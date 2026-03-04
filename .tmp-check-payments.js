const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const q = `
    SELECT id, tenant_id, suscripcion_id, monto::text AS monto, moneda, metodo_pago, proveedor_pago, referencia_externa, fecha_pago
    FROM admin_platform.pagos_tenants
    WHERE proveedor_pago = 'wompi' OR referencia_externa LIKE 'B%'
    ORDER BY id DESC
    LIMIT 20`;
  const r = await pool.query(q);
  console.log(JSON.stringify(r.rows, null, 2));
  await pool.end();
})().catch(async (e) => { console.error(e); try { await pool.end(); } catch {} process.exit(1); });
