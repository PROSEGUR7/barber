import { NextResponse } from "next/server"
import { z } from "zod"

import { findUserByEmail } from "@/lib/auth"
import {
  createPromoCodeForAdmin,
  listPromoCodesForAdmin,
  PromoCodeAlreadyExistsError,
  PromoCodeServiceNotFoundError,
} from "@/lib/wallet"
import { resolveTenantSchemaForAdminRequest } from "@/lib/tenant"

export const runtime = "nodejs"

const createPromoSchema = z.object({
  code: z.string().trim().min(3).max(64),
  description: z.string().trim().min(2).max(200),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  serviceIds: z.array(z.coerce.number().int().positive()).optional().nullable(),
  discountPercent: z.coerce.number().min(1).max(100),
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

  return { ok: true as const, email: userEmail }
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

    const adminCheck = await requireAdminFromRequest(request, tenantSchema)
    if (!adminCheck.ok) {
      return adminCheck.response
    }

    const promoCodes = await listPromoCodesForAdmin({ tenantSchema })

    return NextResponse.json(
      {
        ok: true,
        promoCodes,
      },
      { status: 200 },
    )
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_URL env var is not set") {
      return jsonError(503, {
        code: "DATABASE_NOT_CONFIGURED",
        error: "El servidor no está configurado (DATABASE_URL faltante).",
      })
    }

    console.error("Admin promo codes GET API error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudieron cargar los códigos promo.",
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

  const parsed = createPromoSchema.safeParse(payload)
  if (!parsed.success) {
    return jsonError(400, {
      code: "INVALID_PAYLOAD",
      error: "Datos inválidos para crear el código promo.",
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

    const promoCode = await createPromoCodeForAdmin({
      code: parsed.data.code,
      description: parsed.data.description,
      expiresAt: parsed.data.expiresAt,
      serviceIds: parsed.data.serviceIds,
      discountPercent: parsed.data.discountPercent,
      active: parsed.data.active,
      tenantSchema,
    })

    return NextResponse.json({ ok: true, promoCode }, { status: 201 })
  } catch (error) {
    if (error instanceof PromoCodeAlreadyExistsError) {
      return jsonError(409, {
        code: "PROMO_CODE_ALREADY_EXISTS",
        error: "Ese código promo ya existe.",
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

    console.error("Admin promo codes POST API error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudo crear el código promo.",
    })
  }
}
