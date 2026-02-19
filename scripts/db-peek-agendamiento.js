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
  const appointmentId = Number(process.argv[2] ?? "")
  if (!appointmentId) {
    console.error("Usage: node scripts/db-peek-agendamiento.js <appointmentId>")
    process.exit(1)
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  try {
    const result = await pool.query(
      `SELECT a.id,
              a.cliente_id,
              c.user_id AS cliente_user_id,
              a.empleado_id,
              a.servicio_id,
              a.fecha_cita,
              a.fecha_cita_fin,
              a.estado::text AS estado,
              a.notificado::text AS notificado,
              a.creado_en
         FROM tenant_base.agendamientos a
         LEFT JOIN tenant_base.clientes c ON c.id = a.cliente_id
        WHERE a.id = $1`,
      [appointmentId],
    )

    console.table(result.rows)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
