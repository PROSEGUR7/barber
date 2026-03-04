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

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()

  try {
    const tenantResult = await client.query(
      `SELECT id, nombre, esquema, estado_suscripcion::text AS estado_suscripcion
         FROM admin_platform.tenants
        WHERE lower(esquema) = lower($1)
        LIMIT 1`,
      [tenantSchema],
    )

    if (tenantResult.rowCount === 0) {
      throw new Error(`No existe tenant para esquema ${tenantSchema}`)
    }

    const tenant = tenantResult.rows[0]

    const payments = await client.query(
      `SELECT id,
              estado::text AS estado,
              monto::text AS monto,
              moneda,
              referencia_externa,
              pagado_en::text AS pagado_en,
              fecha_creacion::text AS fecha_creacion
         FROM admin_platform.pagos_tenants
        WHERE tenant_id = $1
        ORDER BY id DESC
        LIMIT 5`,
      [tenant.id],
    )

    const subscription = await client.query(
      `SELECT s.id,
              p.codigo AS plan_codigo,
              p.nombre AS plan_nombre,
              s.fecha_fin_periodo::text AS fecha_fin_periodo,
              s.proximo_cobro::text AS proximo_cobro
         FROM admin_platform.suscripciones_tenants s
         JOIN admin_platform.planes_suscripcion p ON p.id = s.plan_id
        WHERE s.tenant_id = $1
        LIMIT 1`,
      [tenant.id],
    )

    const hasPaid = await client.query(
      `SELECT EXISTS (
         SELECT 1
           FROM admin_platform.pagos_tenants pt
          WHERE pt.tenant_id = $1
            AND lower(coalesce(pt.estado::text, '')) IN ('aprobado','pagado','completo','paid','success','succeeded')
       ) AS has_paid`,
      [tenant.id],
    )

    console.log("TENANT")
    console.table([tenant])
    console.log("HAS_PAID_ACCESS")
    console.table(hasPaid.rows)
    console.log("SUBSCRIPTION")
    console.table(subscription.rows)
    console.log("LAST_PAYMENTS")
    console.table(payments.rows)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error("[check-tenant-paid-access] Error", error)
  process.exitCode = 1
})
