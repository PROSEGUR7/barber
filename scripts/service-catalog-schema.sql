-- Extiende el catalogo de servicios para soportar categorias y paquetes.

CREATE TABLE IF NOT EXISTS tenant_base.servicio_categorias (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL UNIQUE,
  descripcion TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tenant_base.servicios
  ADD COLUMN IF NOT EXISTS categoria_id INTEGER,
  ADD COLUMN IF NOT EXISTS tipo_servicio VARCHAR(20) NOT NULL DEFAULT 'individual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'servicios_categoria_id_fk'
  ) THEN
    ALTER TABLE tenant_base.servicios
      ADD CONSTRAINT servicios_categoria_id_fk
      FOREIGN KEY (categoria_id)
      REFERENCES tenant_base.servicio_categorias(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'servicios_tipo_servicio_chk'
  ) THEN
    ALTER TABLE tenant_base.servicios
      ADD CONSTRAINT servicios_tipo_servicio_chk
      CHECK (LOWER(tipo_servicio) IN ('individual', 'paquete'));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS tenant_base.servicio_paquetes_items (
  id BIGSERIAL PRIMARY KEY,
  servicio_paquete_id INTEGER NOT NULL REFERENCES tenant_base.servicios(id) ON DELETE CASCADE,
  servicio_individual_id INTEGER NOT NULL REFERENCES tenant_base.servicios(id) ON DELETE RESTRICT,
  cantidad INTEGER NOT NULL DEFAULT 1,
  orden INTEGER NOT NULL DEFAULT 0,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT servicio_paquetes_items_cantidad_chk CHECK (cantidad > 0),
  CONSTRAINT servicio_paquetes_items_unq UNIQUE (servicio_paquete_id, servicio_individual_id)
);

CREATE INDEX IF NOT EXISTS servicio_paquetes_items_paquete_idx
  ON tenant_base.servicio_paquetes_items (servicio_paquete_id, orden, id);
