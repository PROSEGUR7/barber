import { NextResponse } from "next/server"
import { z } from "zod"

import { resolveEmployeeIdForUser } from "@/lib/barber-dashboard"
import {
  addAvailabilityException,
  ensureMaterializedEmployeeAvailability,
  getWeeklyAvailability,
  listAvailabilityExceptions,
  type AvailabilityException,
} from "@/lib/availability"
import { resolveTenantSchemaForRequest } from "@/lib/tenant"

const querySchema = z.object({
  userId: z.coerce.number().int().positive(),
  from: z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/),
  to: z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/),
})

const bodySchema = z.object({
  userId: z.coerce.number().int().positive(),
  exception: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("off"),
      date: z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/),
      note: z.string().optional(),
    }),
    z.object({
      type: z.literal("custom"),
      date: z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
      note: z.string().optional(),
    }),
  ]),
})

export async function GET(request: Request) {
  try {
    const tenantSchema = await resolveTenantSchemaForRequest(request)
    const url = new URL(request.url)
    const params = querySchema.parse({
      userId: url.searchParams.get("userId"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    })

    const employeeId = await resolveEmployeeIdForUser(params.userId, tenantSchema)
    const exceptions = await listAvailabilityExceptions({ employeeId, fromDate: params.from, toDate: params.to, tenantSchema })

    return NextResponse.json({ exceptions })
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

    console.error("Error fetching availability exceptions", error)
    return NextResponse.json({ error: "No se pudieron cargar las excepciones" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const tenantSchema = await resolveTenantSchemaForRequest(request)
    const body = bodySchema.parse(await request.json())

    if (body.exception.type === "custom") {
      // Same-day availability blocks must have endTime after startTime.
      // Prevents invalid ranges like 09:00 -> 06:00 that would break materialization.
      if (body.exception.startTime >= body.exception.endTime) {
        return NextResponse.json(
          { error: "Rango horario inválido: la hora fin debe ser mayor que la hora inicio." },
          { status: 400 },
        )
      }
    }

    const employeeId = await resolveEmployeeIdForUser(body.userId, tenantSchema)

    if (body.exception.type === "custom") {
      // Ensure the exception is within the weekly working window for that weekday.
      // If the weekly table isn't deployed yet, getWeeklyAvailability returns [].
      const weekly = await getWeeklyAvailability(employeeId, tenantSchema)
      if (weekly.length > 0) {
        const [y, m, d] = body.exception.date.split("-").map((v) => Number(v))
        const dt = new Date(Date.UTC(y, m - 1, d))
        const dow = dt.getUTCDay()

        const isInsideAnyWindow = weekly.some((rule) => {
          if (rule.active === false) return false
          if (rule.dow !== dow) return false
          return body.exception.startTime >= rule.startTime && body.exception.endTime <= rule.endTime
        })

        if (!isInsideAnyWindow) {
          return NextResponse.json(
            { error: "El rango está fuera de tu horario semanal para ese día." },
            { status: 400 },
          )
        }
      }
    }

    // Prevent creating an exception over an existing exception for the same date.
    // (Keeps behavior simple and avoids conflicting materialization blocks.)
    const existing = await listAvailabilityExceptions({
      employeeId,
      fromDate: body.exception.date,
      toDate: body.exception.date,
      tenantSchema,
    })

    if (existing.length > 0) {
      const detail =
        body.exception.type === "custom"
          ? `Ya tienes una excepción registrada para ${body.exception.date} (${body.exception.startTime} - ${body.exception.endTime}).`
          : `Ya tienes una excepción registrada para ${body.exception.date}.`

      return NextResponse.json(
        {
          error: `${detail} Si necesitas cambiarla, elimina la excepción actual y crea una nueva.`,
          code: "EXCEPTION_ALREADY_EXISTS",
        },
        { status: 409 },
      )
    }

    await addAvailabilityException({ employeeId, exception: body.exception as AvailabilityException, tenantSchema })

    // Re-materialize around the exception date.
    await ensureMaterializedEmployeeAvailability({ employeeId, fromDate: body.exception.date, days: 7, tenantSchema })

    return NextResponse.json({ ok: true }, { status: 201 })
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

    console.error("Error adding availability exception", error)
    return NextResponse.json({ error: "No se pudo guardar la excepción" }, { status: 500 })
  }
}
