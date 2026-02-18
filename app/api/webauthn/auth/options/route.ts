import { NextResponse } from "next/server"

import { generatePasskeyAuthenticationOptions } from "@/lib/webauthn"

export const runtime = "nodejs"

type Body = {
  email?: unknown
  rpIdHint?: unknown
}

function jsonError(
  status: number,
  payload: { code: string; error: string; field?: string },
) {
  return NextResponse.json(
    {
      ok: false,
      ...payload,
    },
    { status },
  )
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function POST(request: Request) {
  let body: Body

  try {
    body = (await request.json()) as Body
  } catch {
    return jsonError(400, { code: "INVALID_JSON", error: "Solicitud inválida." })
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  if (!email) {
    return jsonError(400, {
      code: "EMAIL_REQUIRED",
      error: "Ingresa tu correo electrónico.",
      field: "email",
    })
  }

  if (!isValidEmail(email)) {
    return jsonError(400, {
      code: "EMAIL_INVALID",
      error: "Ingresa un correo electrónico válido.",
      field: "email",
    })
  }

  const rpIdHint = typeof body.rpIdHint === "string" ? body.rpIdHint : null
  const requestOrigin = request.headers.get("origin")

  try {
    const options = await generatePasskeyAuthenticationOptions(email, {
      requestOrigin,
      rpIdHint,
    })

    return NextResponse.json({ ok: true, options }, { status: 200 })
  } catch (error) {
    if (error instanceof Error) {
      switch (error.message) {
        case "USER_NOT_FOUND":
          return jsonError(404, {
            code: "USER_NOT_FOUND",
            error: "No existe una cuenta con ese correo.",
            field: "email",
          })
        case "NO_PASSKEYS":
          return jsonError(409, {
            code: "NO_PASSKEYS",
            error: "Tu cuenta aún no tiene llaves registradas.",
          })
        default:
          break
      }
    }

    console.error("WebAuthn auth options error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudieron generar las opciones de llave de acceso.",
    })
  }
}
