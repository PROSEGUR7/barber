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
    const configRows = await pool.query(
      `SELECT id,
              tenant_schema,
              tenant_id,
              activo,
              meta_phone_number_id,
              meta_verify_token,
              fecha_actualizacion::text
         FROM tenant_base.configuracion_meta_tenant
        ORDER BY id ASC`,
    )

    console.log("configuracion_meta_tenant (tenant_base):")
    console.table(configRows.rows)

    const msgRows = await pool.query(
      `SELECT tenant_schema, count(*)::int AS total
         FROM tenant_base.meta_webhook_messages
        GROUP BY tenant_schema
        ORDER BY tenant_schema`,
    )

    console.log("meta_webhook_messages by tenant:")
    console.table(msgRows.rows)
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
