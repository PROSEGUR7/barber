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
  const client = new Client({
    connectionString: config.connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
  })

  await client.connect()

  try {
    const result = await client.query("SELECT * FROM admin_platform.sincronizar_estado_suscripciones_tenants()")
    console.log("[billing:sync-status] OK", result.rows[0] || {
      total_actualizados: 0,
      a_past_due: 0,
      a_unpaid: 0,
      a_paused: 0,
    })
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error("[billing:sync-status] Unexpected error", error)
  process.exitCode = 1
})