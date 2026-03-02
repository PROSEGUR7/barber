/* eslint-disable no-console */

const fs = require("fs")
const path = require("path")
const { Pool } = require("pg")

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local")
  const content = fs.readFileSync(envPath, "utf8")
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const i = line.indexOf("=")
    if (i < 0) continue
    const key = line.slice(0, i).trim()
    let value = line.slice(i + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

async function main() {
  loadEnv()

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  try {
    await pool.query(
      `UPDATE tenant_prueba.configuracion_meta_tenant c
          SET tenant_id = t.id,
              fecha_actualizacion = NOW()
         FROM admin_platform.tenants t
        WHERE lower(trim(t.esquema)) = 'tenant_prueba'
          AND c.tenant_schema = 'tenant_prueba'`,
    )

    const result = await pool.query(
      `SELECT id, tenant_schema, tenant_id, activo, meta_phone_number_id, fecha_actualizacion::text
         FROM tenant_prueba.configuracion_meta_tenant
        WHERE tenant_schema = 'tenant_prueba'
        ORDER BY id DESC
        LIMIT 1`,
    )

    console.table(result.rows)
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
