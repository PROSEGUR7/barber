import { NextResponse } from "next/server"
import { z } from "zod"

import { getEmployeesWithStats, registerEmployee } from "@/lib/admin"
import { UserAlreadyExistsError } from "@/lib/auth"
import { resolveTenantSchemaForAdminRequest } from "@/lib/tenant"

export const runtime = "nodejs"

const createEmployeeSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  password: z.string().min(8),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(20)
    .regex(/^[0-9+\-\s]+$/),
})

function jsonError(status: number, payload: { error: string; code?: string }) {
  return NextResponse.json(
    {
      ok: false,
      ...payload,
    },
    { status },
  )
}

export async function GET(request: Request) {
  try {
    const tenantSchema = await resolveTenantSchemaForAdminRequest(request)
    if (!tenantSchema) {
      return jsonError(400, {
        code: "TENANT_NOT_RESOLVED",
        error: "No se pudo resolver el tenant de la sesión.",
      })
    }
    const employees = await getEmployeesWithStats({ tenantSchema })
    return NextResponse.json({ ok: true, employees }, { status: 200 })
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_URL env var is not set") {
      return jsonError(503, {
        code: "DATABASE_NOT_CONFIGURED",
        error: "El servidor no está configurado (DATABASE_URL faltante).",
      })
    }

    console.error("Admin employees API error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudieron cargar los empleados.",
    })
  }
}

export async function POST(request: Request) {
  let payload: unknown

  try {
    payload = await request.json()
  } catch {
    return jsonError(400, {
      code: "INVALID_JSON",
      error: "Solicitud inválida.",
    })
  }

  const parsed = createEmployeeSchema.safeParse(payload)
  if (!parsed.success) {
    return jsonError(400, {
      code: "INVALID_PAYLOAD",
      error: "Datos inválidos para crear el empleado.",
    })
  }

  try {
    const tenantSchema = await resolveTenantSchemaForAdminRequest(request)
    if (!tenantSchema) {
      return jsonError(400, {
        code: "TENANT_NOT_RESOLVED",
        error: "No se pudo resolver el tenant de la sesión.",
      })
    }
    const employee = await registerEmployee({
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
      phone: parsed.data.phone,
      tenantSchema,
    })

    return NextResponse.json({ ok: true, employee }, { status: 201 })
  } catch (error) {
    if (error instanceof UserAlreadyExistsError) {
      return jsonError(409, {
        code: "USER_ALREADY_EXISTS",
        error: "Ya existe un usuario con ese correo.",
      })
    }

    if (error instanceof Error && error.message === "DATABASE_URL env var is not set") {
      return jsonError(503, {
        code: "DATABASE_NOT_CONFIGURED",
        error: "El servidor no está configurado (DATABASE_URL faltante).",
      })
    }

    console.error("Admin create employee API error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudo crear el empleado.",
    })
  }
}
