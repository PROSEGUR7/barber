import { NextResponse } from "next/server"
import { z } from "zod"

import {
  getWeeklyAvailability,
  setWeeklyAvailability,
  ensureMaterializedEmployeeAvailability,
} from "@/lib/availability"

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida")

const ruleSchema = z.object({
  dow: z.number().int().min(0).max(6),
  startTime: timeSchema,
  endTime: timeSchema,
  active: z.boolean().optional(),
})

const putSchema = z.object({
  employeeId: z.number().int().positive(),
  rules: z.array(ruleSchema).max(60),
  materializeDays: z.number().int().min(1).max(120).optional().default(60),
  fromDate: z
    .string()
    .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, "Fecha inválida")
    .optional(),
})

function todayYmdUtc(): string {
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(now.getUTCDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const employeeId = z.coerce.number().int().positive().parse(url.searchParams.get("employeeId"))

    const rules = await getWeeklyAvailability(employeeId)
    return NextResponse.json({ rules })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 })
    }

    console.error("Error fetching weekly availability", error)
    return NextResponse.json({ error: "No se pudo obtener el horario semanal" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const payload = putSchema.parse(await request.json())

    // NOTE: This project currently does not enforce auth on API routes.
    // Consider restricting this route to admin/employee sessions.

    await setWeeklyAvailability({ employeeId: payload.employeeId, rules: payload.rules })

    const fromDate = payload.fromDate ?? todayYmdUtc()
    await ensureMaterializedEmployeeAvailability({
      employeeId: payload.employeeId,
      fromDate,
      days: payload.materializeDays,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", issues: error.flatten() }, { status: 400 })
    }

    console.error("Error updating weekly availability", error)
    return NextResponse.json({ error: "No se pudo guardar el horario semanal" }, { status: 500 })
  }
}
