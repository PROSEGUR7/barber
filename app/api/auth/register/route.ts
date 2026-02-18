import { NextResponse } from "next/server"

import {
  createUser,
  MissingProfileDataError,
  UserAlreadyExistsError,
  type AppUserRole,
} from "@/lib/auth"

type RegisterBody = {
  name?: unknown
  phone?: unknown
  email?: unknown
  password?: unknown
  role?: unknown
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

export async function POST(request: Request) {
  let body: RegisterBody

  try {
    body = (await request.json()) as RegisterBody
  } catch {
    return jsonError(400, {
      code: "INVALID_JSON",
      error: "Solicitud inválida.",
    })
  }

  const name = isNonEmptyString(body.name) ? body.name.trim() : ""
  const phone = isNonEmptyString(body.phone) ? body.phone.trim() : ""
  const email = isNonEmptyString(body.email)
    ? body.email.trim().toLowerCase()
    : ""
  const password = typeof body.password === "string" ? body.password : ""

  // Public signup: do not allow privilege escalation via role.
  const role: AppUserRole = "client"

  if (!name) {
    return jsonError(400, {
      code: "NAME_REQUIRED",
      error: "Ingresa tu nombre completo.",
      field: "name",
    })
  }

  if (!phone || phone.replace(/\D/g, "").length < 7) {
    return jsonError(400, {
      code: "PHONE_INVALID",
      error: "Ingresa un teléfono válido.",
      field: "phone",
    })
  }

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
      error: "Ingresa una contraseña.",
      field: "password",
    })
  }

  if (password.length < 8) {
    return jsonError(400, {
      code: "PASSWORD_TOO_SHORT",
      error: "La contraseña debe tener al menos 8 caracteres.",
      field: "password",
    })
  }

  try {
    const user = await createUser({
      email,
      password,
      role,
      profile: {
        name,
        phone,
      },
    })

    return NextResponse.json(
      {
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof UserAlreadyExistsError) {
      return jsonError(409, {
        code: "EMAIL_EXISTS",
        error: "Ya existe una cuenta con este correo.",
        field: "email",
      })
    }

    if (error instanceof MissingProfileDataError) {
      return jsonError(400, {
        code: "PROFILE_DATA_REQUIRED",
        error: "Faltan datos para crear la cuenta.",
      })
    }

    if (error instanceof Error && error.message === "DATABASE_URL env var is not set") {
      return jsonError(503, {
        code: "DATABASE_NOT_CONFIGURED",
        error: "El servidor no está configurado (DATABASE_URL faltante).",
      })
    }

    console.error("Register API error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudo crear la cuenta. Intenta nuevamente.",
    })
  }
}
