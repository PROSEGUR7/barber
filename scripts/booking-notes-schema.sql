-- Add customer notes fields to appointments across tenant schemas.

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
        FROM information_schema.tables
       WHERE table_schema = schema_name
         AND table_name = 'agendamientos'
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE %I.agendamientos ADD COLUMN IF NOT EXISTS comentarios_cliente text NULL;',
      schema_name
    );

    EXECUTE format(
      'ALTER TABLE %I.agendamientos ADD COLUMN IF NOT EXISTS solicitudes_cliente text NULL;',
      schema_name
    );
  END LOOP;
END
$$;
