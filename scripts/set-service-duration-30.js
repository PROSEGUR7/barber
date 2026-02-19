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

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const before = await client.query(
      `SELECT duracion_min, COUNT(*)::int AS cnt
         FROM tenant_base.servicios
        WHERE estado = 'activo'
        GROUP BY duracion_min
        ORDER BY duracion_min`,
    )

    const update = await client.query(
      `UPDATE tenant_base.servicios
          SET duracion_min = 30
        WHERE estado = 'activo'
          AND (duracion_min IS DISTINCT FROM 30)`,
    )

    const after = await client.query(
      `SELECT duracion_min, COUNT(*)::int AS cnt
         FROM tenant_base.servicios
        WHERE estado = 'activo'
        GROUP BY duracion_min
        ORDER BY duracion_min`,
    )

    await client.query("COMMIT")

    console.log("Active services duration distribution (before):")
    console.table(before.rows)
    console.log("Rows updated:", update.rowCount)
    console.log("Active services duration distribution (after):")
    console.table(after.rows)
  } catch (err) {
    await client.query("ROLLBACK")
    console.error(err)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
