ALTER TABLE tenant_base.pagos
  ADD COLUMN IF NOT EXISTS proveedor_pago TEXT,
  ADD COLUMN IF NOT EXISTS wompi_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS wompi_reference TEXT,
  ADD COLUMN IF NOT EXISTS wompi_currency TEXT,
  ADD COLUMN IF NOT EXISTS wompi_status TEXT,
  ADD COLUMN IF NOT EXISTS wompi_event_name TEXT,
  ADD COLUMN IF NOT EXISTS wompi_payload JSONB,
  ADD COLUMN IF NOT EXISTS wompi_payload_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS pagos_proveedor_pago_idx
  ON tenant_base.pagos (proveedor_pago);

CREATE INDEX IF NOT EXISTS pagos_wompi_reference_idx
  ON tenant_base.pagos (wompi_reference);

CREATE INDEX IF NOT EXISTS pagos_wompi_transaction_id_idx
  ON tenant_base.pagos (wompi_transaction_id);

CREATE INDEX IF NOT EXISTS pagos_wompi_status_idx
  ON tenant_base.pagos (wompi_status);
