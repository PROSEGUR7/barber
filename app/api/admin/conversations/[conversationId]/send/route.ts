import { NextResponse } from "next/server"

import { getBotStatusByConversation, sendMessageToMeta } from "@/lib/meta-chat"
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

export async function POST(request: Request, context: Params) {
  const { conversationId } = await context.params
  const tenantSchema = await resolveTenantSchemaForRequest(request)

  if (!tenantSchema) {
    return jsonError(400, {
      code: "TENANT_REQUIRED",
      error: "Debes indicar el tenant para enviar mensajes.",
    })
  }

  try {
    const botStatus = await getBotStatusByConversation(conversationId, tenantSchema)
    if (botStatus.active) {
      return jsonError(409, {
        code: "BOT_ACTIVE_HUMAN_SEND_BLOCKED",
        error: "El bot IA está activo para este cliente. Desactívalo para responder manualmente.",
      })
    }

    const form = await request.formData()
    const textValue = form.get("text")
    const fileValue = form.get("file")
    const contactNameValue = form.get("contactName")
    const reactionEmojiValue = form.get("reactionEmoji")
    const reactionToWamidValue = form.get("reactionToWamid")

    const text = typeof textValue === "string" ? textValue : ""
    const file = fileValue instanceof File ? fileValue : null
    const contactName = typeof contactNameValue === "string" ? contactNameValue : null
    const reactionEmoji = typeof reactionEmojiValue === "string" ? reactionEmojiValue.trim() : ""
    const reactionToWamid = typeof reactionToWamidValue === "string" ? reactionToWamidValue.trim() : ""
    const reaction = reactionEmoji && reactionToWamid ? { emoji: reactionEmoji, messageId: reactionToWamid } : null
    const sentByName =
      request.headers.get("x-user-name")?.trim() ||
      request.headers.get("x-user-email")?.trim() ||
      null

    const result = await sendMessageToMeta({
      tenantSchema,
      to: decodeURIComponent(conversationId),
      text,
      file,
      reaction,
      contactName,
      sentByType: "human",
      sentByName,
    })

    return NextResponse.json(
      {
        ok: true,
        message: result,
      },
      { status: 200 },
    )
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Error inesperado al enviar mensaje"
    console.error("Conversation send API error", error)

    if (detail === "META_ACCESS_TOKEN_MISSING" || detail === "META_PHONE_NUMBER_ID_MISSING") {
      return jsonError(503, {
        code: detail,
        error: "Faltan variables de Meta para enviar mensajes.",
      })
    }

    if (detail === "META_TENANT_CONFIG_MISSING") {
      return jsonError(503, {
        code: detail,
        error: "No hay configuración de Meta activa para este tenant.",
      })
    }

    if (detail === "RECIPIENT_REQUIRED" || detail === "MESSAGE_EMPTY") {
      return jsonError(400, {
        code: detail,
        error: "Debes seleccionar un contacto y escribir un mensaje o adjuntar un archivo.",
      })
    }

    return jsonError(500, {
      code: "MESSAGE_SEND_ERROR",
      error: "No se pudo enviar el mensaje por WhatsApp.",
      detail,
    })
  }
}
