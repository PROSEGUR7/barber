/* eslint-disable no-console */

const fs = require("fs")
const path = require("path")
const { Client } = require("pg")

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

function getConfig() {
  const connectionString = process.env.DATABASE_URL || ""

  if (!connectionString) {
    throw new Error("Falta DATABASE_URL")
  }

  return { connectionString }
}

async function main() {
  loadDotEnvLocal()
  const config = getConfig()
  const sqlPath = path.join(process.cwd(), "scripts", "admin-platform-update-saas-plans.sql")
  const sql = fs.readFileSync(sqlPath, "utf8")

  const client = new Client({
    connectionString: config.connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
  })

  await client.connect()

  try {
    await client.query(sql)

    const plans = await client.query(
      `SELECT id, nombre, codigo, precio_mensual::text AS precio_mensual, activo
         FROM admin_platform.planes_suscripcion
        ORDER BY precio_mensual ASC, id ASC`,
    )

    console.log("[admin-platform:plans] Migración aplicada correctamente")
    console.table(plans.rows)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error("[admin-platform:plans] Error inesperado", error)
  process.exitCode = 1
})
