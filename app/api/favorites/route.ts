import { NextResponse } from "next/server"
import { z } from "zod"

import {
  addFavoriteBarber,
  listFavoriteBarbersForUser,
  removeFavoriteBarber,
} from "@/lib/favorites"

const querySchema = z.object({
  userId: z.coerce.number().int().positive(),
})

const bodySchema = z.object({
  userId: z.coerce.number().int().positive(),
  barberId: z.coerce.number().int().positive(),
})

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const { userId } = querySchema.parse({ userId: url.searchParams.get("userId") })

    const favorites = await listFavoriteBarbersForUser(userId)
    return NextResponse.json({ favorites })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Parámetros inválidos", issues: error.flatten() }, { status: 400 })
    }

    console.error("Error fetching favorites", error)
    return NextResponse.json({ error: "No se pudieron cargar los favoritos" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { userId, barberId } = bodySchema.parse(await request.json())
    await addFavoriteBarber({ userId, barberId })
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

    console.error("Error adding favorite", error)
    return NextResponse.json({ error: "No se pudo guardar el favorito" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId, barberId } = bodySchema.parse(await request.json())
    await removeFavoriteBarber({ userId, barberId })
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", issues: error.flatten() }, { status: 400 })
    }

    console.error("Error removing favorite", error)
    return NextResponse.json({ error: "No se pudo eliminar el favorito" }, { status: 500 })
  }
}
