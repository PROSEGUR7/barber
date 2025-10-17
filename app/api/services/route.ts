import { NextResponse } from "next/server"

import { getActiveServices } from "@/lib/bookings"

export async function GET() {
  try {
    const services = await getActiveServices()

    return NextResponse.json({ services })
  } catch (error) {
    console.error("Error fetching services", error)

    return NextResponse.json(
      { error: "No se pudieron cargar los servicios" },
      { status: 500 },
    )
  }
}
