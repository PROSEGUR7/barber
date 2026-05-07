import { NextResponse } from "next/server"

import { getAdminPayments } from "@/lib/admin"
import { resolveTenantSchemaForAdminRequest } from "@/lib/tenant"

export const runtime = "nodejs"

function jsonError(status: number, payload: { error: string; code?: string }) {
  return NextResponse.json(
    {
      ok: false,
      ...payload,
    },
    { status },
  )
}

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) {
    return undefined
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined
  }

  return Math.trunc(parsed)
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const searchParams = url.searchParams

    const status = searchParams.get("status") ?? undefined
    const limit = parsePositiveInt(searchParams.get("limit"))
    const tenantSchema = await resolveTenantSchemaForAdminRequest(request)
    if (!tenantSchema) {
      return jsonError(400, {
        code: "TENANT_NOT_RESOLVED",
        error: "No se pudo resolver el tenant de la sesión.",
      })
    }

    const adminPayments = await getAdminPayments({
      tenantSchema,
      status,
      limit,
    })

    // Map admin appointment payments to the billing table shape expected by the UI.
    const payments = adminPayments.map((p) => ({
      paymentId: p.rowId,
      amount: p.amount,
      currency: null,
      paymentStatus: p.status,
      paidAt: p.appointmentDate,
      createdAt: null,
      paymentMethod: null,
      paymentProvider: null,
      externalReference: null,
      billingCycle: null,
      planCode: null,
      planName: null,
      invoiceNumber: null,
      invoiceStatus: null,
      tenantId: null,
      tenantName: tenantSchema ?? "",
      tenantSchema: tenantSchema ?? null,
    }))

    return NextResponse.json({ ok: true, payments }, { status: 200 })
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_URL env var is not set") {
      return jsonError(503, {
        code: "DATABASE_NOT_CONFIGURED",
        error: "El servidor no está configurado (DATABASE_URL faltante).",
      })
    }

    console.error("Admin payments API error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudieron cargar los pagos.",
    })
  }
}
