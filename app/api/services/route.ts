import { NextResponse } from "next/server"

import { getActiveServices } from "@/lib/bookings"
import { resolveTenantSchemaForRequest } from "@/lib/tenant"

export async function GET(request: Request) {
  try {
    const tenantSchema = await resolveTenantSchemaForRequest(request)
    const url = new URL(request.url)
    const rawSedeId = url.searchParams.get("sedeId")
    const parsedSedeId =
      rawSedeId != null && rawSedeId.trim().length > 0
        ? Number.parseInt(rawSedeId, 10)
        : null

    if (rawSedeId != null && rawSedeId.trim().length > 0 && (!Number.isInteger(parsedSedeId) || parsedSedeId <= 0)) {
      return NextResponse.json({ error: "sedeId inválido" }, { status: 400 })
    }

    const services = await getActiveServices(tenantSchema, parsedSedeId)

    return NextResponse.json({ services })
  } catch (error) {
    console.error("Error fetching services", error)

    return NextResponse.json(
      { error: "No se pudieron cargar los servicios" },
      { status: 500 },
    )
  }
}
