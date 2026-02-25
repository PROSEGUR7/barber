CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'tenant_base'
       AND table_name = 'horarios_empleados'
       AND column_name = 'disponible'
       AND data_type <> 'boolean'
  ) THEN
    EXECUTE $sql$
      ALTER TABLE tenant_base.horarios_empleados
      ALTER COLUMN disponible TYPE boolean
      USING CASE
        WHEN disponible IS NULL THEN TRUE
        WHEN lower(trim(disponible::text)) IN (
          'true', 't', '1', 'si', 'sí', 's', 'yes', 'y', 'disponible', 'activo'
        ) THEN TRUE
        ELSE FALSE
      END
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'tenant_base'
       AND table_name = 'horarios_empleados'
       AND column_name = 'disponible'
  ) THEN
    EXECUTE 'ALTER TABLE tenant_base.horarios_empleados ALTER COLUMN disponible SET DEFAULT TRUE';
    EXECUTE 'UPDATE tenant_base.horarios_empleados SET disponible = TRUE WHERE disponible IS NULL';
    EXECUTE 'ALTER TABLE tenant_base.horarios_empleados ALTER COLUMN disponible SET NOT NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'tenant_base'
       AND table_name = 'horarios_empleados'
  ) THEN
    EXECUTE $sql$
      UPDATE tenant_base.horarios_empleados
         SET fecha_hora_fin = fecha_hora_inicio + interval '30 minutes'
       WHERE fecha_hora_fin IS NULL
          OR fecha_hora_fin <= fecha_hora_inicio
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'tenant_base'
       AND table_name = 'agendamientos'
       AND column_name = 'fecha_cita'
       AND data_type = 'timestamp without time zone'
  ) THEN
    IF EXISTS (
      SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = 'tenant_base'
         AND t.relname = 'agendamientos'
         AND c.conname = 'agendamientos_no_overlap_per_employee'
    ) THEN
      EXECUTE 'ALTER TABLE tenant_base.agendamientos DROP CONSTRAINT agendamientos_no_overlap_per_employee';
    END IF;

    EXECUTE $sql$
      ALTER TABLE tenant_base.agendamientos
      ALTER COLUMN fecha_cita TYPE timestamptz
      USING fecha_cita AT TIME ZONE 'America/Bogota'
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'tenant_base'
       AND table_name = 'agendamientos'
       AND column_name = 'fecha_cita_fin'
       AND data_type = 'timestamp without time zone'
  ) THEN
    EXECUTE $sql$
      ALTER TABLE tenant_base.agendamientos
      ALTER COLUMN fecha_cita_fin TYPE timestamptz
      USING CASE
        WHEN fecha_cita_fin IS NULL THEN NULL
        ELSE fecha_cita_fin AT TIME ZONE 'America/Bogota'
      END
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'tenant_base'
       AND table_name = 'horarios_empleados'
       AND column_name = 'fecha_hora_inicio'
       AND data_type = 'timestamp without time zone'
  ) THEN
    IF EXISTS (
      SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = 'tenant_base'
         AND t.relname = 'horarios_empleados'
         AND c.conname = 'horarios_empleados_rango_valido'
    ) THEN
      EXECUTE 'ALTER TABLE tenant_base.horarios_empleados DROP CONSTRAINT horarios_empleados_rango_valido';
    END IF;

    EXECUTE $sql$
      ALTER TABLE tenant_base.horarios_empleados
      ALTER COLUMN fecha_hora_inicio TYPE timestamptz
      USING fecha_hora_inicio AT TIME ZONE 'America/Bogota'
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'tenant_base'
       AND table_name = 'horarios_empleados'
       AND column_name = 'fecha_hora_fin'
       AND data_type = 'timestamp without time zone'
  ) THEN
    EXECUTE $sql$
      ALTER TABLE tenant_base.horarios_empleados
      ALTER COLUMN fecha_hora_fin TYPE timestamptz
      USING fecha_hora_fin AT TIME ZONE 'America/Bogota'
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'tenant_base'
       AND table_name = 'horarios_empleados'
  ) THEN
    EXECUTE $sql$
      UPDATE tenant_base.horarios_empleados
         SET fecha_hora_fin = fecha_hora_inicio + interval '30 minutes'
       WHERE fecha_hora_fin IS NULL
          OR fecha_hora_fin <= fecha_hora_inicio
    $sql$;

    IF NOT EXISTS (
      SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = 'tenant_base'
         AND t.relname = 'horarios_empleados'
         AND c.conname = 'horarios_empleados_rango_valido'
    ) THEN
      EXECUTE 'ALTER TABLE tenant_base.horarios_empleados ADD CONSTRAINT horarios_empleados_rango_valido CHECK (fecha_hora_fin > fecha_hora_inicio)';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'tenant_base'
       AND t.relname = 'pagos'
       AND c.conname = 'chk_pagos_final_nonneg'
  )
  AND EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'tenant_base'
       AND t.relname = 'pagos'
       AND c.conname = 'pagos_monto_final_nonnegative'
  ) THEN
    EXECUTE 'ALTER TABLE tenant_base.pagos DROP CONSTRAINT chk_pagos_final_nonneg';
  ELSIF EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'tenant_base'
       AND t.relname = 'pagos'
       AND c.conname = 'chk_pagos_final_nonneg'
  )
  AND NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'tenant_base'
       AND t.relname = 'pagos'
       AND c.conname = 'pagos_monto_final_nonnegative'
  ) THEN
    EXECUTE 'ALTER TABLE tenant_base.pagos RENAME CONSTRAINT chk_pagos_final_nonneg TO pagos_monto_final_nonnegative';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'tenant_base'
       AND table_name = 'pagos'
       AND column_name = 'estado'
  ) THEN
    EXECUTE 'ALTER TABLE tenant_base.pagos ALTER COLUMN estado SET DEFAULT ''pendiente''';
    EXECUTE 'UPDATE tenant_base.pagos SET estado = ''pendiente'' WHERE estado IS NULL';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ag_emp_fecha
  ON tenant_base.agendamientos (empleado_id, fecha_cita);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'tenant_base'
       AND table_name = 'pagos'
       AND column_name = 'monto_final'
  )
  AND NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'tenant_base'
       AND t.relname = 'pagos'
       AND c.conname = 'pagos_monto_final_nonnegative'
  ) THEN
    EXECUTE 'ALTER TABLE tenant_base.pagos ADD CONSTRAINT pagos_monto_final_nonnegative CHECK (monto_final >= 0)';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'tenant_base'
       AND table_name = 'pagos'
       AND column_name = 'monto_descuento'
  )
  AND EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'tenant_base'
       AND table_name = 'pagos'
       AND column_name = 'monto'
  )
  AND NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'tenant_base'
       AND t.relname = 'pagos'
       AND c.conname = 'pagos_descuento_lte_monto'
  ) THEN
    EXECUTE 'ALTER TABLE tenant_base.pagos ADD CONSTRAINT pagos_descuento_lte_monto CHECK (monto_descuento <= monto)';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'tenant_base'
       AND table_name = 'clientes'
  )
  AND NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'tenant_base'
       AND table_name = 'clientes'
       AND column_name = 'deleted_at'
  ) THEN
    EXECUTE 'ALTER TABLE tenant_base.clientes ADD COLUMN deleted_at timestamptz NULL';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'tenant_base'
       AND table_name = 'empleados'
  )
  AND NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'tenant_base'
       AND table_name = 'empleados'
       AND column_name = 'deleted_at'
  ) THEN
    EXECUTE 'ALTER TABLE tenant_base.empleados ADD COLUMN deleted_at timestamptz NULL';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'tenant_base'
       AND table_name = 'servicios'
  )
  AND NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'tenant_base'
       AND table_name = 'servicios'
       AND column_name = 'deleted_at'
  ) THEN
    EXECUTE 'ALTER TABLE tenant_base.servicios ADD COLUMN deleted_at timestamptz NULL';
  END IF;
