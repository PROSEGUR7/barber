-- Minimal wallet schema to back the Wallet page (no payment processing).

CREATE TABLE IF NOT EXISTS tenant_base.clientes_wallet (
  cliente_id INTEGER PRIMARY KEY REFERENCES tenant_base.clientes(id) ON DELETE CASCADE,
  saldo NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_base.clientes_metodos_pago (
  id BIGSERIAL PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES tenant_base.clientes(id) ON DELETE CASCADE,
  brand TEXT NOT NULL,
  last4 TEXT NOT NULL CHECK (char_length(last4) = 4),
  exp_month SMALLINT NOT NULL CHECK (exp_month >= 1 AND exp_month <= 12),
  exp_year SMALLINT NOT NULL CHECK (exp_year >= 0 AND exp_year <= 99),
  status TEXT NOT NULL DEFAULT 'Respaldo' CHECK (status IN ('Principal', 'Respaldo')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clientes_metodos_pago_cliente_idx
  ON tenant_base.clientes_metodos_pago (cliente_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tenant_base.clientes_suscripciones (
  cliente_id INTEGER PRIMARY KEY REFERENCES tenant_base.clientes(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'Free',
  next_charge_date DATE NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_base.clientes_cupones (
  id BIGSERIAL PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES tenant_base.clientes(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  expires_label TEXT NULL,
  status TEXT NOT NULL DEFAULT 'Disponible' CHECK (status IN ('Disponible', 'Usado', 'Expirado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT clientes_cupones_unique UNIQUE (cliente_id, code)
);

CREATE INDEX IF NOT EXISTS clientes_cupones_cliente_idx
  ON tenant_base.clientes_cupones (cliente_id, created_at DESC);

-- Master promo codes catalog (what codes are valid)
CREATE TABLE IF NOT EXISTS tenant_base.promo_codes (
  code TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  expires_label TEXT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS promo_codes_active_idx
  ON tenant_base.promo_codes (active);
