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
  reactionEmoji: string | null
  reactionToWamid: string | null
  reactionToSnippet: string | null
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

type ReactionMeta = {
  emoji: string | null
  targetWamid: string | null
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
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
      .format(date)
      .replace(" AM", " am")
      .replace(" PM", " pm")
  }

  const startNow = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayDiff = Math.floor((startNow.getTime() - startDate.getTime()) / 86400000)

  if (dayDiff === 1) {
    return "ayer"
  }

  if (dayDiff === 2) {
    return "anteayer"
  }

  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`
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

  const digits = normalizePhoneDigits(normalized)

  return {
    sql: "NULLIF(regexp_replace(COALESCE(wa_id, ''), '\\D+', '', 'g'), '') = $2::text",
    params: [digits || normalized],
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

function trimOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value
        .map((item) => asRecord(item))
        .filter((item): item is Record<string, unknown> => Boolean(item))
    : []
}

function normalizeReactionRecord(value: unknown): ReactionMeta {
  const record = asRecord(value)
  if (!record) {
    return { emoji: null, targetWamid: null }
  }

  return {
    emoji: trimOrNull(record.emoji),
    targetWamid: trimOrNull(record.message_id),
  }
}

function extractReactionMeta(rawPayload: unknown): ReactionMeta {
  const payload = asRecord(rawPayload)
  if (!payload) {
    return { emoji: null, targetWamid: null }
  }

  const messageRecord = asRecord(payload.message)
  const fromMessage = normalizeReactionRecord(messageRecord?.reaction)
  if (fromMessage.emoji || fromMessage.targetWamid) {
    return fromMessage
  }

  const fromRoot = normalizeReactionRecord(payload.reaction)
  if (fromRoot.emoji || fromRoot.targetWamid) {
    return fromRoot
  }

  // Compatibilidad con payload legado guardado completo: entry[].changes[].value.messages[].reaction
  const entries = asRecordArray(payload.entry)
  for (const entry of entries) {
    const changes = asRecordArray(entry.changes)
    for (const change of changes) {
      const value = asRecord(change.value)
      const messages = asRecordArray(value?.messages)
      for (const message of messages) {
        const legacy = normalizeReactionRecord(message.reaction)
        if (legacy.emoji || legacy.targetWamid) {
          return legacy
        }
      }
    }
  }

  return { emoji: null, targetWamid: null }
}

function extractStickerMediaMeta(rawPayload: unknown): { mediaId: string | null; mediaMimeType: string | null } {
  const payload = asRecord(rawPayload)
  if (!payload) {
    return { mediaId: null, mediaMimeType: null }
  }

  const messageRecord = asRecord(payload.message)
  const messageSticker = asRecord(messageRecord?.sticker)
  const messageStickerId = trimOrNull(messageSticker?.id)
  if (messageStickerId) {
    return {
      mediaId: messageStickerId,
      mediaMimeType: trimOrNull(messageSticker?.mime_type),
    }
  }

  // Compatibilidad con payload legado guardado completo: entry[].changes[].value.messages[].sticker
  const entries = asRecordArray(payload.entry)
  for (const entry of entries) {
    const changes = asRecordArray(entry.changes)
    for (const change of changes) {
      const value = asRecord(change.value)
      const messages = asRecordArray(value?.messages)
      for (const message of messages) {
        const type = trimOrNull(message.type)?.toLowerCase()
        if (type !== "sticker") {
          continue
        }

        const sticker = asRecord(message.sticker)
        const stickerId = trimOrNull(sticker?.id)
        if (stickerId) {
          return {
            mediaId: stickerId,
            mediaMimeType: trimOrNull(sticker?.mime_type),
          }
        }
      }
    }
  }

  return { mediaId: null, mediaMimeType: null }
}

function messageTypePlaceholder(type: string | null | undefined): string {
  const normalized = (type ?? "").trim().toLowerCase()

  switch (normalized) {
    case "image":
      return "[Imagen]"
    case "sticker":
      return "[Sticker]"
    case "audio":
      return "[Audio]"
    case "document":
      return "[Documento]"
    case "video":
      return "[Video]"
    case "reaction":
      return "[Reacción]"
    default:
      return "Sin contenido"
  }
}

function buildMessageSnippet(text: string | null | undefined, type: string | null | undefined): string {
  const trimmed = text?.trim()
  if (trimmed) {
    return trimmed
  }

  return messageTypePlaceholder(type)
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
         NULLIF(regexp_replace(COALESCE(wa_id, ''), '\\D+', '', 'g'), '') as wa_id_digits,
         COALESCE(
           NULLIF(regexp_replace(COALESCE(wa_id, ''), '\\D+', '', 'g'), ''),
           concat('unknown-', id::text)
         ) as conversation_id,
         COALESCE(
           NULLIF(trim(contact_name), ''),
           NULLIF(regexp_replace(COALESCE(wa_id, ''), '\\D+', '', 'g'), ''),
           'Contacto sin nombre'
         ) as name,
         COALESCE(NULLIF(trim(message_text), ''),
                  CASE
                    WHEN message_type = 'image' THEN '[Imagen]'
                    WHEN message_type = 'sticker' THEN '[Sticker]'
                    WHEN message_type = 'audio' THEN '[Audio]'
                    WHEN message_type = 'document' THEN '[Documento]'
                    WHEN message_type = 'video' THEN '[Video]'
                    WHEN message_type = 'reaction' THEN '[Reacción]'
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
         wa_id_digits,
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
       latest_per_contact.wa_id_digits AS wa_id,
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
    `WITH recent AS (
       SELECT
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
       ORDER BY sent_at DESC NULLS LAST, id DESC
       LIMIT $3
     )
     SELECT *
       FROM recent
      ORDER BY sent_at ASC NULLS LAST, id ASC`,
    [tenantSchema, ...where.params, limit],
  )

  const rowsByWamid = new Map<string, { text: string | null; type: string | null }>()
  for (const row of result.rows) {
    if (row.wamid) {
      rowsByWamid.set(row.wamid, {
        text: row.message_text,
        type: row.message_type,
      })
    }
  }

  const missingReactionTargetWamids = new Set<string>()

  const mappedRows = result.rows.map((row) => {
    const direction = row.direction === "outbound" ? "outbound" : "inbound"
    const senderMeta = extractOutboundSenderMeta(row.raw_payload, direction)
    const reactionMeta = row.message_type?.trim() === "reaction" ? extractReactionMeta(row.raw_payload) : { emoji: null, targetWamid: null }

    if (reactionMeta.targetWamid && !rowsByWamid.has(reactionMeta.targetWamid)) {
      missingReactionTargetWamids.add(reactionMeta.targetWamid)
    }

    return {
      row,
      direction,
      senderMeta,
      reactionMeta,
    }
  })

  const reactionTargetSnippets = new Map<string, string>()

  for (const [wamid, value] of rowsByWamid.entries()) {
    reactionTargetSnippets.set(wamid, buildMessageSnippet(value.text, value.type))
  }

  if (missingReactionTargetWamids.size > 0) {
    const missingIds = Array.from(missingReactionTargetWamids)
    const targetsResult = await pool.query<{ wamid: string | null; message_text: string | null; message_type: string | null }>(
      `SELECT wamid, message_text, message_type
         FROM tenant_base.meta_webhook_messages
        WHERE tenant_schema = $1
          AND wamid = ANY($2::text[])`,
      [tenantSchema, missingIds],
    )

    for (const targetRow of targetsResult.rows) {
      const wamid = targetRow.wamid?.trim() || null
      if (!wamid) {
        continue
      }

      reactionTargetSnippets.set(wamid, buildMessageSnippet(targetRow.message_text, targetRow.message_type))
    }
  }

  return mappedRows.map(({ row, direction, senderMeta, reactionMeta }, index) => {
    const reactionEmoji = reactionMeta.emoji ?? trimOrNull(row.message_text)

    let fallbackPreviousSnippet: string | null = null
    if (row.message_type?.trim() === "reaction") {
      for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
        const previous = mappedRows[previousIndex]?.row
        if (!previous || previous.message_type?.trim() === "reaction") {
          continue
        }

        fallbackPreviousSnippet = buildMessageSnippet(previous.message_text, previous.message_type)
        break
      }
    }

    const reactionToSnippet = reactionMeta.targetWamid
      ? reactionTargetSnippets.get(reactionMeta.targetWamid) ?? "[Mensaje no disponible]"
      : fallbackPreviousSnippet

    const messageText =
      row.message_type?.trim() === "reaction"
        ? reactionEmoji
          ? `Reaccionó ${reactionEmoji}`
          : "Reaccionó a un mensaje"
        : row.message_text

    const normalizedType = row.message_type?.trim() || "text"
    const stickerMediaMeta =
      normalizedType === "sticker" && !row.media_id
        ? extractStickerMediaMeta(row.raw_payload)
        : { mediaId: null, mediaMimeType: null }
    const mediaId = row.media_id ?? stickerMediaMeta.mediaId
    const mediaMimeType = row.media_mime_type ?? stickerMediaMeta.mediaMimeType

    return {
      id: String(row.id),
      wamid: row.wamid,
      direction,
      owner: direction === "inbound" || senderMeta.type === "human" ? "Humano" : "IA",
      sentByType: senderMeta.type,
      sentByName: senderMeta.name,
      type: normalizedType,
      text: messageText,
      mediaId,
      mediaMimeType,
      mediaCaption: row.media_caption,
      mediaFilename: row.media_filename,
      status: row.message_status,
      statusError: row.status_error,
      reactionEmoji,
      reactionToWamid: reactionMeta.targetWamid,
      reactionToSnippet,
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
  reaction?: { messageId: string; emoji: string } | null
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
  const reactionMessageId = params.reaction?.messageId?.trim() ?? ""
  const reactionEmoji = params.reaction?.emoji?.trim() ?? ""
  const hasReaction = reactionMessageId.length > 0 && reactionEmoji.length > 0

  if (!to) {
    throw new Error("RECIPIENT_REQUIRED")
  }

  if (!hasReaction && text.length === 0 && !file) {
    throw new Error("MESSAGE_EMPTY")
  }

  let messageType = "text"
  let mediaId: string | null = null
  let mediaMimeType: string | null = null
  let mediaCaption: string | null = null
  let mediaFilename: string | null = null

  if (hasReaction) {
    messageType = "reaction"
  } else if (file) {
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
  } else if (messageType === "reaction") {
    payload.reaction = {
      message_id: reactionMessageId,
      emoji: reactionEmoji,
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
    reaction:
      messageType === "reaction"
        ? {
            message_id: reactionMessageId,
            emoji: reactionEmoji,
          }
        : undefined,
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
      messageType === "reaction" ? reactionEmoji : text.length > 0 ? text : null,
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
    text: messageType === "reaction" ? reactionEmoji : text.length > 0 ? text : null,
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