END $$;

DO $$
DECLARE
  fecha_cita_type text;
  range_expr text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'tenant_base'
       AND table_name = 'agendamientos'
  ) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'tenant_base'
       AND table_name = 'agendamientos'
       AND column_name = 'empleado_id'
  )
  OR NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'tenant_base'
       AND table_name = 'agendamientos'
       AND column_name = 'fecha_cita'
  )
  OR NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'tenant_base'
       AND table_name = 'agendamientos'
       AND column_name = 'fecha_cita_fin'
  ) THEN
    RETURN;
  END IF;

  EXECUTE $sql$
    UPDATE tenant_base.agendamientos
       SET fecha_cita_fin = fecha_cita + interval '1 minute'
     WHERE fecha_cita_fin IS NULL
        OR fecha_cita_fin <= fecha_cita
  $sql$;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'tenant_base'
       AND t.relname = 'agendamientos'
       AND c.conname = 'agendamientos_rango_valido'
  ) THEN
    EXECUTE 'ALTER TABLE tenant_base.agendamientos ADD CONSTRAINT agendamientos_rango_valido CHECK (fecha_cita_fin > fecha_cita)';
  END IF;

  SELECT data_type
    INTO fecha_cita_type
    FROM information_schema.columns
   WHERE table_schema = 'tenant_base'
     AND table_name = 'agendamientos'
     AND column_name = 'fecha_cita';

  IF fecha_cita_type = 'timestamp with time zone' THEN
    range_expr := 'tstzrange(fecha_cita, fecha_cita_fin, ''[)'')';
  ELSE
    range_expr := 'tsrange(fecha_cita, fecha_cita_fin, ''[)'')';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'tenant_base'
       AND t.relname = 'agendamientos'
       AND c.conname = 'agendamientos_no_overlap_per_employee'
  ) THEN
    BEGIN
      EXECUTE format(
        'ALTER TABLE tenant_base.agendamientos
           ADD CONSTRAINT agendamientos_no_overlap_per_employee
           EXCLUDE USING gist (
             empleado_id WITH =,
             %s WITH &&
           )
           WHERE (empleado_id IS NOT NULL)',
        range_expr
      );
    EXCEPTION
      WHEN exclusion_violation THEN
        RAISE WARNING 'No se pudo crear agendamientos_no_overlap_per_employee porque ya existen citas solapadas.';
    END;
  END IF;
END $$;

DO $$
DECLARE
  seq_record RECORD;
BEGIN
  FOR seq_record IN
    SELECT n.nspname AS schema_name,
           c.relname AS sequence_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'S'
       AND n.nspname = 'tenant_base'
       AND c.relname LIKE '%_seq'
       AND NOT EXISTS (
         SELECT 1
           FROM pg_depend d
          WHERE d.objid = c.oid
       )
  LOOP
    EXECUTE format('DROP SEQUENCE IF EXISTS %I.%I', seq_record.schema_name, seq_record.sequence_name);
  END LOOP;
END $$;
