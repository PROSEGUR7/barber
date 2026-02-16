import { NextResponse } from "next/server"
import { z } from "zod"

import { createService, getServicesCatalog } from "@/lib/admin"

const createServiceSchema = z.object({
  name: z.string().trim().min(2, "El nombre es obligatorio").max(120, "El nombre es demasiado largo"),
  description: z.string().trim().max(500, "La descripción es demasiado larga").optional().nullable(),
  price: z.coerce.number().min(0, "El precio no puede ser negativo"),
  durationMin: z.coerce
    .number()
    .int("La duración debe ser un número entero")
    .min(5, "La duración mínima es de 5 minutos")
    .max(600, "La duración máxima es de 600 minutos"),
})

export async function GET() {
  try {
    const services = await getServicesCatalog()
    return NextResponse.json({ services })
  } catch (error) {
    console.error("Error loading services", error)
    return NextResponse.json({ error: "No se pudieron cargar los servicios" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => ({}))
    const payload = createServiceSchema.parse(json)

    const service = await createService({
      name: payload.name,
      description: payload.description ?? null,
      price: payload.price,
      durationMin: payload.durationMin,
    })

    return NextResponse.json({ service }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", issues: error.flatten() }, { status: 400 })
    }

    console.error("Error creating service", error)
    return NextResponse.json({ error: "No se pudo crear el servicio" }, { status: 500 })
  }
}
