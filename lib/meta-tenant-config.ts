import { pool } from "@/lib/db"
import { findTenantSchemaByEmail } from "@/lib/auth"

const TENANT_SCHEMA_PATTERN = /^tenant_[a-z0-9_]+$/i
const DEFAULT_TENANT_SCHEMA = "tenant_base"

export type MetaTenantConfig = {
  id: number
  tenantSchema: string
  tenantId: number | null
  nombreCuenta: string | null
  activo: boolean
  metaAccessToken: string
  metaVerifyToken: string
  metaPhoneNumberId: string
  metaDisplayPhoneNumber: string | null
  metaBusinessAccountId: string | null
  metaGraphVersion: string
  webhookSecret: string | null
  n8nWebhookUrl: string | null
  n8nApiKey: string | null
}

type MetaTenantConfigRow = {
  id: number
  tenant_schema: string
  tenant_id: number | null
  nombre_cuenta: string | null
  activo: boolean
  meta_access_token: string
  meta_verify_token: string
  meta_phone_number_id: string
  meta_display_phone_number: string | null
  meta_business_account_id: string | null
  meta_graph_version: string
  webhook_secret: string | null
  n8n_webhook_url: string | null
  n8n_api_key: string | null
}

type AdminTenantByEmailRow = {
  esquema: string | null
}

type TenantSchemaRow = {
  schema_name: string
}

function quotePgIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`
}

function isTenantSchema(value: string | null | undefined): value is string {
  return typeof value === "string" && TENANT_SCHEMA_PATTERN.test(value.trim().toLowerCase())
}

function configTableForSchema(schemaName: string) {
  return `${quotePgIdentifier(schemaName)}.${quotePgIdentifier("configuracion_meta_tenant")}`
}

function mapConfigRow(row: MetaTenantConfigRow): MetaTenantConfig {
  return {
    id: row.id,
    tenantSchema: row.tenant_schema,
    tenantId: row.tenant_id,
    nombreCuenta: row.nombre_cuenta,
    activo: row.activo,
    metaAccessToken: row.meta_access_token,
    metaVerifyToken: row.meta_verify_token,
    metaPhoneNumberId: row.meta_phone_number_id,
    metaDisplayPhoneNumber: row.meta_display_phone_number,
    metaBusinessAccountId: row.meta_business_account_id,
    metaGraphVersion: row.meta_graph_version,
    webhookSecret: row.webhook_secret,
    n8nWebhookUrl: row.n8n_webhook_url,
    n8nApiKey: row.n8n_api_key,
  }
}

export function normalizeTenantSchema(value: string | null | undefined): string {
  if (!value) {
    return ""
  }

  const normalized = value.trim().toLowerCase()
  if (!TENANT_SCHEMA_PATTERN.test(normalized)) {
    return ""
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
  if (!TENANT_SCHEMA_PATTERN.test(firstLabel)) {
    return null
  }

  return firstLabel
}

export function resolveTenantSchemaFromRequest(request: Request): string | null {
  const fromHeader = request.headers.get("x-tenant")?.trim().toLowerCase() ?? ""
  if (TENANT_SCHEMA_PATTERN.test(fromHeader)) {
    return fromHeader
  }

  const fromQuery = new URL(request.url).searchParams.get("tenant")?.trim().toLowerCase() ?? ""
  if (TENANT_SCHEMA_PATTERN.test(fromQuery)) {
    return fromQuery
  }

  const fromHost = tenantHintFromHost(request.headers.get("x-forwarded-host") ?? request.headers.get("host"))
  if (fromHost) {
    return fromHost
  }

  return null
}

export async function resolveTenantSchemaForRequest(request: Request): Promise<string | null> {
  const direct = resolveTenantSchemaFromRequest(request)

  const rawEmail = request.headers.get("x-user-email")?.trim().toLowerCase() ?? ""
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    return null
  }

  const tenantByUser = await findTenantSchemaByEmail(rawEmail, direct)
  return tenantByUser ?? null
}

export async function ensureMetaTenantConfigTable() {
  return
}

async function listTenantSchemasWithConfigTable(): Promise<string[]> {
  const result = await pool.query<TenantSchemaRow>(
    `SELECT n.nspname AS schema_name
       FROM pg_namespace n
      WHERE n.nspname ~ '^tenant_[a-z0-9_]+$'
        AND to_regclass(format('%I.configuracion_meta_tenant', n.nspname)) IS NOT NULL
      ORDER BY n.nspname ASC`,
  )

  return result.rows.map((row) => row.schema_name)
}

async function findConfigInSchema(
  schemaName: string,
  whereSql: string,
  params: unknown[],
): Promise<MetaTenantConfig | null> {
  const table = configTableForSchema(schemaName)

  try {
    const result = await pool.query<MetaTenantConfigRow>(
      `SELECT id,
              tenant_schema,
              tenant_id,
              nombre_cuenta,
              activo,
              meta_access_token,
              meta_verify_token,
              meta_phone_number_id,
              meta_display_phone_number,
              meta_business_account_id,
              meta_graph_version,
              webhook_secret,
              n8n_webhook_url,
              n8n_api_key
         FROM ${table}
        WHERE ${whereSql}
          AND activo = TRUE
        LIMIT 1`,
      params,
    )

    if (result.rowCount === 0) {
      return null
    }

    return mapConfigRow(result.rows[0])
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "42P01") {
      return null
    }
    throw error
  }
}

export async function getMetaConfigByTenantSchema(tenantSchemaRaw: string): Promise<MetaTenantConfig | null> {
  const tenantSchema = tenantSchemaRaw?.trim().toLowerCase() ?? ""
  if (!isTenantSchema(tenantSchema)) {
    return null
  }

  return findConfigInSchema(tenantSchema, "tenant_schema = $1", [tenantSchema])
}

export async function getMetaConfigByVerifyToken(verifyToken: string): Promise<MetaTenantConfig | null> {
  const token = verifyToken.trim()
  if (!token) {
    return null
  }

  const tenantSchemas = await listTenantSchemasWithConfigTable()
  const matches: MetaTenantConfig[] = []

  for (const schemaName of tenantSchemas) {
    const config = await findConfigInSchema(
      schemaName,
      "meta_verify_token = $1 AND tenant_schema = $2",
      [token, schemaName],
    )

    if (config) {
      matches.push(config)
    }
  }

  if (matches.length > 1) {
    console.error("Ambiguous Meta verify token across tenants", {
      token,
      tenantSchemas: matches.map((item) => item.tenantSchema),
    })
    return null
  }

  if (matches.length === 1) {
    return matches[0]
  }

  return null
}

export async function getMetaConfigByPhoneNumberId(phoneNumberId: string): Promise<MetaTenantConfig | null> {
  const normalized = phoneNumberId.trim()
  if (!normalized) {
    return null
  }

  const tenantSchemas = await listTenantSchemasWithConfigTable()
  const matches: MetaTenantConfig[] = []

  for (const schemaName of tenantSchemas) {
    const config = await findConfigInSchema(
      schemaName,
      "meta_phone_number_id = $1 AND tenant_schema = $2",
      [normalized, schemaName],
    )

    if (config) {
      matches.push(config)
    }
  }

  if (matches.length > 1) {
    console.error("Ambiguous Meta phone_number_id across tenants", {
      phoneNumberId: normalized,
      tenantSchemas: matches.map((item) => item.tenantSchema),
    })
    return null
  }

  if (matches.length === 1) {
    return matches[0]
  }

  return null
}
