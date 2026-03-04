CREATE OR REPLACE FUNCTION admin_platform.registrar_pago_tenant_con_plan(
  p_tenant_id integer,
  p_plan_codigo text,
  p_monto numeric,
  p_moneda text DEFAULT 'COP',
  p_metodo_pago text DEFAULT NULL,
  p_proveedor_pago text DEFAULT NULL,
  p_referencia_externa text DEFAULT NULL,
  p_ciclo admin_platform.ciclo_facturacion_enum DEFAULT NULL,
  p_fecha_pago timestamptz DEFAULT now()
)
RETURNS TABLE(
  pago_id integer,
  factura_id integer,
  suscripcion_id integer,
  tenant_id integer,
  estado_suscripcion admin_platform.tenant_billing_status_enum,
  proximo_cobro timestamptz
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_suscripcion admin_platform.suscripciones_tenants%ROWTYPE;
  v_plan admin_platform.planes_suscripcion%ROWTYPE;
  v_ciclo admin_platform.ciclo_facturacion_enum;
  v_monto_ciclo numeric(12,2);
  v_inicio_periodo timestamptz;
  v_fin_periodo timestamptz;
  v_numero_factura text;
  v_factura_id int;
  v_pago_id int;
  v_moneda text;
BEGIN
  IF p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto del pago debe ser mayor a 0.';
  END IF;

  SELECT *
    INTO v_suscripcion
  FROM admin_platform.suscripciones_tenants s
  WHERE s.tenant_id = p_tenant_id
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe suscripción para tenant_id=%.', p_tenant_id;
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

  v_ciclo := COALESCE(p_ciclo, v_suscripcion.ciclo_facturacion);

  v_monto_ciclo := CASE v_ciclo
    WHEN 'mensual' THEN v_plan.precio_mensual
    WHEN 'trimestral' THEN v_plan.precio_trimestral
    ELSE v_plan.precio_anual
  END;

  IF abs(coalesce(p_monto, 0) - coalesce(v_monto_ciclo, 0)) > 0.009 THEN
    RAISE EXCEPTION 'Monto inválido para plan/ciclo seleccionado. Esperado: %, recibido: %', v_monto_ciclo, p_monto;
  END IF;

  v_moneda := upper(trim(COALESCE(NULLIF(p_moneda, ''), v_plan.moneda, v_suscripcion.moneda, 'COP')));

  IF upper(trim(COALESCE(v_plan.moneda, 'COP'))) <> v_moneda THEN
    RAISE EXCEPTION 'Moneda inválida para la suscripción. Esperada: %, recibida: %', v_plan.moneda, v_moneda;
  END IF;

  v_inicio_periodo := CASE
    WHEN v_suscripcion.fecha_fin_periodo > p_fecha_pago THEN v_suscripcion.fecha_fin_periodo
    ELSE p_fecha_pago
  END;

  v_fin_periodo := v_inicio_periodo + admin_platform.fn_intervalo_por_ciclo(v_ciclo);

  v_numero_factura := format('FAC-%s-%s', to_char(now(), 'YYYYMMDDHH24MISSUS'), p_tenant_id);

  INSERT INTO admin_platform.facturas_tenants (
    tenant_id,
    suscripcion_id,
    numero_factura,
    estado,
    fecha_emision,
    fecha_vencimiento,
    periodo_inicio,
    periodo_fin,
    subtotal,
    impuestos,
    descuento,
    moneda,
    pagada_en,
    detalle
  )
  VALUES (
    p_tenant_id,
    v_suscripcion.id,
    v_numero_factura,
    'pagada',
    p_fecha_pago,
    p_fecha_pago,
    v_inicio_periodo,
    v_fin_periodo,
    p_monto,
    0,
    0,
    v_moneda,
    p_fecha_pago,
    jsonb_build_object(
      'origen', 'pasarela_wompi',
      'plan_codigo_aplicado', v_plan.codigo,
      'ciclo_aplicado', v_ciclo,
      'referencia', p_referencia_externa
    )
  )
  RETURNING id INTO v_factura_id;

  INSERT INTO admin_platform.pagos_tenants (
    tenant_id,
    suscripcion_id,
    factura_id,
    estado,
    monto,
    moneda,
    metodo_pago,
    proveedor_pago,
    referencia_externa,
    pagado_en,
    payload_pasarela
  )
  VALUES (
    p_tenant_id,
    v_suscripcion.id,
    v_factura_id,
    'aprobado',
    p_monto,
    v_moneda,
    p_metodo_pago,
    p_proveedor_pago,
    p_referencia_externa,
    p_fecha_pago,
    jsonb_build_object('referencia', p_referencia_externa, 'plan_codigo', v_plan.codigo)
  )
  RETURNING id INTO v_pago_id;

  UPDATE admin_platform.suscripciones_tenants
  SET
    plan_id = v_plan.id,
    ciclo_facturacion = v_ciclo,
    monto_ciclo = v_monto_ciclo,
    moneda = v_moneda,
    fecha_inicio_periodo = v_inicio_periodo,
    fecha_fin_periodo = v_fin_periodo,
    proximo_cobro = v_fin_periodo,
    fecha_actualizacion = now()
  WHERE id = v_suscripcion.id;

  UPDATE admin_platform.tenants
  SET
    estado_suscripcion = 'active',
    plan_suscripcion = v_plan.codigo,
    gracia_hasta = NULL,
    ultimo_pago_en = p_fecha_pago
  WHERE id = p_tenant_id;

  RETURN QUERY
  SELECT
    v_pago_id,
    v_factura_id,
    v_suscripcion.id,
    p_tenant_id,
    'active'::admin_platform.tenant_billing_status_enum,
    v_fin_periodo;
END;
$$;
