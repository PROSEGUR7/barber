import { NextResponse } from "next/server"
import { z } from "zod"

import { rescheduleAppointment } from "@/lib/bookings"

const bodySchema = z.object({
  userId: z.coerce.number().int().positive(),
  start: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "Fecha de inicio inválida",
    }),
})

export async function POST(
  request: Request,
  context: { params: { appointmentId: string } },
) {
  try {
    const appointmentId = Number.parseInt(context.params.appointmentId, 10)

    if (Number.isNaN(appointmentId) || appointmentId <= 0) {
      return NextResponse.json(
        { error: "Identificador de cita inválido" },
        { status: 400 },
      )
    }

    const json = await request.json()
    const { userId, start } = bodySchema.parse(json)

    await rescheduleAppointment({ appointmentId, userId, start })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: error.flatten() },
        { status: 400 },
      )
    }

    if (error instanceof Error) {
      if (error.message === "APPOINTMENT_NOT_FOUND") {
        return NextResponse.json(
          { error: "Cita no encontrada" },
          { status: 404 },
        )
      }

      if (error.message === "APPOINTMENT_NOT_RESCHEDULABLE") {
        return NextResponse.json(
          { error: "Esta cita no se puede reprogramar" },
          { status: 409 },
        )
      }

      if (error.message === "SLOT_NOT_AVAILABLE") {
        return NextResponse.json(
          { error: "El horario seleccionado ya no está disponible" },
          { status: 409 },
        )
      }

      if (error.message === "INVALID_START") {
        return NextResponse.json(
          { error: "La fecha proporcionada no es válida" },
          { status: 400 },
        )
      }
    }

    console.error("Error rescheduling appointment", error)
    return NextResponse.json(
      { error: "No se pudo reprogramar la cita" },
      { status: 500 },
    )
  }
}
