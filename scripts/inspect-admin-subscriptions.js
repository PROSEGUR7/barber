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

async function main() {
  loadDotEnvLocal()

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()

  try {
    const tenants = await client.query(
      `SELECT id, nombre, esquema, estado_suscripcion::text AS estado_suscripcion
         FROM admin_platform.tenants
        ORDER BY id`,
    )

    const subscriptions = await client.query(
      `SELECT s.id,
              s.tenant_id,
              s.plan_id,
              p.codigo AS plan_codigo,
              s.ciclo_facturacion::text AS ciclo_facturacion,
              s.monto_ciclo::text AS monto_ciclo,
              s.fecha_fin_periodo::text AS fecha_fin_periodo
         FROM admin_platform.suscripciones_tenants s
         LEFT JOIN admin_platform.planes_suscripcion p ON p.id = s.plan_id
        ORDER BY s.id`,
    )

    console.log("TENANTS")
    console.table(tenants.rows)
    console.log("SUSCRIPCIONES")
    console.table(subscriptions.rows)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error("[inspect-admin-subscriptions] Error", error)
  process.exitCode = 1
})
