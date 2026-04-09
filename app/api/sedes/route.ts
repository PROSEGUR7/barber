import { NextResponse } from "next/server"

import { getActiveSedes } from "@/lib/bookings"
import { resolveTenantSchemaForRequest } from "@/lib/tenant"

export async function GET(request: Request) {
  try {
    const tenantSchema = await resolveTenantSchemaForRequest(request)
    const sedes = await getActiveSedes(tenantSchema)

    return NextResponse.json({ sedes })
  } catch (error) {
    console.error("Error fetching sedes", error)

    return NextResponse.json(
      { error: "No se pudieron cargar las sedes" },
      { status: 500 },
    )
  }
}
