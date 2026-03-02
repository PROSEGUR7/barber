/* eslint-disable no-console */

const fs = require("fs")
const path = require("path")
const { Pool } = require("pg")

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local")
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
    const counts = await pool.query(
      `SELECT tenant_schema, count(*)::int AS total
         FROM tenant_base.meta_webhook_messages
        GROUP BY tenant_schema
        ORDER BY tenant_schema`,
    )

    console.log("counts by tenant:")
    console.table(counts.rows)

    const previews = await pool.query(
      `WITH base AS (
         SELECT
           tenant_schema,
           id,
           COALESCE(NULLIF(trim(wa_id), ''), concat('unknown-', id::text)) as conversation_id,
           NULLIF(trim(wa_id), '') as wa_id,
           sent_at
         FROM tenant_base.meta_webhook_messages
       )
       SELECT tenant_schema, conversation_id, wa_id, sent_at::text
       FROM base
       ORDER BY sent_at DESC NULLS LAST
       LIMIT 20`,
    )

    console.log("latest conversation ids:")
    console.table(previews.rows)

    const targetTenant = process.argv[2] || "tenant_prueba"
    const sampleConversation = previews.rows.find((r) => r.tenant_schema === targetTenant)?.conversation_id

    if (!sampleConversation) {
      console.log(`No sample conversation for tenant: ${targetTenant}`)
      return
    }

    const whereSql = sampleConversation.startsWith("unknown-")
      ? "COALESCE(NULLIF(trim(wa_id), ''), concat('unknown-', id::text)) = $2"
      : "NULLIF(trim(wa_id), '') = $2"

    const messages = await pool.query(
      `SELECT id, tenant_schema, wa_id, message_type, message_text, sent_at::text
         FROM tenant_base.meta_webhook_messages
        WHERE tenant_schema = $1
          AND ${whereSql}
        ORDER BY sent_at ASC NULLS LAST, id ASC
        LIMIT 50`,
      [targetTenant, sampleConversation],
    )

    console.log(`messages for ${targetTenant} / ${sampleConversation}:`)
    console.table(messages.rows)
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
