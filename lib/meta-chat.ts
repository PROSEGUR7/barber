import { pool } from "@/lib/db"
import { tenantSql } from "@/lib/tenant"
import {
  ensureMetaTenantConfigTable,
  getMetaConfigByTenantSchema,
  normalizeTenantSchema,
} from "@/lib/meta-tenant-config"

export type ConversationSummary = {
  id: string
  waId: string | null
  name: string
  initials: string
  snippet: string
  channel: "WhatsApp"
  owner: "Humano" | "IA"
  dateLabel: string
  unreadCount: number
  isUnread: boolean
}

export type ConversationMessage = {
  id: string
  wamid: string | null
  direction: "inbound" | "outbound"
  owner: "Humano" | "IA"
  sentByType: "bot" | "human" | "unknown"
  sentByName: string | null
  type: string
  text: string | null
  mediaId: string | null
  mediaMimeType: string | null
  mediaCaption: string | null
  mediaFilename: string | null
  status: string | null
  statusError: string | null
  dateLabel: string
  timeLabel: string
  sentAt: string | null
}

type ConversationRow = {
  conversation_id: string
  wa_id: string | null
  name: string
  snippet: string
  owner: "Humano" | "IA"
  sent_at: string | null
  display_phone_number: string | null
  unread_count: string | number
}

type MessageRow = {
  id: string | number
  wamid: string | null
  direction: string
  message_type: string | null
  message_text: string | null
  media_id: string | null
  media_mime_type: string | null
  media_caption: string | null
  media_filename: string | null
  message_status: string | null
  status_error: string | null
  sent_at: string | null
  raw_payload: unknown
}

type OutboundSenderMeta = {
  type: "bot" | "human" | "unknown"
  name: string | null
}

let ensurePromise: Promise<void> | null = null

function toInt(value: string | number | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

export function formatRelativeDate(value: string | null | undefined): string {
  if (!value) {
    return "sin fecha"
  }

  const parsed = Number(value)
  const date = Number.isFinite(parsed) ? new Date(parsed * 1000) : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "sin fecha"
  }

  const now = new Date()
  const sameDay = now.toDateString() === date.toDateString()

  if (sameDay) {
    return "hoy"
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)

  if (yesterday.toDateString() === date.toDateString()) {
    return "ayer"
  }

  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
  }).format(date)
}

export function formatTimeLabel(value: string | null | undefined): string {
  if (!value) {
    return ""
  }

  const parsed = Number(value)
  const date = Number.isFinite(parsed) ? new Date(parsed * 1000) : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ""
  }

  return new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

export function getInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  if (parts.length === 0) {
    return "--"
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

function sanitizeConversationId(value: string): string {
  return decodeURIComponent(value).trim()
}

function normalizePhoneDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D+/g, "")
}

function conversationWhereSql(conversationId: string): { sql: string; params: string[] } {
  const normalized = sanitizeConversationId(conversationId)

  if (normalized.startsWith("unknown-")) {
    return {
      sql: "COALESCE(NULLIF(trim(wa_id), ''), concat('unknown-', id::text)) = $2::text",
      params: [normalized],
    }
  }

  return {
    sql: "NULLIF(trim(wa_id), '') = $2::text",
    params: [normalized],
  }
}

function normalizeSenderType(value: unknown): "bot" | "human" | "unknown" {
  if (typeof value !== "string") {
    return "unknown"
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === "human" || normalized === "humano" || normalized === "agent" || normalized === "asesor") {
    return "human"
  }

  if (normalized === "bot" || normalized === "ia" || normalized === "ai" || normalized === "system" || normalized === "n8n") {
    return "bot"
  }

  return "unknown"
}

function extractOutboundSenderMeta(rawPayload: unknown, direction: "inbound" | "outbound"): OutboundSenderMeta {
  if (direction === "inbound") {
    return {
      type: "human",
      name: null,
    }
  }

  if (!rawPayload || typeof rawPayload !== "object") {
    return {
      type: "bot",
      name: null,
    }
  }

  const payload = rawPayload as Record<string, unknown>
  const sentBy = payload.sent_by

  if (!sentBy || typeof sentBy !== "object") {
    return {
      type: "bot",
      name: null,
    }
  }

  const sentByRecord = sentBy as Record<string, unknown>
  const senderType = normalizeSenderType(sentByRecord.type)
  const senderName = typeof sentByRecord.name === "string" ? sentByRecord.name.trim() : ""

  return {
    type: senderType === "unknown" ? "bot" : senderType,
    name: senderName || null,
  }
}

