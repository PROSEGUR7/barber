import { NextResponse } from "next/server"

import { generatePasskeyRegistrationOptions } from "@/lib/webauthn"

export const runtime = "nodejs"

type Body = {
  userId?: unknown
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

export async function POST(request: Request) {
  let body: Body

  try {
    body = (await request.json()) as Body
  } catch {
    return jsonError(400, { code: "INVALID_JSON", error: "Solicitud inválida." })
  }

  const userId = typeof body.userId === "number" ? body.userId : Number(body.userId)
  if (!Number.isFinite(userId) || userId <= 0) {
    return jsonError(400, {
      code: "USER_ID_REQUIRED",
      error: "No se pudo identificar el usuario para registrar la llave.",
      field: "userId",
    })
  }

  const rpIdHint = typeof body.rpIdHint === "string" ? body.rpIdHint : null
  const requestOrigin = request.headers.get("origin")

  try {
    const options = await generatePasskeyRegistrationOptions(userId, {
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
            error: "No encontramos el usuario para registrar la llave.",
          })
        default:
          break
      }
    }

    console.error("WebAuthn register options error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudieron generar las opciones para registrar tu llave.",
    })
  }
}
