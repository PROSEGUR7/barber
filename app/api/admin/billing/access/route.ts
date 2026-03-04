import { NextResponse } from "next/server"

import { getTenantSubscriptionSnapshot } from "@/lib/admin-billing"
import { validateTenantAccess } from "@/lib/admin-billing"
import { findTenantSchemaByEmail } from "@/lib/auth"

export const runtime = "nodejs"

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

function jsonError(status: number, payload: { error: string; code?: string }) {
  return NextResponse.json(
    {
      ok: false,
      ...payload,
    },
    { status },
  )
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    let tenantSchema =
      normalizeTenantHint(url.searchParams.get("tenant")) ??
      normalizeTenantHint(request.headers.get("x-tenant")) ??
      tenantHintFromHost(request.headers.get("x-forwarded-host") ?? request.headers.get("host"))
    const userEmail =
      url.searchParams.get("email") ??
      request.headers.get("x-user-email") ??
      null

    if (!tenantSchema && userEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
      tenantSchema = await findTenantSchemaByEmail(userEmail.trim().toLowerCase())
    }

    const snapshot = await getTenantSubscriptionSnapshot({
      tenantSchema,
    })

    const accessDecision = await validateTenantAccess({
      tenantSchema,
    })

    const nowMs = Date.now()
    const nextChargeMs = snapshot?.nextChargeAt ? new Date(snapshot.nextChargeAt).getTime() : Number.NaN
    const hasDueDatePassed = Number.isFinite(nextChargeMs) && nextChargeMs < nowMs
    const hasPaidAccess = Boolean(snapshot?.hasPaidAccess)
    const canAccessSections = hasPaidAccess && accessDecision.allowed && !hasDueDatePassed
    const accessReason =
      hasDueDatePassed
        ? "payment_due"
        : accessDecision.reason ?? (canAccessSections ? "ok" : "subscription_blocked")

    return NextResponse.json(
      {
        ok: true,
        hasPaidAccess,
        canAccessSections,
        accessReason,
        accessCode: accessDecision.code,
        subscription: snapshot,
      },
      { status: 200 },
    )
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_URL env var is not set") {
      return jsonError(503, {
        code: "DATABASE_NOT_CONFIGURED",
        error: "El servidor no está configurado (DATABASE_URL faltante).",
      })
    }

    console.error("Admin billing access API error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudo validar el acceso por suscripción.",
    })
  }
}
