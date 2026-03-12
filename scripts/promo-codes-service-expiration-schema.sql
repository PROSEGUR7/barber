-- Adds expiration date + service scope support for promo codes across tenant schemas.

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN
    SELECT nspname
    FROM pg_namespace
    WHERE nspname = 'tenant_base' OR nspname LIKE 'tenant\_%' ESCAPE '\'
  LOOP
    EXECUTE format('ALTER TABLE %I.promo_codes ADD COLUMN IF NOT EXISTS expires_at DATE NULL', schema_name);
    EXECUTE format('ALTER TABLE %I.promo_codes ADD COLUMN IF NOT EXISTS service_id INTEGER NULL', schema_name);
    EXECUTE format('ALTER TABLE %I.promo_codes ADD COLUMN IF NOT EXISTS service_ids INTEGER[] NULL', schema_name);
    EXECUTE format('ALTER TABLE %I.promo_codes ADD COLUMN IF NOT EXISTS discount_percent SMALLINT NOT NULL DEFAULT 10', schema_name);

    BEGIN
      EXECUTE format('ALTER TABLE %I.promo_codes ADD CONSTRAINT promo_codes_discount_percent_check CHECK (discount_percent >= 1 AND discount_percent <= 100)', schema_name);
    EXCEPTION
      WHEN duplicate_object THEN
        NULL;
    END;

    BEGIN
      EXECUTE format(
        'ALTER TABLE %I.promo_codes ADD CONSTRAINT promo_codes_service_id_fkey FOREIGN KEY (service_id) REFERENCES %I.servicios(id) ON DELETE SET NULL',
        schema_name,
        schema_name
      );
    EXCEPTION
      WHEN duplicate_object THEN
        NULL;
    END;

    EXECUTE format('CREATE INDEX IF NOT EXISTS promo_codes_service_idx ON %I.promo_codes (service_id)', schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS promo_codes_service_ids_gin_idx ON %I.promo_codes USING GIN (service_ids)', schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS promo_codes_expires_at_idx ON %I.promo_codes (expires_at)', schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS promo_codes_discount_percent_idx ON %I.promo_codes (discount_percent)', schema_name);

    EXECUTE format('ALTER TABLE %I.clientes_cupones ADD COLUMN IF NOT EXISTS expires_at DATE NULL', schema_name);
    EXECUTE format('ALTER TABLE %I.clientes_cupones ADD COLUMN IF NOT EXISTS service_id INTEGER NULL', schema_name);
    EXECUTE format('ALTER TABLE %I.clientes_cupones ADD COLUMN IF NOT EXISTS service_ids INTEGER[] NULL', schema_name);
    EXECUTE format('ALTER TABLE %I.clientes_cupones ADD COLUMN IF NOT EXISTS discount_percent SMALLINT NOT NULL DEFAULT 10', schema_name);

    BEGIN
      EXECUTE format('ALTER TABLE %I.clientes_cupones ADD CONSTRAINT clientes_cupones_discount_percent_check CHECK (discount_percent >= 1 AND discount_percent <= 100)', schema_name);
    EXCEPTION
      WHEN duplicate_object THEN
        NULL;
    END;

    BEGIN
      EXECUTE format(
        'ALTER TABLE %I.clientes_cupones ADD CONSTRAINT clientes_cupones_service_id_fkey FOREIGN KEY (service_id) REFERENCES %I.servicios(id) ON DELETE SET NULL',
        schema_name,
        schema_name
      );
    EXCEPTION
      WHEN duplicate_object THEN
        NULL;
    END;

    EXECUTE format(
      'UPDATE %I.promo_codes
          SET expires_label = CONCAT(''Válido hasta '', TO_CHAR(expires_at, ''DD/MM/YYYY''))
        WHERE expires_at IS NOT NULL
          AND (expires_label IS NULL OR BTRIM(expires_label) = '''')',
      schema_name
    );

    EXECUTE format(
      'UPDATE %I.promo_codes
          SET service_ids = CASE
            WHEN service_ids IS NOT NULL THEN service_ids
            WHEN service_id IS NOT NULL THEN ARRAY[service_id]
            ELSE NULL
          END',
      schema_name
    );

    EXECUTE format(
      'UPDATE %I.clientes_cupones
          SET service_ids = CASE
            WHEN service_ids IS NOT NULL THEN service_ids
            WHEN service_id IS NOT NULL THEN ARRAY[service_id]
            ELSE NULL
          END',
      schema_name
    );
  END LOOP;
END
$$;
