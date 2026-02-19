import { NextResponse } from "next/server"
import { z } from "zod"

import { addPaymentMethodForUser, deletePaymentMethodForUser } from "@/lib/wallet"

const last4Schema = z.string().trim().regex(/^\d{4}$/)

const addSchema = z.object({
  userId: z.coerce.number().int().positive(),
  brand: z.string().trim().min(1).max(40),
  lastFour: last4Schema,
  expMonth: z.coerce.number().int().min(1).max(12),
  expYear: z.coerce.number().int().min(0).max(99),
  status: z.enum(["Principal", "Respaldo"]).default("Respaldo"),
})

const delSchema = z.object({
  userId: z.coerce.number().int().positive(),
  lastFour: last4Schema,
})

export async function POST(request: Request) {
  try {
    const body = addSchema.parse(await request.json())
    await addPaymentMethodForUser(body)
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", issues: error.flatten() }, { status: 400 })
    }

    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
        ? ((error as { code?: string }).code as string)
        : null

    if (code === "CLIENT_PROFILE_NOT_FOUND") {
      return NextResponse.json({ error: "Tu cuenta no tiene perfil de cliente." }, { status: 409 })
    }

    console.error("Error adding payment method", error)
    return NextResponse.json({ error: "No se pudo guardar el método" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const body = delSchema.parse(await request.json())
    await deletePaymentMethodForUser(body)
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", issues: error.flatten() }, { status: 400 })
    }

    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
        ? ((error as { code?: string }).code as string)
        : null

    if (code === "CLIENT_PROFILE_NOT_FOUND") {
      return NextResponse.json({ error: "Tu cuenta no tiene perfil de cliente." }, { status: 409 })
    }

    console.error("Error deleting payment method", error)
    return NextResponse.json({ error: "No se pudo eliminar el método" }, { status: 500 })
  }
}
