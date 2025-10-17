import { NextResponse } from "next/server"
import { z } from "zod"

import { generatePasskeyRegistrationOptions } from "@/lib/webauthn"

const bodySchema = z.object({
  userId: z.coerce.number().int().positive(),
})

export async function POST(request: Request) {
  try {
    const json = await request.json()
    const { userId } = bodySchema.parse(json)

    const options = await generatePasskeyRegistrationOptions(userId)

    return NextResponse.json({ options })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos" },
        { status: 400 },
      )
    }

    if (error instanceof Error) {
      if (error.message === "USER_NOT_FOUND") {
        return NextResponse.json(
          { error: "No encontramos al usuario" },
          { status: 404 },
        )
      }
    }

    console.error("Error generating WebAuthn registration options", error)

    return NextResponse.json(
      { error: "No se pudieron generar las opciones de registro" },
      { status: 500 },
    )
  }
}
