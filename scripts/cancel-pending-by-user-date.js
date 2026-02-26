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
  const isoDate = String(process.argv[3] ?? "").trim()

  if (!userId || !isoDate) {
    console.error("Usage: node scripts/cancel-pending-by-user-date.js <userId> <yyyy-mm-dd>")
    process.exit(1)
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  try {
    const result = await pool.query(
      `UPDATE tenant_base.agendamientos a
          SET estado = 'cancelada'::tenant_base.estado_agendamiento_enum
        WHERE a.id IN (
          SELECT a2.id
            FROM tenant_base.agendamientos a2
            JOIN tenant_base.clientes c ON c.id = a2.cliente_id
           WHERE c.user_id = $1
             AND DATE(a2.fecha_cita) = DATE($2::date)
             AND a2.estado::text = 'pendiente'
           ORDER BY a2.fecha_cita DESC
           LIMIT 1
        )
      RETURNING a.id, a.estado::text AS estado, a.fecha_cita`,
      [userId, isoDate],
    )

    console.log("Updated rows:", result.rowCount)
    console.table(result.rows)
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
