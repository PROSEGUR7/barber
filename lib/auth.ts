import bcrypt from "bcryptjs"
import { pool } from "@/lib/db"

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

export async function findUserByEmailAndRole(
  email: string,
  role: AppUserRole,
): Promise<UserWithPassword | null> {
  const dbRoleParam = roleToDb[role]
  const result = await pool.query<DbUserRow>(
    `SELECT id,
            correo,
            passwordhash,
            rol::text as rol,
            ultimo_acceso
       FROM tenant_base.users
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
    displayName: await getDisplayNameForRole(row.id, appRole),
  }
}

export async function findUserByEmail(
  email: string,
): Promise<UserWithPassword | null> {
  const result = await pool.query<DbUserRow>(
    `SELECT id,
            correo,
            passwordhash,
            rol::text as rol,
            ultimo_acceso
       FROM tenant_base.users
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
  const displayName = await getDisplayNameForRole(row.id, appRole)

  return {
    id: row.id,
    email: row.correo,
    passwordHash: row.passwordhash,
    role: appRole,
    lastLogin: row.ultimo_acceso,
    displayName,
  }
}

export async function findUserById(id: number): Promise<AuthUser | null> {
  const result = await pool.query<DbUserRow>(
    `SELECT id,
            correo,
            passwordhash,
            rol::text as rol,
            ultimo_acceso
       FROM tenant_base.users
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
  const displayName = await getDisplayNameForRole(row.id, appRole)

  return {
    id: row.id,
    email: row.correo,
    role: appRole,
    lastLogin: row.ultimo_acceso,
    displayName,
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
}: {
  email: string
  password: string
  role: AppUserRole
  profile?: CreateUserProfile
}): Promise<AuthUser> {
  const hashedPassword = await bcrypt.hash(password, 10)
  const client = await pool.connect()

  try {
    await client.query("BEGIN")
    await client.query("SET CONSTRAINTS ALL DEFERRED")

    const dbRoleParam = roleToDb[role]
    const userResult = await client.query<DbUserRow>(
      `INSERT INTO tenant_base.users (correo, passwordhash, rol)
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
        `INSERT INTO tenant_base.clientes (user_id, nombre, telefono)
         VALUES ($1, $2, $3)`,
        [userRow.id, fullName, phone],
      )
    } else if (appRole === "barber") {
      const fullName = profile?.name?.trim()
      if (!fullName) {
        throw new MissingProfileDataError(
          "EMPLOYEE_PROFILE_DATA_REQUIRED",
        )
      }

      await client.query(
        `INSERT INTO tenant_base.empleados (user_id, nombre)
         VALUES ($1, $2)`,
        [userRow.id, fullName],
      )
    }

    await client.query("COMMIT")

    return {
      id: userRow.id,
      email: userRow.correo,
      role: appRole,
      lastLogin: userRow.ultimo_acceso,
      displayName: await getDisplayNameForRole(userRow.id, appRole),
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

export async function markUserLogin(userId: number) {
  await pool.query(
    `UPDATE tenant_base.users
     SET ultimo_acceso = NOW(), ultima_actualizacion = NOW()
     WHERE id = $1`,
    [userId],
  )
}

async function getDisplayNameForRole(userId: number, role: AppUserRole): Promise<string | null> {
  try {
    switch (role) {
      case "client": {
        const result = await pool.query<{ nombre: string | null }>(
          `SELECT nombre FROM tenant_base.clientes WHERE user_id = $1 LIMIT 1`,
          [userId],
        )
        return result.rows[0]?.nombre ?? null
      }
      case "barber": {
        const result = await pool.query<{ nombre: string | null }>(
          `SELECT nombre FROM tenant_base.empleados WHERE user_id = $1 LIMIT 1`,
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
