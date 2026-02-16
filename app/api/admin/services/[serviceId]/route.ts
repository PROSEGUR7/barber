import { NextResponse } from "next/server"
import { z } from "zod"

import { ServiceRecordNotFoundError, deleteService, updateService } from "@/lib/admin"

const paramsSchema = z.object({
  serviceId: z.coerce.number().int().positive(),
})

const updateServiceSchema = z.object({
  name: z.string().trim().min(2, "El nombre es obligatorio").max(120, "El nombre es demasiado largo"),
  description: z.string().trim().max(500, "La descripción es demasiado larga").optional().nullable(),
  price: z.coerce.number().min(0, "El precio no puede ser negativo"),
  durationMin: z.coerce
    .number()
    .int("La duración debe ser un número entero")
    .min(5, "La duración mínima es de 5 minutos")
    .max(600, "La duración máxima es de 600 minutos"),
})

export async function PATCH(
  request: Request,
  context: { params: Promise<{ serviceId: string }> },
) {
  try {
    const { serviceId } = paramsSchema.parse(await context.params)
    const json = await request.json().catch(() => ({}))
    const payload = updateServiceSchema.parse(json)

    const service = await updateService(serviceId, {
      name: payload.name,
      description: payload.description ?? null,
      price: payload.price,
      durationMin: payload.durationMin,
    })

    return NextResponse.json({ service })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", issues: error.flatten() }, { status: 400 })
    }

    if (error instanceof ServiceRecordNotFoundError) {
      return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 })
    }

    console.error("Error updating service", error)
    return NextResponse.json({ error: "No se pudo actualizar el servicio" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ serviceId: string }> },
) {
  try {
    const { serviceId } = paramsSchema.parse(await context.params)

    await deleteService(serviceId)

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 })
    }

    if (error instanceof ServiceRecordNotFoundError) {
      return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 })
    }

    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23503") {
      return NextResponse.json(
        { error: "No se puede eliminar el servicio porque está asociado a citas o empleados" },
        { status: 409 },
      )
    }

    console.error("Error deleting service", error)
    return NextResponse.json({ error: "No se pudo eliminar el servicio" }, { status: 500 })
  }
}
