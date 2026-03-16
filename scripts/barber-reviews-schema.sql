CREATE TABLE IF NOT EXISTS tenant_base.empleados_resenas (
  id BIGSERIAL PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES tenant_base.clientes(id) ON DELETE CASCADE,
  empleado_id INTEGER NOT NULL REFERENCES tenant_base.empleados(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT empleados_resenas_unique_cliente_empleado UNIQUE (cliente_id, empleado_id)
);

CREATE INDEX IF NOT EXISTS empleados_resenas_empleado_idx
  ON tenant_base.empleados_resenas (empleado_id, updated_at DESC);
