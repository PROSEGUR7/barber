import { NextResponse } from "next/server"

import { fetchWompiTransactionById, parseTenantBillingReference, reconcileWompiTransaction } from "@/lib/wompi"
import { registerTenantPaymentWithIdempotency, resolveTenantBillingChargeContext } from "@/lib/admin-billing"

type Params = {
  params: Promise<{ transactionId: string }>
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
    const wompiTransaction = await fetchWompiTransactionById(transactionId)

    if (!wompiTransaction) {
      return NextResponse.json(
        { error: "No se pudo consultar la transacción en Wompi" },
        { status: 502 },
      )
    }

    const reconciliation = await reconcileWompiTransaction(wompiTransaction, {
      source: "transaction_query",
      eventName: null,
    })

    const normalizedStatus = (wompiTransaction.status ?? "").trim().toUpperCase()
    const amountInCents = wompiTransaction.amount_in_cents
    const paymentReference =
      (typeof wompiTransaction.id === "string" && wompiTransaction.id.trim()) ||
      (typeof wompiTransaction.reference === "string" && wompiTransaction.reference.trim()) ||
      ""
    const parsedReference = parseTenantBillingReference(wompiTransaction.reference)

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
          currency: (wompiTransaction.currency ?? "COP").toUpperCase(),
          paymentMethod: wompiMethodToAdminMethod(wompiTransaction.payment_method_type ?? undefined),
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

          console.warn("[WOMPI_TRANSACTION_BILLING_REJECTED]", {
            transactionId,
            paymentReference,
            amountInCents,
            currency: (wompiTransaction.currency ?? "COP").toUpperCase(),
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
        id: wompiTransaction.id ?? transactionId,
        status: wompiTransaction.status ?? "UNKNOWN",
        reference: wompiTransaction.reference ?? null,
        amountInCents: wompiTransaction.amount_in_cents ?? null,
        currency: wompiTransaction.currency ?? "COP",
        paymentMethodType: wompiTransaction.payment_method_type ?? null,
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
