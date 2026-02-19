import { NextResponse } from "next/server"
import { z } from "zod"

import { rechargeWalletForUser } from "@/lib/wallet"

const bodySchema = z.object({
  userId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive(),
})

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json())
    await rechargeWalletForUser({ userId: body.userId, amount: body.amount })
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

    if (code === "INVALID_AMOUNT") {
      return NextResponse.json({ error: "Monto inválido" }, { status: 400 })
    }

    console.error("Error recharging wallet", error)
    return NextResponse.json({ error: "No se pudo recargar el saldo" }, { status: 500 })
  }
}
