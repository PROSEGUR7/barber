import { NextResponse } from "next/server"
import { z } from "zod"

import { getAppointmentsForEmployee } from "@/lib/barber-dashboard"
import { resolveTenantSchemaForRequest } from "@/lib/tenant"

const querySchema = z.object({
  userId: z.coerce.number().int().positive(),
  scope: z.enum(["today", "upcoming", "history"]).default("today"),
  date: z
    .string()
    .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
    .optional(),
})

export async function GET(request: Request) {
  try {
    const tenantSchema = await resolveTenantSchemaForRequest(request)
    const url = new URL(request.url)
    const params = querySchema.parse({
      userId: url.searchParams.get("userId"),
      scope: url.searchParams.get("scope") ?? undefined,
      date: url.searchParams.get("date") ?? undefined,
    })

    const appointments = await getAppointmentsForEmployee({
      userId: params.userId,
      scope: params.scope,
      date: params.date,
      tenantSchema,
    })

    return NextResponse.json({ appointments })
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

    console.error("Error fetching employee appointments", error)
    return NextResponse.json({ error: "No se pudieron cargar las citas" }, { status: 500 })
  }
}
