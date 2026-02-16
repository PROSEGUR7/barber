import { NextResponse } from "next/server"
import { z } from "zod"

import { AdminUserRecordNotFoundError, updateAdminUserEmail } from "@/lib/admin"

const paramsSchema = z.object({
  userId: z.coerce.number().int().positive(),
})

const updateAdminUserSchema = z.object({
  email: z.string().email("Correo electrónico inválido"),
})

export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const { userId } = paramsSchema.parse(await context.params)
    const json = await request.json().catch(() => ({}))
    const payload = updateAdminUserSchema.parse(json)

    const adminUser = await updateAdminUserEmail({
      userId,
      email: payload.email.trim().toLowerCase(),
    })

    return NextResponse.json({ adminUser })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: error.flatten() },
        { status: 400 },
      )
    }

    if (error instanceof AdminUserRecordNotFoundError) {
      return NextResponse.json({ error: "Administrador no encontrado" }, { status: 404 })
    }

    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "Ya existe una cuenta con ese correo" }, { status: 409 })
    }

    console.error("Error updating admin settings user", error)
    return NextResponse.json(
      { error: "No se pudo actualizar el administrador" },
      { status: 500 },
    )
  }
}
