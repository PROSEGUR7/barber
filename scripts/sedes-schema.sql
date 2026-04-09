-- Soporte multi-sede para esquemas tenant_base y tenant_%.
-- Crea entidad de sedes y la integra con empleados, servicios, horarios y agendamientos.

DO $$
DECLARE
  schema_name text;
BEGIN
  FOR schema_name IN
    SELECT nspname
      FROM pg_namespace
     WHERE nspname = 'tenant_base'
        OR nspname LIKE 'tenant_%'
     ORDER BY nspname
  LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_class t
        JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = schema_name
         AND t.relname = 'empleados'
    ) OR NOT EXISTS (
      SELECT 1
        FROM pg_class t
        JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = schema_name
         AND t.relname = 'servicios'
    ) OR NOT EXISTS (
      SELECT 1
        FROM pg_class t
        JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = schema_name
         AND t.relname = 'agendamientos'
    ) OR NOT EXISTS (
      SELECT 1
        FROM pg_class t
        JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = schema_name
         AND t.relname = 'horarios_empleados'
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      $fmt$
      CREATE TABLE IF NOT EXISTS %I.sedes (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(120) NOT NULL,
        direccion TEXT NULL,
        ciudad VARCHAR(120) NULL,
        latitud NUMERIC(9, 6) NULL,
        longitud NUMERIC(9, 6) NULL,
        telefono VARCHAR(20) NULL,
        referencia TEXT NULL,
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT sedes_latitud_chk CHECK (latitud IS NULL OR (latitud >= -90 AND latitud <= 90)),
        CONSTRAINT sedes_longitud_chk CHECK (longitud IS NULL OR (longitud >= -180 AND longitud <= 180))
      );
      $fmt$,
      schema_name
    );

    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS sedes_nombre_unique_idx ON %I.sedes (LOWER(nombre));',
      schema_name
    );

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS sedes_activo_idx ON %I.sedes (activo);',
      schema_name
    );

    EXECUTE format(
      $fmt$
      CREATE TABLE IF NOT EXISTS %I.sedes_empleados (
        id BIGSERIAL PRIMARY KEY,
        sede_id INTEGER NOT NULL REFERENCES %I.sedes(id) ON DELETE CASCADE,
        empleado_id INTEGER NOT NULL REFERENCES %I.empleados(id) ON DELETE CASCADE,
        es_principal BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT sedes_empleados_unq UNIQUE (sede_id, empleado_id)
      );
      $fmt$,
      schema_name,
      schema_name,
      schema_name
    );

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS sedes_empleados_sede_idx ON %I.sedes_empleados (sede_id);',
      schema_name
    );

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS sedes_empleados_empleado_idx ON %I.sedes_empleados (empleado_id);',
      schema_name
    );

    EXECUTE format(
      $fmt$
      CREATE TABLE IF NOT EXISTS %I.sedes_servicios (
        id BIGSERIAL PRIMARY KEY,
        sede_id INTEGER NOT NULL REFERENCES %I.sedes(id) ON DELETE CASCADE,
        servicio_id INTEGER NOT NULL REFERENCES %I.servicios(id) ON DELETE CASCADE,
        precio_override NUMERIC(10, 2) NULL,
        duracion_min_override INTEGER NULL,
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT sedes_servicios_unq UNIQUE (sede_id, servicio_id),
        CONSTRAINT sedes_servicios_precio_chk CHECK (precio_override IS NULL OR precio_override >= 0),
        CONSTRAINT sedes_servicios_duracion_chk CHECK (duracion_min_override IS NULL OR duracion_min_override > 0)
      );
      $fmt$,
      schema_name,
      schema_name,
      schema_name
    );

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS sedes_servicios_sede_idx ON %I.sedes_servicios (sede_id);',
      schema_name
    );

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS sedes_servicios_servicio_idx ON %I.sedes_servicios (servicio_id);',
      schema_name
    );

    EXECUTE format('ALTER TABLE IF EXISTS %I.empleados ADD COLUMN IF NOT EXISTS sede_id INTEGER;', schema_name);
    EXECUTE format('ALTER TABLE IF EXISTS %I.servicios ADD COLUMN IF NOT EXISTS sede_id INTEGER;', schema_name);
    EXECUTE format('ALTER TABLE IF EXISTS %I.horarios_empleados ADD COLUMN IF NOT EXISTS sede_id INTEGER;', schema_name);
    EXECUTE format('ALTER TABLE IF EXISTS %I.agendamientos ADD COLUMN IF NOT EXISTS sede_id INTEGER;', schema_name);

    IF EXISTS (
      SELECT 1
        FROM pg_class t
        JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = schema_name
         AND t.relname = 'empleados'
    )
    AND NOT EXISTS (
      SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = schema_name
         AND t.relname = 'empleados'
         AND c.conname = 'empleados_sede_id_fkey'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.empleados ADD CONSTRAINT empleados_sede_id_fkey FOREIGN KEY (sede_id) REFERENCES %I.sedes(id) ON DELETE SET NULL;',
        schema_name,
        schema_name
      );
    END IF;

    IF EXISTS (
      SELECT 1
        FROM pg_class t
        JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = schema_name
         AND t.relname = 'servicios'
    )
    AND NOT EXISTS (
      SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = schema_name
         AND t.relname = 'servicios'
         AND c.conname = 'servicios_sede_id_fkey'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.servicios ADD CONSTRAINT servicios_sede_id_fkey FOREIGN KEY (sede_id) REFERENCES %I.sedes(id) ON DELETE SET NULL;',
        schema_name,
        schema_name
      );
    END IF;

    IF EXISTS (
      SELECT 1
        FROM pg_class t
        JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = schema_name
         AND t.relname = 'horarios_empleados'
    )
    AND NOT EXISTS (
      SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = schema_name
         AND t.relname = 'horarios_empleados'
         AND c.conname = 'horarios_empleados_sede_id_fkey'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.horarios_empleados ADD CONSTRAINT horarios_empleados_sede_id_fkey FOREIGN KEY (sede_id) REFERENCES %I.sedes(id) ON DELETE SET NULL;',
        schema_name,
        schema_name
      );
    END IF;

    IF EXISTS (
      SELECT 1
        FROM pg_class t
        JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = schema_name
         AND t.relname = 'agendamientos'
    )
    AND NOT EXISTS (
      SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = schema_name
         AND t.relname = 'agendamientos'
         AND c.conname = 'agendamientos_sede_id_fkey'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.agendamientos ADD CONSTRAINT agendamientos_sede_id_fkey FOREIGN KEY (sede_id) REFERENCES %I.sedes(id) ON DELETE SET NULL;',
        schema_name,
        schema_name
      );
    END IF;

    EXECUTE format('CREATE INDEX IF NOT EXISTS empleados_sede_id_idx ON %I.empleados (sede_id);', schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS servicios_sede_id_idx ON %I.servicios (sede_id);', schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS horarios_empleados_sede_id_idx ON %I.horarios_empleados (sede_id);', schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS agendamientos_sede_fecha_idx ON %I.agendamientos (sede_id, fecha_cita);', schema_name);

    EXECUTE format(
      $fmt$
      INSERT INTO %I.sedes (nombre, direccion, ciudad, activo)
      SELECT 'Sede principal', NULL, NULL, TRUE
      WHERE NOT EXISTS (SELECT 1 FROM %I.sedes);
      $fmt$,
      schema_name,
      schema_name
    );

    EXECUTE format(
      $fmt$
      UPDATE %I.empleados e
         SET sede_id = seed.default_sede_id
        FROM (
          SELECT MIN(s.id)::int AS default_sede_id
            FROM %I.sedes s
        ) seed
       WHERE e.sede_id IS NULL
         AND seed.default_sede_id IS NOT NULL;
      $fmt$,
      schema_name,
      schema_name
    );

    EXECUTE format(
      $fmt$
      INSERT INTO %I.sedes_empleados (sede_id, empleado_id, es_principal)
      SELECT e.sede_id, e.id, TRUE
        FROM %I.empleados e
       WHERE e.sede_id IS NOT NULL
      ON CONFLICT (sede_id, empleado_id) DO NOTHING;
      $fmt$,
      schema_name,
      schema_name
    );

    EXECUTE format(
      $fmt$
      DELETE FROM %I.sedes_empleados se
      USING (
        SELECT id
          FROM (
            SELECT se_inner.id,
                   ROW_NUMBER() OVER (
                     PARTITION BY se_inner.empleado_id
                     ORDER BY
                       CASE WHEN e.sede_id = se_inner.sede_id THEN 0 ELSE 1 END,
                       CASE WHEN se_inner.es_principal THEN 0 ELSE 1 END,
                       se_inner.created_at ASC,
                       se_inner.id ASC
                   ) AS rn
              FROM %I.sedes_empleados se_inner
              LEFT JOIN %I.empleados e ON e.id = se_inner.empleado_id
          ) ranked
         WHERE rn > 1
      ) duplicated
      WHERE se.id = duplicated.id;
      $fmt$,
      schema_name,
      schema_name,
      schema_name
    );

    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS sedes_empleados_empleado_unique_idx ON %I.sedes_empleados (empleado_id);',
      schema_name
    );

    EXECUTE format(
      'UPDATE %I.sedes_empleados SET es_principal = TRUE;',
      schema_name
    );

    EXECUTE format(
      $fmt$
      CREATE OR REPLACE FUNCTION %I.tg_empleados_assign_default_sede()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $fn$
      DECLARE
        default_sede_id integer;
      BEGIN
        IF NEW.sede_id IS NOT NULL THEN
          RETURN NEW;
        END IF;

        SELECT MIN(s.id)::int
          INTO default_sede_id
          FROM %I.sedes s
         WHERE s.activo = TRUE;

        IF default_sede_id IS NULL THEN
          RAISE EXCEPTION 'No hay sedes activas para asignar a empleados en %%', %L;
        END IF;

        NEW.sede_id := default_sede_id;
        RETURN NEW;
      END;
      $fn$;
      $fmt$,
      schema_name,
      schema_name,
      schema_name
    );

    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_empleados_assign_default_sede ON %I.empleados;',
      schema_name
    );

    EXECUTE format(
      $fmt$
      CREATE TRIGGER trg_empleados_assign_default_sede
      BEFORE INSERT OR UPDATE OF sede_id ON %I.empleados
      FOR EACH ROW
      EXECUTE FUNCTION %I.tg_empleados_assign_default_sede();
      $fmt$,
      schema_name,
      schema_name
    );

    EXECUTE format(
      $fmt$
      CREATE OR REPLACE FUNCTION %I.tg_empleados_sync_sedes_empleados()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $fn$
      BEGIN
        IF NEW.sede_id IS NULL THEN
          RETURN NEW;
        END IF;

        DELETE FROM %I.sedes_empleados
         WHERE empleado_id = NEW.id
           AND sede_id <> NEW.sede_id;

        INSERT INTO %I.sedes_empleados (sede_id, empleado_id, es_principal)
        VALUES (NEW.sede_id, NEW.id, TRUE)
        ON CONFLICT (empleado_id) DO UPDATE
          SET sede_id = EXCLUDED.sede_id,
              es_principal = TRUE;

        RETURN NEW;
      END;
      $fn$;
      $fmt$,
      schema_name,
      schema_name,
      schema_name
    );

    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_empleados_sync_sedes_empleados ON %I.empleados;',
      schema_name
    );

    EXECUTE format(
      $fmt$
      CREATE TRIGGER trg_empleados_sync_sedes_empleados
      AFTER INSERT OR UPDATE OF sede_id ON %I.empleados
      FOR EACH ROW
      EXECUTE FUNCTION %I.tg_empleados_sync_sedes_empleados();
      $fmt$,
      schema_name,
      schema_name
    );

    EXECUTE format(
      'ALTER TABLE %I.empleados ALTER COLUMN sede_id SET NOT NULL;',
      schema_name
    );

    EXECUTE format(
      $fmt$
      UPDATE %I.agendamientos a
         SET sede_id = e.sede_id
        FROM %I.empleados e
       WHERE a.empleado_id = e.id
         AND a.sede_id IS NULL
         AND e.sede_id IS NOT NULL;
      $fmt$,
      schema_name,
      schema_name
    );

    EXECUTE format(
      $fmt$
      UPDATE %I.horarios_empleados h
         SET sede_id = e.sede_id
        FROM %I.empleados e
       WHERE h.empleado_id = e.id
         AND h.sede_id IS NULL
         AND e.sede_id IS NOT NULL;
      $fmt$,
      schema_name,
      schema_name
    );

    EXECUTE format(
      $fmt$
      INSERT INTO %I.sedes_servicios (sede_id, servicio_id, activo)
      SELECT default_sede_id, s.id, TRUE
        FROM %I.servicios s
        CROSS JOIN (
          SELECT MIN(sd.id)::int AS default_sede_id
            FROM %I.sedes sd
        ) d
       WHERE d.default_sede_id IS NOT NULL
      ON CONFLICT (sede_id, servicio_id) DO NOTHING;
      $fmt$,
      schema_name,
      schema_name,
      schema_name
    );

    EXECUTE format(
      $fmt$
      UPDATE %I.servicios s
         SET sede_id = d.default_sede_id
        FROM (
          SELECT MIN(sd.id)::int AS default_sede_id
            FROM %I.sedes sd
        ) d
       WHERE s.sede_id IS NULL
         AND d.default_sede_id IS NOT NULL;
      $fmt$,
      schema_name,
      schema_name
    );
  END LOOP;
END
$$;
