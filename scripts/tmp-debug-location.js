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
  const r = await pool.query(`
    SELECT id, sent_at::text, message_type, message_text,
           raw_payload->'message'->>'type' AS raw_type,
           raw_payload->'message'->'location' AS raw_location,
           raw_payload->'message'->'unsupported' AS raw_unsupported
    FROM tenant_base.meta_webhook_messages
    WHERE tenant_schema='tenant_prueba' AND wa_id='573202110534'
    ORDER BY sent_at DESC NULLS LAST, id DESC
    LIMIT 10
  `);
  console.table(r.rows);
  const target = r.rows.find((x) => x.message_type === 'location' || x.raw_type === 'location' || x.raw_unsupported);
  if (target) {
    const full = await pool.query(`SELECT id, raw_payload FROM tenant_base.meta_webhook_messages WHERE id=$1`, [target.id]);
    console.log('FULL_PAYLOAD_FOR_ID', target.id);
    console.dir(full.rows[0].raw_payload, { depth: 12 });
  }
  await pool.end();
})().catch((e)=>{console.error(e);process.exit(1)});
