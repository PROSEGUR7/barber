import { NextResponse } from "next/server"
import { z } from "zod"

import { getBarbersForService } from "@/lib/bookings"

const paramsSchema = z.object({
  serviceId: z.coerce.number().int().positive(),
})

export async function GET(
  _request: Request,
  context: { params: { serviceId: string } },
) {
  try {
    const { serviceId } = paramsSchema.parse(context.params)

    const barbers = await getBarbersForService(serviceId)

    return NextResponse.json({ barbers })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Parámetros inválidos" },
        { status: 400 },
      )
    }

    console.error("Error fetching barbers for service", error)

    return NextResponse.json(
      { error: "No se pudieron cargar los profesionales" },
      { status: 500 },
    )
  }
}
