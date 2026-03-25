const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const envPath = path.join(process.cwd(), ".env.local");
for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq === -1) continue;
  const key = line.slice(0, eq).trim();
  let value = line.slice(eq + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  if (!process.env[key]) process.env[key] = value;
}
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const q = `
  SELECT id, message_type, message_status, status_error,
         COALESCE(raw_payload->'meta_response'->'messages'->0->>'id','') AS meta_wamid,
         COALESCE(raw_payload->'meta_response'->>'messaging_product','') AS messaging_product,
         LEFT(COALESCE(raw_payload::text,''), 400) AS raw_preview
  FROM tenant_base.meta_webhook_messages
  WHERE tenant_schema='tenant_prueba' AND wa_id='573202110534' AND direction='outbound'
  ORDER BY id DESC
  LIMIT 6`;
  const r = await pool.query(q);
  console.table(r.rows);
  await pool.end();
})().catch((e)=>{console.error(e);process.exit(1)});
