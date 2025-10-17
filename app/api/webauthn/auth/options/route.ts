import { NextResponse } from "next/server"
import { z } from "zod"

import { generatePasskeyAuthenticationOptions } from "@/lib/webauthn"

const bodySchema = z.object({
  email: z.string().email(),
})

export async function POST(request: Request) {
  try {
    const json = await request.json()
    const { email } = bodySchema.parse(json)

    const options = await generatePasskeyAuthenticationOptions(email)

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
          { error: "No encontramos una cuenta con este correo" },
          { status: 404 },
        )
      }
      if (error.message === "NO_PASSKEYS") {
        return NextResponse.json(
          { error: "Este usuario aún no tiene llaves de acceso registradas" },
          { status: 404 },
        )
      }
    }

    console.error("Error generating WebAuthn authentication options", error)

    return NextResponse.json(
      { error: "No se pudieron generar las opciones de autenticación" },
      { status: 500 },
    )
  }
}
