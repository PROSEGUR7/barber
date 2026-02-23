import { NextResponse } from "next/server"
import { z } from "zod"

import { reserveAppointments } from "@/lib/bookings"

const reservationSchema = z
  .object({
  userId: z.coerce.number().int().positive(),
  serviceId: z.coerce.number().int().positive().optional(),
  serviceIds: z.array(z.coerce.number().int().positive()).min(1).max(2).optional(),
  barberId: z.coerce.number().int().positive(),
  start: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "Fecha de inicio inválida",
    }),
})
  .superRefine((value, ctx) => {
    const hasSingle = typeof value.serviceId === "number"
    const hasMulti = Array.isArray(value.serviceIds) && value.serviceIds.length > 0

    if (!hasSingle && !hasMulti) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Selecciona al menos un servicio" })
    }

    if (hasSingle && hasMulti) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Envía serviceId o serviceIds, no ambos" })
    }
  })

export async function POST(request: Request) {
  try {
    const json = await request.json()
    const { userId, serviceId, serviceIds, barberId, start } = reservationSchema.parse(json)

    const resolvedServiceIds = Array.isArray(serviceIds)
      ? serviceIds
      : typeof serviceId === "number"
        ? [serviceId]
        : []

    const appointment = await reserveAppointments({
      userId,
      employeeId: barberId,
      serviceIds: resolvedServiceIds,
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

    if (code === "START_IN_PAST") {
      return NextResponse.json(
        { error: "No puedes agendar una cita en un horario que ya pasó" },
        { status: 409 },
      )
    }

    if (code === "SERVICE_NOT_FOUND") {
      return NextResponse.json(
        { error: "El servicio seleccionado no existe o no está activo" },
        { status: 404 },
      )
    }

    if (code === "SERVICE_SELECTION_LIMIT") {
      return NextResponse.json(
        { error: "Solo puedes seleccionar hasta 2 servicios por reserva." },
        { status: 400 },
      )
    }

    if (code === "CLIENT_PROFILE_NOT_FOUND") {
      return NextResponse.json(
        { error: "Tu cuenta no tiene perfil de cliente. Vuelve a registrarte o contacta soporte." },
        { status: 409 },
      )
    }

    if (code === "CLIENT_DAILY_LIMIT") {
      const meta =
        typeof error === "object" &&
        error !== null &&
        "meta" in error &&
        typeof (error as { meta?: unknown }).meta === "object" &&
        (error as { meta?: unknown }).meta !== null
          ? ((error as { meta?: { maxPerDay?: number; existingCount?: number } }).meta ?? null)
          : null

      const maxPerDay = typeof meta?.maxPerDay === "number" ? meta.maxPerDay : 2
      const existingCount = typeof meta?.existingCount === "number" ? meta.existingCount : null

      return NextResponse.json(
        {
          error:
            existingCount != null
              ? `No se puede agendar: ya tienes ${existingCount} cita(s) programada(s) para ese día. Máximo ${maxPerDay}.`
              : `Ya alcanzaste el máximo de ${maxPerDay} citas para ese día.`,
        },
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
