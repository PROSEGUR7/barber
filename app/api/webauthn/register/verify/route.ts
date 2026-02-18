import { NextResponse } from "next/server"

import { verifyPasskeyRegistration } from "@/lib/webauthn"

export const runtime = "nodejs"

type Body = {
  userId?: unknown
  credential?: unknown
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

  if (!body.credential || typeof body.credential !== "object") {
    return jsonError(400, {
      code: "CREDENTIAL_REQUIRED",
      error: "No se recibió la información de la llave.",
      field: "credential",
    })
  }

  const rpIdHint = typeof body.rpIdHint === "string" ? body.rpIdHint : null
  const requestOrigin = request.headers.get("origin")

  try {
    const result = await verifyPasskeyRegistration({
      userId,
      credential: body.credential as any,
      requestOrigin,
      rpIdHint,
    })

    if (!result.verified) {
      return jsonError(400, {
        code: "REGISTRATION_NOT_VERIFIED",
        error: "No se pudo verificar la llave. Intenta nuevamente.",
      })
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    if (error instanceof Error) {
      switch (error.message) {
        case "USER_NOT_FOUND":
          return jsonError(404, {
            code: "USER_NOT_FOUND",
            error: "No encontramos el usuario para registrar la llave.",
          })
        case "CHALLENGE_NOT_FOUND":
          return jsonError(400, {
            code: "CHALLENGE_NOT_FOUND",
            error: "La solicitud expiró. Vuelve a intentar registrar la llave.",
          })
        case "REGISTRATION_NOT_VERIFIED":
          return jsonError(400, {
            code: "REGISTRATION_NOT_VERIFIED",
            error: "No se pudo verificar la llave. Intenta nuevamente.",
          })
        default:
          break
      }
    }

    console.error("WebAuthn register verify error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudo guardar la llave de acceso.",
    })
  }
}
