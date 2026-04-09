import { NextResponse } from "next/server"

import { getClientsWithStats, getEmployeeByUserId, getServicesCatalog } from "@/lib/admin"
import { resolveTenantSchemaForRequest } from "@/lib/tenant"

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
    const userId = parsePositiveInt(url.searchParams.get("userId"))

    if (!userId) {
      return jsonError(400, {
        code: "INVALID_USER_ID",
        error: "Se requiere un userId válido.",
      })
    }

    const tenantSchema = await resolveTenantSchemaForRequest(request)

    const [employee, clients, services] = await Promise.all([
      getEmployeeByUserId(userId, tenantSchema),
      getClientsWithStats({ tenantSchema }),
      getServicesCatalog(tenantSchema),
    ])

    if (!employee) {
      return jsonError(409, {
        code: "EMPLOYEE_PROFILE_NOT_FOUND",
        error: "Tu cuenta no tiene perfil de empleado.",
      })
    }

    const activeServices = services.filter((service) => service.status?.trim().toLowerCase() !== "inactivo")

    return NextResponse.json(
      {
        ok: true,
        employee,
        clients,
        services: activeServices,
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

    console.error("Barber agendamientos catalogs API error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudieron cargar los catálogos de agendamiento.",
    })
  }
}
