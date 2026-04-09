import { NextResponse } from "next/server"
import { z } from "zod"

import { getActiveBarbersBySede, getActiveServices, getSedeById } from "@/lib/bookings"
import { resolveTenantSchemaForRequest } from "@/lib/tenant"

const paramsSchema = z.object({
  sedeId: z.coerce.number().int().positive(),
})

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sedeId: string }> },
) {
  try {
    const tenantSchema = await resolveTenantSchemaForRequest(request)
    const resolvedParams = await params
    const { sedeId } = paramsSchema.parse(resolvedParams)

    const sede = await getSedeById(sedeId, tenantSchema)
    if (!sede || !sede.isActive) {
      return NextResponse.json({ error: "Sede no encontrada" }, { status: 404 })
    }

    const [services, barbers] = await Promise.all([
      getActiveServices(tenantSchema, sedeId),
      getActiveBarbersBySede(sedeId, tenantSchema),
    ])

    return NextResponse.json({
      sede,
      services,
      barbers,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 })
    }

    console.error("Error fetching sede details", error)
    return NextResponse.json(
      { error: "No se pudo cargar la información de la sede" },
      { status: 500 },
    )
  }
}