export async function ensureMetaWebhookTables() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await ensureMetaTenantConfigTable()
      await pool.query("SELECT pg_advisory_lock(hashtext('tenant_base.meta_webhook_messages_ddl'))")

      try {
        await pool.query(`
          CREATE SEQUENCE IF NOT EXISTS tenant_base.meta_webhook_messages_id_seq
        `)

        await pool.query(`
          CREATE TABLE IF NOT EXISTS tenant_base.meta_webhook_messages (
            id BIGINT PRIMARY KEY DEFAULT nextval('tenant_base.meta_webhook_messages_id_seq'::regclass),
            tenant_schema TEXT NOT NULL DEFAULT 'tenant_base',
            wamid TEXT UNIQUE,
            phone_number_id TEXT,
            display_phone_number TEXT,
            wa_id TEXT,
            contact_name TEXT,
            direction TEXT NOT NULL,
            message_type TEXT,
            message_text TEXT,
            media_id TEXT,
            media_mime_type TEXT,
            media_caption TEXT,
            media_filename TEXT,
            message_status TEXT,
            status_error TEXT,
            sent_at TIMESTAMPTZ,
            read_at TIMESTAMPTZ,
            raw_payload JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `)

        await pool.query(`
          ALTER TABLE tenant_base.meta_webhook_messages
          ADD COLUMN IF NOT EXISTS tenant_schema TEXT NOT NULL DEFAULT 'tenant_base',
          ADD COLUMN IF NOT EXISTS media_id TEXT,
          ADD COLUMN IF NOT EXISTS media_mime_type TEXT,
          ADD COLUMN IF NOT EXISTS media_caption TEXT,
          ADD COLUMN IF NOT EXISTS media_filename TEXT,
          ADD COLUMN IF NOT EXISTS message_status TEXT,
          ADD COLUMN IF NOT EXISTS status_error TEXT,
          ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        `)

        await pool.query(`
          UPDATE tenant_base.meta_webhook_messages
             SET tenant_schema = 'tenant_base'
           WHERE tenant_schema IS NULL OR trim(tenant_schema) = ''
        `)

        await pool.query(`
          ALTER SEQUENCE tenant_base.meta_webhook_messages_id_seq
          OWNED BY tenant_base.meta_webhook_messages.id
        `)

        await pool.query(`
          CREATE INDEX IF NOT EXISTS meta_webhook_messages_wa_id_sent_idx
            ON tenant_base.meta_webhook_messages (tenant_schema, wa_id, sent_at DESC, id DESC)
        `)

        await pool.query(`
          CREATE INDEX IF NOT EXISTS meta_webhook_messages_unread_idx
            ON tenant_base.meta_webhook_messages (tenant_schema, wa_id, id)
          WHERE direction = 'inbound' AND read_at IS NULL
        `)
      } finally {
        await pool.query("SELECT pg_advisory_unlock(hashtext('tenant_base.meta_webhook_messages_ddl'))")
      }
    })().catch((error) => {
      ensurePromise = null
      throw error
    })
  }

  return ensurePromise
}

async function ensureClientesBotStatusColumn(tenantSchema: string): Promise<void> {
  await pool.query(
    tenantSql(
      `ALTER TABLE tenant_base.clientes
         ADD COLUMN IF NOT EXISTS estado_bot text NOT NULL DEFAULT 'activo'`,
      tenantSchema,
    ),
  )

  await pool.query(
    tenantSql(
      `UPDATE tenant_base.clientes
          SET estado_bot = 'activo'
        WHERE estado_bot IS NULL OR trim(estado_bot) = ''`,
      tenantSchema,
    ),
  )

  try {
    await pool.query(
      tenantSql(
        `ALTER TABLE tenant_base.clientes
           ADD CONSTRAINT chk_clientes_estado_bot
           CHECK (estado_bot IN ('activo', 'inactivo'))`,
        tenantSchema,
      ),
    )
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : ""

    // 42710: duplicate_object (constraint already exists)
    if (code !== "42710") {
      throw error
    }
  }
}

export async function getBotStatusByConversation(
  conversationId: string,
  tenantSchemaRaw: string,
): Promise<{ exists: boolean; active: boolean; clientId: number | null }> {
  const tenantSchema = normalizeTenantSchema(tenantSchemaRaw)
  await ensureClientesBotStatusColumn(tenantSchema)

  const waId = normalizePhoneDigits(sanitizeConversationId(conversationId))
  if (!waId) {
    return { exists: false, active: true, clientId: null }
  }

  const result = await pool.query<{ id: number; estado_bot: string | null }>(
    tenantSql(
      `SELECT id,
              COALESCE(NULLIF(trim(estado_bot), ''), 'activo') AS estado_bot
         FROM tenant_base.clientes
        WHERE regexp_replace(COALESCE(telefono, ''), '\\D+', '', 'g') = $1
        LIMIT 1`,
      tenantSchema,
    ),
    [waId],
  )

  if (result.rowCount === 0) {
    return { exists: false, active: true, clientId: null }
  }

  const estadoBot = (result.rows[0].estado_bot ?? "activo").trim().toLowerCase()
  return {
    exists: true,
    active: estadoBot !== "inactivo",
    clientId: result.rows[0].id,
  }
}

