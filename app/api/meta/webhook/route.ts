import { NextResponse } from "next/server"

import { pool } from "@/lib/db"
import { ensureMetaWebhookTables } from "@/lib/meta-chat"
import {
  getMetaConfigByPhoneNumberId,
  getMetaConfigByVerifyToken,
} from "@/lib/meta-tenant-config"

export const runtime = "nodejs"

type MetaMessage = {
  id?: string
  from?: string
  timestamp?: string
  type?: string
  text?: { body?: string }
  reaction?: { message_id?: string; emoji?: string }
  image?: { id?: string; mime_type?: string; caption?: string }
  sticker?: { id?: string; mime_type?: string }
  audio?: { id?: string; mime_type?: string }
  document?: { id?: string; mime_type?: string; caption?: string; filename?: string }
  video?: { id?: string; mime_type?: string; caption?: string }
  video_note?: { id?: string; mime_type?: string; caption?: string }
  ptv?: { id?: string; mime_type?: string; caption?: string }
  location?: {
    latitude?: number | string
    longitude?: number | string
    name?: string
    address?: string
    url?: string
  }
  contacts?: Array<{
    name?: {
      formatted_name?: string
      first_name?: string
      last_name?: string
    }
    phones?: Array<{
      phone?: string
      wa_id?: string
      type?: string
    }>
  }>
  unsupported?: { type?: string }
}

type MetaStatus = {
  id?: string
  status?: string
  timestamp?: string
  recipient_id?: string
  errors?: Array<{ message?: string }>
}

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
        messages?: MetaMessage[]
        statuses?: MetaStatus[]
      }
    }>
  }>
}

const DEFAULT_N8N_TEST_WEBHOOK_URL =
  process.env.N8N_WEBHOOK_TEST_URL?.trim() ||
  process.env.N8N_WEBHOOK_URL?.trim() ||
  "https://n8n-production-d829.up.railway.app/webhook-test/21a5c328-b92c-4bf1-af6b-a4888d27db98"

