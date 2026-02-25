import { NextResponse } from "next/server"

import { pool } from "@/lib/db"

export const runtime = "nodejs"

type MetaWebhookBody = {
  object?: string
  entry?: Array<{
    id?: string
    changes?: Array<{
      field?: string
      value?: {
        metadata?: {
          display_phone_number?: string
          phone_number_id?: string
        }
        contacts?: Array<{
          profile?: {
            name?: string
          }
          wa_id?: string
        }>
        messages?: Array<{
          id?: string
          from?: string
          timestamp?: string
          type?: string
          text?: {
            body?: string
          }
        }>
      }
    }>
  }>
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

function parseUnixTimestampToIso(value: string | undefined): string | null {
  if (!value) {
    return null
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return null
  }

  return new Date(parsed * 1000).toISOString()
}

export async function GET(request: Request) {
  const verifyToken = process.env.META_VERIFY_TOKEN?.trim()

  if (!verifyToken) {
    return NextResponse.json(
      {
        ok: false,
        error: "META_VERIFY_TOKEN no está configurado en el servidor.",
      },
      { status: 503 },
    )
  }

  const { searchParams } = new URL(request.url)
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    })
  }

  return NextResponse.json(
    {
      ok: false,
      error: "Webhook verification failed.",
    },
    { status: 403 },
  )
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as MetaWebhookBody

    if (payload.object !== "whatsapp_business_account") {
      return NextResponse.json({ ok: true, ignored: true }, { status: 200 })
    }

    await ensureMetaWebhookTables()

    let storedMessages = 0
    const entries = Array.isArray(payload.entry) ? payload.entry : []

    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes : []

      for (const change of changes) {
        if (change.field !== "messages") {
          continue
        }

        const value = change.value
        const metadata = value?.metadata
        const contact = value?.contacts?.[0]
        const messages = Array.isArray(value?.messages) ? value.messages : []

        for (const message of messages) {
          const waId = message.from?.trim() || contact?.wa_id?.trim() || null
          const contactName = contact?.profile?.name?.trim() || null
          const textBody = message.text?.body?.trim() || ""
          const sentAt = parseUnixTimestampToIso(message.timestamp)

          await pool.query(
            `INSERT INTO tenant_base.meta_webhook_messages (
               wamid,
               phone_number_id,
               display_phone_number,
               wa_id,
               contact_name,
               direction,
               message_type,
               message_text,
               sent_at,
               raw_payload
             )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             ON CONFLICT (wamid) DO NOTHING`,
            [
              message.id?.trim() || null,
              metadata?.phone_number_id?.trim() || null,
              metadata?.display_phone_number?.trim() || null,
              waId,
              contactName,
              "inbound",
              message.type?.trim() || null,
              textBody.length > 0 ? textBody : null,
              sentAt,
              JSON.stringify(payload),
            ],
          )

          storedMessages += 1
        }
      }
    }

    console.log("Meta webhook event received", {
      object: payload.object,
      entries: entries.length,
      storedMessages,
    })

    return NextResponse.json({ ok: true, storedMessages }, { status: 200 })
  } catch (error) {
    console.error("Meta webhook parse error", error)
    return NextResponse.json(
      {
        ok: false,
        error: "No se pudo procesar el webhook de Meta.",
      },
      { status: 400 },
    )
  }
}
