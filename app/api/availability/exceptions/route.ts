import { NextResponse } from "next/server"
import { z } from "zod"

import {
  addAvailabilityException,
  listAvailabilityExceptions,
  ensureMaterializedEmployeeAvailability,
  type AvailabilityException,
} from "@/lib/availability"
import { resolveTenantSchemaForAdminRequest } from "@/lib/tenant"

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

function jsonError(status: number, payload: { error: string; code?: string; issues?: unknown }) {
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
        error: "Debes iniciar sesión como administrador para consultar excepciones.",
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
    const params = querySchema.parse({
      employeeId: url.searchParams.get("employeeId"),
      fromDate: url.searchParams.get("fromDate"),
      toDate: url.searchParams.get("toDate"),
    })

    const exceptions = await listAvailabilityExceptions({
      employeeId: params.employeeId,
      fromDate: params.fromDate,
      toDate: params.toDate,
      tenantSchema,
    })

    return NextResponse.json({ ok: true, exceptions })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(400, { error: "Parámetros inválidos", code: "INVALID_PARAMS", issues: error.flatten() })
    }

    console.error("Error fetching availability exceptions", error)
    return jsonError(500, { error: "No se pudieron cargar las excepciones", code: "SERVER_ERROR" })
  }
}

export async function POST(request: Request) {
  try {
    const userEmail = getRequestUserEmail(request)
    if (!userEmail) {
      return jsonError(401, {
        code: "AUTH_REQUIRED",
        error: "Debes iniciar sesión como administrador para guardar excepciones.",
      })
    }

    const tenantSchema = await resolveTenantSchemaForAdminRequest(request)
    if (!tenantSchema) {
      return jsonError(400, {
        code: "TENANT_NOT_RESOLVED",
        error: "No se pudo resolver el tenant de la sesión.",
      })
    }

    const payload = postSchema.parse(await request.json())

    await addAvailabilityException({
      employeeId: payload.employeeId,
      exception: payload.exception as AvailabilityException,
      tenantSchema,
    })

    const today = todayYmdUtc()
    const fromDate = payload.exception.date < today ? today : payload.exception.date
    await ensureMaterializedEmployeeAvailability({
      employeeId: payload.employeeId,
      fromDate,
      days: payload.materializeDays,
      tenantSchema,
    })

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(400, { error: "Datos inválidos", code: "INVALID_PAYLOAD", issues: error.flatten() })
    }

    console.error("Error creating availability exception", error)
    return jsonError(500, { error: "No se pudo guardar la excepción", code: "SERVER_ERROR" })
  }
}
