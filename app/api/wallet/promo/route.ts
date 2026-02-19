import { NextResponse } from "next/server"
import { z } from "zod"

import { redeemPromoCodeForUser } from "@/lib/wallet"

const bodySchema = z.object({
  userId: z.coerce.number().int().positive(),
  code: z.string().trim().min(1).max(40),
})

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json())
    await redeemPromoCodeForUser({ userId: body.userId, code: body.code })
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

    if (code === "CLIENT_PROFILE_NOT_FOUND") {
      return NextResponse.json({ error: "Tu cuenta no tiene perfil de cliente." }, { status: 409 })
    }

    if (code === "PROMO_NOT_FOUND") {
      return NextResponse.json({ error: "Código promocional no válido" }, { status: 404 })
    }

    if (code === "PROMO_INACTIVE") {
      return NextResponse.json({ error: "Este código ya no está disponible" }, { status: 409 })
    }

    console.error("Error redeeming promo code", error)
    return NextResponse.json({ error: "No se pudo aplicar el código" }, { status: 500 })
  }
}
