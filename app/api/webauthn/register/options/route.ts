import { NextResponse } from "next/server"
import { z } from "zod"

import { generatePasskeyRegistrationOptions } from "@/lib/webauthn"

const bodySchema = z.object({
  userId: z.coerce.number().int().positive(),
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
    const { userId } = bodySchema.parse(json)

    const preferPlatform = shouldPreferPlatformAuthenticator(request.headers.get("user-agent"))

    const options = await generatePasskeyRegistrationOptions(
      userId,
      preferPlatform
        ? {
            authenticatorAttachment: "platform",
            residentKey: "preferred",
            userVerification: "required",
          }
        : undefined,
    )

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
