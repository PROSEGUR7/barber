import { NextResponse } from "next/server"
import { z } from "zod"

import { ServiceRecordNotFoundError, deleteService, updateService } from "@/lib/admin"
import { resolveTenantSchemaForAdminRequest } from "@/lib/tenant"

export const runtime = "nodejs"

const paramsSchema = z.object({
  serviceId: z.coerce.number().int().positive(),
})

const serviceSchema = z.object({
  name: z.string().trim().min(2),
  description: z.string().trim().nullable().optional(),
  price: z.coerce.number().min(0),
  durationMin: z.coerce.number().int().min(5).max(600),
  status: z.enum(["activo", "inactivo"]).default("activo"),
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

export async function PATCH(request: Request, context: { params: Promise<{ serviceId: string }> }) {
  const rawParams = await context.params
  const parsedParams = paramsSchema.safeParse(rawParams)

  if (!parsedParams.success) {
    return jsonError(400, {
      code: "INVALID_SERVICE_ID",
      error: "El servicio seleccionado no es válido.",
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

  const parsed = serviceSchema.safeParse(payload)
  if (!parsed.success) {
    return jsonError(400, {
      code: "INVALID_PAYLOAD",
      error: "Datos inválidos para actualizar el servicio.",
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
    const service = await updateService(parsedParams.data.serviceId, {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      price: parsed.data.price,
      durationMin: parsed.data.durationMin,
      status: parsed.data.status,
      tenantSchema,
    })

    return NextResponse.json({ ok: true, service }, { status: 200 })
  } catch (error) {
    if (error instanceof ServiceRecordNotFoundError) {
      return jsonError(404, {
        code: "SERVICE_NOT_FOUND",
        error: "No se encontró el servicio seleccionado.",
      })
    }

    if (error instanceof Error && error.message === "DATABASE_URL env var is not set") {
      return jsonError(503, {
        code: "DATABASE_NOT_CONFIGURED",
        error: "El servidor no está configurado (DATABASE_URL faltante).",
      })
    }

    console.error("Admin update service API error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudo actualizar el servicio.",
    })
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ serviceId: string }> }) {
  const rawParams = await context.params
  const parsedParams = paramsSchema.safeParse(rawParams)

  if (!parsedParams.success) {
    return jsonError(400, {
      code: "INVALID_SERVICE_ID",
      error: "El servicio seleccionado no es válido.",
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
    await deleteService(parsedParams.data.serviceId, tenantSchema)
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    if (error instanceof ServiceRecordNotFoundError) {
      return jsonError(404, {
        code: "SERVICE_NOT_FOUND",
        error: "No se encontró el servicio seleccionado.",
      })
    }

    if (error instanceof Error && error.message === "DATABASE_URL env var is not set") {
      return jsonError(503, {
        code: "DATABASE_NOT_CONFIGURED",
        error: "El servidor no está configurado (DATABASE_URL faltante).",
      })
    }

    console.error("Admin delete service API error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudo eliminar el servicio.",
    })
  }
}