export async function updateBotStatusByConversation(
  conversationId: string,
  active: boolean,
  tenantSchemaRaw: string,
): Promise<{ updated: boolean; active: boolean; clientId: number | null }> {
  const tenantSchema = normalizeTenantSchema(tenantSchemaRaw)
  await ensureClientesBotStatusColumn(tenantSchema)

  const waId = normalizePhoneDigits(sanitizeConversationId(conversationId))
  if (!waId) {
    return { updated: false, active, clientId: null }
  }

  const nextValue = active ? "activo" : "inactivo"
  const result = await pool.query<{ id: number }>(
    tenantSql(
      `UPDATE tenant_base.clientes
          SET estado_bot = $2
        WHERE regexp_replace(COALESCE(telefono, ''), '\\D+', '', 'g') = $1
        RETURNING id`,
      tenantSchema,
    ),
    [waId, nextValue],
  )

  return {
    updated: result.rowCount > 0,
    active,
    clientId: result.rowCount > 0 ? result.rows[0].id : null,
  }
}

export async function getConversations(
  limit: number,
  tenantSchemaRaw: string,
): Promise<{ conversations: ConversationSummary[]; phoneDisplay: string }> {
  await ensureMetaWebhookTables()

  const tenantSchema = normalizeTenantSchema(tenantSchemaRaw)

  const result = await pool.query<ConversationRow>(
    `WITH base AS (
       SELECT
         id,
         COALESCE(NULLIF(trim(wa_id), ''), concat('unknown-', id::text)) as conversation_id,
         NULLIF(trim(wa_id), '') as wa_id,
         COALESCE(NULLIF(trim(contact_name), ''), NULLIF(trim(wa_id), ''), 'Contacto sin nombre') as name,
         COALESCE(NULLIF(trim(message_text), ''),
                  CASE
                    WHEN message_type = 'image' THEN '[Imagen]'
                    WHEN message_type = 'audio' THEN '[Audio]'
                    WHEN message_type = 'document' THEN '[Documento]'
                    WHEN message_type = 'video' THEN '[Video]'
                    ELSE 'Sin contenido'
                  END) as snippet,
         CASE
           WHEN direction = 'inbound' THEN 'Humano'
           WHEN lower(COALESCE(raw_payload -> 'sent_by' ->> 'type', '')) IN ('human', 'humano', 'agent', 'asesor') THEN 'Humano'
           ELSE 'IA'
         END as owner,
         sent_at,
         display_phone_number,
         direction,
         read_at
       FROM tenant_base.meta_webhook_messages
      WHERE tenant_schema = $1
     ),
     latest_per_contact AS (
       SELECT DISTINCT ON (conversation_id)
         conversation_id,
         wa_id,
         name,
         snippet,
         owner,
         sent_at,
         display_phone_number
       FROM base
       ORDER BY conversation_id, sent_at DESC NULLS LAST, conversation_id DESC
     ),
     unread_counts AS (
       SELECT conversation_id, COUNT(*)::int as unread_count
       FROM base
       WHERE direction = 'inbound' AND read_at IS NULL
       GROUP BY conversation_id
     )
     SELECT
       latest_per_contact.conversation_id,
       latest_per_contact.wa_id,
       latest_per_contact.name,
       latest_per_contact.snippet,
       latest_per_contact.owner,
       latest_per_contact.sent_at::text,
       latest_per_contact.display_phone_number,
       COALESCE(unread_counts.unread_count, 0) as unread_count
     FROM latest_per_contact
     LEFT JOIN unread_counts ON unread_counts.conversation_id = latest_per_contact.conversation_id
     ORDER BY latest_per_contact.sent_at DESC NULLS LAST
     LIMIT $2`,
    [tenantSchema, limit],
  )

  const conversations = result.rows.map((row) => {
    const unreadCount = toInt(row.unread_count)
    return {
      id: row.conversation_id,
      waId: row.wa_id,
      name: row.name,
      initials: getInitials(row.name),
      snippet: row.snippet,
      channel: "WhatsApp" as const,
      owner: row.owner,
      dateLabel: formatRelativeDate(row.sent_at),
      unreadCount,
      isUnread: unreadCount > 0,
    }
  })

  const phoneDisplay =
    result.rows.find((row) => (row.display_phone_number ?? "").trim().length > 0)?.display_phone_number?.trim() ?? ""

  return { conversations, phoneDisplay }
}

