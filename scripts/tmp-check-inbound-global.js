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

  const inboundGlobal = await pool.query(`
    SELECT tenant_schema, wa_id, message_type, sent_at::text, created_at::text, id
    FROM tenant_base.meta_webhook_messages
    WHERE direction='inbound'
    ORDER BY id DESC
    LIMIT 20
  `);
  console.log('LATEST_INBOUND_GLOBAL');
  console.table(inboundGlobal.rows);

  const contact = await pool.query(`
    SELECT id, direction, message_type, message_status, status_error, sent_at::text, created_at::text,
           LEFT(COALESCE(message_text,''),120) AS text_preview
    FROM tenant_base.meta_webhook_messages
    WHERE tenant_schema='tenant_prueba' AND wa_id='573202110534'
    ORDER BY id DESC
    LIMIT 20
  `);
  console.log('CONTACT_TIMELINE');
  console.table(contact.rows);

  await pool.end();
})().catch((e)=>{console.error(e);process.exit(1)});
