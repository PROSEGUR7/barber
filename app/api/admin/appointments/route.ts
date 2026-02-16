import { NextResponse } from "next/server"
import { z } from "zod"

import { getAdminAppointments } from "@/lib/admin"

const querySchema = z.object({
  status: z.string().optional(),
  employeeId: z.coerce.number().int().positive().optional(),
  clientId: z.coerce.number().int().positive().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
})

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const parsed = querySchema.parse({
      status: searchParams.get("status") ?? undefined,
      employeeId: searchParams.get("employeeId") ?? undefined,
      clientId: searchParams.get("clientId") ?? undefined,
      fromDate: searchParams.get("fromDate") ?? undefined,
      toDate: searchParams.get("toDate") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    })

    const appointments = await getAdminAppointments(parsed)

    return NextResponse.json({ appointments })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: error.flatten() },
        { status: 400 },
      )
    }

    console.error("Error loading admin appointments", error)
    return NextResponse.json(
      { error: "No se pudieron cargar los agendamientos" },
      { status: 500 },
    )
  }
}
