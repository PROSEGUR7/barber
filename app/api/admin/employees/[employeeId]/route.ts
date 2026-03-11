import { NextResponse } from "next/server"
import { z } from "zod"

import { EmployeeRecordNotFoundError, ServiceRecordNotFoundError, deleteEmployee, updateEmployee } from "@/lib/admin"
import { resolveTenantSchemaForAdminRequest } from "@/lib/tenant"

export const runtime = "nodejs"

const paramsSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
})

const updateEmployeeSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(20)
    .regex(/^[0-9+\-\s]+$/),
  serviceIds: z.array(z.coerce.number().int().positive()).optional(),
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

export async function PATCH(request: Request, context: { params: Promise<{ employeeId: string }> }) {
  const rawParams = await context.params
  const parsedParams = paramsSchema.safeParse(rawParams)

  if (!parsedParams.success) {
    return jsonError(400, {
      code: "INVALID_EMPLOYEE_ID",
      error: "El empleado seleccionado no es válido.",
    })
  }

  let payload: unknown

  try {
    payload = await request.json()
  } catch {
    return jsonError(400, {
      code: "INVALID_JSON",
      error: "Solicitud inválida.",
    })
  }

  const parsedBody = updateEmployeeSchema.safeParse(payload)
  if (!parsedBody.success) {
    return jsonError(400, {
      code: "INVALID_PAYLOAD",
      error: "Datos inválidos para actualizar el empleado.",
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
    const employee = await updateEmployee({
      employeeId: parsedParams.data.employeeId,
      name: parsedBody.data.name,
      email: parsedBody.data.email.toLowerCase(),
      phone: parsedBody.data.phone,
      serviceIds: parsedBody.data.serviceIds,
      tenantSchema,
    })

    return NextResponse.json({ ok: true, employee }, { status: 200 })
  } catch (error) {
    if (error instanceof EmployeeRecordNotFoundError) {
      return jsonError(404, {
        code: "EMPLOYEE_NOT_FOUND",
        error: "No se encontró el empleado seleccionado.",
      })
    }

    if (error instanceof ServiceRecordNotFoundError) {
      return jsonError(400, {
        code: "SERVICE_NOT_FOUND",
        error: "Uno o más servicios seleccionados no existen.",
      })
    }

    if (error instanceof Error && error.message === "DATABASE_URL env var is not set") {
      return jsonError(503, {
        code: "DATABASE_NOT_CONFIGURED",
        error: "El servidor no está configurado (DATABASE_URL faltante).",
      })
    }

    console.error("Admin update employee API error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudo actualizar el empleado.",
    })
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ employeeId: string }> }) {
  const rawParams = await context.params
  const parsedParams = paramsSchema.safeParse(rawParams)

  if (!parsedParams.success) {
    return jsonError(400, {
      code: "INVALID_EMPLOYEE_ID",
      error: "El empleado seleccionado no es válido.",
    })
  }

  try {
    const tenantSchema = await resolveTenantSchemaForAdminRequest(_request)
    if (!tenantSchema) {
      return jsonError(400, {
        code: "TENANT_NOT_RESOLVED",
        error: "No se pudo resolver el tenant de la sesión.",
      })
    }
    await deleteEmployee(parsedParams.data.employeeId, tenantSchema)
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    if (error instanceof EmployeeRecordNotFoundError) {
      return jsonError(404, {
        code: "EMPLOYEE_NOT_FOUND",
        error: "No se encontró el empleado seleccionado.",
      })
    }

    if (error instanceof Error && error.message === "DATABASE_URL env var is not set") {
      return jsonError(503, {
        code: "DATABASE_NOT_CONFIGURED",
        error: "El servidor no está configurado (DATABASE_URL faltante).",
      })
    }

    console.error("Admin delete employee API error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudo eliminar el empleado.",
    })
  }
}