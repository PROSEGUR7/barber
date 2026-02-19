import { NextResponse } from "next/server"
import { z } from "zod"

import { cancelAppointment } from "@/lib/bookings"

const paramsSchema = z.object({
  appointmentId: z.coerce.number().int().positive(),
})

const bodySchema = z.object({
  userId: z.coerce.number().int().positive(),
})

export async function POST(
  request: Request,
  context: { params: Promise<{ appointmentId: string }> },
) {
  try {
    const rawParams = await context.params
    const { appointmentId } = paramsSchema.parse(rawParams)
    const body = bodySchema.parse(await request.json())

    await cancelAppointment({
      appointmentId,
      userId: body.userId,
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

    if (code === "APPOINTMENT_NOT_CANCELABLE") {
      return NextResponse.json(
        { error: "Esta cita no se puede cancelar" },
        { status: 409 },
      )
    }

    if (code === "APPOINTMENT_CANCEL_FAILED") {
      return NextResponse.json(
        { error: "No se pudo cancelar la cita" },
        { status: 500 },
      )
    }

    console.error("Error canceling appointment", error)
    return NextResponse.json(
      { error: "No se pudo cancelar la cita" },
      { status: 500 },
    )
  }
}
