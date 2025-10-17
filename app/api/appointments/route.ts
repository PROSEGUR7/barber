import { NextResponse } from "next/server"
import { z } from "zod"

import { getAppointmentsForUser } from "@/lib/bookings"

const querySchema = z.object({
  userId: z.coerce.number().int().positive(),
  scope: z.enum(["upcoming", "history"]).default("upcoming"),
  limit: z.coerce.number().int().positive().max(200).optional(),
})

function parseStatuses(searchParams: URLSearchParams, scope: "upcoming" | "history") {
  const rawStatuses = searchParams.getAll("status")
  const expanded = rawStatuses
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0)

  if (expanded.includes("all")) {
    return []
  }

  if (expanded.length > 0) {
    return expanded
  }

  return scope === "upcoming" ? ["pendiente", "confirmada"] : ["completada", "cancelada"]
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const searchParams = url.searchParams

    const parsed = querySchema.parse({
      userId: searchParams.get("userId"),
      scope: searchParams.get("scope") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    })

    const statuses = parseStatuses(searchParams, parsed.scope)

    const appointments = await getAppointmentsForUser({
      userId: parsed.userId,
      scope: parsed.scope,
      statuses,
      limit: parsed.limit,
    })

    return NextResponse.json({ appointments })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: error.flatten() },
        { status: 400 },
      )
    }

    console.error("Error fetching appointments", error)
    return NextResponse.json(
      { error: "No se pudieron cargar las citas" },
      { status: 500 },
    )
  }
}
