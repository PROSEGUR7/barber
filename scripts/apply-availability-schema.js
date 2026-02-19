/* eslint-disable no-console */

const fs = require("fs")
const path = require("path")

const { Pool } = require("pg")

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local")
  if (!fs.existsSync(envPath)) {
    return
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

    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

async function main() {
  loadDotEnvLocal()

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error("DATABASE_URL not found (set env var or add .env.local).")
    process.exit(1)
  }

  const sqlPath = path.join(process.cwd(), "scripts", "availability-schema.sql")
  const sql = fs.readFileSync(sqlPath, "utf8")

  const pool = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
  })

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query(sql)
    await client.query("COMMIT")
    console.log("Availability schema applied successfully.")
  } catch (err) {
    await client.query("ROLLBACK")
    console.error("Failed applying availability schema.")
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
