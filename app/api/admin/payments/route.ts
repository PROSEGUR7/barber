import { NextResponse } from "next/server"
import { z } from "zod"

import { getAdminPayments } from "@/lib/admin"

const querySchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
})

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const parsed = querySchema.parse({
      status: searchParams.get("status") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    })

    const payments = await getAdminPayments(parsed)

    return NextResponse.json({ payments })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: error.flatten() },
        { status: 400 },
      )
    }

    console.error("Error loading admin payments", error)
    return NextResponse.json(
      { error: "No se pudieron cargar los pagos" },
      { status: 500 },
    )
  }
}
