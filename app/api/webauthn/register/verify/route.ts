import { NextResponse } from "next/server"
import { z } from "zod"

import { verifyPasskeyRegistration } from "@/lib/webauthn"

const bodySchema = z.object({
  userId: z.coerce.number().int().positive(),
  credential: z.any(),
})

export async function POST(request: Request) {
  try {
    const json = await request.json()
    const { userId, credential } = bodySchema.parse(json)

    const verification = await verifyPasskeyRegistration({
      userId,
      credential,
      requestOrigin: request.headers.get("origin"),
    })

    return NextResponse.json({ verification })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos" },
        { status: 400 },
      )
    }

    if (error instanceof Error) {
      switch (error.message) {
        case "USER_NOT_FOUND":
          return NextResponse.json(
            { error: "No encontramos al usuario" },
            { status: 404 },
          )
        case "CHALLENGE_NOT_FOUND":
          return NextResponse.json(
            { error: "La solicitud de registro expiró. Intenta de nuevo." },
            { status: 410 },
          )
        case "REGISTRATION_NOT_VERIFIED":
          return NextResponse.json(
            { error: "No se pudo verificar la llave de acceso" },
            { status: 400 },
          )
        default:
          break
      }
    }

    console.error("Error verifying WebAuthn registration", error)

    return NextResponse.json(
      { error: "No se pudo confirmar la llave de acceso" },
      { status: 500 },
    )
  }
}
