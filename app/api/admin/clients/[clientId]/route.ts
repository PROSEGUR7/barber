import { NextResponse } from "next/server"
import { z } from "zod"

import { ClientRecordNotFoundError, deleteClient, updateClient } from "@/lib/admin"

export const runtime = "nodejs"

const paramsSchema = z.object({
  clientId: z.coerce.number().int().positive(),
})

const updateClientSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(20)
    .regex(/^[0-9+\-\s]+$/),
})

function jsonError(status: number, payload: { error: string; code?: string }) {
  return NextResponse.json(
    {
      ok: false,
      ...payload,
    },
    { status },
  )
}

export async function PATCH(request: Request, context: { params: Promise<{ clientId: string }> }) {
  const rawParams = await context.params
  const parsedParams = paramsSchema.safeParse(rawParams)

  if (!parsedParams.success) {
    return jsonError(400, {
      code: "INVALID_CLIENT_ID",
      error: "El cliente seleccionado no es válido.",
    })
  }

  let payload: unknown

  try {
    payload = await request.json()
  } catch {
    return jsonError(400, {
      code: "INVALID_JSON",
      error: "Solicitud inválida.",
    })
  }

  const parsedBody = updateClientSchema.safeParse(payload)
  if (!parsedBody.success) {
    return jsonError(400, {
      code: "INVALID_PAYLOAD",
      error: "Datos inválidos para actualizar el cliente.",
    })
  }

  try {
    const client = await updateClient({
      clientId: parsedParams.data.clientId,
      name: parsedBody.data.name,
      email: parsedBody.data.email.toLowerCase(),
      phone: parsedBody.data.phone,
    })

    return NextResponse.json({ ok: true, client }, { status: 200 })
  } catch (error) {
    if (error instanceof ClientRecordNotFoundError) {
      return jsonError(404, {
        code: "CLIENT_NOT_FOUND",
        error: "No se encontró el cliente seleccionado.",
      })
    }

    if (error instanceof Error && error.message === "DATABASE_URL env var is not set") {
      return jsonError(503, {
        code: "DATABASE_NOT_CONFIGURED",
        error: "El servidor no está configurado (DATABASE_URL faltante).",
      })
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      return jsonError(409, {
        code: "EMAIL_EXISTS",
        error: "Ya existe una cuenta con ese correo.",
      })
    }

    console.error("Admin update client API error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudo actualizar el cliente.",
    })
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ clientId: string }> }) {
  const rawParams = await context.params
  const parsedParams = paramsSchema.safeParse(rawParams)

  if (!parsedParams.success) {
    return jsonError(400, {
      code: "INVALID_CLIENT_ID",
      error: "El cliente seleccionado no es válido.",
    })
  }

  try {
    await deleteClient(parsedParams.data.clientId)
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    if (error instanceof ClientRecordNotFoundError) {
      return jsonError(404, {
        code: "CLIENT_NOT_FOUND",
        error: "No se encontró el cliente seleccionado.",
      })
    }

    if (error instanceof Error && error.message === "DATABASE_URL env var is not set") {
      return jsonError(503, {
        code: "DATABASE_NOT_CONFIGURED",
        error: "El servidor no está configurado (DATABASE_URL faltante).",
      })
    }

    console.error("Admin delete client API error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudo eliminar el cliente.",
    })
  }
}
