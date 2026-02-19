import { NextResponse } from "next/server"
import { z } from "zod"

import { rescheduleAppointment } from "@/lib/bookings"

const paramsSchema = z.object({
  appointmentId: z.coerce.number().int().positive(),
})

const bodySchema = z.object({
  userId: z.coerce.number().int().positive(),
  start: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Fecha de inicio inválida",
  }),
})

export async function POST(
  request: Request,
  context: { params: Promise<{ appointmentId: string }> },
) {
  try {
    const rawParams = await context.params
    const { appointmentId } = paramsSchema.parse(rawParams)
    const body = bodySchema.parse(await request.json())

    await rescheduleAppointment({
      appointmentId,
      userId: body.userId,
      start: body.start,
    })

    return NextResponse.json({ ok: true }, { status: 200 })
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

    if (code === "APPOINTMENT_NOT_FOUND") {
      return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 })
    }

    if (code === "APPOINTMENT_NOT_RESCHEDULABLE") {
      return NextResponse.json(
        { error: "Esta cita no se puede reprogramar" },
        { status: 409 },
      )
    }

    if (code === "SLOT_NOT_AVAILABLE" || code === "SLOT_ALREADY_TAKEN") {
      return NextResponse.json(
        { error: "El horario seleccionado ya no está disponible" },
        { status: 409 },
      )
    }

    if (code === "CLIENT_DAILY_LIMIT") {
      return NextResponse.json(
        { error: "Solo puedes agendar 1 cita por día." },
        { status: 409 },
      )
    }

    console.error("Error rescheduling appointment", error)
    return NextResponse.json(
      { error: "No se pudo reprogramar la cita" },
      { status: 500 },
    )
  }
}
