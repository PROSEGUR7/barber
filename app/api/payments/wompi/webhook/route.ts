import { NextResponse } from "next/server"

import { getWompiBaseUrl, reconcileWompiTransaction } from "@/lib/wompi"
import { registerTenantPaymentWithIdempotency } from "@/lib/admin-billing"

export const runtime = "nodejs"

type WompiWebhookPayload = {
  event?: string
  data?: {
    transaction?: {
      id?: string
      status?: string
      reference?: string
      amount_in_cents?: number
      currency?: string
      payment_method_type?: string
    }
  }
}

type WompiTransactionResponse = {
  data?: {
    id?: string
    status?: string
    reference?: string
    amount_in_cents?: number
    currency?: string
    payment_method_type?: string
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
    const payload = (await request.json()) as WompiWebhookPayload

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
      const response = await fetch(`${getWompiBaseUrl()}/v1/transactions/${encodeURIComponent(transactionId)}`, {
        method: "GET",
        cache: "no-store",
      })

      const latest = (await response.json().catch(() => ({}))) as WompiTransactionResponse
      if (response.ok && latest.data) {
        transactionForReconciliation = latest.data
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
        const result = await registerTenantPaymentWithIdempotency({
          amount: amountInCents / 100,
          currency: (transactionForReconciliation?.currency ?? "COP").toUpperCase(),
          paymentMethod: wompiMethodToAdminMethod(transactionForReconciliation?.payment_method_type ?? undefined),
          paymentProvider: "wompi",
          externalReference: paymentReference,
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
