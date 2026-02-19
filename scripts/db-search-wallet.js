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

  const patterns = ["%wallet%", "%pago%", "%pago%", "%fact%", "%recib%", "%cupon%", "%promo%", "%metodo%", "%tarjeta%"]

  try {
    const result = await pool.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'tenant_base'
          AND (${patterns.map((_, i) => `table_name ILIKE $${i + 1}`).join(" OR ")})
        ORDER BY table_name`,
      patterns,
    )

    console.log("Candidate wallet/payment tables:")
    console.table(result.rows)

    for (const row of result.rows) {
      const tableName = row.table_name
      const cols = await pool.query(
        `SELECT column_name, data_type, udt_name
           FROM information_schema.columns
          WHERE table_schema = 'tenant_base'
            AND table_name = $1
          ORDER BY ordinal_position`,
        [tableName],
      )
      console.log(`Columns for tenant_base.${tableName}:`)
      console.table(cols.rows)
    }
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
