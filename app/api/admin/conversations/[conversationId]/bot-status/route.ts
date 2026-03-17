import { NextResponse } from "next/server"

import { getBotStatusByConversation, updateBotStatusByConversation } from "@/lib/meta-chat"
import { resolveTenantSchemaForRequest } from "@/lib/meta-tenant-config"

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
  const tenantSchema = await resolveTenantSchemaForRequest(request)

  if (!tenantSchema) {
    return jsonError(400, {
      code: "TENANT_REQUIRED",
      error: "Debes indicar el tenant para consultar el estado del bot.",
    })
  }

  try {
    const status = await getBotStatusByConversation(conversationId, tenantSchema)

    return NextResponse.json(
      {
        ok: true,
        conversationId,
        tenantSchema,
        exists: status.exists,
        active: status.active,
        clientId: status.clientId,
      },
      { status: 200 },
    )
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Error inesperado"
    return jsonError(500, {
      code: "BOT_STATUS_READ_ERROR",
      error: "No se pudo consultar el estado del bot.",
      detail,
    })
  }
}

export async function POST(request: Request, context: Params) {
  const { conversationId } = await context.params
  const tenantSchema = await resolveTenantSchemaForRequest(request)

  if (!tenantSchema) {
    return jsonError(400, {
      code: "TENANT_REQUIRED",
      error: "Debes indicar el tenant para actualizar el estado del bot.",
    })
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { active?: unknown }
    if (typeof body.active !== "boolean") {
      return jsonError(400, {
        code: "BOT_STATUS_INVALID",
        error: "Debes enviar el campo active (boolean).",
      })
    }

    const updated = await updateBotStatusByConversation(conversationId, body.active, tenantSchema)
    if (!updated.updated) {
      return jsonError(404, {
        code: "CLIENT_NOT_FOUND",
        error: "No encontramos cliente para esta conversación.",
      })
    }

    return NextResponse.json(
      {
        ok: true,
        conversationId,
        tenantSchema,
        active: updated.active,
        clientId: updated.clientId,
      },
      { status: 200 },
    )
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Error inesperado"
    return jsonError(500, {
      code: "BOT_STATUS_UPDATE_ERROR",
      error: "No se pudo actualizar el estado del bot.",
      detail,
    })
  }
}