import { NextResponse } from "next/server"

export const runtime = "nodejs"

type MetaGraphError = {
  message?: string
  type?: string
  code?: number
}

type MetaGraphEnvelope<T> = {
  data?: T[]
  error?: MetaGraphError
}

type MetaPhoneInfo = {
  id?: string
  display_phone_number?: string
  verified_name?: string
  quality_rating?: string
}

type MetaConversationMessage = {
  id?: string
  from?: string
  timestamp?: string
  type?: string
  text?: {
    body?: string
  }
}

type MetaConversation = {
  id?: string
  updated_time?: string
  expiration_timestamp?: string
  messages?: {
    data?: MetaConversationMessage[]
  }
  participants?: {
    data?: Array<{ name?: string; wa_id?: string }>
  }
  origin?: {
    type?: string
  }
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

function buildGraphUrl(path: string, query?: Record<string, string>) {
  const version = process.env.META_GRAPH_VERSION?.trim() || "v22.0"
  const url = new URL(`https://graph.facebook.com/${version}/${path}`)

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value)
    }
  }

  return url.toString()
}

function getInitials(name: string): string {
  const chunks = name
    .split(/\s+/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)

  if (chunks.length === 0) {
    return "--"
  }

  return chunks
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() ?? "")
    .join("")
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

async function graphGet<T>(path: string, token: string, query?: Record<string, string>): Promise<T> {
  const response = await fetch(buildGraphUrl(path, query), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  })

  const payload = (await response.json().catch(() => ({}))) as T & { error?: MetaGraphError }

  if (!response.ok || payload.error) {
    const message = payload.error?.message ?? "Error al consultar Meta Graph API"
    throw new Error(message)
  }

  return payload
}

function normalizeConversation(item: MetaConversation): ConversationPreview | null {
  const id = item.id?.trim()
  if (!id) {
    return null
  }

  const participant = item.participants?.data?.[0]
  const participantName = participant?.name?.trim() || participant?.wa_id?.trim() || `Contacto ${id.slice(-4)}`

  const latestMessage = item.messages?.data?.[0]
  const snippet = latestMessage?.text?.body?.trim() || "Sin mensajes recientes"

  return {
    id,
    name: participantName,
    initials: getInitials(participantName),
    snippet,
    channel: "WhatsApp",
    owner: latestMessage?.from ? "Humano" : "IA",
    dateLabel: formatRelativeDate(latestMessage?.timestamp ?? item.updated_time ?? item.expiration_timestamp),
    isUnread: false,
  }
}

export async function GET(request: Request) {
  const accessToken = process.env.META_ACCESS_TOKEN?.trim()
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID?.trim()

  if (!accessToken) {
    return jsonError(503, {
      code: "META_ACCESS_TOKEN_MISSING",
      error: "Falta configurar META_ACCESS_TOKEN en el servidor.",
    })
  }

  if (!phoneNumberId) {
    return jsonError(503, {
      code: "META_PHONE_NUMBER_ID_MISSING",
      error: "Falta configurar META_PHONE_NUMBER_ID en el servidor.",
    })
  }

  const url = new URL(request.url)
  const limitParam = Number(url.searchParams.get("limit") ?? "20")
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 50) : 20

  try {
    const phone = await graphGet<MetaPhoneInfo>(phoneNumberId, accessToken, {
      fields: "id,display_phone_number,verified_name,quality_rating",
    })

    let warnings: string[] = []
    let conversations: ConversationPreview[] = []

    try {
      const result = await graphGet<MetaGraphEnvelope<MetaConversation>>(`${phoneNumberId}/conversations`, accessToken, {
        limit: String(limit),
        fields: "id,updated_time,expiration_timestamp,origin,messages.limit(1){id,from,timestamp,type,text},participants",
      })

      const rawConversations = Array.isArray(result.data) ? result.data : []
      conversations = rawConversations
        .map((conversation) => normalizeConversation(conversation))
        .filter((conversation): conversation is ConversationPreview => Boolean(conversation))
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo consultar la lista de conversaciones"
      warnings = [message]
    }

    return NextResponse.json(
      {
        ok: true,
        connected: true,
        phone: {
          id: phone.id ?? phoneNumberId,
          displayPhoneNumber: phone.display_phone_number ?? "",
          verifiedName: phone.verified_name ?? "",
          qualityRating: phone.quality_rating ?? "",
        },
        conversations,
        warnings,
      },
      { status: 200 },
    )
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Error inesperado al conectar con Meta"
    console.error("Meta conversations API error", error)

    return jsonError(502, {
      code: "META_API_ERROR",
      error: "No se pudo conectar con Meta API.",
      detail,
    })
  }
}
