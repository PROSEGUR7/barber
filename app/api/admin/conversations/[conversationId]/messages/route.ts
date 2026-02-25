import { NextResponse } from "next/server"

import { getMessagesByConversation } from "@/lib/meta-chat"

export const runtime = "nodejs"

type Params = {
  params: Promise<{ conversationId: string }>
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

export async function GET(request: Request, context: Params) {
  const { conversationId } = await context.params
  const url = new URL(request.url)
  const limitParam = Number(url.searchParams.get("limit") ?? "200")
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 500) : 200

  try {
    const messages = await getMessagesByConversation(conversationId, limit)

    return NextResponse.json(
      {
        ok: true,
        conversationId,
        messages,
      },
      { status: 200 },
    )
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Error inesperado al cargar mensajes"
    console.error("Conversation messages API error", error)

    return jsonError(500, {
      code: "MESSAGES_READ_ERROR",
      error: "No se pudieron cargar los mensajes de la conversación.",
      detail,
    })
  }
}
