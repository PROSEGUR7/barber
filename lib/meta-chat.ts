import { pool } from "@/lib/db"

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

function conversationWhereSql(conversationId: string): { sql: string; params: string[] } {
  const normalized = sanitizeConversationId(conversationId)

  if (normalized.startsWith("unknown-")) {
    return {
      sql: "COALESCE(NULLIF(trim(wa_id), ''), concat('unknown-', id::text)) = $1",
      params: [normalized],
    }
  }

  return {
    sql: "NULLIF(trim(wa_id), '') = $1",
    params: [normalized],
  }
}

export async function ensureMetaWebhookTables() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await pool.query("SELECT pg_advisory_lock(hashtext('tenant_base.meta_webhook_messages_ddl'))")

      try {
        await pool.query(`
          CREATE SEQUENCE IF NOT EXISTS tenant_base.meta_webhook_messages_id_seq
        `)

        await pool.query(`
          CREATE TABLE IF NOT EXISTS tenant_base.meta_webhook_messages (
            id BIGINT PRIMARY KEY DEFAULT nextval('tenant_base.meta_webhook_messages_id_seq'::regclass),
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
          ALTER SEQUENCE tenant_base.meta_webhook_messages_id_seq
          OWNED BY tenant_base.meta_webhook_messages.id
        `)

        await pool.query(`
          CREATE INDEX IF NOT EXISTS meta_webhook_messages_wa_id_sent_idx
            ON tenant_base.meta_webhook_messages (wa_id, sent_at DESC, id DESC)
        `)

        await pool.query(`
          CREATE INDEX IF NOT EXISTS meta_webhook_messages_unread_idx
            ON tenant_base.meta_webhook_messages (wa_id, id)
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

export async function getConversations(limit: number): Promise<{ conversations: ConversationSummary[]; phoneDisplay: string }> {
  await ensureMetaWebhookTables()

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
         CASE WHEN direction = 'inbound' THEN 'Humano' ELSE 'IA' END as owner,
         sent_at,
         display_phone_number,
         direction,
         read_at
       FROM tenant_base.meta_webhook_messages
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
     LIMIT $1`,
    [limit],
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

export async function getMessagesByConversation(conversationId: string, limit = 200): Promise<ConversationMessage[]> {
  await ensureMetaWebhookTables()

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
       sent_at::text
     FROM tenant_base.meta_webhook_messages
     WHERE ${where.sql}
     ORDER BY sent_at ASC NULLS LAST, id ASC
     LIMIT $2`,
    [...where.params, limit],
  )

  return result.rows.map((row) => {
    const direction = row.direction === "outbound" ? "outbound" : "inbound"
    return {
      id: String(row.id),
      wamid: row.wamid,
      direction,
      owner: direction === "inbound" ? "Humano" : "IA",
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

export async function markConversationAsRead(conversationId: string): Promise<number> {
  await ensureMetaWebhookTables()

  const where = conversationWhereSql(conversationId)
  const result = await pool.query(
    `UPDATE tenant_base.meta_webhook_messages
        SET read_at = NOW(),
            updated_at = NOW()
      WHERE ${where.sql}
        AND direction = 'inbound'
        AND read_at IS NULL`,
    where.params,
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

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name}_MISSING`)
  }
  return value
}

function buildGraphUrl(path: string): string {
  const version = process.env.META_GRAPH_VERSION?.trim() || "v22.0"
  return `https://graph.facebook.com/${version}/${path}`
}

async function graphRequest(path: string, init: RequestInit, token: string) {
  const response = await fetch(buildGraphUrl(path), {
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
  to: string
  text?: string | null
  file?: File | null
  contactName?: string | null
}): Promise<SendResult> {
  await ensureMetaWebhookTables()

  const accessToken = requiredEnv("META_ACCESS_TOKEN")
  const phoneNumberId = requiredEnv("META_PHONE_NUMBER_ID")

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
    }, accessToken)) as { id?: string }

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
  }, accessToken)) as {
    messages?: Array<{ id?: string }>
  }

  const wamid = sendPayload.messages?.[0]?.id?.trim() ?? null
  const sentAt = new Date().toISOString()

  await pool.query(
    `INSERT INTO tenant_base.meta_webhook_messages (
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
       $1,$2,$3,$4,'outbound',$5,$6,$7,$8,$9,$10,'sent',$11,NOW(),$12::jsonb,NOW()
     )
     ON CONFLICT (wamid) DO UPDATE
     SET message_status = EXCLUDED.message_status,
         updated_at = NOW()`,
    [
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
      JSON.stringify(sendPayload),
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

export async function fetchMetaMedia(mediaId: string): Promise<{ buffer: ArrayBuffer; contentType: string; filename?: string }> {
  const accessToken = requiredEnv("META_ACCESS_TOKEN")

  const metadata = (await graphRequest(mediaId, {
    method: "GET",
  }, accessToken)) as {
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
