import { NextResponse } from "next/server"

import { getBarbersForService } from "@/lib/bookings"
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ serviceId: string }> },
) {
  const { serviceId } = await params
  const parsedServiceId = Number.parseInt(serviceId, 10)

  if (!Number.isFinite(parsedServiceId) || parsedServiceId <= 0) {
    return jsonError(400, {
      code: "SERVICE_ID_INVALID",
      error: "Servicio inválido.",
    })
  }

  try {
    const tenantSchema = await resolveTenantSchemaForRequest(request)
    const barbers = await getBarbersForService(parsedServiceId, tenantSchema)
    return NextResponse.json({ ok: true, barbers }, { status: 200 })
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_URL env var is not set") {
      return jsonError(503, {
        code: "DATABASE_NOT_CONFIGURED",
        error: "El servidor no está configurado (DATABASE_URL faltante).",
      })
    }

    console.error("Error fetching barbers for service", { serviceId: parsedServiceId }, error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudieron cargar los profesionales",
    })
  }
}
