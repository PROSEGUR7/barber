-- Creates weekly availability + exceptions tables used to materialize into tenant_base.horarios_empleados.
-- Run this against your Postgres DB (same one used by DATABASE_URL).

CREATE TABLE IF NOT EXISTS tenant_base.empleados_disponibilidad_semanal (
  id BIGSERIAL PRIMARY KEY,
  empleado_id INTEGER NOT NULL REFERENCES tenant_base.empleados(id) ON DELETE CASCADE,
  dow SMALLINT NOT NULL CHECK (dow >= 0 AND dow <= 6),
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT empleados_disponibilidad_semanal_time_check CHECK (hora_fin > hora_inicio),
  CONSTRAINT empleados_disponibilidad_semanal_unique UNIQUE (empleado_id, dow, hora_inicio, hora_fin)
);

CREATE INDEX IF NOT EXISTS empleados_disponibilidad_semanal_emp_dow_idx
  ON tenant_base.empleados_disponibilidad_semanal (empleado_id, dow)
  WHERE activo = TRUE;

CREATE TABLE IF NOT EXISTS tenant_base.empleados_disponibilidad_excepciones (
  id BIGSERIAL PRIMARY KEY,
  empleado_id INTEGER NOT NULL REFERENCES tenant_base.empleados(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('off', 'custom')),
  hora_inicio TIME NULL,
  hora_fin TIME NULL,
  nota TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT empleados_disponibilidad_excepciones_shape_check CHECK (
    (tipo = 'off' AND hora_inicio IS NULL AND hora_fin IS NULL)
    OR (tipo = 'custom' AND hora_inicio IS NOT NULL AND hora_fin IS NOT NULL AND hora_fin > hora_inicio)
  ),
  CONSTRAINT empleados_disponibilidad_excepciones_unique UNIQUE (empleado_id, fecha, tipo, hora_inicio, hora_fin)
);

CREATE INDEX IF NOT EXISTS empleados_disponibilidad_excepciones_emp_fecha_idx
  ON tenant_base.empleados_disponibilidad_excepciones (empleado_id, fecha);
