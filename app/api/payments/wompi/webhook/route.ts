import { NextResponse } from "next/server"

import {
  fetchWompiTransactionById,
  parseTenantBillingReference,
  reconcileWompiTransaction,
  verifyWompiWebhookSignature,
} from "@/lib/wompi"
import { registerTenantPaymentWithIdempotency, resolveTenantBillingChargeContext } from "@/lib/admin-billing"

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
    const rawBody = await request.text()
    const payload = JSON.parse(rawBody) as WompiWebhookPayload

    const signatureCheck = verifyWompiWebhookSignature(rawBody, payload)
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
        const billingContext = await resolveTenantBillingChargeContext({
          tenantId: parsedReference.tenantId,
          requestedPlanCode: parsedReference.planCode,
          requestedBillingCycle: parsedReference.billingCycle,
        })

        const result = await registerTenantPaymentWithIdempotency({
          tenantId: billingContext.tenantId,
          amount: amountInCents / 100,
          currency: (transactionForReconciliation?.currency ?? "COP").toUpperCase(),
          paymentMethod: wompiMethodToAdminMethod(transactionForReconciliation?.payment_method_type ?? undefined),
          paymentProvider: "wompi",
          externalReference: paymentReference,
          billingCycle: billingContext.billingCycle,
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
            transactionId,
            paymentReference,
            amountInCents,
            currency: (transactionForReconciliation?.currency ?? "COP").toUpperCase(),
            reason: billingRegistration.reason,
            pgCode: meta?.pgCode ?? null,
            pgMessage: meta?.pgMessage ?? null,
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
