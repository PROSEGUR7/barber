import { NextResponse } from "next/server"
import { z } from "zod"

import { listBarbersForUser } from "@/lib/barbers"

const querySchema = z.object({
  userId: z.coerce.number().int().positive().optional(),
  serviceId: z.coerce.number().int().positive().optional(),
})

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const rawParams = {
      userId: url.searchParams.get("userId") ?? undefined,
      serviceId: url.searchParams.get("serviceId") ?? undefined,
    }

    const params = querySchema.parse(rawParams)

    const barbers = await listBarbersForUser({
      userId: params.userId ?? null,
      serviceId: params.serviceId ?? null,
    })

    return NextResponse.json({ barbers })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 })
    }

    console.error("Error fetching barbers", error)
    return NextResponse.json({ error: "No se pudieron cargar los barberos" }, { status: 500 })
  }
}