export async function getMessagesByConversation(
  conversationId: string,
  limit = 200,
  tenantSchemaRaw: string,
): Promise<ConversationMessage[]> {
  await ensureMetaWebhookTables()

  const tenantSchema = normalizeTenantSchema(tenantSchemaRaw)

  const where = conversationWhereSql(conversationId)
  const result = await pool.query<MessageRow>(
    `SELECT
       id,
       wamid,
       direction,
       message_type,
       message_text,
       media_id,
       media_mime_type,
       media_caption,
       media_filename,
       message_status,
       status_error,
       sent_at::text,
       raw_payload
     FROM tenant_base.meta_webhook_messages
     WHERE tenant_schema = $1
       AND ${where.sql}
     ORDER BY sent_at ASC NULLS LAST, id ASC
     LIMIT $3`,
    [tenantSchema, ...where.params, limit],
  )

  return result.rows.map((row) => {
    const direction = row.direction === "outbound" ? "outbound" : "inbound"
    const senderMeta = extractOutboundSenderMeta(row.raw_payload, direction)

    return {
      id: String(row.id),
      wamid: row.wamid,
      direction,
      owner: direction === "inbound" || senderMeta.type === "human" ? "Humano" : "IA",
      sentByType: senderMeta.type,
      sentByName: senderMeta.name,
      type: row.message_type?.trim() || "text",
      text: row.message_text,
      mediaId: row.media_id,
      mediaMimeType: row.media_mime_type,
      mediaCaption: row.media_caption,
      mediaFilename: row.media_filename,
      status: row.message_status,
      statusError: row.status_error,
      dateLabel: formatRelativeDate(row.sent_at),
      timeLabel: formatTimeLabel(row.sent_at),
      sentAt: row.sent_at,
    }
  })
}

export async function markConversationAsRead(conversationId: string, tenantSchemaRaw: string): Promise<number> {
  await ensureMetaWebhookTables()

  const tenantSchema = normalizeTenantSchema(tenantSchemaRaw)

  const where = conversationWhereSql(conversationId)
  const result = await pool.query(
    `UPDATE tenant_base.meta_webhook_messages
        SET read_at = NOW(),
            updated_at = NOW()
      WHERE tenant_schema = $1
        AND ${where.sql}
        AND direction = 'inbound'
        AND read_at IS NULL`,
    [tenantSchema, ...where.params],
  )

  return result.rowCount ?? 0
}

type SendResult = {
  wamid: string | null
  type: string
  text: string | null
  mediaId: string | null
  mediaMimeType: string | null
  mediaCaption: string | null
  mediaFilename: string | null
}

function buildGraphUrl(path: string, graphVersion: string): string {
  const version = graphVersion.trim() || "v22.0"
  return `https://graph.facebook.com/${version}/${path}`
}

async function graphRequest(path: string, init: RequestInit, token: string, graphVersion: string) {
  const response = await fetch(buildGraphUrl(path, graphVersion), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  })

  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string }
    [key: string]: unknown
  }

  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? "META_API_REQUEST_FAILED")
  }

  return payload
}

function inferMessageTypeFromMime(mimeType: string | null | undefined): "image" | "audio" | "video" | "document" {
  const mime = mimeType?.toLowerCase() ?? ""

  if (mime.startsWith("image/")) {
    return "image"
  }

  if (mime.startsWith("audio/")) {
    return "audio"
  }

  if (mime.startsWith("video/")) {
    return "video"
  }

  return "document"
}

