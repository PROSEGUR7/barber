CREATE OR REPLACE FUNCTION admin_platform.preparar_contexto_suscripcion_tenant(
  p_tenant_id integer,
  p_plan_codigo text,
  p_ciclo admin_platform.ciclo_facturacion_enum
)
RETURNS TABLE(
  tenant_id integer,
  suscripcion_id integer,
  plan_id integer,
  plan_codigo text,
  plan_nombre text,
  ciclo_facturacion admin_platform.ciclo_facturacion_enum,
  monto_ciclo numeric,
  moneda text,
  suscripcion_creada boolean
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_plan admin_platform.planes_suscripcion%ROWTYPE;
  v_suscripcion admin_platform.suscripciones_tenants%ROWTYPE;
  v_ciclo admin_platform.ciclo_facturacion_enum;
  v_monto_ciclo numeric(12,2);
  v_moneda text;
  v_now timestamptz := now();
  v_suscripcion_creada boolean := false;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id <= 0 THEN
    RAISE EXCEPTION 'tenant_id inválido: %', p_tenant_id;
  END IF;

  IF p_plan_codigo IS NULL OR btrim(p_plan_codigo) = '' THEN
    RAISE EXCEPTION 'plan_codigo requerido';
  END IF;

  v_ciclo := COALESCE(p_ciclo, 'mensual'::admin_platform.ciclo_facturacion_enum);

  PERFORM 1
    FROM admin_platform.tenants t
   WHERE t.id = p_tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe tenant_id=%', p_tenant_id;
  END IF;

  SELECT *
    INTO v_plan
    FROM admin_platform.planes_suscripcion p
   WHERE lower(trim(p.codigo)) = lower(trim(p_plan_codigo))
     AND p.activo = true
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe plan activo con código=%.', p_plan_codigo;
  END IF;

  v_monto_ciclo := CASE v_ciclo
    WHEN 'mensual' THEN v_plan.precio_mensual
    WHEN 'trimestral' THEN v_plan.precio_trimestral
    ELSE v_plan.precio_anual
  END;

  IF v_monto_ciclo IS NULL OR v_monto_ciclo <= 0 THEN
    RAISE EXCEPTION 'Monto inválido para plan/ciclo seleccionado. plan=%, ciclo=%', v_plan.codigo, v_ciclo;
  END IF;

  v_moneda := upper(trim(COALESCE(NULLIF(v_plan.moneda, ''), 'COP')));

  SELECT *
    INTO v_suscripcion
    FROM admin_platform.suscripciones_tenants s
   WHERE s.tenant_id = p_tenant_id
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO admin_platform.suscripciones_tenants (
      tenant_id,
      plan_id,
      ciclo_facturacion,
      monto_ciclo,
      moneda,
      fecha_inicio_periodo,
      fecha_fin_periodo,
      proximo_cobro,
      renovacion_automatica
    )
    VALUES (
      p_tenant_id,
      v_plan.id,
      v_ciclo,
      v_monto_ciclo,
      v_moneda,
      v_now,
      v_now + interval '1 minute',
      v_now,
      true
    )
    RETURNING * INTO v_suscripcion;

    v_suscripcion_creada := true;
  ELSE
    UPDATE admin_platform.suscripciones_tenants
       SET plan_id = v_plan.id,
           ciclo_facturacion = v_ciclo,
           monto_ciclo = v_monto_ciclo,
           moneda = v_moneda,
           fecha_actualizacion = now()
     WHERE id = v_suscripcion.id
    RETURNING * INTO v_suscripcion;
  END IF;

  UPDATE admin_platform.tenants
     SET plan_suscripcion = v_plan.codigo,
         estado_suscripcion_actualizado_en = now()
   WHERE id = p_tenant_id;

  RETURN QUERY
  SELECT
    p_tenant_id,
    v_suscripcion.id,
    v_plan.id,
    v_plan.codigo,
    v_plan.nombre,
    v_ciclo,
    v_monto_ciclo,
    v_moneda,
    v_suscripcion_creada;
END;
$$;
