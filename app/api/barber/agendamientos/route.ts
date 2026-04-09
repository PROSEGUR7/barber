import { NextResponse } from "next/server"
import { z } from "zod"

import { getAdminAppointments } from "@/lib/admin"
import { addAvailabilityException, ensureMaterializedEmployeeAvailability } from "@/lib/availability"
import { resolveEmployeeIdForUser } from "@/lib/barber-dashboard"
import { getActiveServices, reserveAppointments } from "@/lib/bookings"
import { resolveTenantSchemaForRequest } from "@/lib/tenant"

export const runtime = "nodejs"

function jsonError(status: number, payload: { error: string; code?: string }) {
  return NextResponse.json(
    {
      ok: false,
      ...payload,
    },
    { status },
  )
}

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) {
    return undefined
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined
  }

  return Math.trunc(parsed)
}

const isoDateSchema = z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
const hhmmSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

const createAppointmentSchema = z.object({
  action: z.literal("create"),
  clientUserId: z.coerce.number().int().positive(),
  serviceIds: z.array(z.coerce.number().int().positive()).min(1).max(2),
  start: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Invalid start datetime",
  }),
})

const createGroupAppointmentSchema = z.object({
  action: z.literal("group"),
  clientUserIds: z.array(z.coerce.number().int().positive()).min(2).max(20),
  serviceIds: z.array(z.coerce.number().int().positive()).min(1).max(2),
  start: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Invalid start datetime",
  }),
})

const blockAvailabilitySchema = z.object({
  action: z.literal("block"),
  date: isoDateSchema,
  startTime: hhmmSchema,
  endTime: hhmmSchema,
  note: z.string().trim().max(300).optional(),
})

const appointmentActionSchema = z.discriminatedUnion("action", [
  createAppointmentSchema,
  createGroupAppointmentSchema,
  blockAvailabilitySchema,
])

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const searchParams = url.searchParams

    const userId = parsePositiveInt(searchParams.get("userId"))
    if (!userId) {
      return jsonError(400, {
        code: "INVALID_USER_ID",
        error: "Se requiere un userId válido.",
      })
    }

    const status = searchParams.get("status") ?? undefined
    const clientId = parsePositiveInt(searchParams.get("clientId"))
    const fromDate = searchParams.get("fromDate") ?? undefined
    const toDate = searchParams.get("toDate") ?? undefined
    const limit = parsePositiveInt(searchParams.get("limit"))

    const tenantSchema = await resolveTenantSchemaForRequest(request)
    const employeeId = await resolveEmployeeIdForUser(userId, tenantSchema)

    const appointments = await getAdminAppointments({
      status,
      employeeId,
      clientId,
      fromDate,
      toDate,
      limit,
      tenantSchema,
    })

    return NextResponse.json({ ok: true, appointments }, { status: 200 })
  } catch (error) {
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
        ? ((error as { code?: string }).code as string)
        : null

    if (code === "EMPLOYEE_PROFILE_NOT_FOUND") {
      return jsonError(409, {
        code,
        error: "Tu cuenta no tiene perfil de empleado.",
      })
    }

    if (error instanceof Error && error.message === "DATABASE_URL env var is not set") {
      return jsonError(503, {
        code: "DATABASE_NOT_CONFIGURED",
        error: "El servidor no está configurado (DATABASE_URL faltante).",
      })
    }

    console.error("Barber agendamientos API error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudieron cargar los agendamientos.",
    })
  }
}