export async function sendMessageToMeta(params: {
  tenantSchema: string
  to: string
  text?: string | null
  file?: File | null
  contactName?: string | null
  sentByType?: "bot" | "human"
  sentByName?: string | null
}): Promise<SendResult> {
  await ensureMetaWebhookTables()

  const tenantSchema = normalizeTenantSchema(params.tenantSchema)
  const config = await getMetaConfigByTenantSchema(tenantSchema)
  if (!config) {
    throw new Error("META_TENANT_CONFIG_MISSING")
  }

  const accessToken = config.metaAccessToken
  const phoneNumberId = config.metaPhoneNumberId
  const graphVersion = config.metaGraphVersion

  const to = params.to.trim()
  const text = params.text?.trim() ?? ""
  const file = params.file ?? null

  if (!to) {
    throw new Error("RECIPIENT_REQUIRED")
  }

  if (text.length === 0 && !file) {
    throw new Error("MESSAGE_EMPTY")
  }

  let messageType = "text"
  let mediaId: string | null = null
  let mediaMimeType: string | null = null
  let mediaCaption: string | null = null
  let mediaFilename: string | null = null

  if (file) {
    const formData = new FormData()
    formData.append("messaging_product", "whatsapp")
    formData.append("file", file, file.name || "archivo")

    const uploadPayload = (await graphRequest(`${phoneNumberId}/media`, {
      method: "POST",
      body: formData,
    }, accessToken, graphVersion)) as { id?: string }

    if (!uploadPayload.id) {
      throw new Error("MEDIA_UPLOAD_FAILED")
    }

    mediaId = uploadPayload.id
    mediaMimeType = file.type || null
    mediaFilename = file.name || null
    mediaCaption = text.length > 0 ? text : null
    messageType = inferMessageTypeFromMime(file.type)
  }

  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: messageType,
  }

  if (messageType === "text") {
    payload.text = {
      body: text,
      preview_url: false,
    }
  } else if (messageType === "image") {
    payload.image = {
      id: mediaId,
      caption: mediaCaption ?? undefined,
    }
  } else if (messageType === "audio") {
    payload.audio = {
      id: mediaId,
    }
  } else if (messageType === "video") {
    payload.video = {
      id: mediaId,
      caption: mediaCaption ?? undefined,
    }
  } else {
    payload.document = {
      id: mediaId,
      caption: mediaCaption ?? undefined,
      filename: mediaFilename ?? undefined,
    }
  }

  const sendPayload = (await graphRequest(`${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }, accessToken, graphVersion)) as {
    messages?: Array<{ id?: string }>
  }

  const wamid = sendPayload.messages?.[0]?.id?.trim() ?? null
  const sentAt = new Date().toISOString()
  const sentByType = params.sentByType === "human" ? "human" : "bot"
  const sentByName = (params.sentByName ?? "").trim() || (sentByType === "human" ? null : "Bot whatsapp")
  const outboundRawPayload = {
    sent_by: {
      type: sentByType,
      name: sentByName,
      at: sentAt,
    },
    meta_response: sendPayload,
  }

  await pool.query(
    `INSERT INTO tenant_base.meta_webhook_messages (
       tenant_schema,
       wamid,
       phone_number_id,
       wa_id,
       contact_name,
       direction,
       message_type,
       message_text,
       media_id,
       media_mime_type,
       media_caption,
       media_filename,
       message_status,
       sent_at,
       read_at,
       raw_payload,
       updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,'outbound',$6,$7,$8,$9,$10,$11,'sent',$12,NOW(),$13::jsonb,NOW()
     )
     ON CONFLICT (wamid) DO UPDATE
     SET message_status = EXCLUDED.message_status,
         updated_at = NOW()`,
    [
      tenantSchema,
      wamid,
      phoneNumberId,
      to,
      params.contactName?.trim() || null,
      messageType,
      text.length > 0 ? text : null,
      mediaId,
      mediaMimeType,
      mediaCaption,
      mediaFilename,
      sentAt,
      JSON.stringify(outboundRawPayload),
    ],
  )

  return {
    wamid,
    type: messageType,
    text: text.length > 0 ? text : null,
    mediaId,
    mediaMimeType,
    mediaCaption,
    mediaFilename,
  }
}

export async function fetchMetaMedia(
  mediaId: string,
  tenantSchemaRaw: string,
): Promise<{ buffer: ArrayBuffer; contentType: string; filename?: string }> {
  await ensureMetaWebhookTables()

  const tenantSchema = normalizeTenantSchema(tenantSchemaRaw)
  const config = await getMetaConfigByTenantSchema(tenantSchema)
  if (!config) {
    throw new Error("META_TENANT_CONFIG_MISSING")
  }

  const accessToken = config.metaAccessToken
  const graphVersion = config.metaGraphVersion

  const metadata = (await graphRequest(mediaId, {
    method: "GET",
  }, accessToken, graphVersion)) as {
    url?: string
    mime_type?: string
    file_size?: number
    id?: string
  }

  if (!metadata.url) {
    throw new Error("MEDIA_URL_NOT_FOUND")
  }

  const mediaResponse = await fetch(metadata.url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  })

  if (!mediaResponse.ok) {
    throw new Error("MEDIA_DOWNLOAD_FAILED")
  }

  return {
    buffer: await mediaResponse.arrayBuffer(),
    contentType: metadata.mime_type || mediaResponse.headers.get("content-type") || "application/octet-stream",
  }
}
