import { NextResponse } from "next/server"
import { z } from "zod"

import { getBillingPlans } from "@/lib/admin-billing"
import { getSaasPlanById, type SaasPlanId } from "@/lib/saas-plans"
import { createWompiCheckoutDataForSaasPlan } from "@/lib/wompi"

const checkoutSchema = z.object({
  planId: z.enum(["fullstack", "fullstack-sedes", "fullstack-ia", "fullstack-sedes-ia"]),
  billingCycle: z.enum(["mensual", "trimestral", "anual"]).optional(),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { planId, billingCycle } = checkoutSchema.parse(body)
    const resolvedBillingCycle = billingCycle ?? "mensual"

    const fallbackPlan = getSaasPlanById(planId as SaasPlanId)
    const billingPlans = await getBillingPlans({ activeOnly: true })
    const billingPlan = billingPlans.find((item) => item.code === planId)

    const fallbackByCycle =
      resolvedBillingCycle === "trimestral"
        ? fallbackPlan.priceInCop * 3
        : resolvedBillingCycle === "anual"
          ? fallbackPlan.priceInCop * 12
          : fallbackPlan.priceInCop

    const billingPriceByCycle =
      resolvedBillingCycle === "trimestral"
        ? billingPlan?.quarterlyPrice
        : resolvedBillingCycle === "anual"
          ? billingPlan?.yearlyPrice
          : billingPlan?.monthlyPrice

    const plan = {
      id: fallbackPlan.id,
      title: billingPlan?.name ?? fallbackPlan.title,
      priceInCop:
        typeof billingPriceByCycle === "number" && Number.isFinite(billingPriceByCycle) && billingPriceByCycle > 0
          ? Math.round(billingPriceByCycle)
          : fallbackByCycle,
    }

    const wompiCheckout = await createWompiCheckoutDataForSaasPlan({
      planId: plan.id,
      amountInCop: plan.priceInCop,
    })

    return NextResponse.json({
      plan: {
        id: plan.id,
        title: plan.title,
        amountInCop: plan.priceInCop,
        billingCycle: resolvedBillingCycle,
      },
      wompiCheckout,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Plan inválido", issues: error.flatten() }, { status: 400 })
    }

    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
        ? ((error as { code?: string }).code as string)
        : null

    if (code === "WOMPI_NOT_CONFIGURED") {
      const meta =
        typeof error === "object" &&
        error !== null &&
        "meta" in error &&
        typeof (error as { meta?: unknown }).meta === "object" &&
        (error as { meta?: unknown }).meta !== null
          ? ((error as { meta?: { environment?: string; missing?: string[] } }).meta ?? null)
          : null

      const missing = Array.isArray(meta?.missing) && meta?.missing.length > 0 ? meta.missing.join(", ") : null
      const envLabel = meta?.environment === "production" ? "producción" : "sandbox"

      return NextResponse.json(
        {
          error: missing
            ? `Wompi no está configurado para ${envLabel}. Faltan: ${missing}.`
            : "Wompi no está configurado todavía.",
        },
        { status: 503 },
      )
    }

    if (code === "WOMPI_MERCHANT_UNAVAILABLE" || code === "WOMPI_ACCEPTANCE_TOKEN_MISSING") {
      return NextResponse.json(
        { error: "No pudimos inicializar el checkout de Wompi. Intenta nuevamente." },
        { status: 502 },
      )
    }

    if (code === "AMOUNT_INVALID") {
      return NextResponse.json({ error: "El valor del plan es inválido." }, { status: 409 })
    }

    console.error("Error creating Wompi checkout for SaaS plan", error)
    return NextResponse.json({ error: "No se pudo iniciar el pago del plan" }, { status: 500 })
  }
}
