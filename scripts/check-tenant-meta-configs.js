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
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  try {
    const tenantPrueba = await pool.query("SELECT id, tenant_schema, activo, meta_phone_number_id FROM tenant_prueba.configuracion_meta_tenant LIMIT 5")
    console.log("tenant_prueba.configuracion_meta_tenant")
    console.table(tenantPrueba.rows)

    const tenantPepeExists = await pool.query("SELECT to_regclass('tenant_pepe.configuracion_meta_tenant')::text AS t")
    console.log("tenant_pepe.configuracion_meta_tenant exists:", tenantPepeExists.rows[0]?.t)
    if (tenantPepeExists.rows[0]?.t) {
      const tenantPepe = await pool.query("SELECT id, tenant_schema, activo, meta_phone_number_id FROM tenant_pepe.configuracion_meta_tenant LIMIT 5")
      console.log("tenant_pepe.configuracion_meta_tenant")
      console.table(tenantPepe.rows)
    }
  } finally {
    await pool.end()
  }
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
