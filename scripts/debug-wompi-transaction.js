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

function getWompiConfig() {
  const isProduction = (process.env.WOMPI_ENV || "").trim().toLowerCase() === "production"
  const baseUrl = (process.env.WOMPI_API_BASE_URL || "").trim() || (isProduction ? "https://production.wompi.co" : "https://sandbox.wompi.co")

  const privateKey = isProduction
    ? (process.env.WOMPI_PRODUCTION_PRIVATE_KEY || process.env.WOMPI_PRIVATE_KEY || "").trim()
    : (process.env.WOMPI_SANDBOX_PRIVATE_KEY || process.env.WOMPI_PRIVATE_KEY || "").trim()

  return { baseUrl: baseUrl.replace(/\/$/, ""), privateKey, isProduction }
}

async function fetchJson(url, options) {
  const response = await fetch(url, options)
  const payload = await response.json().catch(() => ({}))
  return { ok: response.ok, status: response.status, payload }
}

async function main() {
  loadDotEnvLocal()

  const transactionId = (process.argv[2] || "").trim()
  if (!transactionId) {
    console.error("Usage: node scripts/debug-wompi-transaction.js <transactionId>")
    process.exit(1)
  }

  const { baseUrl, privateKey, isProduction } = getWompiConfig()
  if (!privateKey) {
    console.error("Missing WOMPI private key in env.")
    process.exit(1)
  }

  const txResult = await fetchJson(`${baseUrl}/v1/transactions/${encodeURIComponent(transactionId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${privateKey}` },
    cache: "no-store",
  })

  const tx = txResult.payload?.data || null
  const paymentLinkId = (tx?.payment_link_id || "").trim()

  let paymentLink = null
  if (paymentLinkId) {
    const linkResult = await fetchJson(`${baseUrl}/v1/payment_links/${encodeURIComponent(paymentLinkId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${privateKey}` },
      cache: "no-store",
    })
    paymentLink = linkResult.payload?.data || null
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  const dbSummary = []
  let appointmentFromSku = null
  const skuValue = typeof paymentLink?.sku === "string" ? paymentLink.sku.trim() : ""
  if (/^cita[_-](\d+)$/i.test(skuValue)) {
    appointmentFromSku = Number.parseInt(skuValue.replace(/^cita[_-]/i, ""), 10)
  }
  try {
    const schemasRes = await pool.query("select nspname from pg_namespace where nspname='tenant_base' or nspname like 'tenant_%' order by nspname")
    const schemas = schemasRes.rows.map((r) => r.nspname)

    for (const schema of schemas) {
      const paymentRes = await pool.query(
        `select id, agendamiento_id, estado::text as estado, proveedor_pago, wompi_reference, wompi_transaction_id, wompi_status
           from ${schema}.pagos
          where wompi_transaction_id = $1
             or wompi_reference = $2
          order by id desc
          limit 5`,
        [transactionId, tx?.reference || null],
      )

      if (paymentRes.rowCount === 0) continue

      const appointmentIds = [...new Set(paymentRes.rows.map((r) => r.agendamiento_id).filter((n) => Number.isFinite(n)))]
      const appointmentRes = appointmentIds.length
        ? await pool.query(
            `select id, estado::text as estado, fecha_cita
               from ${schema}.agendamientos
              where id = any($1::int[])
              order by id desc`,
            [appointmentIds],
          )
        : { rows: [] }

      dbSummary.push({
        schema,
        payments: paymentRes.rows,
        appointments: appointmentRes.rows,
      })
    }

    if (appointmentFromSku && Number.isFinite(appointmentFromSku)) {
      for (const schema of schemas) {
        const appointmentRes = await pool.query(
          `select a.id, a.estado::text as estado, a.fecha_cita, c.user_id, u.correo
             from ${schema}.agendamientos a
             left join ${schema}.clientes c on c.id = a.cliente_id
             left join ${schema}.users u on u.id = c.user_id
            where a.id = $1
            limit 1`,
          [appointmentFromSku],
        )

        if (appointmentRes.rowCount > 0) {
          dbSummary.push({
            schema,
            payments: [],
            appointments: appointmentRes.rows,
            foundBy: "payment_link.sku",
          })
        }
      }
    }
  } finally {
    await pool.end()
  }

  console.log(JSON.stringify({
    env: isProduction ? "production" : "sandbox",
    wompi: {
      txFetchOk: txResult.ok,
      txFetchStatus: txResult.status,
      id: tx?.id || null,
      status: tx?.status || null,
      reference: tx?.reference || null,
      payment_link_id: tx?.payment_link_id || null,
      amount_in_cents: tx?.amount_in_cents || null,
      currency: tx?.currency || null,
      customer_email: tx?.customer_email || null,
      sku: tx?.sku || null,
    },
    paymentLink: paymentLink
      ? {
          id: paymentLink.id || null,
          name: paymentLink.name || null,
          sku: paymentLink.sku || null,
          reference: paymentLink.reference || null,
          redirect_url: paymentLink.redirect_url || null,
        }
      : null,
    dbSummary,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
