import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  BASE_TENANT_SCHEMA,
  findUserByEmailAcrossChildTenants,
} from "@/lib/auth"
import { pool } from "@/lib/db"

type DbRole = "cliente" | "empleado" | "admin"
type AppRole = "client" | "barber" | "admin"

type UserRow = {
  id: number
  correo: string
  rol: DbRole
  ultimo_acceso: string | null
}

type ProfileResponse = {
  id: number
  email: string
  role: AppRole
  name: string
  phone: string
  avatarUrl: string | null
  lastLogin: string | null
}

type ProfileSettingsRow = {
  avatar_url: string | null
}

const TENANT_SCHEMA_PATTERN = /^(tenant_base|tenant_[a-z0-9_]+)$/i

const roleMap: Record<DbRole, AppRole> = {
  cliente: "client",
  empleado: "barber",
  admin: "admin",
}

const emailSchema = z.string().email("Correo inválido")

const updateProfileSchema = z.object({
  currentEmail: z.string().email("Correo actual inválido"),
  email: z.string().email("Correo inválido"),
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120, "Nombre demasiado largo"),
  phone: z
    .string()
    .trim()
    .max(20, "El teléfono no puede exceder 20 caracteres")
    .optional()
    .or(z.literal("")),
  tenantSchema: z.string().trim().optional(),
})

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
    `SELECT id, correo, rol::text as rol, ultimo_acceso
       FROM ${tenantSchema}.users
      WHERE lower(correo) = lower($1)
      LIMIT 1`,
    [email],
  )

  return result.rows[0] ?? null
}

async function resolveNameAndPhone(userId: number, role: AppRole, fallbackEmail: string, tenantSchema: string) {
  if (role === "client") {
    const result = await pool.query<{ nombre: string | null; telefono: string | null }>(
      `SELECT nombre, telefono
         FROM ${tenantSchema}.clientes
        WHERE user_id = $1
        LIMIT 1`,
      [userId],
    )

    return {
      name: result.rows[0]?.nombre?.trim() || fallbackEmail.split("@")[0],
      phone: result.rows[0]?.telefono?.trim() || "",
    }
  }

  if (role === "barber") {
    const result = await pool.query<{ nombre: string | null; telefono: string | null }>(
      `SELECT nombre, telefono
         FROM ${tenantSchema}.empleados
        WHERE user_id = $1
        LIMIT 1`,
      [userId],
    )

    return {
      name: result.rows[0]?.nombre?.trim() || fallbackEmail.split("@")[0],
      phone: result.rows[0]?.telefono?.trim() || "",
    }
  }

  return {
    name: fallbackEmail.split("@")[0],
    phone: "",
  }
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
  try {
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
  } catch (error) {
    console.warn("No se pudo cargar avatar del perfil", error)
    return null
  }
}

async function buildProfileByEmail(email: string, tenantSchema: string): Promise<ProfileResponse | null> {
  const user = await getUserByEmail(email, tenantSchema)

  if (!user) {
    return null
  }

  const role = roleMap[user.rol]
  const { name, phone } = await resolveNameAndPhone(user.id, role, user.correo, tenantSchema)
  const avatarUrl = await getAvatarUrl(user.id, tenantSchema)

  return {
    id: user.id,
    email: user.correo,
    role,
    name,
    phone,
    avatarUrl,
    lastLogin: user.ultimo_acceso,
  }
}

export async function GET(request: NextRequest) {
  try {
    const rawEmail = request.nextUrl.searchParams.get("email")
    const tenantSchema = await resolveTenantSchemaForEmail({
      email: rawEmail,
      tenantHint:
      request.nextUrl.searchParams.get("tenant") ?? request.headers.get("x-tenant"),
    })

    if (!rawEmail) {
      return NextResponse.json({ error: "Debes indicar el correo del usuario" }, { status: 400 })
    }

    const email = emailSchema.parse(rawEmail.trim().toLowerCase())
    const profile = await buildProfileByEmail(email, tenantSchema)

    if (!profile) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
    }

    return NextResponse.json({ profile })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: error.flatten() },
        { status: 400 },
      )
    }

    console.error("Error loading profile", error)
    return NextResponse.json(
      { error: "No se pudo cargar el perfil" },
      { status: 500 },
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = updateProfileSchema.parse(await request.json())
    const currentEmail = payload.currentEmail.trim().toLowerCase()
    const tenantSchema = await resolveTenantSchemaForEmail({
      email: currentEmail,
      tenantHint: payload.tenantSchema,
    })
    const nextEmail = payload.email.trim().toLowerCase()
    const nextName = payload.name.trim()
    const nextPhone = (payload.phone ?? "").trim()

    const user = await getUserByEmail(currentEmail, tenantSchema)

    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
    }

    const role = roleMap[user.rol]

    const client = await pool.connect()

    try {
      await client.query("BEGIN")

      await client.query(
        `UPDATE ${tenantSchema}.users
            SET correo = $1,
                ultima_actualizacion = NOW()
          WHERE id = $2`,
        [nextEmail, user.id],
      )

      if (role === "client") {
        const updateResult = await client.query(
          `UPDATE ${tenantSchema}.clientes
              SET nombre = $1,
                  telefono = NULLIF($2, ''),
                  ultima_actualizacion = NOW()
            WHERE user_id = $3`,
          [nextName, nextPhone, user.id],
        )

        if (updateResult.rowCount === 0) {
          await client.query(
            `INSERT INTO ${tenantSchema}.clientes (user_id, nombre, telefono)
             VALUES ($1, $2, NULLIF($3, ''))`,
            [user.id, nextName, nextPhone],
          )
        }
      }

      if (role === "barber") {
        const updateResult = await client.query(
          `UPDATE ${tenantSchema}.empleados
              SET nombre = $1,
                  telefono = NULLIF($2, ''),
                  ultima_actualizacion = NOW()
            WHERE user_id = $3`,
          [nextName, nextPhone, user.id],
        )

        if (updateResult.rowCount === 0) {
          await client.query(
            `INSERT INTO ${tenantSchema}.empleados (user_id, nombre, telefono)
             VALUES ($1, $2, NULLIF($3, ''))`,
            [user.id, nextName, nextPhone],
          )
        }
      }

      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }

    const profile = await buildProfileByEmail(nextEmail, tenantSchema)

    if (!profile) {
      return NextResponse.json({ error: "No se pudo refrescar el perfil" }, { status: 500 })
    }

    return NextResponse.json({ profile })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: error.flatten() },
        { status: 400 },
      )
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      return NextResponse.json({ error: "Ya existe una cuenta con ese correo" }, { status: 409 })
    }

    console.error("Error updating profile", error)
    return NextResponse.json(
      { error: "No se pudo actualizar el perfil" },
      { status: 500 },
    )
  }
}
