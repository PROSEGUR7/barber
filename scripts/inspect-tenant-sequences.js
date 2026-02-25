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

  try {
    const result = await pool.query(
      `SELECT
         seq_ns.nspname AS schema_name,
         seq.relname AS sequence_name,
         tbl.relname AS owned_table,
         att.attname AS owned_column
       FROM pg_class seq
       JOIN pg_namespace seq_ns ON seq_ns.oid = seq.relnamespace
       LEFT JOIN pg_depend dep
              ON dep.objid = seq.oid
             AND dep.classid = 'pg_class'::regclass
             AND dep.refclassid = 'pg_class'::regclass
             AND dep.deptype IN ('a', 'i')
       LEFT JOIN pg_class tbl ON tbl.oid = dep.refobjid
       LEFT JOIN pg_attribute att
              ON att.attrelid = tbl.oid
             AND att.attnum = dep.refobjsubid
       WHERE seq.relkind = 'S'
         AND seq_ns.nspname = 'tenant_base'
       ORDER BY seq.relname`,
    )

    const orphan = result.rows.filter((row) => !row.owned_table)

    console.log("=== tenant_base sequences ===")
    console.table(result.rows)
    console.log(`Total sequences: ${result.rows.length}`)
    console.log(`Orphan/disconnected sequences: ${orphan.length}`)

    if (orphan.length > 0) {
      console.log("Orphan sequence names:", orphan.map((row) => row.sequence_name))
      process.exitCode = 2
    }
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
