import { NextResponse } from "next/server"

import { getWompiBaseUrl, reconcileWompiTransaction } from "@/lib/wompi"
import { registerTenantPaymentWithIdempotency } from "@/lib/admin-billing"

type Params = {
  params: Promise<{ transactionId: string }>
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

export async function GET(_: Request, context: Params) {
  const { transactionId } = await context.params

  if (!transactionId?.trim()) {
    return NextResponse.json({ error: "transactionId requerido" }, { status: 400 })
  }

  try {
    const response = await fetch(`${getWompiBaseUrl()}/v1/transactions/${encodeURIComponent(transactionId)}`, {
      method: "GET",
      cache: "no-store",
    })

    const payload = (await response.json().catch(() => ({}))) as WompiTransactionResponse

    if (!response.ok || !payload.data) {
      return NextResponse.json(
        { error: "No se pudo consultar la transacción en Wompi" },
        { status: 502 },
      )
    }

    const reconciliation = await reconcileWompiTransaction(payload.data, {
      source: "transaction_query",
      eventName: null,
    })

    const normalizedStatus = (payload.data.status ?? "").trim().toUpperCase()
    const amountInCents = payload.data.amount_in_cents
    const paymentReference =
      (typeof payload.data.id === "string" && payload.data.id.trim()) ||
      (typeof payload.data.reference === "string" && payload.data.reference.trim()) ||
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
          currency: (payload.data.currency ?? "COP").toUpperCase(),
          paymentMethod: wompiMethodToAdminMethod(payload.data.payment_method_type ?? undefined),
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

          console.warn("[WOMPI_TRANSACTION_BILLING_REJECTED]", {
            transactionId,
            paymentReference,
            amountInCents,
            currency: (payload.data.currency ?? "COP").toUpperCase(),
            reason: billingRegistration.reason,
            pgCode: meta?.pgCode ?? null,
            pgMessage: meta?.pgMessage ?? null,
          })
        } else {
          throw error
        }
      }
    }

    return NextResponse.json(
      {
        id: payload.data.id ?? transactionId,
        status: payload.data.status ?? "UNKNOWN",
        reference: payload.data.reference ?? null,
        amountInCents: payload.data.amount_in_cents ?? null,
        currency: payload.data.currency ?? "COP",
        paymentMethodType: payload.data.payment_method_type ?? null,
        reconciliation,
        billingRegistration,
        billingRejected: billingRegistration.rejected,
        billingRejectReason: billingRegistration.reason,
        billingRejectMessage: billingRegistration.message,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("Error fetching Wompi transaction", error)
    return NextResponse.json(
      { error: "Error consultando estado de pago en Wompi" },
      { status: 500 },
    )
  }
}
