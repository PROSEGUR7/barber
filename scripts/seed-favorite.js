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

  const userId = Number(process.argv[2] ?? "")
  const barberId = Number(process.argv[3] ?? "")

  if (!userId || !barberId) {
    console.error("Usage: node scripts/seed-favorite.js <userId> <barberId>")
    process.exit(1)
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  try {
    const clientResult = await pool.query(
      "SELECT id FROM tenant_base.clientes WHERE user_id = $1 LIMIT 1",
      [userId],
    )

    const clientId = clientResult.rows[0]?.id
    if (!clientId) {
      console.error(`No client profile found for userId=${userId}`)
      process.exit(2)
    }

    await pool.query(
      `INSERT INTO tenant_base.clientes_favoritos_empleados (cliente_id, empleado_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [clientId, barberId],
    )

    console.log(`Favorite ensured: userId=${userId} (cliente_id=${clientId}) -> empleado_id=${barberId}`)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
