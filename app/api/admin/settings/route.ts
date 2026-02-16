import { NextResponse } from "next/server"

import { getAdminSettings } from "@/lib/admin"

export async function GET() {
  try {
    const data = await getAdminSettings()
    return NextResponse.json(data)
  } catch (error) {
    console.error("Error loading admin settings", error)
    return NextResponse.json(
      { error: "No se pudieron cargar los ajustes de plataforma" },
      { status: 500 },
    )
  }
}
