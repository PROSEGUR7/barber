import { NextResponse } from "next/server"
import { z } from "zod"

import { AdminUserRecordNotFoundError, updateAdminUserEmail } from "@/lib/admin"
import { resolveTenantSchemaForRequest } from "@/lib/tenant"

export const runtime = "nodejs"

const paramsSchema = z.object({
  userId: z.coerce.number().int().positive(),
})

const bodySchema = z.object({
  email: z.string().trim().email(),
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

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const rawParams = await context.params
  const parsedParams = paramsSchema.safeParse(rawParams)

  if (!parsedParams.success) {
    return jsonError(400, {
      code: "INVALID_ADMIN_ID",
      error: "El administrador seleccionado no es válido.",
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

  const parsedBody = bodySchema.safeParse(payload)
  if (!parsedBody.success) {
    return jsonError(400, {
      code: "INVALID_PAYLOAD",
      error: "Datos inválidos para actualizar el administrador.",
    })
  }

  try {
    const tenantSchema = await resolveTenantSchemaForRequest(request)
    const adminUser = await updateAdminUserEmail({
      userId: parsedParams.data.userId,
      email: parsedBody.data.email.toLowerCase(),
      tenantSchema,
    })

    return NextResponse.json({ ok: true, adminUser }, { status: 200 })
  } catch (error) {
    if (error instanceof AdminUserRecordNotFoundError) {
      return jsonError(404, {
        code: "ADMIN_NOT_FOUND",
        error: "No se encontró el administrador seleccionado.",
      })
    }

    if (error instanceof Error && error.message === "DATABASE_URL env var is not set") {
      return jsonError(503, {
        code: "DATABASE_NOT_CONFIGURED",
        error: "El servidor no está configurado (DATABASE_URL faltante).",
      })
    }

    console.error("Admin settings update API error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudo actualizar el administrador.",
    })
  }
}
