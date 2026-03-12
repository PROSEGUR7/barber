import { NextResponse } from "next/server"
import { z } from "zod"

import { findUserByEmail } from "@/lib/auth"
import { PromoCodeNotFoundError, PromoCodeServiceNotFoundError, updatePromoCodeForAdmin } from "@/lib/wallet"
import { resolveTenantSchemaForAdminRequest } from "@/lib/tenant"

export const runtime = "nodejs"

const paramsSchema = z.object({
  code: z.string().trim().min(1),
})

const updatePromoSchema = z.object({
  description: z.string().trim().min(2).max(200).optional(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  serviceIds: z.array(z.coerce.number().int().positive()).optional().nullable(),
  discountPercent: z.coerce.number().min(1).max(100).optional(),
  active: z.boolean().optional(),
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

async function requireAdminFromRequest(request: Request, tenantSchema: string) {
  const userEmail = request.headers.get("x-user-email")?.trim().toLowerCase() ?? ""

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
    return { ok: false as const, response: jsonError(401, { code: "UNAUTHORIZED", error: "Debes iniciar sesión como administrador." }) }
  }

  const user = await findUserByEmail(userEmail, tenantSchema)
  if (!user || user.role !== "admin") {
    return { ok: false as const, response: jsonError(403, { code: "FORBIDDEN", error: "Solo administradores pueden gestionar códigos promo." }) }
  }

  return { ok: true as const }
}

export async function PATCH(request: Request, context: { params: Promise<{ code: string }> }) {
  const rawParams = await context.params
  const parsedParams = paramsSchema.safeParse(rawParams)

  if (!parsedParams.success) {
    return jsonError(400, {
      code: "INVALID_PROMO_CODE",
      error: "El código promocional no es válido.",
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

  const parsedBody = updatePromoSchema.safeParse(payload)
  if (!parsedBody.success) {
    return jsonError(400, {
      code: "INVALID_PAYLOAD",
      error: "Datos inválidos para actualizar el código promo.",
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

    const adminCheck = await requireAdminFromRequest(request, tenantSchema)
    if (!adminCheck.ok) {
      return adminCheck.response
    }

    const promoCode = await updatePromoCodeForAdmin({
      code: parsedParams.data.code,
      description: parsedBody.data.description,
      expiresAt: parsedBody.data.expiresAt,
      serviceIds: parsedBody.data.serviceIds,
      discountPercent: parsedBody.data.discountPercent,
      active: parsedBody.data.active,
      tenantSchema,
    })

    return NextResponse.json({ ok: true, promoCode }, { status: 200 })
  } catch (error) {
    if (error instanceof PromoCodeNotFoundError) {
      return jsonError(404, {
        code: "PROMO_CODE_NOT_FOUND",
        error: "No encontramos ese código promo.",
      })
    }

    if (error instanceof PromoCodeServiceNotFoundError) {
      return jsonError(404, {
        code: "PROMO_CODE_SERVICE_NOT_FOUND",
        error: "El servicio seleccionado no existe en este tenant.",
      })
    }

    const errorCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
        ? ((error as { code?: string }).code as string)
        : null

    if (errorCode === "PROMO_INVALID_DISCOUNT") {
      return jsonError(400, {
        code: "PROMO_INVALID_DISCOUNT",
        error: "El porcentaje de descuento debe estar entre 1 y 100.",
      })
    }

    if (error instanceof Error && error.message === "DATABASE_URL env var is not set") {
      return jsonError(503, {
        code: "DATABASE_NOT_CONFIGURED",
        error: "El servidor no está configurado (DATABASE_URL faltante).",
      })
    }

    console.error("Admin promo codes PATCH API error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudo actualizar el código promo.",
    })
  }
}
