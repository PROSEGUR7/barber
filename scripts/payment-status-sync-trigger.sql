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
    EXECUTE format(
      $fmt$
      CREATE OR REPLACE FUNCTION %I.tg_sync_agendamiento_status_from_pago()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $fn$
      BEGIN
        IF NEW.agendamiento_id IS NULL THEN
          RETURN NEW;
        END IF;

        IF COALESCE(NEW.estado::text, '') = 'completo'
           AND (
             TG_OP = 'INSERT'
             OR COALESCE(OLD.estado::text, '') <> 'completo'
             OR COALESCE(OLD.wompi_status, '') IS DISTINCT FROM COALESCE(NEW.wompi_status, '')
           )
           AND (
             lower(COALESCE(NEW.proveedor_pago, '')) = 'wompi'
             OR upper(COALESCE(NEW.wompi_status, '')) = 'APPROVED'
           )
        THEN
          UPDATE %I.agendamientos
             SET estado = 'pendiente'
           WHERE id = NEW.agendamiento_id
             AND estado::text = 'provisional';
        END IF;

        RETURN NEW;
      END;
      $fn$;
      $fmt$,
      schema_name,
      schema_name
    );

    EXECUTE format('DROP TRIGGER IF EXISTS trg_sync_agendamiento_status_from_pago ON %I.pagos;', schema_name);

    EXECUTE format(
      $fmt$
      CREATE TRIGGER trg_sync_agendamiento_status_from_pago
      AFTER INSERT OR UPDATE OF estado, wompi_status, proveedor_pago
      ON %I.pagos
      FOR EACH ROW
      EXECUTE FUNCTION %I.tg_sync_agendamiento_status_from_pago();
      $fmt$,
      schema_name,
      schema_name
    );
  END LOOP;
END
$$;