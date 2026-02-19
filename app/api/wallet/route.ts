import { NextResponse } from "next/server"
import { z } from "zod"

import { getWalletDataForUser } from "@/lib/wallet"

const querySchema = z.object({
  userId: z.coerce.number().int().positive(),
})

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const { userId } = querySchema.parse({ userId: url.searchParams.get("userId") })

    const wallet = await getWalletDataForUser(userId)
    return NextResponse.json(wallet)
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

    if (code === "CLIENT_PROFILE_NOT_FOUND") {
      return NextResponse.json({ error: "Tu cuenta no tiene perfil de cliente." }, { status: 409 })
    }

    console.error("Error fetching wallet", error)
    return NextResponse.json({ error: "No se pudo cargar el wallet" }, { status: 500 })
  }
}
