import { NextResponse } from "next/server"

import {
  fetchWompiTransactionById,
  parseTenantBillingReference,
  reconcileWompiTransaction,
  verifyWompiWebhookSignature,
} from "@/lib/wompi"
import { prepareTenantSubscriptionContext, registerTenantPaymentWithIdempotency, resolveTenantBillingChargeContext } from "@/lib/admin-billing"

export const runtime = "nodejs"

type WompiWebhookPayload = {
  event?: string
  sent_at?: string
  timestamp?: string | number
  signature?: {
    checksum?: string
    properties?: string[]
    timestamp?: string | number
  }
  data?: {
    transaction?: {
      id?: string | null
      status?: string | null
      reference?: string | null
      amount_in_cents?: number | null
      currency?: string | null
      payment_method_type?: string | null
    }
  }
}

type BillingValidationMeta = {
  reason?: string
  businessMessage?: string
  pgCode?: string
  pgMessage?: string
  pgDetail?: string
  pgHint?: string
}

function getDbTargetForTrace() {
  const raw = process.env.DATABASE_URL?.trim()
  if (!raw) return "DATABASE_URL:not-set"

  try {
    const parsed = new URL(raw)
    const dbName = parsed.pathname.replace(/^\//, "") || "unknown"
    const host = parsed.hostname || "unknown"
    const port = parsed.port || "5432"
    return `${host}:${port}/${dbName}`
  } catch {
    return "DATABASE_URL:invalid"
  }
}

function wompiMethodToAdminMethod(method: string | undefined): string {
  const normalized = (method ?? "").trim().toUpperCase()

  if (normalized === "CARD" || normalized === "PSE") return "tarjeta"
  if (normalized === "NEQUI") return "nequi"
  if (normalized === "DAVIPLATA") return "daviplata"

  return "otro"
}

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      provider: "wompi",
      message: "Webhook endpoint ready",
    },
    { status: 200 },
  )
}

