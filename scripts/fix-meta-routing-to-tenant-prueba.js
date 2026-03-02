/* eslint-disable no-console */

const fs = require("fs")
const path = require("path")
const { Pool } = require("pg")

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local")
  const content = fs.readFileSync(envPath, "utf8")

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const eq = line.indexOf("=")
    if (eq === -1) continue

    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    if (!process.env[key]) process.env[key] = value
  }
}

async function main() {
  loadDotEnvLocal()

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  try {
    const phoneId = process.env.META_PHONE_NUMBER_ID?.trim()
    if (!phoneId) {
      throw new Error("META_PHONE_NUMBER_ID no está definido en .env.local")
    }

    const targetTenant = "tenant_prueba"

    await pool.query("BEGIN")

    const updatedConfig = await pool.query(
      `UPDATE tenant_base.configuracion_meta_tenant
          SET tenant_schema = $1,
              tenant_id = COALESCE((SELECT id FROM admin_platform.tenants WHERE lower(trim(esquema)) = lower($1) LIMIT 1), tenant_id),
              fecha_actualizacion = NOW()
        WHERE meta_phone_number_id = $2
      RETURNING id, tenant_schema, tenant_id, meta_phone_number_id, fecha_actualizacion::text`,
      [targetTenant, phoneId],
    )

    if (updatedConfig.rowCount === 0) {
      throw new Error("No se encontró configuración Meta por meta_phone_number_id para actualizar")
    }

    const movedMessages = await pool.query(
      `UPDATE tenant_base.meta_webhook_messages
          SET tenant_schema = $1,
              updated_at = NOW()
        WHERE tenant_schema = 'tenant_base'
          AND phone_number_id = $2
      RETURNING id`,
      [targetTenant, phoneId],
    )

    await pool.query("COMMIT")

    console.log("Configuración Meta ajustada a tenant_prueba:")
    console.table(updatedConfig.rows)
    console.log(`Mensajes migrados a tenant_prueba: ${movedMessages.rowCount ?? 0}`)
  } catch (error) {
    try {
      await pool.query("ROLLBACK")
    } catch (_) {}
    throw error
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
