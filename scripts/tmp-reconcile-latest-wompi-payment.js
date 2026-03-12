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
  const tenant = process.argv[2] || "tenant_prueba"

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  try {
    const result = await pool.query(
      `SELECT p.id,
              p.agendamiento_id,
              p.estado::text AS estado,
              p.monto::text AS monto,
              p.monto_descuento::text AS monto_descuento,
              p.monto_final::text AS monto_final,
              p.wompi_reference,
              p.wompi_transaction_id,
              p.wompi_status,
              p.fecha_pago,
              a.estado::text AS cita_estado,
              a.fecha_cita,
              c.user_id,
              u.correo
         FROM ${tenant}.pagos p
         LEFT JOIN ${tenant}.agendamientos a ON a.id = p.agendamiento_id
         LEFT JOIN ${tenant}.clientes c ON c.id = a.cliente_id
         LEFT JOIN ${tenant}.users u ON u.id = c.user_id
        WHERE p.proveedor_pago = 'wompi'
        ORDER BY p.id DESC
        LIMIT 5`
    )

    console.log(JSON.stringify({ tenant, payments: result.rows }, null, 2))
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error("ERROR", error)
  process.exit(1)
})
