import { NextResponse } from "next/server"
import { z } from "zod"

import { listBarberReviews, upsertBarberReview } from "@/lib/reviews"
import { resolveTenantSchemaForRequest } from "@/lib/tenant"

const paramsSchema = z.object({
  barberId: z.coerce.number().int().positive(),
})

const querySchema = z.object({
  limit: z.coerce.number().int().positive().max(30).optional(),
})

const bodySchema = z.object({
  userId: z.coerce.number().int().positive(),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
})

export async function GET(
  request: Request,
  context: { params: Promise<{ barberId: string }> },
) {
  try {
    const tenantSchema = await resolveTenantSchemaForRequest(request)
    const rawParams = await context.params
    const { barberId } = paramsSchema.parse(rawParams)

    const url = new URL(request.url)
    const { limit } = querySchema.parse({ limit: url.searchParams.get("limit") ?? undefined })

    const data = await listBarberReviews({
      barberId,
      limit: limit ?? 10,
      tenantSchema,
    })

    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Parámetros inválidos", issues: error.flatten() }, { status: 400 })
    }

    console.error("Error fetching barber reviews", error)
    return NextResponse.json({ error: "No se pudieron cargar las reseñas" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ barberId: string }> },
) {
  try {
    const tenantSchema = await resolveTenantSchemaForRequest(request)
    const rawParams = await context.params
    const { barberId } = paramsSchema.parse(rawParams)

    const body = bodySchema.parse(await request.json())

    const data = await upsertBarberReview({
      userId: body.userId,
      barberId,
      rating: body.rating,
      comment: body.comment,
      tenantSchema,
    })

    return NextResponse.json(data, { status: 201 })
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

    if (code === "CLIENT_PROFILE_NOT_FOUND") {
      return NextResponse.json({ error: "Tu cuenta no tiene perfil de cliente." }, { status: 409 })
    }

    if (code === "REVIEW_REQUIRES_COMPLETED_APPOINTMENT") {
      return NextResponse.json(
        { error: "Solo puedes calificar después de tener una cita completada con este barbero." },
        { status: 409 },
      )
    }

    console.error("Error saving barber review", error)
    return NextResponse.json({ error: "No se pudo guardar la reseña" }, { status: 500 })
  }
}
