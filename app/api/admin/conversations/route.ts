import { NextResponse } from "next/server"

import { getConversations } from "@/lib/meta-chat"
import { getMetaConfigByTenantSchema, resolveTenantSchemaFromRequest } from "@/lib/meta-tenant-config"

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
  const tenantSchema = resolveTenantSchemaFromRequest(request)

  try {
    const { conversations, phoneDisplay } = await getConversations(limit, tenantSchema)
    const config = await getMetaConfigByTenantSchema(tenantSchema)

    return NextResponse.json(
      {
        ok: true,
        connected: Boolean(config),
        phone: {
          id: config?.metaPhoneNumberId ?? "",
          displayPhoneNumber: config?.metaDisplayPhoneNumber ?? phoneDisplay,
          verifiedName: "",
          qualityRating: "",
        },
        conversations,
        warnings: [],
        source: "webhook",
        tenantSchema,
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
