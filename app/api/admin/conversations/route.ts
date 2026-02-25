import { NextResponse } from "next/server"

import { getConversations } from "@/lib/meta-chat"

export const runtime = "nodejs"

function jsonError(status: number, payload: { error: string; code?: string; detail?: string }) {
  return NextResponse.json(
    {
      ok: false,
      ...payload,
    },
    { status },
  )
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const limitParam = Number(url.searchParams.get("limit") ?? "50")
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 200) : 50

  try {
    const { conversations, phoneDisplay } = await getConversations(limit)

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
      error: "No se pudieron cargar las conversaciones.",
      detail,
    })
  }
}
