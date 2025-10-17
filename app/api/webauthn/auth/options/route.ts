import { NextResponse } from "next/server"
import { z } from "zod"

import { generatePasskeyAuthenticationOptions } from "@/lib/webauthn"

const bodySchema = z.object({
  email: z.string().email(),
})

function shouldPreferPlatformAuthenticator(userAgent: string | null): boolean {
  if (!userAgent) {
    return false
  }

  const ua = userAgent.toLowerCase()
  if (ua.includes("iphone") || ua.includes("ipod") || ua.includes("android")) {
    return true
  }

  if (ua.includes("ipad") || (ua.includes("macintosh") && ua.includes("mobile"))) {
    return true
  }

  return false
}

export async function POST(request: Request) {
  try {
    const json = await request.json()
    const { email } = bodySchema.parse(json)

    const preferPlatform = shouldPreferPlatformAuthenticator(request.headers.get("user-agent"))

    const options = await generatePasskeyAuthenticationOptions(email, {
      overrides: {
        userVerification: preferPlatform ? "required" : "preferred",
        preferPlatformAuthenticator: preferPlatform,
      },
      requestOrigin: request.headers.get("origin"),
    })

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
