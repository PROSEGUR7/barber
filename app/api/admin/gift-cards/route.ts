import { NextResponse } from "next/server"
import { z } from "zod"

import {
  applyGiftCardMovement,
  createGiftCard,
  GiftCardError,
  GiftCardInactiveError,
  GiftCardInsufficientBalanceError,
  GiftCardNotFoundError,
  listGiftCardMovements,
  listGiftCards,
} from "@/lib/admin-gift-cards"
import { resolveTenantSchemaForAdminRequest } from "@/lib/tenant"

export const runtime = "nodejs"

const createSchema = z.object({
  action: z.literal("create"),
  clientId: z.number().int().positive().optional().nullable(),
  code: z.string().trim().min(4).max(64).optional().nullable(),
  amount: z.number().min(0),
  expiresAt: z.string().datetime().optional().nullable(),
  note: z.string().trim().max(300).optional().nullable(),
})

const topupSchema = z.object({
  action: z.literal("topup"),
  giftCardId: z.number().int().positive(),
  amount: z.number().positive(),
  reference: z.string().trim().max(120).optional().nullable(),
  note: z.string().trim().max(300).optional().nullable(),
})

const redeemSchema = z.object({
  action: z.literal("redeem"),
  giftCardId: z.number().int().positive(),
  amount: z.number().positive(),
  reference: z.string().trim().max(120).optional().nullable(),
  note: z.string().trim().max(300).optional().nullable(),
})

const postSchema = z.discriminatedUnion("action", [createSchema, topupSchema, redeemSchema])

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

    const search = new URL(request.url).searchParams.get("search")
    const cards = await listGiftCards({ tenantSchema, search })
    const movements = await listGiftCardMovements({ tenantSchema, limit: 80 })

    return NextResponse.json({ ok: true, cards, movements }, { status: 200 })
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_URL env var is not set") {
      return jsonError(503, {
        code: "DATABASE_NOT_CONFIGURED",
        error: "El servidor no está configurado (DATABASE_URL faltante).",
      })
    }

    console.error("Admin gift cards GET API error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudieron cargar las tarjetas regalo.",
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

  const parsed = postSchema.safeParse(payload)
  if (!parsed.success) {
    return jsonError(400, {
      code: "INVALID_PAYLOAD",
      error: "Datos inválidos para la operación de tarjeta regalo.",
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

    const createdBy = request.headers.get("x-user-email")?.trim().toLowerCase() || null

    if (parsed.data.action === "create") {
      const result = await createGiftCard({
        tenantSchema,
        clientId: parsed.data.clientId ?? null,
        amount: parsed.data.amount,
        code: parsed.data.code ?? null,
        expiresAt: parsed.data.expiresAt ?? null,
        note: parsed.data.note ?? null,
        createdBy,
      })

      return NextResponse.json({ ok: true, card: result.card, movement: result.movement }, { status: 201 })
    }

    if (parsed.data.action === "topup") {
      const result = await applyGiftCardMovement({
        tenantSchema,
        giftCardId: parsed.data.giftCardId,
        action: "topup",
        amount: parsed.data.amount,
        reference: parsed.data.reference ?? null,
        note: parsed.data.note ?? null,
        createdBy,
      })

      return NextResponse.json({ ok: true, card: result.card, movement: result.movement }, { status: 200 })
    }

    const result = await applyGiftCardMovement({
      tenantSchema,
      giftCardId: parsed.data.giftCardId,
      action: "redeem",
      amount: parsed.data.amount,
      reference: parsed.data.reference ?? null,
      note: parsed.data.note ?? null,
      createdBy,
    })

    return NextResponse.json({ ok: true, card: result.card, movement: result.movement }, { status: 200 })
  } catch (error) {
    if (error instanceof GiftCardNotFoundError) {
      return jsonError(404, {
        code: "GIFT_CARD_NOT_FOUND",
        error: error.message,
      })
    }

    if (error instanceof GiftCardInactiveError) {
      return jsonError(409, {
        code: "GIFT_CARD_INACTIVE",
        error: error.message,
      })
    }

    if (error instanceof GiftCardInsufficientBalanceError) {
      return jsonError(409, {
        code: "GIFT_CARD_INSUFFICIENT_BALANCE",
        error: error.message,
      })
    }

    if (error instanceof GiftCardError) {
      return jsonError(400, {
        code: "GIFT_CARD_OPERATION_ERROR",
        error: error.message,
      })
    }

    if (error instanceof Error && error.message === "DATABASE_URL env var is not set") {
      return jsonError(503, {
        code: "DATABASE_NOT_CONFIGURED",
        error: "El servidor no está configurado (DATABASE_URL faltante).",
      })
    }

    console.error("Admin gift cards POST API error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudo completar la operación de tarjeta regalo.",
    })
  }
}
