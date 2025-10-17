import { NextResponse } from "next/server"
import { z } from "zod"

import {
  ClientRecordNotFoundError,
  getClientsWithStats,
  registerClient,
} from "@/lib/admin"
import { UserAlreadyExistsError } from "@/lib/auth"

const createClientSchema = z.object({
  name: z.string().min(2, "El nombre es obligatorio"),
  email: z.string().email("Correo electrónico inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  phone: z
    .string()
    .trim()
    .min(7, "Ingresa un teléfono válido")
    .max(20, "El teléfono es demasiado largo")
    .regex(/^[0-9+\-\s]+$/, "El teléfono solo puede tener números y símbolos + -"),
})

export async function GET() {
  try {
    const clients = await getClientsWithStats()
    return NextResponse.json({ clients })
  } catch (error) {
    console.error("Error loading clients", error)
    return NextResponse.json(
      { error: "No se pudieron cargar los clientes" },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => ({}))
    const payload = createClientSchema
      .transform((data) => ({
        ...data,
        phone: data.phone.trim(),
      }))
      .parse(json)

    const client = await registerClient(payload)

    return NextResponse.json({ client }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: error.flatten() },
        { status: 400 },
      )
    }

    if (error instanceof UserAlreadyExistsError) {
      return NextResponse.json(
        { error: "Ya existe un usuario con ese correo" },
        { status: 409 },
      )
    }

    if (error instanceof ClientRecordNotFoundError) {
      return NextResponse.json(
        { error: "No se pudo crear el cliente en el sistema" },
        { status: 500 },
      )
    }

    console.error("Error creating client", error)
    return NextResponse.json(
      { error: "No se pudo crear el cliente" },
      { status: 500 },
    )
  }
}
