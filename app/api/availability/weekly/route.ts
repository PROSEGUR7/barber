import { NextResponse } from "next/server"
import { z } from "zod"

import {
  getWeeklyAvailability,
  setWeeklyAvailability,
  ensureMaterializedEmployeeAvailability,
} from "@/lib/availability"
import { resolveTenantSchemaForAdminRequest } from "@/lib/tenant"

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

function jsonError(status: number, payload: { error: string; code?: string }) {
  return NextResponse.json(
    {
      ok: false,
      ...payload,
    },
    { status },
  )
}

function getRequestUserEmail(request: Request): string {
  return request.headers.get("x-user-email")?.trim().toLowerCase() ?? ""
}

export async function GET(request: Request) {
  try {
    const userEmail = getRequestUserEmail(request)
    if (!userEmail) {
      return jsonError(401, {
        code: "AUTH_REQUIRED",
        error: "Debes iniciar sesión como administrador para consultar disponibilidad.",
      })
    }

    const tenantSchema = await resolveTenantSchemaForAdminRequest(request)
    if (!tenantSchema) {
      return jsonError(400, {
        code: "TENANT_NOT_RESOLVED",
        error: "No se pudo resolver el tenant de la sesión.",
      })
    }

    const url = new URL(request.url)
    const employeeId = z.coerce.number().int().positive().parse(url.searchParams.get("employeeId"))

    const rules = await getWeeklyAvailability(employeeId, tenantSchema)
    return NextResponse.json({ ok: true, rules })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(400, { error: "Parámetros inválidos", code: "INVALID_PARAMS" })
    }

    console.error("Error fetching weekly availability", error)
    return jsonError(500, { error: "No se pudo obtener el horario semanal", code: "SERVER_ERROR" })
  }
}

export async function PUT(request: Request) {
  try {
    const userEmail = getRequestUserEmail(request)
    if (!userEmail) {
      return jsonError(401, {
        code: "AUTH_REQUIRED",
        error: "Debes iniciar sesión como administrador para editar disponibilidad.",
      })
    }

    const tenantSchema = await resolveTenantSchemaForAdminRequest(request)
    if (!tenantSchema) {
      return jsonError(400, {
        code: "TENANT_NOT_RESOLVED",
        error: "No se pudo resolver el tenant de la sesión.",
      })
    }

    const payload = putSchema.parse(await request.json())

    await setWeeklyAvailability({ employeeId: payload.employeeId, rules: payload.rules, tenantSchema })

    const fromDate = payload.fromDate ?? todayYmdUtc()
    await ensureMaterializedEmployeeAvailability({
      employeeId: payload.employeeId,
      fromDate,
      days: payload.materializeDays,
      tenantSchema,
    })

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Datos inválidos", code: "INVALID_PAYLOAD", issues: error.flatten() },
        { status: 400 },
      )
    }

    console.error("Error updating weekly availability", error)
    return jsonError(500, { error: "No se pudo guardar el horario semanal", code: "SERVER_ERROR" })
  }
}
