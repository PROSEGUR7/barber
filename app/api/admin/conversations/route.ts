import { NextResponse } from "next/server"

import { pool } from "@/lib/db"

export const runtime = "nodejs"

type ConversationRow = {
  conversation_id: string
  name: string
  snippet: string
  owner: "Humano" | "IA"
  sent_at: string | null
  display_phone_number: string | null
}

type ConversationPreview = {
  id: string
  name: string
  initials: string
  snippet: string
  channel: "WhatsApp"
  owner: "Humano" | "IA"
  dateLabel: string
  isUnread: boolean
}

function jsonError(status: number, payload: { error: string; code?: string; detail?: string }) {
  return NextResponse.json(
    {
      ok: false,
      ...payload,
    },
    { status },
  )
}

async function ensureMetaWebhookTables() {
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
      sent_at TIMESTAMPTZ,
      raw_payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

    await pool.query(`
      ALTER SEQUENCE tenant_base.meta_webhook_messages_id_seq
      OWNED BY tenant_base.meta_webhook_messages.id
    `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS meta_webhook_messages_wa_id_sent_idx
      ON tenant_base.meta_webhook_messages (wa_id, sent_at DESC, id DESC)
  `)
  } finally {
    await pool.query("SELECT pg_advisory_unlock(hashtext('tenant_base.meta_webhook_messages_ddl'))")
  }
}

function formatRelativeDate(value: string | null | undefined): string {
  if (!value) {
    return "sin fecha"
  }

  const parsed = Number(value)
  const date = Number.isFinite(parsed) ? new Date(parsed * 1000) : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "sin fecha"
  }

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const dayMs = 1000 * 60 * 60 * 24
  const diffDays = Math.floor(diffMs / dayMs)

  if (diffDays <= 0) {
    return "hoy"
  }

  if (diffDays === 1) {
    return "ayer"
  }

  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
  }).format(date)
}

function getInitials(name: string): string {
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

export async function GET(request: Request) {
  const url = new URL(request.url)
  const limitParam = Number(url.searchParams.get("limit") ?? "20")
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 50) : 20

  try {
    await ensureMetaWebhookTables()

    const result = await pool.query<ConversationRow>(
      `WITH latest_per_contact AS (
         SELECT DISTINCT ON (COALESCE(NULLIF(trim(wa_id), ''), concat('unknown-', id::text)))
           COALESCE(NULLIF(trim(wa_id), ''), concat('unknown-', id::text)) as conversation_id,
           COALESCE(NULLIF(trim(contact_name), ''), NULLIF(trim(wa_id), ''), 'Contacto sin nombre') as name,
           COALESCE(NULLIF(trim(message_text), ''), 'Sin mensaje de texto') as snippet,
           CASE WHEN direction = 'inbound' THEN 'Humano' ELSE 'IA' END as owner,
           sent_at,
           display_phone_number
         FROM tenant_base.meta_webhook_messages
         ORDER BY COALESCE(NULLIF(trim(wa_id), ''), concat('unknown-', id::text)), sent_at DESC NULLS LAST, id DESC
       )
       SELECT conversation_id, name, snippet, owner, sent_at::text, display_phone_number
       FROM latest_per_contact
       ORDER BY sent_at DESC NULLS LAST
       LIMIT $1`,
      [limit],
    )

    const conversations: ConversationPreview[] = result.rows.map((row) => ({
      id: row.conversation_id,
      name: row.name,
      initials: getInitials(row.name),
      snippet: row.snippet,
      channel: "WhatsApp",
      owner: row.owner,
      dateLabel: formatRelativeDate(row.sent_at),
      isUnread: false,
    }))

    const phoneDisplay =
      result.rows.find((row) => (row.display_phone_number ?? "").trim().length > 0)?.display_phone_number?.trim() ??
      ""

    return NextResponse.json(
      {
        ok: true,
        connected: Boolean(process.env.META_VERIFY_TOKEN?.trim()),
        phone: {
          id: process.env.META_PHONE_NUMBER_ID?.trim() ?? "",
          displayPhoneNumber: phoneDisplay,
          verifiedName: "",
          qualityRating: "",
        },
        conversations,
        warnings: [],
        source: "webhook",
      },
      { status: 200 },
    )
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Error inesperado al cargar conversaciones"
    console.error("Admin conversations API error", error)

    return jsonError(500, {
      code: "CONVERSATIONS_READ_ERROR",
      error: "No se pudieron cargar las conversaciones almacenadas del webhook.",
      detail,
    })
  }
}
