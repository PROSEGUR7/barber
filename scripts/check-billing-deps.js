/* eslint-disable no-console */

const fs = require("fs")
const path = require("path")
const { Pool } = require("pg")

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local")
  if (!fs.existsSync(envPath)) {
    throw new Error(".env.local no existe")
  }

  const content = fs.readFileSync(envPath, "utf8")
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const eq = line.indexOf("=")
    if (eq === -1) continue

    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

async function main() {
  loadDotEnvLocal()

  const tenantIdRaw = process.env.ADMIN_PLATFORM_TENANT_ID?.trim() || ""
  const tenantId = Number.parseInt(tenantIdRaw, 10)

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  try {
    const fnResultOneArg = await pool.query(
      "SELECT to_regprocedure('admin_platform.tenant_can_login(integer)')::text AS fn",
    )

    const fnResultTwoArgs = await pool.query(
      "SELECT to_regprocedure('admin_platform.tenant_can_login(integer,timestamp with time zone)')::text AS fn",
    )

    const tableResult = await pool.query(
      "SELECT to_regclass('admin_platform.tenants')::text AS tbl",
    )

    let callResult = null
    let callError = null

    if (Number.isInteger(tenantId) && tenantId > 0) {
      try {
        const result = await pool.query(
          "SELECT * FROM admin_platform.tenant_can_login($1)",
          [tenantId],
        )
        callResult = result.rows[0] ?? null
      } catch (error) {
        callError = error instanceof Error ? error.message : String(error)
      }
    }

    console.log({
      tenant_can_login_one_arg: fnResultOneArg.rows[0]?.fn ?? null,
      tenant_can_login_two_args: fnResultTwoArgs.rows[0]?.fn ?? null,
      tenants_table: tableResult.rows[0]?.tbl ?? null,
      tested_tenant_id: Number.isInteger(tenantId) && tenantId > 0 ? tenantId : null,
      tenant_can_login_call_result: callResult,
      tenant_can_login_call_error: callError,
    })
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
