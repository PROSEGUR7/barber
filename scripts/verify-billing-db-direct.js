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

function getConfig() {
  const connectionString = process.env.DATABASE_URL || ""
  if (!connectionString) {
    throw new Error("Falta DATABASE_URL")
  }

  const configuredTenantId = Number.parseInt(process.env.ADMIN_PLATFORM_TENANT_ID || "1", 10)

  return {
    connectionString,
    configuredTenantId: Number.isInteger(configuredTenantId) && configuredTenantId > 0 ? configuredTenantId : 1,
  }
}

async function main() {
  loadDotEnvLocal()
  const config = getConfig()

  const client = new Client({
    connectionString: config.connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
  })

  await client.connect()

  try {
    const report = []

    const configuredSubscription = await client.query(
      "SELECT tenant_id FROM admin_platform.suscripciones_tenants WHERE tenant_id = $1 LIMIT 1",
      [config.configuredTenantId],
    )

    let tenantIdForPayment = config.configuredTenantId
    if (configuredSubscription.rowCount === 0) {
      const fallback = await client.query("SELECT tenant_id FROM admin_platform.suscripciones_tenants ORDER BY tenant_id LIMIT 1")
      if (fallback.rowCount === 0) {
        throw new Error("No hay suscripciones en admin_platform.suscripciones_tenants para probar pagos")
      }

      tenantIdForPayment = fallback.rows[0].tenant_id
    }

    report.push({
      test: "tenant_for_payment",
      ok: true,
      detail: {
        configuredTenantId: config.configuredTenantId,
        tenantUsed: tenantIdForPayment,
      },
    })

    const tenantCanLoginResult = await client.query("SELECT * FROM admin_platform.tenant_can_login($1)", [tenantIdForPayment])
    report.push({
      test: "tenant_can_login(main)",
      ok: tenantCanLoginResult.rowCount > 0,
      detail: tenantCanLoginResult.rows[0] || null,
    })

    const allowedSample = await client.query(
      "SELECT id, estado_suscripcion FROM admin_platform.tenants WHERE estado = true AND estado_suscripcion IN ('active', 'trialing') ORDER BY id LIMIT 1",
    )

    if (allowedSample.rowCount > 0) {
      const sample = allowedSample.rows[0]
      const sampleResult = await client.query("SELECT * FROM admin_platform.tenant_can_login($1)", [sample.id])
      report.push({
        test: "tenant_can_login(allowed sample)",
        ok: sampleResult.rows[0]?.can_login === true,
        detail: {
          tenantId: sample.id,
          estadoSuscripcion: sample.estado_suscripcion,
          result: sampleResult.rows[0] || null,
        },
      })
    } else {
      report.push({
        test: "tenant_can_login(allowed sample)",
        ok: false,
        detail: "No hay tenant active/trialing para probar",
      })
    }

    const blockedSample = await client.query(
      "SELECT id, estado_suscripcion FROM admin_platform.tenants WHERE estado_suscripcion IN ('past_due', 'unpaid', 'paused') ORDER BY id LIMIT 1",
    )

    if (blockedSample.rowCount > 0) {
      const sample = blockedSample.rows[0]
      const sampleResult = await client.query("SELECT * FROM admin_platform.tenant_can_login($1)", [sample.id])
      const isBlockedOrGracePeriod =
        sampleResult.rows[0]?.can_login === false ||
        (sample.estado_suscripcion === "past_due" && sampleResult.rows[0]?.reason === "grace_period")

      report.push({
        test: "tenant_can_login(blocked sample)",
        ok: isBlockedOrGracePeriod,
        detail: {
          tenantId: sample.id,
          estadoSuscripcion: sample.estado_suscripcion,
          result: sampleResult.rows[0] || null,
        },
      })
    } else {
      report.push({
        test: "tenant_can_login(blocked sample)",
        ok: false,
        detail: "No hay tenant past_due/unpaid/paused para probar",
      })
    }

    const reference = `VERIFY-BILLING-${Date.now()}`
    const subscriptionPricing = await client.query(
      `SELECT
         COALESCE(
           s.monto_ciclo,
           CASE s.ciclo_facturacion
             WHEN 'mensual' THEN p.precio_mensual
             WHEN 'trimestral' THEN p.precio_trimestral
             ELSE p.precio_anual
           END
         )::numeric AS expected_amount,
         COALESCE(NULLIF(s.moneda, ''), 'COP') AS expected_currency,
         COALESCE(s.ciclo_facturacion::text, 'mensual') AS expected_cycle
       FROM admin_platform.suscripciones_tenants s
       JOIN admin_platform.planes_suscripcion p ON p.id = s.plan_id
      WHERE s.tenant_id = $1
      LIMIT 1`,
      [tenantIdForPayment],
    )

    if (subscriptionPricing.rowCount === 0) {
      throw new Error(`No existe suscripción para tenant_id=${tenantIdForPayment}`)
    }

    const expectedAmount = Number.parseFloat(String(subscriptionPricing.rows[0].expected_amount ?? "0"))
    const expectedCurrency = String(subscriptionPricing.rows[0].expected_currency ?? "COP").toUpperCase()
    const expectedCycle = String(subscriptionPricing.rows[0].expected_cycle ?? "mensual").toLowerCase()

    if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
      throw new Error(`Monto esperado inválido para tenant_id=${tenantIdForPayment}`)
    }

    const before = await client.query("SELECT count(*)::int as count FROM admin_platform.pagos_tenants WHERE referencia_externa = $1", [
      reference,
    ])

    const firstPayment = await client.query(
      `SELECT *
         FROM admin_platform.registrar_pago_tenant(
           $1,
           $2,
           $3,
           $4,
           $5,
           $6,
           $7::admin_platform.ciclo_facturacion_enum,
           $8
         )`,
      [
        tenantIdForPayment,
        expectedAmount,
        expectedCurrency,
        "qa",
        "verify-script",
        reference,
        expectedCycle,
        new Date().toISOString(),
      ],
    )

    const afterFirst = await client.query("SELECT count(*)::int as count FROM admin_platform.pagos_tenants WHERE referencia_externa = $1", [
      reference,
    ])

    let secondAttemptErrorCode = null
    try {
      await client.query(
        `SELECT *
           FROM admin_platform.registrar_pago_tenant(
             $1,
             $2,
             $3,
             $4,
             $5,
             $6,
             $7::admin_platform.ciclo_facturacion_enum,
             $8
           )`,
        [
          tenantIdForPayment,
          expectedAmount,
          expectedCurrency,
          "qa",
          "verify-script",
          reference,
          expectedCycle,
          new Date().toISOString(),
        ],
      )
    } catch (error) {
      secondAttemptErrorCode = typeof error?.code === "string" ? error.code : "unknown"
    }

    const afterSecond = await client.query("SELECT count(*)::int as count FROM admin_platform.pagos_tenants WHERE referencia_externa = $1", [
      reference,
    ])

    report.push({
      test: "registrar_pago_tenant(new payment)",
      ok: firstPayment.rowCount > 0 && afterFirst.rows[0].count === 1,
      detail: {
        reference,
        expectedAmount,
        expectedCurrency,
        expectedCycle,
        firstResult: firstPayment.rows[0] || null,
        countBefore: before.rows[0].count,
        countAfterFirst: afterFirst.rows[0].count,
      },
    })

    report.push({
      test: "registrar_pago_tenant(retry same reference)",
      ok: afterSecond.rows[0].count === 1,
      detail: {
        reference,
        secondAttemptErrorCode,
        countAfterSecond: afterSecond.rows[0].count,
      },
    })

    const syncResult = await client.query("SELECT * FROM admin_platform.sincronizar_estado_suscripciones_tenants()")
    report.push({
      test: "sincronizar_estado_suscripciones_tenants",
      ok: syncResult.rowCount > 0,
      detail: syncResult.rows[0] || null,
    })

    const hasHardFailure = report.some((item) => {
      if (item.ok) return false
      return item.test !== "tenant_can_login(blocked sample)"
    })

    const summary = {
      ok: !hasHardFailure,
      report,
    }

    if (summary.ok) {
      console.log(JSON.stringify(summary, null, 2))
      return
    }

    console.error(JSON.stringify(summary, null, 2))
    process.exitCode = 1
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
