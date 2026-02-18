import { NextResponse } from "next/server"

import {
  findUserByEmail,
  markUserLogin,
  verifyPassword,
  type AuthUser,
} from "@/lib/auth"
import { pool } from "@/lib/db"

type LoginBody = {
  email?: unknown
  password?: unknown
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

async function hasPasskeys(userId: number): Promise<boolean> {
  try {
    const result = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM tenant_base.passkeys WHERE user_id = $1 LIMIT 1
       ) as exists`,
      [userId],
    )
    return result.rows[0]?.exists ?? false
  } catch (error) {
    // If passkeys tables are not created yet (or DB schema differs), don't block login.
    return false
  }
}

export async function POST(request: Request) {
  let body: LoginBody

  try {
    body = (await request.json()) as LoginBody
  } catch {
    return jsonError(400, {
      code: "INVALID_JSON",
      error: "Solicitud inválida.",
    })
  }

  const email = isNonEmptyString(body.email) ? body.email.trim().toLowerCase() : ""
  const password = typeof body.password === "string" ? body.password : ""

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

  if (!password) {
    return jsonError(400, {
      code: "PASSWORD_REQUIRED",
      error: "Ingresa tu contraseña.",
      field: "password",
    })
  }

  try {
    const userWithPassword = await findUserByEmail(email)

    if (!userWithPassword) {
      return jsonError(401, {
        code: "USER_NOT_FOUND",
        error: "No existe una cuenta con ese correo.",
        field: "email",
      })
    }

    const passwordOk = await verifyPassword(password, userWithPassword.passwordHash)

    if (!passwordOk) {
      return jsonError(401, {
        code: "PASSWORD_INVALID",
        error: "La contraseña es incorrecta.",
        field: "password",
      })
    }

    await markUserLogin(userWithPassword.id)

    const authUser: AuthUser = {
      id: userWithPassword.id,
      email: userWithPassword.email,
      role: userWithPassword.role,
      lastLogin: userWithPassword.lastLogin,
      displayName: userWithPassword.displayName,
    }

    return NextResponse.json(
      {
        ok: true,
        user: {
          id: authUser.id,
          email: authUser.email,
          role: authUser.role,
          displayName: authUser.displayName ?? null,
          hasPasskeys: await hasPasskeys(authUser.id),
        },
      },
      { status: 200 },
    )
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_URL env var is not set") {
      return jsonError(503, {
        code: "DATABASE_NOT_CONFIGURED",
        error: "El servidor no está configurado (DATABASE_URL faltante).",
      })
    }

    console.error("Login API error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudo iniciar sesión. Intenta nuevamente.",
    })
  }
}
