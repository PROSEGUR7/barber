import { NextResponse } from "next/server"

import { markConversationAsRead } from "@/lib/meta-chat"
import { resolveTenantSchemaFromRequest } from "@/lib/meta-tenant-config"

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

export async function POST(request: Request, context: Params) {
  const { conversationId } = await context.params
  const tenantSchema = resolveTenantSchemaFromRequest(request)

  try {
    const updated = await markConversationAsRead(conversationId, tenantSchema)

    return NextResponse.json(
      {
        ok: true,
        updated,
        tenantSchema,
      },
      { status: 200 },
    )
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Error inesperado al marcar leído"
    console.error("Conversation read API error", error)

    return jsonError(500, {
      code: "READ_UPDATE_ERROR",
      error: "No se pudieron actualizar los mensajes leídos.",
      detail,
    })
  }
}
