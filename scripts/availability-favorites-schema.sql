-- Favorites: client <-> employee

CREATE TABLE IF NOT EXISTS tenant_base.clientes_favoritos_empleados (
  id BIGSERIAL PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES tenant_base.clientes(id) ON DELETE CASCADE,
  empleado_id INTEGER NOT NULL REFERENCES tenant_base.empleados(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT clientes_favoritos_empleados_unique UNIQUE (cliente_id, empleado_id)
);

CREATE INDEX IF NOT EXISTS clientes_favoritos_empleados_cliente_idx
  ON tenant_base.clientes_favoritos_empleados (cliente_id);

CREATE INDEX IF NOT EXISTS clientes_favoritos_empleados_empleado_idx
  ON tenant_base.clientes_favoritos_empleados (empleado_id);
