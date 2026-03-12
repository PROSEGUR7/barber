import { NextResponse } from "next/server"
import { z } from "zod"

import { resolveTenantSchemaForRequest } from "@/lib/tenant"
import { getReservationPricingBreakdown } from "@/lib/wallet"

const previewSchema = z.object({
  serviceIds: z.array(z.coerce.number().int().positive()).min(1).max(2),
  promoCode: z.string().trim().min(3).max(64),
})

export async function POST(request: Request) {
  try {
    const tenantSchema = await resolveTenantSchemaForRequest(request)
    const payload = previewSchema.parse(await request.json())

    const pricing = await getReservationPricingBreakdown({
      serviceIds: payload.serviceIds,
      promoCode: payload.promoCode,
      tenantSchema,
    })

    return NextResponse.json({
      ok: true,
      pricing,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", issues: error.flatten() }, { status: 400 })
    }

    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
        ? ((error as { code?: string }).code as string)
        : null

    if (code === "PROMO_NOT_FOUND") {
      return NextResponse.json({ error: "Código promocional no válido." }, { status: 404 })
    }

    if (code === "PROMO_INACTIVE") {
      return NextResponse.json({ error: "Este código ya no está disponible." }, { status: 409 })
    }

    if (code === "PROMO_EXPIRED") {
      return NextResponse.json({ error: "Este código ya expiró." }, { status: 409 })
    }

    if (code === "PROMO_NOT_APPLICABLE") {
      return NextResponse.json({ error: "El código no aplica para estos servicios." }, { status: 409 })
    }

    if (code === "SERVICE_NOT_FOUND" || code === "SERVICE_PRICE_INVALID") {
      return NextResponse.json({ error: "No pudimos calcular el valor de los servicios seleccionados." }, { status: 409 })
    }

    console.error("Error generating reservation promo preview", error)
    return NextResponse.json({ error: "No se pudo validar el código promocional." }, { status: 500 })
  }
}
