import { NextResponse } from "next/server"
import { z } from "zod"

import {
  addAvailabilityException,
  listAvailabilityExceptions,
  ensureMaterializedEmployeeAvailability,
  type AvailabilityException,
} from "@/lib/availability"

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida")

const dateSchema = z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, "Fecha inválida")

const exceptionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("off"),
    date: dateSchema,
    note: z.string().max(300).optional(),
  }),
  z.object({
    type: z.literal("custom"),
    date: dateSchema,
    startTime: timeSchema,
    endTime: timeSchema,
    note: z.string().max(300).optional(),
  }),
])

const postSchema = z.object({
  employeeId: z.number().int().positive(),
  exception: exceptionSchema,
  materializeDays: z.number().int().min(1).max(120).optional().default(60),
})

const querySchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  fromDate: dateSchema,
  toDate: dateSchema,
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
    const params = querySchema.parse({
      employeeId: url.searchParams.get("employeeId"),
      fromDate: url.searchParams.get("fromDate"),
      toDate: url.searchParams.get("toDate"),
    })

    const exceptions = await listAvailabilityExceptions({
      employeeId: params.employeeId,
      fromDate: params.fromDate,
      toDate: params.toDate,
    })

    return NextResponse.json({ exceptions })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Parámetros inválidos", issues: error.flatten() }, { status: 400 })
    }

    console.error("Error fetching availability exceptions", error)
    return NextResponse.json({ error: "No se pudieron cargar las excepciones" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const payload = postSchema.parse(await request.json())

    // NOTE: This project currently does not enforce auth on API routes.
    // Consider restricting this route to admin/employee sessions.

    await addAvailabilityException({ employeeId: payload.employeeId, exception: payload.exception as AvailabilityException })

    const today = todayYmdUtc()
    const fromDate = payload.exception.date < today ? today : payload.exception.date
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

    console.error("Error creating availability exception", error)
    return NextResponse.json({ error: "No se pudo guardar la excepción" }, { status: 500 })
  }
}
