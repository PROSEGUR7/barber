import bcrypt from "bcryptjs"
import { NextResponse } from "next/server"
import { z } from "zod"

import { findUserByEmail, verifyPassword } from "@/lib/auth"
import { pool } from "@/lib/db"

const changePasswordSchema = z
  .object({
    email: z.string().email("Correo inválido"),
    currentPassword: z.string().min(1, "La contraseña actual es obligatoria"),
    newPassword: z.string().min(8, "La nueva contraseña debe tener al menos 8 caracteres"),
    confirmPassword: z.string().min(1, "Debes confirmar la nueva contraseña"),
  })
  .refine((payload) => payload.newPassword === payload.confirmPassword, {
    message: "La confirmación no coincide con la nueva contraseña",
    path: ["confirmPassword"],
  })

export async function PATCH(request: Request) {
  try {
    const payload = changePasswordSchema.parse(await request.json())
    const email = payload.email.trim().toLowerCase()

    const user = await findUserByEmail(email)

    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
    }

    const currentPasswordOk = await verifyPassword(payload.currentPassword, user.passwordHash)

    if (!currentPasswordOk) {
      return NextResponse.json({ error: "La contraseña actual no es correcta" }, { status: 401 })
    }

    const newPasswordEqualsCurrent = await verifyPassword(payload.newPassword, user.passwordHash)

    if (newPasswordEqualsCurrent) {
      return NextResponse.json(
        { error: "La nueva contraseña debe ser diferente a la actual" },
        { status: 400 },
      )
    }

    const hashedPassword = await bcrypt.hash(payload.newPassword, 10)

    await pool.query(
      `UPDATE tenant_base.users
          SET passwordhash = $1,
              ultima_actualizacion = NOW()
        WHERE id = $2`,
      [hashedPassword, user.id],
    )

    return NextResponse.json({ message: "Contraseña actualizada correctamente" })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: error.flatten() },
        { status: 400 },
      )
    }

    console.error("Error changing password", error)
    return NextResponse.json(
      { error: "No se pudo actualizar la contraseña" },
      { status: 500 },
    )
  }
}
