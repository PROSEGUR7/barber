import { NextResponse } from "next/server"
import { z } from "zod"

import { resolveTenantSchemaForRequest } from "@/lib/tenant"
import { getWalletReceiptDownloadForUser } from "@/lib/wallet"

const querySchema = z.object({
  userId: z.coerce.number().int().positive(),
})

const paramsSchema = z.object({
  receiptId: z.coerce.number().int().positive(),
})

export async function GET(request: Request, context: { params: Promise<{ receiptId: string }> }) {
  try {
    const tenantSchema = await resolveTenantSchemaForRequest(request)
    const { receiptId } = paramsSchema.parse(await context.params)
    const url = new URL(request.url)
    const { userId } = querySchema.parse({ userId: url.searchParams.get("userId") })

    const file = await getWalletReceiptDownloadForUser({ userId, receiptId, tenantSchema })

    return new NextResponse(file.body, {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Parámetros inválidos", issues: error.flatten() }, { status: 400 })
    }

    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
        ? ((error as { code?: string }).code as string)
        : null

    if (code === "CLIENT_PROFILE_NOT_FOUND") {
      return NextResponse.json({ error: "Tu cuenta no tiene perfil de cliente." }, { status: 409 })
    }

    if (code === "RECEIPT_NOT_FOUND") {
      return NextResponse.json({ error: "No encontramos esa factura para tu cuenta." }, { status: 404 })
    }

    console.error("Error generating wallet receipt download", error)
    return NextResponse.json({ error: "No se pudo descargar la factura" }, { status: 500 })
  }
}
