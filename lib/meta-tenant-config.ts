import { pool } from "@/lib/db"

const TENANT_SCHEMA_PATTERN = /^tenant_[a-z0-9_]+$/i
const DEFAULT_TENANT_SCHEMA = "tenant_base"

let ensureMetaTenantConfigPromise: Promise<void> | null = null

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
    return DEFAULT_TENANT_SCHEMA
  }

  const normalized = value.trim().toLowerCase()
  if (!TENANT_SCHEMA_PATTERN.test(normalized)) {
    return DEFAULT_TENANT_SCHEMA
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

export async function ensureMetaTenantConfigTable() {
  if (!ensureMetaTenantConfigPromise) {
    ensureMetaTenantConfigPromise = (async () => {
      await pool.query("SELECT pg_advisory_lock(hashtext('tenant_base.configuracion_meta_tenant_ddl'))")

      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS tenant_base.configuracion_meta_tenant (
            id BIGSERIAL PRIMARY KEY,
            tenant_schema TEXT NOT NULL,
            tenant_id INTEGER NULL,
            nombre_cuenta TEXT NULL,
            activo BOOLEAN NOT NULL DEFAULT TRUE,
            meta_access_token TEXT NOT NULL,
            meta_verify_token TEXT NOT NULL,
            meta_phone_number_id TEXT NOT NULL,
            meta_display_phone_number TEXT NULL,
            meta_business_account_id TEXT NULL,
            meta_graph_version TEXT NOT NULL DEFAULT 'v22.0',
            webhook_secret TEXT NULL,
            n8n_webhook_url TEXT NULL,
            n8n_api_key TEXT NULL,
            fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT chk_configuracion_meta_tenant_schema CHECK (tenant_schema ~ '^tenant_[a-z0-9_]+$')
          )
        `)

        await pool.query(`
          ALTER TABLE tenant_base.configuracion_meta_tenant
          ADD COLUMN IF NOT EXISTS tenant_id INTEGER NULL,
          ADD COLUMN IF NOT EXISTS nombre_cuenta TEXT NULL,
          ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE,
          ADD COLUMN IF NOT EXISTS meta_display_phone_number TEXT NULL,
          ADD COLUMN IF NOT EXISTS meta_business_account_id TEXT NULL,
          ADD COLUMN IF NOT EXISTS meta_graph_version TEXT NOT NULL DEFAULT 'v22.0',
          ADD COLUMN IF NOT EXISTS webhook_secret TEXT NULL,
          ADD COLUMN IF NOT EXISTS n8n_webhook_url TEXT NULL,
          ADD COLUMN IF NOT EXISTS n8n_api_key TEXT NULL,
          ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          ADD COLUMN IF NOT EXISTS fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
        `)

        await pool.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS ux_configuracion_meta_tenant_schema
            ON tenant_base.configuracion_meta_tenant (tenant_schema)
        `)

        await pool.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS ux_configuracion_meta_tenant_verify_token
            ON tenant_base.configuracion_meta_tenant (meta_verify_token)
        `)

        await pool.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS ux_configuracion_meta_tenant_phone_id
            ON tenant_base.configuracion_meta_tenant (meta_phone_number_id)
        `)
      } finally {
        await pool.query("SELECT pg_advisory_unlock(hashtext('tenant_base.configuracion_meta_tenant_ddl'))")
      }
    })().catch((error) => {
      ensureMetaTenantConfigPromise = null
      throw error
    })
  }

  return ensureMetaTenantConfigPromise
}

export async function getMetaConfigByTenantSchema(tenantSchemaRaw: string): Promise<MetaTenantConfig | null> {
  await ensureMetaTenantConfigTable()

  const tenantSchema = normalizeTenantSchema(tenantSchemaRaw)
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
       FROM tenant_base.configuracion_meta_tenant
      WHERE tenant_schema = $1
        AND activo = TRUE
      LIMIT 1`,
    [tenantSchema],
  )

  if (result.rowCount === 0) {
    return null
  }

  return mapConfigRow(result.rows[0])
}

export async function getMetaConfigByVerifyToken(verifyToken: string): Promise<MetaTenantConfig | null> {
  await ensureMetaTenantConfigTable()

  const token = verifyToken.trim()
  if (!token) {
    return null
  }

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
       FROM tenant_base.configuracion_meta_tenant
      WHERE meta_verify_token = $1
        AND activo = TRUE
      LIMIT 1`,
    [token],
  )

  if (result.rowCount === 0) {
    return null
  }

  return mapConfigRow(result.rows[0])
}

export async function getMetaConfigByPhoneNumberId(phoneNumberId: string): Promise<MetaTenantConfig | null> {
  await ensureMetaTenantConfigTable()

  const normalized = phoneNumberId.trim()
  if (!normalized) {
    return null
  }

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
       FROM tenant_base.configuracion_meta_tenant
      WHERE meta_phone_number_id = $1
        AND activo = TRUE
      LIMIT 1`,
    [normalized],
  )

  if (result.rowCount === 0) {
    return null
  }

  return mapConfigRow(result.rows[0])
}
