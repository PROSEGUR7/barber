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

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error("DATABASE_URL not found")
    process.exit(1)
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })

  const checks = {
    extensionBtreeGist: false,
    pagosEstadoDefault: null,
    pagosChecks: [],
    duplicatePagoConstraintExists: false,
    horariosDisponibleType: null,
    horariosDisponibleDefault: null,
    agendamientosFechaType: null,
    agendamientosFechaFinType: null,
    deletedAtColumns: [],
    overlapConstraint: false,
    agEmpFechaIndex: false,
    orphanTenantSequences: 0,
  }

  try {
    const ext = await pool.query(
      `SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'btree_gist') AS ok`,
    )
    checks.extensionBtreeGist = Boolean(ext.rows[0]?.ok)

    const pagosCol = await pool.query(
      `SELECT column_default
         FROM information_schema.columns
        WHERE table_schema = 'tenant_base'
          AND table_name = 'pagos'
          AND column_name = 'estado'`,
    )
    checks.pagosEstadoDefault = pagosCol.rows[0]?.column_default ?? null

    const pagosConstraints = await pool.query(
      `SELECT c.conname
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'tenant_base'
          AND t.relname = 'pagos'
          AND c.conname IN ('pagos_monto_final_nonnegative', 'pagos_descuento_lte_monto')
        ORDER BY c.conname`,
    )
    checks.pagosChecks = pagosConstraints.rows.map((row) => row.conname)

    const duplicatePagoConstraint = await pool.query(
      `SELECT EXISTS(
         SELECT 1
           FROM pg_constraint c
           JOIN pg_class t ON t.oid = c.conrelid
           JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE n.nspname = 'tenant_base'
            AND t.relname = 'pagos'
            AND c.conname = 'chk_pagos_final_nonneg'
       ) AS ok`,
    )
    checks.duplicatePagoConstraintExists = Boolean(duplicatePagoConstraint.rows[0]?.ok)

    const horariosCol = await pool.query(
      `SELECT data_type, column_default
         FROM information_schema.columns
        WHERE table_schema = 'tenant_base'
          AND table_name = 'horarios_empleados'
          AND column_name = 'disponible'`,
    )
    checks.horariosDisponibleType = horariosCol.rows[0]?.data_type ?? null
    checks.horariosDisponibleDefault = horariosCol.rows[0]?.column_default ?? null

    const agCols = await pool.query(
      `SELECT column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = 'tenant_base'
          AND table_name = 'agendamientos'
          AND column_name IN ('fecha_cita', 'fecha_cita_fin')`,
    )
    for (const row of agCols.rows) {
      if (row.column_name === 'fecha_cita') checks.agendamientosFechaType = row.data_type
      if (row.column_name === 'fecha_cita_fin') checks.agendamientosFechaFinType = row.data_type
    }

    const deletedCols = await pool.query(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'tenant_base'
          AND table_name IN ('clientes', 'empleados', 'servicios')
          AND column_name = 'deleted_at'
        ORDER BY table_name`,
    )
    checks.deletedAtColumns = deletedCols.rows.map((row) => `${row.table_name}.${row.column_name}`)

    const overlapConstraint = await pool.query(
      `SELECT EXISTS(
         SELECT 1
           FROM pg_constraint c
           JOIN pg_class t ON t.oid = c.conrelid
           JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE n.nspname = 'tenant_base'
            AND t.relname = 'agendamientos'
            AND c.conname = 'agendamientos_no_overlap_per_employee'
       ) AS ok`,
    )
    checks.overlapConstraint = Boolean(overlapConstraint.rows[0]?.ok)

    const agEmpFechaIndex = await pool.query(
      `SELECT EXISTS(
         SELECT 1
           FROM pg_indexes
          WHERE schemaname = 'tenant_base'
            AND tablename = 'agendamientos'
            AND indexname = 'idx_ag_emp_fecha'
       ) AS ok`,
    )
    checks.agEmpFechaIndex = Boolean(agEmpFechaIndex.rows[0]?.ok)

    const orphanSeq = await pool.query(
      `SELECT COUNT(*)::int AS cnt
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'S'
          AND n.nspname = 'tenant_base'
          AND c.relname LIKE '%_seq'
          AND NOT EXISTS (
            SELECT 1
              FROM pg_depend d
             WHERE d.objid = c.oid
          )`,
    )
    checks.orphanTenantSequences = Number(orphanSeq.rows[0]?.cnt ?? 0)

    console.log("=== Senior hardening verification ===")
    console.log(JSON.stringify(checks, null, 2))

    const pass =
      checks.extensionBtreeGist &&
      (checks.pagosEstadoDefault || "").includes("pendiente") &&
      checks.pagosChecks.includes("pagos_monto_final_nonnegative") &&
      checks.pagosChecks.includes("pagos_descuento_lte_monto") &&
      !checks.duplicatePagoConstraintExists &&
      checks.horariosDisponibleType === "boolean" &&
      checks.agendamientosFechaType === "timestamp with time zone" &&
      checks.agendamientosFechaFinType === "timestamp with time zone" &&
      checks.deletedAtColumns.length === 3 &&
      checks.overlapConstraint &&
      checks.agEmpFechaIndex &&
      checks.orphanTenantSequences === 0

    if (!pass) {
      console.error("Verification finished with missing items.")
      process.exitCode = 2
      return
    }

    console.log("Verification passed.")
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
