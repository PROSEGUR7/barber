import { NextResponse } from "next/server"

import { sendMessageToMeta } from "@/lib/meta-chat"
import {
  getMetaConfigByTenantSchema,
  normalizeTenantSchema,
  resolveTenantSchemaFromRequest,
} from "@/lib/meta-tenant-config"

export const runtime = "nodejs"

type SendInput = {
  tenantSchema: string
  to: string
  text: string
  contactName: string | null
  sentByName: string | null
  sentByType: "bot" | "human"
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

function pickString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function pickSenderType(value: unknown): "bot" | "human" {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : ""
  if (normalized === "human" || normalized === "humano" || normalized === "agent" || normalized === "asesor") {
    return "human"
  }

  return "bot"
}

async function getInputFromRequest(request: Request): Promise<SendInput> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? ""

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    return {
      tenantSchema: pickString(body.tenantSchema) || pickString(body.tenant),
      to: pickString(body.to) || pickString(body.waId) || pickString(body.numero) || pickString(body.numeroCliente),
      text: pickString(body.text) || pickString(body.message),
      contactName: pickString(body.contactName) || pickString(body.remitente) || null,
      sentByName: pickString(body.sentByName) || pickString(body.senderName) || null,
      sentByType: pickSenderType(body.sentByType ?? body.senderType),
    }
  }

  const form = await request.formData()
  return {
    tenantSchema: pickString(form.get("tenantSchema")) || pickString(form.get("tenant")),
    to:
      pickString(form.get("to")) ||
      pickString(form.get("waId")) ||
      pickString(form.get("numero")) ||
      pickString(form.get("numeroCliente")),
    text: pickString(form.get("text")) || pickString(form.get("message")),
    contactName: pickString(form.get("contactName")) || pickString(form.get("remitente")) || null,
    sentByName: pickString(form.get("sentByName")) || pickString(form.get("senderName")) || null,
    sentByType: pickSenderType(form.get("sentByType") ?? form.get("senderType")),
  }
}

export async function POST(request: Request) {
  try {
    const input = await getInputFromRequest(request)

    const tenantFromRequest = resolveTenantSchemaFromRequest(request)
    const tenantFromBody = normalizeTenantSchema(input.tenantSchema)
    const tenantSchema = tenantFromRequest || tenantFromBody

    if (!tenantSchema) {
      return jsonError(400, {
        code: "TENANT_REQUIRED",
        error: "Debes enviar el tenant (header x-tenant, query ?tenant= o body tenantSchema).",
      })
    }

    if (!input.to) {
      return jsonError(400, {
        code: "RECIPIENT_REQUIRED",
        error: "Debes enviar el numero destino en el campo to.",
      })
    }

    if (!input.text) {
      return jsonError(400, {
        code: "MESSAGE_EMPTY",
        error: "Debes enviar el mensaje en el campo text o message.",
      })
    }

    const config = await getMetaConfigByTenantSchema(tenantSchema)
    if (!config) {
      return jsonError(503, {
        code: "META_TENANT_CONFIG_MISSING",
        error: "No hay configuracion de Meta activa para este tenant.",
      })
    }

    const configuredApiKey = config.n8nApiKey?.trim() || ""
    if (configuredApiKey) {
      const incomingApiKey =
        request.headers.get("x-n8n-key")?.trim() || request.headers.get("x-api-key")?.trim() || ""

      if (incomingApiKey !== configuredApiKey) {
        return jsonError(401, {
          code: "N8N_API_KEY_INVALID",
          error: "x-n8n-key invalido para este tenant.",
        })
      }
    }

    const result = await sendMessageToMeta({
      tenantSchema,
      to: input.to,
      text: input.text,
      contactName: input.contactName,
      sentByType: input.sentByType,
      sentByName: input.sentByName,
    })

    return NextResponse.json(
      {
        ok: true,
        tenantSchema,
        to: input.to,
        type: result.type,
        messageId: result.wamid,
        warning: result.wamid ? null : "META_NO_WAMID",
      },
      { status: 200 },
    )
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Error inesperado al enviar mensaje"
    console.error("Meta send API error", error)

    return jsonError(500, {
      code: "META_SEND_ERROR",
      error: "No se pudo enviar el mensaje por WhatsApp.",
      detail,
    })
  }
}
