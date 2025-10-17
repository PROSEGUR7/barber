import { NextResponse } from "next/server"
import { z } from "zod"

import { getAvailabilitySlots } from "@/lib/bookings"

const querySchema = z.object({
  serviceId: z.coerce.number().int().positive(),
  barberId: z.coerce.number().int().positive(),
  date: z
    .string()
    .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
    .transform((value) => value),
})

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const rawParams = {
      serviceId: url.searchParams.get("serviceId"),
      barberId: url.searchParams.get("barberId"),
      date: url.searchParams.get("date"),
    }

    const params = querySchema.parse(rawParams)

    const slots = await getAvailabilitySlots({
      serviceId: params.serviceId,
      employeeId: params.barberId,
      date: params.date,
    })

    return NextResponse.json({ slots })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Parámetros inválidos" },
        { status: 400 },
      )
    }

    console.error("Error fetching availability", error)

    return NextResponse.json(
      { error: "No se pudo obtener la disponibilidad" },
      { status: 500 },
    )
  }
}
