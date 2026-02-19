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

function todayYmdUtc() {
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(now.getUTCDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

async function main() {
  loadDotEnvLocal()

  const employeeId = Number(process.argv[2] ?? "")
  const fromDate = String(process.argv[3] ?? todayYmdUtc())
  const days = Number(process.argv[4] ?? "60")

  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    console.error("Usage: node scripts/seed-availability.js <employeeId> [fromDate YYYY-MM-DD] [days]")
    process.exit(1)
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
    console.error("fromDate must be YYYY-MM-DD")
    process.exit(1)
  }

  if (!Number.isFinite(days) || days < 1 || days > 365) {
    console.error("days must be between 1 and 365")
    process.exit(1)
  }

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error("DATABASE_URL not found (set env var or add .env.local).")
    process.exit(1)
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })

  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    // 1) Set a default weekly schedule: Mon-Sat 09:00-18:00
    await client.query(
      `DELETE FROM tenant_base.empleados_disponibilidad_semanal WHERE empleado_id = $1`,
      [employeeId],
    )

    // dow: 0=Sun, 1=Mon, ... 6=Sat
    const defaultRules = [1, 2, 3, 4, 5, 6]
    for (const dow of defaultRules) {
      await client.query(
        `INSERT INTO tenant_base.empleados_disponibilidad_semanal (empleado_id, dow, hora_inicio, hora_fin, activo)
         VALUES ($1, $2, '09:00'::time, '18:00'::time, TRUE)
         ON CONFLICT DO NOTHING`,
        [employeeId, dow],
      )
    }

    // 2) Materialize horarios_empleados for the date range.
    // This respects exceptions if they exist (off/custom).
    await client.query(
      `DELETE FROM tenant_base.horarios_empleados he
        WHERE he.empleado_id = $1
          AND DATE(he.fecha_hora_inicio) BETWEEN $2::date AND ($2::date + ($3::int - 1))`,
      [employeeId, fromDate, days],
    )

    await client.query(
      `WITH days AS (
          SELECT ($2::date + gs)::date AS d,
                 EXTRACT(DOW FROM ($2::date + gs))::int AS dow
            FROM generate_series(0, $3::int - 1) AS gs
        ),
        weekly AS (
          SELECT dow, hora_inicio, hora_fin
            FROM tenant_base.empleados_disponibilidad_semanal
           WHERE empleado_id = $1
             AND activo = TRUE
        ),
        ex_off AS (
          SELECT fecha
            FROM tenant_base.empleados_disponibilidad_excepciones
           WHERE empleado_id = $1
             AND tipo = 'off'
             AND fecha BETWEEN $2::date AND ($2::date + ($3::int - 1))
        ),
        ex_custom AS (
          SELECT fecha, hora_inicio, hora_fin
            FROM tenant_base.empleados_disponibilidad_excepciones
           WHERE empleado_id = $1
             AND tipo = 'custom'
             AND fecha BETWEEN $2::date AND ($2::date + ($3::int - 1))
        ),
        blocks AS (
          SELECT d.d AS fecha,
                 COALESCE(ec.hora_inicio, w.hora_inicio) AS hora_inicio,
                 COALESCE(ec.hora_fin, w.hora_fin) AS hora_fin
            FROM days d
            LEFT JOIN ex_off eo ON eo.fecha = d.d
            LEFT JOIN ex_custom ec ON ec.fecha = d.d
            LEFT JOIN weekly w ON w.dow = d.dow
           WHERE eo.fecha IS NULL
             AND (ec.fecha IS NOT NULL OR w.dow IS NOT NULL)
        )
         INSERT INTO tenant_base.horarios_empleados (empleado_id, disponible, fecha_hora_inicio, fecha_hora_fin)
         SELECT $1,
           TRUE,
               (b.fecha + b.hora_inicio) AS fecha_hora_inicio,
               (b.fecha + b.hora_fin) AS fecha_hora_fin
          FROM blocks b
         ORDER BY b.fecha, b.hora_inicio`,
      [employeeId, fromDate, days],
    )

    const countResult = await client.query(
      `SELECT COUNT(*)::int AS cnt
         FROM tenant_base.horarios_empleados he
        WHERE he.empleado_id = $1
          AND DATE(he.fecha_hora_inicio) BETWEEN $2::date AND ($2::date + ($3::int - 1))`,
      [employeeId, fromDate, days],
    )
    const blocksInserted = countResult.rows[0]?.cnt ?? 0

    await client.query("COMMIT")

    console.log(
      `Seeded weekly availability and materialized horarios_empleados for empleado_id=${employeeId} from ${fromDate} (${days} days). Blocks: ${blocksInserted}.`,
    )
  } catch (err) {
    await client.query("ROLLBACK")
    console.error("Failed seeding availability")
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
