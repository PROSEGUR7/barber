import { NextResponse } from "next/server"

import { getAdminAppointments } from "@/lib/admin"
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
    const employeeId = parsePositiveInt(searchParams.get("employeeId"))
    const clientId = parsePositiveInt(searchParams.get("clientId"))
    const fromDate = searchParams.get("fromDate") ?? undefined
    const toDate = searchParams.get("toDate") ?? undefined
    const limit = parsePositiveInt(searchParams.get("limit"))

    const tenantSchema = await resolveTenantSchemaForAdminRequest(request)
    if (!tenantSchema) {
      return jsonError(400, {
        code: "TENANT_NOT_RESOLVED",
        error: "No se pudo resolver el tenant de la sesión.",
      })
    }

    const appointments = await getAdminAppointments({
      status,
      employeeId,
      clientId,
      fromDate,
      toDate,
      limit,
      tenantSchema,
    })

    return NextResponse.json({ ok: true, appointments }, { status: 200 })
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_URL env var is not set") {
      return jsonError(503, {
        code: "DATABASE_NOT_CONFIGURED",
        error: "El servidor no está configurado (DATABASE_URL faltante).",
      })
    }

    console.error("Admin appointments API error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudieron cargar los agendamientos.",
    })
  }
}