type N8nInboundMessagePayload = {
  source: "meta-webhook"
  tenantSchema: string
  conversationId: string | null
  phoneNumberId: string | null
  displayPhoneNumber: string | null
  contact: {
    waId: string | null
    name: string | null
  }
  message: {
    wamid: string | null
    direction: "inbound"
    type: string
    text: string | null
    mediaId: string | null
    mediaMimeType: string | null
    mediaCaption: string | null
    mediaFilename: string | null
    sentAt: string | null
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

function toFiniteNumber(value: number | string | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function buildLocationText(location: MetaMessage["location"]): string | null {
  if (!location) {
    return null
  }

  const latitude = toFiniteNumber(location.latitude)
  const longitude = toFiniteNumber(location.longitude)
  const name = location.name?.trim() || ""
  const address = location.address?.trim() || ""
  const url = location.url?.trim() || (latitude !== null && longitude !== null ? `https://maps.google.com/?q=${latitude},${longitude}` : "")

  const lines = [
    name,
    address,
    latitude !== null && longitude !== null ? `Coordenadas: ${latitude}, ${longitude}` : "",
    url,
  ].filter((line) => line.length > 0)

  if (lines.length === 0) {
    return "[Ubicación]"
  }

  return lines.join("\n")
}

function buildContactText(contacts: MetaMessage["contacts"]): string | null {
  const firstContact = Array.isArray(contacts) ? contacts[0] : null
  if (!firstContact) {
    return null
  }

  const formattedName = firstContact.name?.formatted_name?.trim() || ""
  const firstName = firstContact.name?.first_name?.trim() || ""
  const lastName = firstContact.name?.last_name?.trim() || ""
  const name = formattedName || [firstName, lastName].filter((part) => part.length > 0).join(" ") || "Contacto"

  const phones = Array.isArray(firstContact.phones) ? firstContact.phones : []
  const phone = phones[0]?.phone?.trim() || ""
  const waId = phones[0]?.wa_id?.trim() || ""

  const lines = [
    `Nombre: ${name}`,
    phone ? `Teléfono: ${phone}` : "",
    waId ? `WhatsApp: ${waId}` : "",
  ].filter((line) => line.length > 0)

  return lines.length > 0 ? lines.join("\n") : "[Contacto compartido]"
}

function getMessagePayload(message: MetaMessage): {
  text: string | null
  mediaId: string | null
  mediaMimeType: string | null
  mediaCaption: string | null
  mediaFilename: string | null
  type: string
} {
  const rawType = message.type?.trim().toLowerCase() || ""
  const unsupportedSubtype = message.unsupported?.type?.trim().toLowerCase() || ""
  const type = rawType || "text"
  const videoPayload = message.video ?? message.video_note ?? message.ptv

  if (rawType === "unsupported" && (unsupportedSubtype === "video_note" || unsupportedSubtype === "ptv")) {
    return {
      text: "[Nota de video]",
      mediaId: videoPayload?.id?.trim() || null,
      mediaMimeType: videoPayload?.mime_type?.trim() || null,
      mediaCaption: videoPayload?.caption?.trim() || null,
      mediaFilename: null,
      type: unsupportedSubtype,
    }
  }

  if (rawType === "unsupported" && unsupportedSubtype === "poll_creation") {
    return {
      text: "[Encuesta de WhatsApp no compatible en Meta]",
      mediaId: null,
      mediaMimeType: null,
      mediaCaption: null,
      mediaFilename: null,
      type: "unsupported",
    }
  }

  if ((rawType === "video" || rawType === "video_note" || rawType === "ptv") || videoPayload) {
    return {
      text: videoPayload?.caption?.trim() || null,
      mediaId: videoPayload?.id?.trim() || null,
      mediaMimeType: videoPayload?.mime_type?.trim() || null,
      mediaCaption: videoPayload?.caption?.trim() || null,
      mediaFilename: null,
      type: "video",
    }
  }

  if (type === "reaction") {
    return {
      text: message.reaction?.emoji?.trim() || null,
      mediaId: null,
      mediaMimeType: null,
      mediaCaption: null,
      mediaFilename: null,
      type,
    }
  }

  if (type === "image") {
    return {
      text: message.image?.caption?.trim() || null,
      mediaId: message.image?.id?.trim() || null,
      mediaMimeType: message.image?.mime_type?.trim() || null,
      mediaCaption: message.image?.caption?.trim() || null,
      mediaFilename: null,
      type,
    }
  }

  if (type === "sticker") {
    return {
      text: null,
      mediaId: message.sticker?.id?.trim() || null,
      mediaMimeType: message.sticker?.mime_type?.trim() || null,
      mediaCaption: null,
      mediaFilename: null,
      type,
    }
  }

  if (type === "audio") {
    return {
      text: null,
      mediaId: message.audio?.id?.trim() || null,
      mediaMimeType: message.audio?.mime_type?.trim() || null,
      mediaCaption: null,
      mediaFilename: null,
      type,
    }
  }

  if (type === "document") {
    return {
      text: message.document?.caption?.trim() || null,
      mediaId: message.document?.id?.trim() || null,
      mediaMimeType: message.document?.mime_type?.trim() || null,
      mediaCaption: message.document?.caption?.trim() || null,
      mediaFilename: message.document?.filename?.trim() || null,
      type,
    }
  }

  if (type === "video") {
    return {
      text: message.video?.caption?.trim() || null,
      mediaId: message.video?.id?.trim() || null,
      mediaMimeType: message.video?.mime_type?.trim() || null,
      mediaCaption: message.video?.caption?.trim() || null,
      mediaFilename: null,
      type,
    }
  }

  if (type === "location") {
    return {
      text: buildLocationText(message.location),
      mediaId: null,
      mediaMimeType: null,
      mediaCaption: null,
      mediaFilename: null,
      type,
    }
  }

  if (type === "contacts") {
    return {
      text: buildContactText(message.contacts),
      mediaId: null,
      mediaMimeType: null,
      mediaCaption: null,
      mediaFilename: null,
      type,
    }
  }

  return {
    text: message.text?.body?.trim() || null,
    mediaId: null,
    mediaMimeType: null,
    mediaCaption: null,
    mediaFilename: null,
    type,
  }
}

async function sendInboundMessageToN8n(
  url: string,
  payload: N8nInboundMessagePayload,
  apiKey: string | null,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }

  if (apiKey?.trim()) {
    headers["x-api-key"] = apiKey.trim()
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8_000),
  })

  if (!response.ok) {
    const responseBody = await response.text().catch(() => "")
    throw new Error(
      `n8n webhook responded with ${response.status}${responseBody ? `: ${responseBody.slice(0, 300)}` : ""}`,
    )
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  const requestedToken = token?.trim() ?? ""
  const configFromTable = requestedToken ? await getMetaConfigByVerifyToken(requestedToken) : null

  if (mode === "subscribe" && challenge && Boolean(configFromTable)) {
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

    const entries = Array.isArray(payload.entry) ? payload.entry : []
    let storedMessages = 0
    let updatedStatuses = 0
    let forwardedToN8n = 0

    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes : []

      for (const change of changes) {
        if (change.field !== "messages") {
          continue
        }

        const value = change.value
        const metadata = value?.metadata
        const phoneNumberId = metadata?.phone_number_id?.trim() || ""
        const configByPhone = phoneNumberId ? await getMetaConfigByPhoneNumberId(phoneNumberId) : null

        const tenantSchema = configByPhone?.tenantSchema ?? null
        const n8nWebhookUrl = configByPhone?.n8nWebhookUrl?.trim() || DEFAULT_N8N_TEST_WEBHOOK_URL
        const n8nApiKey = configByPhone?.n8nApiKey?.trim() || null

        if (!tenantSchema) {
          console.warn("Meta webhook ignorado: phone_number_id sin configuración tenant", {
            phoneNumberId: phoneNumberId || null,
          })
          continue
        }

        const contact = value?.contacts?.[0]
        const messages = Array.isArray(value?.messages) ? value.messages : []
        const statuses = Array.isArray(value?.statuses) ? value.statuses : []

        for (const message of messages) {
          const waId = message.from?.trim() || contact?.wa_id?.trim() || null
          const contactName = contact?.profile?.name?.trim() || null
          const sentAt = parseUnixTimestampToIso(message.timestamp)
          const normalized = getMessagePayload(message)
          const conversationId = waId || null

          await pool.query(
            `INSERT INTO tenant_base.meta_webhook_messages (
               tenant_schema,
               wamid,
               phone_number_id,
               display_phone_number,
               wa_id,
               contact_name,
               direction,
               message_type,
               message_text,
               media_id,
               media_mime_type,
               media_caption,
               media_filename,
               sent_at,
               raw_payload,
               updated_at
             )
             VALUES ($1,$2,$3,$4,$5,$6,'inbound',$7,$8,$9,$10,$11,$12,$13,$14::jsonb,NOW())
             ON CONFLICT (wamid) DO UPDATE
               SET wa_id = COALESCE(EXCLUDED.wa_id, tenant_base.meta_webhook_messages.wa_id),
                   contact_name = COALESCE(EXCLUDED.contact_name, tenant_base.meta_webhook_messages.contact_name),
                   message_type = COALESCE(EXCLUDED.message_type, tenant_base.meta_webhook_messages.message_type),
                   message_text = COALESCE(EXCLUDED.message_text, tenant_base.meta_webhook_messages.message_text),
                   media_id = COALESCE(EXCLUDED.media_id, tenant_base.meta_webhook_messages.media_id),
                   media_mime_type = COALESCE(EXCLUDED.media_mime_type, tenant_base.meta_webhook_messages.media_mime_type),
                   media_caption = COALESCE(EXCLUDED.media_caption, tenant_base.meta_webhook_messages.media_caption),
                   media_filename = COALESCE(EXCLUDED.media_filename, tenant_base.meta_webhook_messages.media_filename),
                   sent_at = COALESCE(EXCLUDED.sent_at, tenant_base.meta_webhook_messages.sent_at),
                   raw_payload = EXCLUDED.raw_payload,
                   updated_at = NOW()
             WHERE tenant_base.meta_webhook_messages.tenant_schema = EXCLUDED.tenant_schema`,
            [
              tenantSchema,
              message.id?.trim() || null,
              metadata?.phone_number_id?.trim() || null,
              metadata?.display_phone_number?.trim() || null,
              waId,
              contactName,
              normalized.type,
              normalized.text,
              normalized.mediaId,
              normalized.mediaMimeType,
              normalized.mediaCaption,
              normalized.mediaFilename,
              sentAt,
              JSON.stringify({
                source: "meta-webhook",
                entryId: entry.id?.trim() || null,
                metadata: {
                  phoneNumberId: metadata?.phone_number_id?.trim() || null,
                  displayPhoneNumber: metadata?.display_phone_number?.trim() || null,
                },
                contact: {
                  waId,
                  name: contactName,
                },
                message,
              }),
            ],
          )

          storedMessages += 1

          try {
            await sendInboundMessageToN8n(
              n8nWebhookUrl,
              {
                source: "meta-webhook",
                tenantSchema,
                conversationId,
                phoneNumberId: metadata?.phone_number_id?.trim() || null,
                displayPhoneNumber: metadata?.display_phone_number?.trim() || null,
                contact: {
                  waId,
                  name: contactName,
                },
                message: {
                  wamid: message.id?.trim() || null,
                  direction: "inbound",
                  type: normalized.type,
                  text: normalized.text,
                  mediaId: normalized.mediaId,
                  mediaMimeType: normalized.mediaMimeType,
                  mediaCaption: normalized.mediaCaption,
                  mediaFilename: normalized.mediaFilename,
                  sentAt,
                },
              },
              n8nApiKey,
            )

            forwardedToN8n += 1
          } catch (forwardError) {
            console.error("Meta webhook: no se pudo reenviar mensaje entrante a n8n", {
              tenantSchema,
              wamid: message.id?.trim() || null,
              webhookUrl: n8nWebhookUrl,
              error: forwardError,
            })
          }
        }

        for (const status of statuses) {
          const wamid = status.id?.trim()
          if (!wamid) {
            continue
          }

           const statusValue = status.status?.trim() || null
           const statusError = status.errors?.[0]?.message?.trim() || null
           const readAt = statusValue === "read" ? parseUnixTimestampToIso(status.timestamp) : null

           await pool.query(
             `INSERT INTO tenant_base.meta_webhook_messages (
                tenant_schema,
                wamid,
                phone_number_id,
                wa_id,
                direction,
                message_status,
                status_error,
                read_at,
                updated_at
              ) VALUES (
                $1,$2,$3,$4,'outbound',$5,$6,$7::timestamptz,NOW()
              )
              ON CONFLICT (wamid) DO UPDATE
              SET tenant_schema = COALESCE(tenant_base.meta_webhook_messages.tenant_schema, EXCLUDED.tenant_schema),
                  phone_number_id = COALESCE(tenant_base.meta_webhook_messages.phone_number_id, EXCLUDED.phone_number_id),
                  wa_id = COALESCE(tenant_base.meta_webhook_messages.wa_id, EXCLUDED.wa_id),
                  status_error = COALESCE(EXCLUDED.status_error, tenant_base.meta_webhook_messages.status_error),
                  read_at = COALESCE(EXCLUDED.read_at, tenant_base.meta_webhook_messages.read_at),
                  message_status = CASE
                    WHEN LOWER(COALESCE(tenant_base.meta_webhook_messages.message_status, '')) = 'read' THEN tenant_base.meta_webhook_messages.message_status
                    WHEN LOWER(COALESCE(EXCLUDED.message_status, '')) = 'read' THEN EXCLUDED.message_status
                    WHEN LOWER(COALESCE(tenant_base.meta_webhook_messages.message_status, '')) = 'delivered' AND LOWER(COALESCE(EXCLUDED.message_status, '')) = 'sent' THEN tenant_base.meta_webhook_messages.message_status
                    WHEN LOWER(COALESCE(EXCLUDED.message_status, '')) = 'delivered' THEN EXCLUDED.message_status
                    WHEN LOWER(COALESCE(tenant_base.meta_webhook_messages.message_status, '')) = 'failed' AND LOWER(COALESCE(EXCLUDED.message_status, '')) = 'sent' THEN tenant_base.meta_webhook_messages.message_status
                    ELSE COALESCE(EXCLUDED.message_status, tenant_base.meta_webhook_messages.message_status)
                  END,
                  updated_at = NOW()`,
             [
               tenantSchema,
               wamid,
               metadata?.phone_number_id?.trim() || null,
               status.recipient_id?.trim() || null,
               statusValue,
               statusError,
               readAt,
             ],
           )

           updatedStatuses += 1
         }
       }
     }

     console.log("Meta webhook event received", {
       object: payload.object,
       entries: entries.length,
       storedMessages,
       forwardedToN8n,
       updatedStatuses,
     })

     return NextResponse.json({ ok: true, storedMessages, forwardedToN8n, updatedStatuses }, { status: 200 })
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
