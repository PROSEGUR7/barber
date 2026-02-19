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

    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
        ? ((error as { code?: string }).code as string)
        : null

    if (code === "INVALID_START") {
      return NextResponse.json(
        { error: "Fecha de inicio inválida" },
        { status: 400 },
      )
    }

    if (code === "SERVICE_NOT_FOUND") {
      return NextResponse.json(
        { error: "El servicio seleccionado no existe o no está activo" },
        { status: 404 },
      )
    }

    if (code === "CLIENT_PROFILE_NOT_FOUND") {
      return NextResponse.json(
        { error: "Tu cuenta no tiene perfil de cliente. Vuelve a registrarte o contacta soporte." },
        { status: 409 },
      )
    }

    if (code === "CLIENT_DAILY_LIMIT") {
      return NextResponse.json(
        { error: "Solo puedes agendar 1 cita por día." },
        { status: 409 },
      )
    }

    if (code === "SLOT_NOT_AVAILABLE" || code === "SLOT_ALREADY_TAKEN") {
      return NextResponse.json(
        { error: "El horario seleccionado ya no está disponible" },
        { status: 409 },
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
