import { NextResponse } from "next/server"
import { z } from "zod"

import { resolveEmployeeIdForUser } from "@/lib/barber-dashboard"
import {
  ensureMaterializedEmployeeAvailability,
  getWeeklyAvailability,
  setWeeklyAvailability,
  type WeeklyAvailabilityRule,
} from "@/lib/availability"

const querySchema = z.object({
  userId: z.coerce.number().int().positive(),
})

const bodySchema = z.object({
  userId: z.coerce.number().int().positive(),
  rules: z
    .array(
      z.object({
        dow: z.number().int().min(0).max(6),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
        active: z.boolean().optional(),
      }),
    )
    .default([]),
})

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const { userId } = querySchema.parse({ userId: url.searchParams.get("userId") })

    const employeeId = await resolveEmployeeIdForUser(userId)
    const rules = await getWeeklyAvailability(employeeId)

    return NextResponse.json({ rules })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Parámetros inválidos", issues: error.flatten() }, { status: 400 })
    }

    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
        ? ((error as { code?: string }).code as string)
        : null

    if (code === "EMPLOYEE_PROFILE_NOT_FOUND") {
      return NextResponse.json({ error: "Tu cuenta no tiene perfil de empleado." }, { status: 409 })
    }

    console.error("Error fetching weekly availability", error)
    return NextResponse.json({ error: "No se pudo cargar la disponibilidad" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = bodySchema.parse(await request.json())

    const employeeId = await resolveEmployeeIdForUser(body.userId)
    await setWeeklyAvailability({ employeeId, rules: body.rules as WeeklyAvailabilityRule[] })

    // Re-materialize next 14 days from today to reflect changes.
    const today = new Date()
    const yyyy = today.getUTCFullYear()
    const mm = String(today.getUTCMonth() + 1).padStart(2, "0")
    const dd = String(today.getUTCDate()).padStart(2, "0")
    const fromDate = `${yyyy}-${mm}-${dd}`

    await ensureMaterializedEmployeeAvailability({ employeeId, fromDate, days: 14 })

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", issues: error.flatten() }, { status: 400 })
    }

    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
        ? ((error as { code?: string }).code as string)
        : null

    if (code === "EMPLOYEE_PROFILE_NOT_FOUND") {
      return NextResponse.json({ error: "Tu cuenta no tiene perfil de empleado." }, { status: 409 })
    }

    console.error("Error updating weekly availability", error)
    return NextResponse.json({ error: "No se pudo guardar la disponibilidad" }, { status: 500 })
  }
}
