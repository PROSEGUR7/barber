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

function getConfig() {
  const baseUrl =
    process.env.ADMIN_BILLING_BASE_URL ||
    process.env.ADMIN_API_BASE_URL ||
    process.env.ADMIN_BASE_URL ||
    ""
  const serviceToken =
    process.env.ADMIN_BILLING_SERVICE_TOKEN ||
    process.env.ADMIN_SERVICE_TOKEN ||
    process.env.ADMIN_API_KEY ||
    ""
  const tokenHeader = process.env.ADMIN_BILLING_SERVICE_TOKEN_HEADER || "x-service-token"
  const syncPath = process.env.ADMIN_BILLING_SYNC_STATUS_PATH || "/api/billing/sync-status"

  if (!baseUrl) {
    throw new Error("Falta ADMIN_BILLING_BASE_URL (o ADMIN_API_BASE_URL / ADMIN_BASE_URL)")
  }

  if (!serviceToken) {
    throw new Error("Falta ADMIN_BILLING_SERVICE_TOKEN (o ADMIN_SERVICE_TOKEN / ADMIN_API_KEY)")
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    serviceToken,
    tokenHeader,
    syncPath: syncPath.startsWith("/") ? syncPath : `/${syncPath}`,
  }
}

async function main() {
  loadDotEnvLocal()
  const config = getConfig()

  const response = await fetch(`${config.baseUrl}${config.syncPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      [config.tokenHeader]: config.serviceToken,
    },
    body: JSON.stringify({}),
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    console.error("[billing:sync-status] Error", {
      status: response.status,
      payload,
    })
    process.exitCode = 1
    return
  }

  console.log("[billing:sync-status] OK", payload)
}

main().catch((error) => {
  console.error("[billing:sync-status] Unexpected error", error)
  process.exitCode = 1
})