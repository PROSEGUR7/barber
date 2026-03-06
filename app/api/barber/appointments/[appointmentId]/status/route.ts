import { NextResponse } from "next/server"
import { z } from "zod"

import { updateEmployeeAppointmentStatus } from "@/lib/barber-dashboard"
import { resolveTenantSchemaForRequest } from "@/lib/tenant"

const paramsSchema = z.object({
  appointmentId: z.coerce.number().int().positive(),
})

const bodySchema = z.object({
  userId: z.coerce.number().int().positive(),
  status: z.enum(["cancelada", "completada"]),
})

export async function POST(
  request: Request,
  context: { params: Promise<{ appointmentId: string }> },
) {
  try {
    const tenantSchema = await resolveTenantSchemaForRequest(request)
    const rawParams = await context.params
    const { appointmentId } = paramsSchema.parse(rawParams)
    const body = bodySchema.parse(await request.json())

    await updateEmployeeAppointmentStatus({
      userId: body.userId,
      appointmentId,
      status: body.status,
      tenantSchema,
    })

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

    if (code === "APPOINTMENT_STATUS_UPDATE_FAILED") {
      return NextResponse.json({ error: "No se pudo actualizar el estado de la cita" }, { status: 409 })
    }

    console.error("Error updating appointment status", error)
    return NextResponse.json({ error: "No se pudo actualizar la cita" }, { status: 500 })
  }
}
