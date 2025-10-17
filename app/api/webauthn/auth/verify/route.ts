import { NextResponse } from "next/server"
import { z } from "zod"

import { verifyPasskeyAuthentication } from "@/lib/webauthn"

const bodySchema = z.object({
  credential: z.any(),
})

export async function POST(request: Request) {
  try {
    const json = await request.json()
    const { credential } = bodySchema.parse(json)

    const hostHeader = request.headers.get("host")
    const urlHost = (() => {
      try {
        return new URL(request.url).hostname
      } catch {
        return null
      }
    })()

    const { verified, user } = await verifyPasskeyAuthentication({
      credential,
      requestOrigin: request.headers.get("origin"),
      rpIdHint: hostHeader ?? urlHost,
    })

    if (!verified) {
      return NextResponse.json(
        { error: "No se pudo verificar la llave de acceso" },
        { status: 401 },
      )
    }

    return NextResponse.json({
      user,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos" },
        { status: 400 },
      )
    }

    if (error instanceof Error) {
      switch (error.message) {
        case "PASSKEY_NOT_FOUND":
          return NextResponse.json(
            { error: "No encontramos esa llave de acceso" },
            { status: 404 },
          )
        case "CHALLENGE_NOT_FOUND":
          return NextResponse.json(
            { error: "La solicitud de autenticación expiró. Intenta de nuevo." },
            { status: 410 },
          )
        case "AUTHENTICATION_NOT_VERIFIED":
          return NextResponse.json(
            { error: "La firma de la llave no es válida" },
            { status: 401 },
          )
        case "USER_NOT_FOUND":
          return NextResponse.json(
            { error: "La cuenta asociada a la llave ya no existe" },
            { status: 404 },
          )
        default:
          break
      }
    }

    console.error("Error verifying WebAuthn authentication", error)

    return NextResponse.json(
      { error: "No se pudo iniciar sesión con llave de acceso" },
      { status: 500 },
    )
  }
}