export async function POST(request: Request) {
  try {
    const tenantSchema = await resolveTenantSchemaForRequest(request)

    const url = new URL(request.url)
    const userId = parsePositiveInt(url.searchParams.get("userId"))
    if (!userId) {
      return jsonError(400, {
        code: "INVALID_USER_ID",
        error: "Se requiere un userId válido.",
      })
    }

    const employeeId = await resolveEmployeeIdForUser(userId, tenantSchema)
    const payload = appointmentActionSchema.parse(await request.json())

    if (payload.action === "create") {
      const appointment = await reserveAppointments({
        userId: payload.clientUserId,
        employeeId,
        serviceIds: payload.serviceIds,
        start: payload.start,
        tenantSchema,
      })

      return NextResponse.json({ ok: true, action: payload.action, appointmentIds: appointment.appointmentIds }, { status: 201 })
    }

    if (payload.action === "group") {
      const activeServices = await getActiveServices(tenantSchema)
      const totalDurationMin = payload.serviceIds.reduce((acc, serviceId) => {
        const matchedService = activeServices.find((service) => service.id === serviceId)
        const duration = Number(matchedService?.durationMin ?? 0)
        return acc + (Number.isFinite(duration) && duration > 0 ? Math.trunc(duration) : 0)
      }, 0)

      if (!Number.isFinite(totalDurationMin) || totalDurationMin <= 0) {
        return jsonError(400, {
          code: "INVALID_GROUP_SERVICE_DURATION",
          error: "No se pudo calcular la duración del servicio grupal.",
        })
      }

      let currentStart = new Date(payload.start)
      const appointmentIds: number[] = []

      for (const clientUserId of payload.clientUserIds) {
        const appointment = await reserveAppointments({
          userId: clientUserId,
          employeeId,
          serviceIds: payload.serviceIds,
          start: currentStart.toISOString(),
          tenantSchema,
        })

        appointmentIds.push(...appointment.appointmentIds)
        currentStart = new Date(currentStart.getTime() + totalDurationMin * 60 * 1000)
      }

      return NextResponse.json(
        {
          ok: true,
          action: payload.action,
          appointmentIds,
          totalCreated: appointmentIds.length,
        },
        { status: 201 },
      )
    }

    if (payload.startTime >= payload.endTime) {
      return jsonError(400, {
        code: "INVALID_TIME_RANGE",
        error: "La hora fin debe ser mayor que la hora inicio.",
      })
    }

    await addAvailabilityException({
      employeeId,
      exception: {
        type: "custom",
        date: payload.date,
        startTime: payload.startTime,
        endTime: payload.endTime,
        note: payload.note,
      },
      tenantSchema,
    })

    await ensureMaterializedEmployeeAvailability({
      employeeId,
      fromDate: payload.date,
      days: 60,
      tenantSchema,
    })

    return NextResponse.json({ ok: true, action: payload.action }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(400, {
        code: "INVALID_PAYLOAD",
        error: "Datos inválidos para crear la acción de agenda.",
      })
    }

    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
        ? ((error as { code?: string }).code as string)
        : null

    if (code === "EMPLOYEE_PROFILE_NOT_FOUND") {
      return jsonError(409, {
        code,
        error: "Tu cuenta no tiene perfil de empleado.",
      })
    }

    if (code === "SLOT_NOT_AVAILABLE" || code === "SLOT_ALREADY_TAKEN") {
      return jsonError(409, {
        code,
        error: "Ese horario ya no está disponible para tu agenda.",
      })
    }

    if (code === "CLIENT_PROFILE_NOT_FOUND") {
      return jsonError(404, {
        code,
        error: "Alguno de los clientes no tiene perfil válido para agendar.",
      })
    }

    if (code === "SERVICE_NOT_FOUND") {
      return jsonError(404, {
        code,
        error: "El servicio seleccionado no existe o no está activo.",
      })
    }

    if (code === "CLIENT_DAILY_LIMIT") {
      return jsonError(409, {
        code,
        error: "El cliente alcanzó el límite diario de citas.",
      })
    }

    if (error instanceof Error && error.message === "DATABASE_URL env var is not set") {
      return jsonError(503, {
        code: "DATABASE_NOT_CONFIGURED",
        error: "El servidor no está configurado (DATABASE_URL faltante).",
      })
    }

    console.error("Barber agendamientos action API error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudo completar la acción de agenda.",
    })
  }
}
