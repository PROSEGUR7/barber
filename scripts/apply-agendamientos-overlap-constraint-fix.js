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

    await client.query(`
      ALTER TABLE tenant_base.agendamientos
      DROP CONSTRAINT IF EXISTS agendamientos_no_overlap_per_employee;
    `)

    await client.query(`
      ALTER TABLE tenant_base.agendamientos
      ADD CONSTRAINT agendamientos_no_overlap_per_employee
      EXCLUDE USING gist (
        empleado_id WITH =,
        tstzrange(fecha_cita, fecha_cita_fin, '[)') WITH &&
      )
      WHERE (
        empleado_id IS NOT NULL
        AND estado <> 'cancelada'::tenant_base.estado_agendamiento_enum
      );
    `)

    await client.query("COMMIT")

    const verify = await client.query(`
      SELECT conname,
             pg_get_constraintdef(c.oid) AS definition
        FROM pg_constraint c
       WHERE c.conrelid = 'tenant_base.agendamientos'::regclass
         AND c.conname = 'agendamientos_no_overlap_per_employee';
    `)

    console.table(verify.rows)
    console.log("Constraint fix applied successfully.")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
