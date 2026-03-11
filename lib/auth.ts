import bcrypt from "bcryptjs"
import { pool } from "@/lib/db"

export const BASE_TENANT_SCHEMA = "tenant_base"

const tenantSchemaPattern = /^tenant_[a-z0-9_]+$/i

function quotePgIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`
}

function normalizeTenantSchemaName(schema: string | null | undefined): string | null {
  if (!schema) {
    return null
  }

  const normalized = schema.trim().toLowerCase()

  if (!tenantSchemaPattern.test(normalized)) {
    return null
  }

  return normalized
}

function resolveTenantSchemaName(schema?: string) {
  return normalizeTenantSchemaName(schema) ?? BASE_TENANT_SCHEMA
}

function usersTableForTenant(tenantSchema: string) {
  return `${quotePgIdentifier(tenantSchema)}.${quotePgIdentifier("users")}`
}

function clientesTableForTenant(tenantSchema: string) {
  return `${quotePgIdentifier(tenantSchema)}.${quotePgIdentifier("clientes")}`
}

function empleadosTableForTenant(tenantSchema: string) {
  return `${quotePgIdentifier(tenantSchema)}.${quotePgIdentifier("empleados")}`
}

export type AppUserRole = "client" | "barber" | "admin"

const roleToDb: Record<AppUserRole, "cliente" | "empleado" | "admin"> = {
  client: "cliente",
  barber: "empleado",
  admin: "admin",
}

const roleFromDb: Record<"cliente" | "empleado" | "admin", AppUserRole> = {
  cliente: "client",
  empleado: "barber",
  admin: "admin",
}

type DbUserRow = {
  id: number
  correo: string
  passwordhash: string
  rol: keyof typeof roleFromDb
  ultimo_acceso: string | null
}

export type AuthUser = {
  id: number
  email: string
  role: AppUserRole
  lastLogin: string | null
  displayName?: string | null
  tenantSchema?: string
}

export type UserWithPassword = AuthUser & {
  passwordHash: string
}

export class MissingProfileDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MissingProfileDataError"
  }
}

export class UserAlreadyExistsError extends Error {
  constructor() {
    super("USER_ALREADY_EXISTS")
    this.name = "UserAlreadyExistsError"
  }
}

async function listChildTenantSchemas(): Promise<string[]> {
  const result = await pool.query<{ schema_name: string }>(
    `SELECT n.nspname AS schema_name
       FROM pg_namespace n
      WHERE n.nspname LIKE 'tenant\\_%' ESCAPE '\\'
        AND n.nspname <> $1
        AND to_regclass(format('%I.users', n.nspname)) IS NOT NULL
      ORDER BY n.nspname ASC`,
    [BASE_TENANT_SCHEMA],
  )

  return result.rows.map((row) => row.schema_name)
}

export async function findUserByEmailAcrossChildTenants(
  email: string,
  preferredTenantSchema?: string | null,
): Promise<{ user: UserWithPassword; tenantSchema: string } | null> {
  const normalizedPreferredTenant = normalizeTenantSchemaName(preferredTenantSchema)

  if (normalizedPreferredTenant && normalizedPreferredTenant !== BASE_TENANT_SCHEMA) {
    const preferredTenantUser = await findUserByEmail(email, normalizedPreferredTenant)

    if (preferredTenantUser) {
      return {
        user: preferredTenantUser,
        tenantSchema: normalizedPreferredTenant,
      }
    }
  }

  const childSchemas = await listChildTenantSchemas()

  for (const schemaName of childSchemas) {
    if (schemaName === normalizedPreferredTenant) {
      continue
    }

    const user = await findUserByEmail(email, schemaName)

    if (user) {
      return {
        user,
        tenantSchema: schemaName,
      }
    }
  }

  return null
}

export async function findTenantSchemaByEmail(
  email: string,
  preferredTenantSchema?: string | null,
): Promise<string | null> {
  const normalizedPreferredTenant = normalizeTenantSchemaName(preferredTenantSchema)

  if (normalizedPreferredTenant && normalizedPreferredTenant !== BASE_TENANT_SCHEMA) {
    const usersTable = usersTableForTenant(normalizedPreferredTenant)
    const preferredResult = await pool.query<{ id: number }>(
      `SELECT id
         FROM ${usersTable}
        WHERE lower(correo) = lower($1)
        LIMIT 1`,
      [email],
    )

    if (preferredResult.rowCount > 0) {
      return normalizedPreferredTenant
    }
  }

  const childSchemas = await listChildTenantSchemas()
  const matches: string[] = []

  for (const schemaName of childSchemas) {
    if (schemaName === normalizedPreferredTenant) {
      continue
    }

    const usersTable = usersTableForTenant(schemaName)
    const result = await pool.query<{ id: number }>(
      `SELECT id
         FROM ${usersTable}
        WHERE lower(correo) = lower($1)
        LIMIT 1`,
      [email],
    )

    if (result.rowCount > 0) {
      matches.push(schemaName)
    }
  }

  if (matches.length > 1) {
    return null
  }

  if (matches.length === 1) {
    return matches[0]
  }

  return null
}

export async function findUserByEmailAndRole(
  email: string,
  role: AppUserRole,
  tenantSchema?: string,
): Promise<UserWithPassword | null> {
  const dbRoleParam = roleToDb[role]
  const resolvedTenantSchema = resolveTenantSchemaName(tenantSchema)
  const usersTable = usersTableForTenant(resolvedTenantSchema)

  const result = await pool.query<DbUserRow>(
    `SELECT id,
            correo,
            passwordhash,
            rol::text as rol,
            ultimo_acceso
       FROM ${usersTable}
      WHERE lower(correo) = lower($1)
        AND rol::text = $2
      LIMIT 1`,
    [email, dbRoleParam],
  )

  if (result.rowCount === 0) {
    return null
  }

  const row = result.rows[0]

  // Ensure TypeScript understands the role value comes from DB enum
  const dbRoleFromRow = row.rol as keyof typeof roleFromDb
  const appRole = roleFromDb[dbRoleFromRow]

  return {
    id: row.id,
    email: row.correo,
    passwordHash: row.passwordhash,
    role: appRole,
    lastLogin: row.ultimo_acceso,
    displayName: await getDisplayNameForRole(row.id, appRole, resolvedTenantSchema),
    tenantSchema: resolvedTenantSchema,
  }
}

export async function findUserByEmail(
  email: string,
  tenantSchema?: string,
): Promise<UserWithPassword | null> {
  const resolvedTenantSchema = resolveTenantSchemaName(tenantSchema)
  const usersTable = usersTableForTenant(resolvedTenantSchema)

  const result = await pool.query<DbUserRow>(
    `SELECT id,
            correo,
            passwordhash,
            rol::text as rol,
            ultimo_acceso
       FROM ${usersTable}
      WHERE lower(correo) = lower($1)
      LIMIT 1`,
    [email],
  )

  if (result.rowCount === 0) {
    return null
  }

  const row = result.rows[0]
  const dbRoleFromRow = row.rol as keyof typeof roleFromDb
  const appRole = roleFromDb[dbRoleFromRow]
  const displayName = await getDisplayNameForRole(row.id, appRole, resolvedTenantSchema)

  return {
    id: row.id,
    email: row.correo,
    passwordHash: row.passwordhash,
    role: appRole,
    lastLogin: row.ultimo_acceso,
    displayName,
    tenantSchema: resolvedTenantSchema,
  }
}

export async function findUserById(id: number, tenantSchema?: string): Promise<AuthUser | null> {
  const resolvedTenantSchema = resolveTenantSchemaName(tenantSchema)
  const usersTable = usersTableForTenant(resolvedTenantSchema)

  const result = await pool.query<DbUserRow>(
    `SELECT id,
            correo,
            passwordhash,
            rol::text as rol,
            ultimo_acceso
       FROM ${usersTable}
      WHERE id = $1
      LIMIT 1`,
    [id],
  )

  if (result.rowCount === 0) {
    return null
  }

  const row = result.rows[0]
  const dbRoleFromRow = row.rol as keyof typeof roleFromDb
  const appRole = roleFromDb[dbRoleFromRow]
  const displayName = await getDisplayNameForRole(row.id, appRole, resolvedTenantSchema)

  return {
    id: row.id,
    email: row.correo,
    role: appRole,
    lastLogin: row.ultimo_acceso,
    displayName,
    tenantSchema: resolvedTenantSchema,
  }
}

type CreateUserProfile = {
  name?: string
  phone?: string
}

export async function createUser({
  email,
  password,
  role,
  profile,
  tenantSchema,
}: {
  email: string
  password: string
  role: AppUserRole
  profile?: CreateUserProfile
  tenantSchema?: string
}): Promise<AuthUser> {
  const hashedPassword = await bcrypt.hash(password, 10)
  const resolvedTenantSchema = resolveTenantSchemaName(tenantSchema)
  const usersTable = usersTableForTenant(resolvedTenantSchema)
  const clientesTable = clientesTableForTenant(resolvedTenantSchema)
  const empleadosTable = empleadosTableForTenant(resolvedTenantSchema)
  const client = await pool.connect()

  try {
    await client.query("BEGIN")
    await client.query("SET CONSTRAINTS ALL DEFERRED")

    const dbRoleParam = roleToDb[role]
    const userResult = await client.query<DbUserRow>(
      `INSERT INTO ${usersTable} (correo, passwordhash, rol)
       VALUES ($1, $2, $3)
       RETURNING id, correo, passwordhash, rol::text as rol, ultimo_acceso`,
      [email, hashedPassword, dbRoleParam],
    )

    const userRow = userResult.rows[0]
  const dbRoleFromRow = userRow.rol as keyof typeof roleFromDb
    const appRole = roleFromDb[dbRoleFromRow]

    if (appRole === "client") {
      const fullName = profile?.name?.trim()
      const phone = profile?.phone?.trim()

      if (!fullName || !phone) {
        throw new MissingProfileDataError(
          "CLIENT_PROFILE_DATA_REQUIRED",
        )
      }

      await client.query(
        `INSERT INTO ${clientesTable} (user_id, nombre, telefono)
         VALUES ($1, $2, $3)`,
        [userRow.id, fullName, phone],
      )
    } else if (appRole === "barber") {
      const fullName = profile?.name?.trim()
      const phone = profile?.phone?.trim()

      if (!fullName || !phone) {
        throw new MissingProfileDataError(
          "EMPLOYEE_PROFILE_DATA_REQUIRED",
        )
      }

      await client.query(
        `INSERT INTO ${empleadosTable} (user_id, nombre, telefono)
         VALUES ($1, $2, $3)`,
        [userRow.id, fullName, phone],
      )
    }

    await client.query("COMMIT")

    return {
      id: userRow.id,
      email: userRow.correo,
      role: appRole,
      lastLogin: userRow.ultimo_acceso,
      displayName: await getDisplayNameForRole(userRow.id, appRole, resolvedTenantSchema),
      tenantSchema: resolvedTenantSchema,
    }
  } catch (error) {
    try {
      await client.query("ROLLBACK")
    } catch (rollbackError) {
      console.error("Failed to rollback user creation transaction", rollbackError)
    }

    if (error instanceof MissingProfileDataError) {
      throw error
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "SELF_SIGNED_CERT_IN_CHAIN"
    ) {
      const err = new Error(
        "Database TLS verification failed: self-signed certificate in certificate chain. " +
          "If you're running locally, set NODE_ENV=development or export PGSSLMODE=no-verify to allow self-signed certs (not for production).",
      )
      ;(err as any).code = (error as any).code
      throw err
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "23505"
    ) {
      throw new UserAlreadyExistsError()
    }

    throw error
  } finally {
    client.release()
  }
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash)
}

export async function markUserLogin(userId: number, tenantSchema?: string) {
  const resolvedTenantSchema = resolveTenantSchemaName(tenantSchema)
  const usersTable = usersTableForTenant(resolvedTenantSchema)

  await pool.query(
    `UPDATE ${usersTable}
     SET ultimo_acceso = NOW(), ultima_actualizacion = NOW()
     WHERE id = $1`,
    [userId],
  )
}

async function getDisplayNameForRole(
  userId: number,
  role: AppUserRole,
  tenantSchema: string,
): Promise<string | null> {
  try {
    switch (role) {
      case "client": {
        const clientesTable = clientesTableForTenant(tenantSchema)
        const result = await pool.query<{ nombre: string | null }>(
          `SELECT nombre FROM ${clientesTable} WHERE user_id = $1 LIMIT 1`,
          [userId],
        )
        return result.rows[0]?.nombre ?? null
      }
      case "barber": {
        const empleadosTable = empleadosTableForTenant(tenantSchema)
        const result = await pool.query<{ nombre: string | null }>(
          `SELECT nombre FROM ${empleadosTable} WHERE user_id = $1 LIMIT 1`,
          [userId],
        )
        return result.rows[0]?.nombre ?? null
      }
      case "admin":
      default:
        return null
    }
  } catch (error) {
    console.warn("Failed to load display name for user", { userId, role }, error)
    return null
  }
}
