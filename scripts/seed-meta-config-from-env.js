/* eslint-disable no-console */

const fs = require("fs")
const path = require("path")
const { Pool } = require("pg")

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local")
  if (!fs.existsSync(envPath)) {
    throw new Error(".env.local no existe en la raíz del proyecto")
  }

  const content = fs.readFileSync(envPath, "utf8")
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const eqIndex = line.indexOf("=")
    if (eqIndex === -1) continue

    const key = line.slice(0, eqIndex).trim()
    let value = line.slice(eqIndex + 1).trim()

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    if (!process.env[key]) process.env[key] = value
  }
}

function parseOptionalInt(value) {
  if (!value || !String(value).trim()) return null
  const parsed = Number.parseInt(String(value).trim(), 10)
  return Number.isFinite(parsed) ? parsed : null
}

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Falta variable requerida: ${name}`)
  }
  return value
}

async function main() {
  loadDotEnvLocal()

  const connectionString = required("DATABASE_URL")
  const tenantSchema =
    process.env.META_TENANT_SCHEMA?.trim().toLowerCase() ||
    process.env.DEFAULT_TENANT_SCHEMA?.trim().toLowerCase() ||
    "tenant_base"

  const tenantId = parseOptionalInt(process.env.META_TENANT_ID) ?? parseOptionalInt(process.env.ADMIN_PLATFORM_TENANT_ID)

  const nombreCuenta = process.env.META_ACCOUNT_NAME?.trim() || null
  const metaAccessToken = required("META_ACCESS_TOKEN")
  const metaVerifyToken = required("META_VERIFY_TOKEN")
  const metaPhoneNumberId = required("META_PHONE_NUMBER_ID")
  const metaDisplayPhoneNumber = process.env.META_DISPLAY_PHONE_NUMBER?.trim() || null
  const metaBusinessAccountId = process.env.META_BUSINESS_ACCOUNT_ID?.trim() || null
  const metaGraphVersion = process.env.META_GRAPH_VERSION?.trim() || "v22.0"
  const webhookSecret = process.env.META_WEBHOOK_SECRET?.trim() || null
  const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL?.trim() || null
  const n8nApiKey = process.env.N8N_API_KEY?.trim() || null

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })

  try {
    const result = await pool.query(
      `INSERT INTO tenant_base.configuracion_meta_tenant (
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
         n8n_api_key,
         fecha_actualizacion
       )
       VALUES ($1,$2,$3,TRUE,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
       ON CONFLICT (tenant_schema)
       DO UPDATE SET
         tenant_id = EXCLUDED.tenant_id,
         nombre_cuenta = EXCLUDED.nombre_cuenta,
         activo = TRUE,
         meta_access_token = EXCLUDED.meta_access_token,
         meta_verify_token = EXCLUDED.meta_verify_token,
         meta_phone_number_id = EXCLUDED.meta_phone_number_id,
         meta_display_phone_number = EXCLUDED.meta_display_phone_number,
         meta_business_account_id = EXCLUDED.meta_business_account_id,
         meta_graph_version = EXCLUDED.meta_graph_version,
         webhook_secret = EXCLUDED.webhook_secret,
         n8n_webhook_url = EXCLUDED.n8n_webhook_url,
         n8n_api_key = EXCLUDED.n8n_api_key,
         fecha_actualizacion = NOW()
       RETURNING id, tenant_schema, tenant_id, activo, meta_phone_number_id, meta_graph_version, fecha_actualizacion::text`,
      [
        tenantSchema,
        tenantId,
        nombreCuenta,
        metaAccessToken,
        metaVerifyToken,
        metaPhoneNumberId,
        metaDisplayPhoneNumber,
        metaBusinessAccountId,
        metaGraphVersion,
        webhookSecret,
        n8nWebhookUrl,
        n8nApiKey,
      ],
    )

    console.log("Configuración Meta insertada/actualizada correctamente:")
    console.table(result.rows)
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error("Error al insertar configuración Meta desde .env.local")
  console.error(error.message || error)
  process.exit(1)
})
