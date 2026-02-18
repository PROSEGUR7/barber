import { NextResponse } from "next/server"

import { getClientsWithStats } from "@/lib/admin"

export const runtime = "nodejs"

function jsonError(status: number, payload: { error: string; code?: string }) {
  return NextResponse.json(
    {
      ok: false,
      ...payload,
    },
    { status },
  )
}

export async function GET() {
  try {
    const clients = await getClientsWithStats()
    return NextResponse.json({ ok: true, clients }, { status: 200 })
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_URL env var is not set") {
      return jsonError(503, {
        code: "DATABASE_NOT_CONFIGURED",
        error: "El servidor no está configurado (DATABASE_URL faltante).",
      })
    }

    console.error("Admin clients API error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudieron cargar los clientes.",
    })
  }
}
