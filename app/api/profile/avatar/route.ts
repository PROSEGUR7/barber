import { mkdir, unlink, writeFile } from "fs/promises"
import path from "path"

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { BASE_TENANT_SCHEMA, findUserByEmailAcrossChildTenants } from "@/lib/auth"
import { pool } from "@/lib/db"

export const runtime = "nodejs"

type UserRow = {
  id: number
  correo: string
  rol: "cliente" | "empleado" | "admin"
}

type ProfileSettingsRow = {
  avatar_url: string | null
}

const TENANT_SCHEMA_PATTERN = /^(tenant_base|tenant_[a-z0-9_]+)$/i
const emailSchema = z.string().email("Correo inválido")

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024
const AVATAR_DIR_ABSOLUTE = path.join(process.cwd(), "public", "uploads", "avatars")
const AVATAR_PUBLIC_PREFIX = "/uploads/avatars/"

function resolveTenantSchema(rawValue?: string | null): string {
  const normalized = (rawValue ?? "").trim().toLowerCase()
  if (TENANT_SCHEMA_PATTERN.test(normalized)) {
    return normalized
  }

  return BASE_TENANT_SCHEMA
}

async function resolveTenantSchemaForEmail(options: {
  tenantHint?: string | null
  email?: string | null
}): Promise<string> {
  const explicitTenant = resolveTenantSchema(options.tenantHint)
  const rawHint = (options.tenantHint ?? "").trim()

  if (rawHint && TENANT_SCHEMA_PATTERN.test(rawHint)) {
    return explicitTenant
  }

  const email = (options.email ?? "").trim().toLowerCase()
  if (!email) {
    return BASE_TENANT_SCHEMA
  }

  const tenantMatch = await findUserByEmailAcrossChildTenants(email)
  if (tenantMatch?.tenantSchema) {
    return tenantMatch.tenantSchema
  }

  const existsInBase = await getUserByEmail(email, BASE_TENANT_SCHEMA)
  if (existsInBase) {
    return BASE_TENANT_SCHEMA
  }

  return BASE_TENANT_SCHEMA
}

async function getUserByEmail(email: string, tenantSchema: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `SELECT id, correo, rol::text as rol
       FROM ${tenantSchema}.users
      WHERE lower(correo) = lower($1)
      LIMIT 1`,
    [email],
  )

  return result.rows[0] ?? null
}

async function ensureProfileSettingsTable(tenantSchema: string): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${tenantSchema}.user_profile_settings (
       user_id integer PRIMARY KEY REFERENCES ${tenantSchema}.users(id) ON DELETE CASCADE,
       avatar_url text,
       updated_at timestamp NOT NULL DEFAULT NOW()
     )`,
  )
}

async function getAvatarUrl(userId: number, tenantSchema: string): Promise<string | null> {
  await ensureProfileSettingsTable(tenantSchema)

  const result = await pool.query<ProfileSettingsRow>(
    `SELECT avatar_url
       FROM ${tenantSchema}.user_profile_settings
      WHERE user_id = $1
      LIMIT 1`,
    [userId],
  )

  const avatarUrl = result.rows[0]?.avatar_url?.trim()
  return avatarUrl && avatarUrl.length > 0 ? avatarUrl : null
}

async function setAvatarUrl(userId: number, avatarUrl: string | null, tenantSchema: string): Promise<void> {
  await ensureProfileSettingsTable(tenantSchema)

  await pool.query(
    `INSERT INTO ${tenantSchema}.user_profile_settings (user_id, avatar_url, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET avatar_url = EXCLUDED.avatar_url, updated_at = NOW()`,
    [userId, avatarUrl],
  )
}

function extractLocalAvatarPath(avatarUrl: string | null): string | null {
  if (!avatarUrl || !avatarUrl.startsWith(AVATAR_PUBLIC_PREFIX)) {
    return null
  }

  const candidate = avatarUrl.slice(1)
  if (candidate.includes("..") || candidate.includes("\\")) {
    return null
  }

  return path.join(process.cwd(), "public", candidate)
}

async function deleteLocalAvatarIfNeeded(avatarUrl: string | null): Promise<void> {
  const absolutePath = extractLocalAvatarPath(avatarUrl)
  if (!absolutePath) {
    return
  }

  try {
    await unlink(absolutePath)
  } catch {
    // Ignore if file does not exist.
  }
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()
    const emailRaw =
      typeof form.get("email") === "string"
        ? String(form.get("email"))
        : request.headers.get("x-user-email") ?? ""

    const email = emailSchema.parse(emailRaw.trim().toLowerCase())
    const tenantHint =
      typeof form.get("tenantSchema") === "string"
        ? String(form.get("tenantSchema"))
        : request.headers.get("x-tenant")

    const tenantSchema = await resolveTenantSchemaForEmail({
      email,
      tenantHint,
    })

    const user = await getUserByEmail(email, tenantSchema)
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
    }

    if (user.rol !== "cliente" && user.rol !== "empleado" && user.rol !== "admin") {
      return NextResponse.json({ error: "Solo clientes, empleados y administradores pueden actualizar su avatar" }, { status: 403 })
    }

    const fileValue = form.get("file")
    const file = fileValue instanceof File ? fileValue : null

    if (!file) {
      return NextResponse.json({ error: "Debes seleccionar una imagen" }, { status: 400 })
    }

    const extension = ALLOWED_MIME_TYPES[file.type]
    if (!extension) {
      return NextResponse.json({ error: "Formato no soportado. Usa JPG, PNG o WEBP" }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "La imagen no puede superar 4MB" }, { status: 400 })
    }

    const previousAvatarUrl = await getAvatarUrl(user.id, tenantSchema)

    await mkdir(AVATAR_DIR_ABSOLUTE, { recursive: true })

    const fileName = `${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`
    const absolutePath = path.join(AVATAR_DIR_ABSOLUTE, fileName)
    const publicUrl = `${AVATAR_PUBLIC_PREFIX}${fileName}`

    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(absolutePath, buffer)

    await setAvatarUrl(user.id, publicUrl, tenantSchema)
    await deleteLocalAvatarIfNeeded(previousAvatarUrl)

    return NextResponse.json({ ok: true, avatarUrl: publicUrl })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", issues: error.flatten() }, { status: 400 })
    }

    console.error("Error uploading avatar", error)
    return NextResponse.json({ error: "No se pudo actualizar la foto de perfil" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const emailRaw =
      request.nextUrl.searchParams.get("email") ?? request.headers.get("x-user-email") ?? ""
    const email = emailSchema.parse(emailRaw.trim().toLowerCase())

    const tenantSchema = await resolveTenantSchemaForEmail({
      email,
      tenantHint: request.nextUrl.searchParams.get("tenant") ?? request.headers.get("x-tenant"),
    })

    const user = await getUserByEmail(email, tenantSchema)
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
    }

    if (user.rol !== "cliente" && user.rol !== "empleado" && user.rol !== "admin") {
      return NextResponse.json({ error: "Solo clientes, empleados y administradores pueden actualizar su avatar" }, { status: 403 })
    }

    const previousAvatarUrl = await getAvatarUrl(user.id, tenantSchema)
    await setAvatarUrl(user.id, null, tenantSchema)
    await deleteLocalAvatarIfNeeded(previousAvatarUrl)

    return NextResponse.json({ ok: true, avatarUrl: null })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", issues: error.flatten() }, { status: 400 })
    }

    console.error("Error deleting avatar", error)
    return NextResponse.json({ error: "No se pudo eliminar la foto de perfil" }, { status: 500 })
  }
}