export async function POST(request: Request) {
  try {
    const dbTarget = getDbTargetForTrace()
    const rawBody = await request.text()
    const payload = JSON.parse(rawBody) as WompiWebhookPayload

    console.log("[WOMPI_WEBHOOK_TRACE_INPUT]", {
      dbTarget,
      contentLength: rawBody.length,
      event: payload?.event ?? null,
      transactionId: payload?.data?.transaction?.id ?? null,
      reference: payload?.data?.transaction?.reference ?? null,
      status: payload?.data?.transaction?.status ?? null,
      amountInCents: payload?.data?.transaction?.amount_in_cents ?? null,
      currency: payload?.data?.transaction?.currency ?? null,
    })

    const signatureCheck = verifyWompiWebhookSignature(rawBody, payload)
    console.log("[WOMPI_WEBHOOK_TRACE_SIGNATURE]", {
      dbTarget,
      valid: signatureCheck.valid,
      reason: signatureCheck.reason,
      signatureTimestamp: payload?.signature?.timestamp ?? payload?.timestamp ?? payload?.sent_at ?? null,
      signatureProperties: payload?.signature?.properties ?? null,
    })

    if (!signatureCheck.valid) {
      console.warn("[WOMPI_WEBHOOK_IGNORED_INVALID_SIGNATURE]", {
        reason: signatureCheck.reason,
      })

      return NextResponse.json(
        {
          ok: true,
          ignored: true,
          reason: signatureCheck.reason ?? "invalid_signature",
        },
        { status: 200 },
      )
    }

    const eventName = payload?.event ?? "unknown"
    const transactionId = payload?.data?.transaction?.id ?? "unknown"
    const transactionStatus = payload?.data?.transaction?.status ?? "unknown"
    const reference = payload?.data?.transaction?.reference ?? "unknown"

    console.log("[WOMPI_WEBHOOK_RECEIVED]", {
      event: eventName,
      transactionId,
      transactionStatus,
      reference,
    })

    let transactionForReconciliation = payload?.data?.transaction ?? null

    if (transactionId !== "unknown") {
      const latest = await fetchWompiTransactionById(transactionId)
      if (latest) {
        transactionForReconciliation = latest
      }

      console.log("[WOMPI_WEBHOOK_TRACE_FETCH_TRANSACTION]", {
        dbTarget,
        transactionId,
        fetched: Boolean(latest),
        fetchedStatus: latest?.status ?? null,
        fetchedReference: latest?.reference ?? null,
        fetchedAmountInCents: latest?.amount_in_cents ?? null,
        fetchedCurrency: latest?.currency ?? null,
      })
    }

    let reconciliation = null
    if (transactionForReconciliation) {
      reconciliation = await reconcileWompiTransaction(transactionForReconciliation, {
        source: "webhook",
        eventName,
      })
    }

    const normalizedStatus = (transactionForReconciliation?.status ?? "").trim().toUpperCase()
    const amountInCents = transactionForReconciliation?.amount_in_cents
    const paymentReference =
      (typeof transactionForReconciliation?.id === "string" && transactionForReconciliation.id.trim()) ||
      (typeof transactionForReconciliation?.reference === "string" && transactionForReconciliation.reference.trim()) ||
      ""
    const referenceForTenantContext =
      (typeof transactionForReconciliation?.reference === "string" && transactionForReconciliation.reference.trim()) ||
      ""
    const parsedReference = parseTenantBillingReference(referenceForTenantContext)

    let billingRegistration: {
      attempted: boolean
      registered: boolean
      skipped: boolean
      rejected: boolean
      code: string | null
      reason: string | null
      message: string | null
    } = {
      attempted: false,
      registered: false,
      skipped: false,
      rejected: false,
      code: null,
      reason: null,
      message: null,
    }

    if (
      normalizedStatus === "APPROVED" &&
      typeof amountInCents === "number" &&
      Number.isFinite(amountInCents) &&
      amountInCents > 0 &&
      paymentReference
    ) {
      billingRegistration.attempted = true

      try {
        const billingContext =
          parsedReference.planCode && parsedReference.billingCycle
            ? await prepareTenantSubscriptionContext({
                tenantId: parsedReference.tenantId,
                requestedPlanCode: parsedReference.planCode,
                requestedBillingCycle: parsedReference.billingCycle,
              })
            : await resolveTenantBillingChargeContext({
                tenantId: parsedReference.tenantId,
                requestedPlanCode: parsedReference.planCode,
                requestedBillingCycle: parsedReference.billingCycle,
              })

        console.log("[WOMPI_WEBHOOK_TRACE_REGISTER_PAYLOAD]", {
          dbTarget,
          transactionId,
          wompi: {
            status: normalizedStatus,
            referenceFromWompi: transactionForReconciliation?.reference ?? null,
            externalReferenceForDb: paymentReference,
            amountInCents,
            amountCop: amountInCents / 100,
            currency: (transactionForReconciliation?.currency ?? "COP").toUpperCase(),
            paymentMethodType: transactionForReconciliation?.payment_method_type ?? null,
          },
          parsedReference,
          expectedBySubscription: {
            tenantId: billingContext.tenantId,
            planCode: billingContext.planCode,
            billingCycle: billingContext.billingCycle,
            amount: billingContext.amount,
            currency: billingContext.currency,
          },
        })

        const result = await registerTenantPaymentWithIdempotency({
          tenantId: billingContext.tenantId,
          amount: amountInCents / 100,
          currency: (transactionForReconciliation?.currency ?? "COP").toUpperCase(),
          paymentMethod: wompiMethodToAdminMethod(transactionForReconciliation?.payment_method_type ?? undefined),
          paymentProvider: "wompi",
          externalReference: paymentReference,
          billingCycle: billingContext.billingCycle,
          requestedPlanCode: parsedReference.planCode,
        })

        billingRegistration.registered = result.ok && !result.skipped
        billingRegistration.skipped = result.skipped
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "UNKNOWN_BILLING_ERROR"

        if (errorMessage === "ADMIN_BILLING_PAYMENT_VALIDATION_FAILED") {
          const meta =
            typeof error === "object" && error !== null && "meta" in error
              ? ((error as { meta?: unknown }).meta as BillingValidationMeta)
              : undefined

          billingRegistration.rejected = true
          billingRegistration.code = errorMessage
          billingRegistration.reason = meta?.reason ?? "payment_validation_failed"
          billingRegistration.message =
            meta?.businessMessage ?? "Pago aprobado en pasarela, pero rechazado por validación de billing."
          console.warn("[WOMPI_WEBHOOK_BILLING_REJECTED]", {
            dbTarget,
            transactionId,
            paymentReference,
            amountInCents,
            currency: (transactionForReconciliation?.currency ?? "COP").toUpperCase(),
            reason: billingRegistration.reason,
            pgCode: meta?.pgCode ?? null,
            pgMessage: meta?.pgMessage ?? null,
            pgDetail: meta?.pgDetail ?? null,
            pgHint: meta?.pgHint ?? null,
          })
        } else {
          throw error
        }
      }
    } else {
      console.info("[WOMPI_WEBHOOK_NON_APPROVED]", {
        event: eventName,
        transactionId,
        status: normalizedStatus || "UNKNOWN",
        paymentReference: paymentReference || null,
      })
    }

    console.log("[WOMPI_WEBHOOK_RECONCILED]", {
      event: eventName,
      transactionId,
      reconciliation,
      billingRegistration,
    })

    return NextResponse.json(
      {
        ok: true,
        received: true,
        reconciliation,
        billingRegistration,
        billingRejected: billingRegistration.rejected,
        billingRejectReason: billingRegistration.reason,
        billingRejectMessage: billingRegistration.message,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("[WOMPI_WEBHOOK_ERROR]", error)
    return NextResponse.json({ ok: false, error: "Invalid webhook payload" }, { status: 400 })
  }
}
