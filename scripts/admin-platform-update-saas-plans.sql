BEGIN;

CREATE TEMP TABLE tmp_new_saas_plans (
  codigo text PRIMARY KEY,
  nombre text NOT NULL,
  descripcion text NULL,
  precio_mensual numeric(12,2) NOT NULL,
  precio_trimestral numeric(12,2) NOT NULL,
  precio_anual numeric(12,2) NOT NULL,
  moneda text NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_new_saas_plans (codigo, nombre, descripcion, precio_mensual, precio_trimestral, precio_anual, moneda)
VALUES
  ('independiente', 'Plan Independiente', 'Plan base para barberias que inician con operacion digital.', 59900, 179700, 718800, 'COP'),
  ('independiente-ia', 'Plan Independiente + Chatbot IA', 'Plan independiente con atencion automatizada via WhatsApp.', 99900, 299700, 1198800, 'COP'),
  ('comercial-lite', 'Plan Comercial Lite', 'Para equipos con mas personal y multiples sedes.', 99900, 299700, 1198800, 'COP'),
  ('comercial-lite-ia', 'Plan Comercial Lite + Chatbot IA', 'Automatizacion con IA para equipos con varias sedes.', 149900, 449700, 1798800, 'COP'),
  ('comercial-pro-ia', 'Plan Comercial Pro + Chatbot IA', 'Operacion avanzada con IA para alto volumen.', 299900, 899700, 3598800, 'COP');

INSERT INTO admin_platform.planes_suscripcion (
  nombre,
  codigo,
  descripcion,
  precio_mensual,
  precio_trimestral,
  precio_anual,
  moneda,
  activo
)
SELECT
  n.nombre,
  n.codigo,
  n.descripcion,
  n.precio_mensual,
  n.precio_trimestral,
  n.precio_anual,
  n.moneda,
  true
FROM tmp_new_saas_plans n
ON CONFLICT (codigo)
DO UPDATE SET
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  precio_mensual = EXCLUDED.precio_mensual,
  precio_trimestral = EXCLUDED.precio_trimestral,
  precio_anual = EXCLUDED.precio_anual,
  moneda = EXCLUDED.moneda,
  activo = true,
  fecha_actualizacion = now();

WITH fallback_plan AS (
  SELECT id, precio_mensual, precio_trimestral, precio_anual, moneda
  FROM admin_platform.planes_suscripcion
  WHERE codigo = 'independiente'
  LIMIT 1
)
UPDATE admin_platform.suscripciones_tenants s
SET
  plan_id = fp.id,
  monto_ciclo = CASE s.ciclo_facturacion
    WHEN 'mensual' THEN fp.precio_mensual
    WHEN 'trimestral' THEN fp.precio_trimestral
    ELSE fp.precio_anual
  END,
  moneda = fp.moneda,
  fecha_actualizacion = now()
FROM fallback_plan fp
WHERE s.plan_id IN (
  SELECT p.id
  FROM admin_platform.planes_suscripcion p
  LEFT JOIN tmp_new_saas_plans n ON n.codigo = p.codigo
  WHERE n.codigo IS NULL
);

UPDATE admin_platform.planes_suscripcion p
SET activo = false,
    fecha_actualizacion = now()
WHERE p.codigo NOT IN (SELECT codigo FROM tmp_new_saas_plans);

DELETE FROM admin_platform.planes_suscripcion p
WHERE p.codigo NOT IN (SELECT codigo FROM tmp_new_saas_plans)
  AND NOT EXISTS (
    SELECT 1
    FROM admin_platform.suscripciones_tenants s
    WHERE s.plan_id = p.id
  );

UPDATE admin_platform.tenants t
SET plan_suscripcion = p.codigo
FROM admin_platform.suscripciones_tenants s
JOIN admin_platform.planes_suscripcion p ON p.id = s.plan_id
WHERE s.tenant_id = t.id;

COMMIT;
