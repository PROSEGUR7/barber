import { NextResponse } from "next/server"

import { getActiveServices } from "@/lib/bookings"
import { resolveTenantSchemaForRequest } from "@/lib/tenant"

export async function GET(request: Request) {
  try {
    const tenantSchema = await resolveTenantSchemaForRequest(request)
    const services = await getActiveServices(tenantSchema)

    return NextResponse.json({ services })
  } catch (error) {
    console.error("Error fetching services", error)

    return NextResponse.json(
      { error: "No se pudieron cargar los servicios" },
      { status: 500 },
    )
  }
}
