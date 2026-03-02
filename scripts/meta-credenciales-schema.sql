-- Configuración Meta por tenant (multitenant)
-- Esta tabla vive en tenant_base y almacena credenciales por cliente/tenant.

CREATE TABLE IF NOT EXISTS tenant_base.configuracion_meta_tenant (
  id BIGSERIAL PRIMARY KEY,
  tenant_schema TEXT NOT NULL,
  tenant_id INTEGER NULL,
  nombre_cuenta TEXT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  meta_access_token TEXT NOT NULL,
  meta_verify_token TEXT NOT NULL,
  meta_phone_number_id TEXT NOT NULL,
  meta_display_phone_number TEXT NULL,
  meta_business_account_id TEXT NULL,
  meta_graph_version TEXT NOT NULL DEFAULT 'v22.0',
  webhook_secret TEXT NULL,
  n8n_webhook_url TEXT NULL,
  n8n_api_key TEXT NULL,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_configuracion_meta_tenant_schema CHECK (tenant_schema ~ '^tenant_[a-z0-9_]+$')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_configuracion_meta_tenant_schema
  ON tenant_base.configuracion_meta_tenant (tenant_schema);

CREATE UNIQUE INDEX IF NOT EXISTS ux_configuracion_meta_tenant_verify_token
  ON tenant_base.configuracion_meta_tenant (meta_verify_token);

CREATE UNIQUE INDEX IF NOT EXISTS ux_configuracion_meta_tenant_phone_id
  ON tenant_base.configuracion_meta_tenant (meta_phone_number_id);

-- Aislamiento de chats por tenant
ALTER TABLE tenant_base.meta_webhook_messages
  ADD COLUMN IF NOT EXISTS tenant_schema TEXT NOT NULL DEFAULT 'tenant_base';

UPDATE tenant_base.meta_webhook_messages
   SET tenant_schema = 'tenant_base'
 WHERE tenant_schema IS NULL OR trim(tenant_schema) = '';

CREATE INDEX IF NOT EXISTS meta_webhook_messages_tenant_wa_id_sent_idx
  ON tenant_base.meta_webhook_messages (tenant_schema, wa_id, sent_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS meta_webhook_messages_tenant_unread_idx
  ON tenant_base.meta_webhook_messages (tenant_schema, wa_id, id)
  WHERE direction = 'inbound' AND read_at IS NULL;
