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
  SELECT tenant_schema, activo, meta_phone_number_id, meta_business_account_id,
         CASE WHEN meta_access_token IS NULL OR length(trim(meta_access_token))=0 THEN 'missing' ELSE 'present' END AS access_token,
         CASE WHEN meta_verify_token IS NULL OR length(trim(meta_verify_token))=0 THEN 'missing' ELSE 'present' END AS verify_token,
         COALESCE(meta_graph_version, '') AS graph_version,
         COALESCE(n8n_webhook_url, '') AS n8n_webhook_url,
         updated_at::text
  FROM tenant_prueba.configuracion_meta_tenant
  WHERE tenant_schema='tenant_prueba'
  LIMIT 1`;
  const r = await pool.query(q);
  console.table(r.rows);
  await pool.end();
})().catch((e)=>{console.error(e);process.exit(1)});
