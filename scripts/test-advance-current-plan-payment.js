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

function daysBetween(from, to) {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
}

async function main() {
  loadDotEnvLocal()

  const tenantSchema = (process.argv[2] || "tenant_prueba").trim()
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()

  try {
    const tenantResult = await client.query(
      `SELECT id, nombre, esquema
         FROM admin_platform.tenants
        WHERE lower(esquema) = lower($1)
        LIMIT 1`,
      [tenantSchema],
    )

    if (tenantResult.rowCount === 0) {
      throw new Error(`No existe tenant para esquema ${tenantSchema}`)
    }

    const tenant = tenantResult.rows[0]

    const subBefore = await client.query(
      `SELECT s.id,
              s.tenant_id,
              s.ciclo_facturacion::text AS ciclo_facturacion,
              s.monto_ciclo::text AS monto_ciclo,
              s.moneda,
              s.fecha_fin_periodo::text AS fecha_fin_periodo,
              s.proximo_cobro::text AS proximo_cobro,
              p.codigo AS plan_codigo,
              p.nombre AS plan_nombre
         FROM admin_platform.suscripciones_tenants s
         JOIN admin_platform.planes_suscripcion p ON p.id = s.plan_id
        WHERE s.tenant_id = $1
        LIMIT 1`,
      [tenant.id],
    )

    if (subBefore.rowCount === 0) {
      throw new Error(`El tenant ${tenant.esquema} no tiene suscripción en admin_platform.suscripciones_tenants`)
    }

    const before = subBefore.rows[0]
    const beforeEnd = new Date(before.fecha_fin_periodo)
    const beforeNext = new Date(before.proximo_cobro)
    const now = new Date()

    const reference = `ADVANCE-PLAN-${tenant.id}-${Date.now()}`

    const paymentResult = await client.query(
      `SELECT *
         FROM admin_platform.registrar_pago_tenant(
           $1,
           $2::numeric,
           $3,
           $4,
           $5,
           $6,
           $7::admin_platform.ciclo_facturacion_enum,
           $8
         )`,
      [
        tenant.id,
        Number.parseFloat(before.monto_ciclo),
        before.moneda || "COP",
        "wompi",
        "wompi",
        reference,
        before.ciclo_facturacion,
        new Date().toISOString(),
      ],
    )

    const subAfter = await client.query(
      `SELECT s.id,
              s.ciclo_facturacion::text AS ciclo_facturacion,
              s.fecha_fin_periodo::text AS fecha_fin_periodo,
              s.proximo_cobro::text AS proximo_cobro
         FROM admin_platform.suscripciones_tenants s
        WHERE s.tenant_id = $1
        LIMIT 1`,
      [tenant.id],
    )

    const after = subAfter.rows[0]
    const afterEnd = new Date(after.fecha_fin_periodo)
    const afterNext = new Date(after.proximo_cobro)

    const summary = {
      tenant: {
        id: tenant.id,
        schema: tenant.esquema,
        name: tenant.nombre,
      },
      plan: {
        code: before.plan_codigo,
        name: before.plan_nombre,
        cycle: before.ciclo_facturacion,
        amount: before.monto_ciclo,
        currency: before.moneda,
      },
      before: {
        periodEnd: beforeEnd.toISOString(),
        nextCharge: beforeNext.toISOString(),
        remainingDays: daysBetween(now, beforeEnd),
      },
      payment: {
        reference,
        result: paymentResult.rows[0] || null,
      },
      after: {
        periodEnd: afterEnd.toISOString(),
        nextCharge: afterNext.toISOString(),
        remainingDays: daysBetween(new Date(), afterEnd),
      },
      deltaDays: daysBetween(beforeEnd, afterEnd),
    }

    console.log(JSON.stringify(summary, null, 2))
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  )
  process.exitCode = 1
})
