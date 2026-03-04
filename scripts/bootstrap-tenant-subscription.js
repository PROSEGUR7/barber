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

async function main() {
  loadDotEnvLocal()

  const tenantSchema = (process.argv[2] || "tenant_prueba").trim()
  const planCode = (process.argv[3] || "fullstack").trim()
  const cycle = (process.argv[4] || "mensual").trim()

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()

  try {
    await client.query("BEGIN")

    const tenantResult = await client.query(
      `SELECT id, nombre, esquema
         FROM admin_platform.tenants
        WHERE lower(esquema) = lower($1)
        LIMIT 1`,
      [tenantSchema],
    )

    if (tenantResult.rowCount === 0) {
      throw new Error(`No existe tenant con esquema ${tenantSchema}`)
    }

    const tenant = tenantResult.rows[0]

    const planResult = await client.query(
      `SELECT id,
              codigo,
              precio_mensual,
              precio_trimestral,
              precio_anual,
              moneda
         FROM admin_platform.planes_suscripcion
        WHERE lower(codigo) = lower($1)
          AND activo = true
        LIMIT 1`,
      [planCode],
    )

    if (planResult.rowCount === 0) {
      throw new Error(`No existe plan activo con código ${planCode}`)
    }

    const plan = planResult.rows[0]
    const amount =
      cycle === "trimestral"
        ? Number(plan.precio_trimestral)
        : cycle === "anual"
          ? Number(plan.precio_anual)
          : Number(plan.precio_mensual)

    const now = new Date()
    const periodEnd = new Date(now)
    if (cycle === "trimestral") {
      periodEnd.setMonth(periodEnd.getMonth() + 3)
    } else if (cycle === "anual") {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1)
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1)
    }

    await client.query(
      `INSERT INTO admin_platform.suscripciones_tenants (
         tenant_id,
         plan_id,
         ciclo_facturacion,
         monto_ciclo,
         moneda,
         fecha_inicio_periodo,
         fecha_fin_periodo,
         proximo_cobro,
         renovacion_automatica
       ) VALUES (
         $1,
         $2,
         $3::admin_platform.ciclo_facturacion_enum,
         $4,
         $5,
         $6,
         $7,
         $7,
         true
       )
       ON CONFLICT (tenant_id)
       DO UPDATE SET
         plan_id = EXCLUDED.plan_id,
         ciclo_facturacion = EXCLUDED.ciclo_facturacion,
         monto_ciclo = EXCLUDED.monto_ciclo,
         moneda = EXCLUDED.moneda,
         fecha_inicio_periodo = EXCLUDED.fecha_inicio_periodo,
         fecha_fin_periodo = EXCLUDED.fecha_fin_periodo,
         proximo_cobro = EXCLUDED.proximo_cobro,
         renovacion_automatica = EXCLUDED.renovacion_automatica,
         fecha_actualizacion = now()`,
      [tenant.id, plan.id, cycle, amount, plan.moneda || "COP", now.toISOString(), periodEnd.toISOString()],
    )

    await client.query(
      `UPDATE admin_platform.tenants
          SET plan_suscripcion = $2,
              estado_suscripcion = 'active',
              periodo_inicio = $3,
              periodo_fin = $4,
              gracia_hasta = NULL,
              estado_suscripcion_actualizado_en = now()
        WHERE id = $1`,
      [tenant.id, plan.codigo, now.toISOString(), periodEnd.toISOString()],
    )

    await client.query("COMMIT")

    console.log("[bootstrap-subscription] OK", {
      tenantId: tenant.id,
      tenantSchema: tenant.esquema,
      planCode: plan.codigo,
      cycle,
      amount,
      periodEnd: periodEnd.toISOString(),
    })
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error("[bootstrap-subscription] Error", error)
  process.exitCode = 1
})
