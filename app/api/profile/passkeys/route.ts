import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { BASE_TENANT_SCHEMA, findUserByEmail, findUserByEmailAcrossChildTenants } from "@/lib/auth"
import { deletePasskeyForUser, listPasskeysForUser } from "@/lib/webauthn"

export const runtime = "nodejs"

const emailSchema = z.string().email("Correo inválido")
const credentialIdSchema = z.string().trim().min(1, "Llave inválida")

function resolveTenantSchema(rawValue?: string | null): string | null {
  const normalized = (rawValue ?? "").trim().toLowerCase()

  if (/^(tenant_base|tenant_[a-z0-9_]+)$/i.test(normalized)) {
    return normalized
  }

  return null
}

async function resolveUserByEmail(email: string, tenantHint?: string | null) {
  const explicitTenant = resolveTenantSchema(tenantHint)

  if (explicitTenant) {
    const explicitUser = await findUserByEmail(email, explicitTenant)

    if (explicitUser) {
      return { user: explicitUser, tenantSchema: explicitTenant }
    }
  }

  const tenantMatch = await findUserByEmailAcrossChildTenants(email, explicitTenant)
  if (tenantMatch) {
    return tenantMatch
  }

  const baseUser = await findUserByEmail(email, BASE_TENANT_SCHEMA)
  if (baseUser) {
    return { user: baseUser, tenantSchema: BASE_TENANT_SCHEMA }
  }

  return null
}

export async function GET(request: NextRequest) {
  try {
    const rawEmail = request.nextUrl.searchParams.get("email") ?? ""
    const email = emailSchema.parse(rawEmail.trim().toLowerCase())
    const tenantHint = request.nextUrl.searchParams.get("tenant") ?? request.headers.get("x-tenant")

    const resolved = await resolveUserByEmail(email, tenantHint)
    if (!resolved) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
    }

    const passkeys = await listPasskeysForUser(resolved.user.id, resolved.tenantSchema)

    return NextResponse.json({ passkeys })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", issues: error.flatten() }, { status: 400 })
    }

    console.error("Error loading passkeys", error)
    return NextResponse.json({ error: "No se pudieron cargar las llaves de acceso" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      email?: unknown
      credentialId?: unknown
      tenantSchema?: unknown
    }

    const email = emailSchema.parse(String(body.email ?? "").trim().toLowerCase())
    const credentialId = credentialIdSchema.parse(String(body.credentialId ?? "").trim())
    const tenantHint =
      typeof body.tenantSchema === "string"
        ? body.tenantSchema
        : request.headers.get("x-tenant")

    const resolved = await resolveUserByEmail(email, tenantHint)
    if (!resolved) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
    }

    const deleted = await deletePasskeyForUser(resolved.user.id, credentialId, resolved.tenantSchema)

    if (!deleted) {
      return NextResponse.json({ error: "No se encontró la llave para eliminar" }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", issues: error.flatten() }, { status: 400 })
    }

    console.error("Error deleting passkey", error)
    return NextResponse.json({ error: "No se pudo eliminar la llave de acceso" }, { status: 500 })
  }
}