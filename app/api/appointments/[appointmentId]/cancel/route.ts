import { NextResponse } from "next/server"
import { z } from "zod"

import { cancelAppointment } from "@/lib/bookings"

const bodySchema = z.object({
  userId: z.coerce.number().int().positive(),
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
    const { userId } = bodySchema.parse(json)

    await cancelAppointment({ appointmentId, userId })

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

      if (error.message === "APPOINTMENT_NOT_CANCELABLE") {
        return NextResponse.json(
          { error: "Esta cita no se puede cancelar" },
          { status: 409 },
        )
      }
    }

    console.error("Error canceling appointment", error)
    return NextResponse.json(
      { error: "No se pudo cancelar la cita" },
      { status: 500 },
    )
  }
}
