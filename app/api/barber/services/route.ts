import { NextResponse } from "next/server"
import { z } from "zod"

import { getEmployeeServices, setEmployeeServices } from "@/lib/barber-services"

const querySchema = z.object({
  userId: z.coerce.number().int().positive(),
})

const bodySchema = z.object({
  userId: z.coerce.number().int().positive(),
  serviceIds: z.array(z.coerce.number().int().positive()).default([]),
})

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const { userId } = querySchema.parse({ userId: url.searchParams.get("userId") })

    const services = await getEmployeeServices({ userId })
    return NextResponse.json({ services }, { status: 200 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Parámetros inválidos", issues: error.flatten() }, { status: 400 })
    }

    console.error("Error fetching employee services", error)
    return NextResponse.json({ error: "No se pudieron cargar tus servicios" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = bodySchema.parse(await request.json())

    await setEmployeeServices({ userId: body.userId, serviceIds: body.serviceIds })
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", issues: error.flatten() }, { status: 400 })
    }

    console.error("Error updating employee services", error)
    return NextResponse.json({ error: "No se pudieron guardar tus servicios" }, { status: 500 })
  }
}
