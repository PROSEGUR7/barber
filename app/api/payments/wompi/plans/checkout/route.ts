import { NextResponse } from "next/server"
import { z } from "zod"

import { isPlanChangeBillingEnabled, resolveTenantBillingChargeContext } from "@/lib/admin-billing"
import { findTenantSchemaByEmail } from "@/lib/auth"
import { createWompiCheckoutDataForSaasPlan } from "@/lib/wompi"

const checkoutSchema = z.object({
  planId: z.enum(["fullstack", "fullstack-sedes", "fullstack-ia", "fullstack-sedes-ia"]),
  billingCycle: z.enum(["mensual", "trimestral", "anual"]).optional(),
  tenant: z.string().optional(),
  email: z.string().email().optional(),
})

function normalizeTenantHint(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (!/^tenant_[a-z0-9_]+$/.test(normalized)) {
    return null
  }

  return normalized
}

function tenantHintFromHost(host: string | null): string | null {
  if (!host) {
    return null
  }

  const hostname = host.split(":")[0]?.trim().toLowerCase()
  if (!hostname) {
    return null
  }

  const firstLabel = hostname.split(".")[0] ?? ""
  return normalizeTenantHint(firstLabel)
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { planId, billingCycle, tenant, email } = checkoutSchema.parse(body)
    const resolvedBillingCycle = billingCycle ?? "mensual"

    let tenantSchema =
      normalizeTenantHint(tenant) ??
      normalizeTenantHint(request.headers.get("x-tenant")) ??
      tenantHintFromHost(request.headers.get("x-forwarded-host") ?? request.headers.get("host"))

    const emailHint =
      (typeof email === "string" && email.trim()) ||
      request.headers.get("x-user-email") ||
      null

    if (!tenantSchema && emailHint && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailHint)) {
      tenantSchema = await findTenantSchemaByEmail(emailHint.trim().toLowerCase())
    }

    const billingContext = await resolveTenantBillingChargeContext({
      tenantSchema,
      requestedPlanCode: planId,
      requestedBillingCycle: resolvedBillingCycle,
    })

    const normalizedRequestedPlan = planId.trim().toLowerCase()
    const currentPlanCode = billingContext.currentSubscriptionPlanCode?.trim().toLowerCase() ?? null

    if (currentPlanCode && normalizedRequestedPlan !== currentPlanCode) {
      const planChangeEnabled = await isPlanChangeBillingEnabled()
      if (!planChangeEnabled) {
        return NextResponse.json(
          {
            error:
              "El cambio de plan aún no está habilitado en billing. Debes aplicar la función SQL registrar_pago_tenant_con_plan.",
            code: "PLAN_CHANGE_NOT_SUPPORTED",
            currentPlanCode,
            requestedPlanCode: normalizedRequestedPlan,
          },
          { status: 409 },
        )
      }
    }

    const wompiCheckout = await createWompiCheckoutDataForSaasPlan({
      tenantId: billingContext.tenantId,
      planCode: billingContext.planCode,
      billingCycle: billingContext.billingCycle,
      amountInCop: billingContext.amount,
    })

    return NextResponse.json({
      plan: {
        id: billingContext.planCode,
        title: billingContext.planName,
        amountInCop: Math.round(billingContext.amount),
        billingCycle: billingContext.billingCycle,
        currency: billingContext.currency,
      },
      tenantId: billingContext.tenantId,
      wompiCheckout,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Plan inválido", issues: error.flatten() }, { status: 400 })
    }

    const codeFromProp =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
        ? ((error as { code?: string }).code as string)
        : null
    const codeFromMessage = error instanceof Error ? error.message : null
    const code = codeFromProp ?? codeFromMessage

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
      const meta =
        typeof error === "object" &&
        error !== null &&
        "meta" in error &&
        typeof (error as { meta?: unknown }).meta === "object" &&
        (error as { meta?: unknown }).meta !== null
          ? ((error as {
              meta?: {
                status?: number
                statusText?: string
                publicKeyPrefix?: string
                wompiMessage?: unknown
              }
            }).meta ?? null)
          : null

      return NextResponse.json(
        {
          error: "No pudimos inicializar el checkout de Wompi. Intenta nuevamente.",
          debug: {
            upstreamStatus: meta?.status ?? null,
            upstreamStatusText: meta?.statusText ?? null,
            publicKeyPrefix: meta?.publicKeyPrefix ?? null,
            wompiMessage: meta?.wompiMessage ?? null,
          },
        },
        { status: 502 },
      )
    }

    if (code === "WOMPI_CONFIG_CONFLICT") {
      const meta =
        typeof error === "object" &&
        error !== null &&
        "meta" in error &&
        typeof (error as { meta?: unknown }).meta === "object" &&
        (error as { meta?: unknown }).meta !== null
          ? ((error as { meta?: { message?: string } }).meta ?? null)
          : null

      return NextResponse.json(
        {
          error:
            meta?.message?.trim() ||
            "La configuración de llaves/secretos de Wompi tiene conflicto entre variables sandbox y generales.",
        },
        { status: 503 },
      )
    }

    if (code === "AMOUNT_INVALID") {
      return NextResponse.json({ error: "El valor del plan es inválido." }, { status: 409 })
    }

    if (code === "ADMIN_BILLING_TENANT_ID_REQUIRED" || code === "ADMIN_BILLING_TENANT_NOT_FOUND") {
      return NextResponse.json(
        { error: "No se pudo resolver el tenant para cobrar la suscripción." },
        { status: 409 },
      )
    }

    if (code === "ADMIN_BILLING_PLAN_NOT_FOUND" || code === "ADMIN_BILLING_PLAN_NOT_RESOLVED") {
      return NextResponse.json({ error: "No se pudo resolver el plan de suscripción en billing." }, { status: 409 })
    }

    if (code === "ADMIN_BILLING_AMOUNT_NOT_RESOLVED") {
      return NextResponse.json(
        { error: "No se pudo resolver el monto esperado para el ciclo de facturación." },
        { status: 409 },
      )
    }

    console.error("Error creating Wompi checkout for SaaS plan", error)
    return NextResponse.json({ error: "No se pudo iniciar el pago del plan" }, { status: 500 })
  }
}
