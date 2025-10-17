import { NextResponse } from "next/server"
import { z } from "zod"

import { reserveAppointment } from "@/lib/bookings"

const reservationSchema = z.object({
  userId: z.coerce.number().int().positive(),
  serviceId: z.coerce.number().int().positive(),
  barberId: z.coerce.number().int().positive(),
  start: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "Fecha de inicio inválida",
    }),
})

export async function POST(request: Request) {
  try {
    const json = await request.json()
    const { userId, serviceId, barberId, start } = reservationSchema.parse(json)

    const appointment = await reserveAppointment({
      userId,
      employeeId: barberId,
      serviceId,
      start,
    })

    return NextResponse.json(
      {
        appointment,
        message: "Cita reservada correctamente",
      },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: error.flatten() },
        { status: 400 },
      )
    }

    console.error("Error creating reservation", error)

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      return NextResponse.json(
        { error: "El horario seleccionado ya no está disponible" },
        { status: 409 },
      )
    }

    return NextResponse.json(
      { error: "No se pudo crear la reserva" },
      { status: 500 },
    )
  }
}
