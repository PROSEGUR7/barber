import { NextResponse } from "next/server"

import { verifyPasskeyAuthentication, userHasPasskeys } from "@/lib/webauthn"
import { markUserLogin } from "@/lib/auth"

export const runtime = "nodejs"

type Body = {
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
    const result = await verifyPasskeyAuthentication({
      credential: body.credential as any,
      requestOrigin,
      rpIdHint,
    })

    if (!result.verified) {
      return jsonError(401, {
        code: "AUTHENTICATION_NOT_VERIFIED",
        error: "No se pudo verificar la llave de acceso.",
      })
    }

    await markUserLogin(result.user.id)

    return NextResponse.json(
      {
        ok: true,
        user: {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
          displayName: result.user.displayName ?? null,
          hasPasskeys: await userHasPasskeys(result.user.id),
        },
      },
      { status: 200 },
    )
  } catch (error) {
    if (error instanceof Error) {
      switch (error.message) {
        case "PASSKEY_NOT_FOUND":
          return jsonError(404, {
            code: "PASSKEY_NOT_FOUND",
            error: "No encontramos esa llave registrada.",
          })
        case "CHALLENGE_NOT_FOUND":
          return jsonError(400, {
            code: "CHALLENGE_NOT_FOUND",
            error: "La solicitud expiró. Intenta nuevamente.",
          })
        case "AUTHENTICATION_NOT_VERIFIED":
          return jsonError(401, {
            code: "AUTHENTICATION_NOT_VERIFIED",
            error: "No se pudo verificar la llave de acceso.",
          })
        case "USER_NOT_FOUND":
          return jsonError(404, {
            code: "USER_NOT_FOUND",
            error: "No existe una cuenta asociada a esa llave.",
          })
        default:
          break
      }
    }

    console.error("WebAuthn auth verify error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudo iniciar sesión con tu llave de acceso.",
    })
  }
}
