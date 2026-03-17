/* eslint-disable no-console */

const fs = require("fs")
const path = require("path")

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

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")
  const appointmentId = Number.parseInt(process.argv[2] || "", 10)
  if (!Number.isFinite(appointmentId) || appointmentId <= 0) {
    console.error("Usage: node scripts/simulate-webhook-cita-reference.js <appointmentId>")
    process.exit(1)
  }

  const payload = {
    event: "transaction.updated",
    timestamp: Date.now(),
    data: {
      transaction: {
        id: `SIM-${Date.now()}`,
        status: "APPROVED",
        reference: `cita_${appointmentId}`,
        amount_in_cents: 1000000,
        currency: "COP",
        payment_method_type: "CARD",
      },
    },
    signature: {
      checksum: "invalid-on-purpose",
      properties: ["transaction.id", "transaction.status"],
      timestamp: String(Date.now()),
    },
  }

  const response = await fetch(`${baseUrl}/api/payments/wompi/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })

  const body = await response.json().catch(() => ({}))
  console.log(JSON.stringify({ status: response.status, body }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
