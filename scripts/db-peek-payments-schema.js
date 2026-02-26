/* eslint-disable no-console */

const fs = require("fs")
const path = require("path")
const { Pool } = require("pg")

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local")
  if (!fs.existsSync(envPath)) return

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

async function main() {
  loadDotEnvLocal()

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  try {
    const columns = await pool.query(
      `SELECT table_name,
              column_name,
              data_type,
              udt_name,
              is_nullable,
              column_default
         FROM information_schema.columns
        WHERE table_schema = 'tenant_base'
          AND table_name IN ('pagos', 'agendamientos')
        ORDER BY table_name, ordinal_position`,
    )

    const enums = await pool.query(
      `SELECT t.typname AS enum_name,
              e.enumsortorder,
              e.enumlabel
         FROM pg_type t
         JOIN pg_enum e ON e.enumtypid = t.oid
         JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'tenant_base'
          AND t.typname IN ('estado_agendamiento_enum', 'estado_pago_enum', 'metodo_pago_enum')
        ORDER BY t.typname, e.enumsortorder`,
    )

    console.log("Columns:")
    console.table(columns.rows)
    console.log("Enums:")
    console.table(enums.rows)
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
