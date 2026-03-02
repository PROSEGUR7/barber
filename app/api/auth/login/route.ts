import { NextResponse } from "next/server"

import {
  findUserByEmailAcrossChildTenants,
  markUserLogin,
  verifyPassword,
  type AuthUser,
} from "@/lib/auth"
import { validateTenantAccess } from "@/lib/admin-billing"
import { pool } from "@/lib/db"

type LoginBody = {
  email?: unknown
  password?: unknown
  tenant?: unknown
}

function jsonError(
  status: number,
  payload: { code: string; error: string; field?: string; [key: string]: unknown },
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

function normalizeTenantHint(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim().toLowerCase()

  if (!/^tenant_[a-z0-9_]+$/.test(normalized)) {
    return null
  }

  return normalized
}

function tenantHintFromHost(host: string | null): string | null {
  if (!host) {
    return null
  }

  const hostname = host.split(":")[0]?.trim().toLowerCase()

  if (!hostname) {
    return null
  }

  const firstLabel = hostname.split(".")[0] ?? ""
  return normalizeTenantHint(firstLabel)
}

async function hasPasskeys(userId: number, tenantSchema: string): Promise<boolean> {
  if (!/^tenant_[a-z0-9_]+$/.test(tenantSchema)) {
    return false
  }

  const passkeysTable = `"${tenantSchema.replace(/"/g, '""')}"."passkeys"`

  try {
    const result = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM ${passkeysTable} WHERE user_id = $1 LIMIT 1
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
  const preferredTenant =
    normalizeTenantHint(body.tenant) ??
    normalizeTenantHint(request.headers.get("x-tenant")) ??
    tenantHintFromHost(request.headers.get("x-forwarded-host") ?? request.headers.get("host"))

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
    const tenantUserMatch = await findUserByEmailAcrossChildTenants(email, preferredTenant)

    if (!tenantUserMatch) {
      return jsonError(401, {
        code: "USER_NOT_FOUND",
        error: "No existe una cuenta con ese correo.",
        field: "email",
      })
    }

    const { user: userWithPassword, tenantSchema } = tenantUserMatch

    const passwordOk = await verifyPassword(password, userWithPassword.passwordHash)

    if (!passwordOk) {
      return jsonError(401, {
        code: "PASSWORD_INVALID",
        error: "La contraseña es incorrecta.",
        field: "password",
      })
    }

    const tenantAccess = await validateTenantAccess({ tenantSchema })

    if (!tenantAccess.allowed) {
      return jsonError(403, {
        code: tenantAccess.code,
        error: tenantAccess.message,
        reason: tenantAccess.reason,
        subscriptionStatus: tenantAccess.status,
        graceUntil: tenantAccess.graceUntil,
        tenantId: tenantAccess.tenantId,
      })
    }

    await markUserLogin(userWithPassword.id, tenantSchema)

    const authUser: AuthUser = {
      id: userWithPassword.id,
      email: userWithPassword.email,
      role: userWithPassword.role,
      lastLogin: userWithPassword.lastLogin,
      displayName: userWithPassword.displayName,
      tenantSchema,
    }

    return NextResponse.json(
      {
        ok: true,
        user: {
          id: authUser.id,
          email: authUser.email,
          role: authUser.role,
          displayName: authUser.displayName ?? null,
          hasPasskeys: await hasPasskeys(authUser.id, tenantSchema),
          tenant: tenantSchema,
        },
      },
      { status: 200 },
    )
  } catch (error) {
    if (error instanceof Error && error.message === "BILLING_VALIDATION_UNAVAILABLE") {
      return jsonError(503, {
        code: "BILLING_VALIDATION_UNAVAILABLE",
        error: "No fue posible validar el estado de suscripción. Intenta nuevamente en unos minutos.",
      })
    }

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
