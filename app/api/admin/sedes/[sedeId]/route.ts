import { NextResponse } from "next/server"
import { z } from "zod"

import {
  SedeRecordNotFoundError,
  SedesModuleNotAvailableError,
  deleteAdminSede,
  updateAdminSede,
} from "@/lib/admin"
import { resolveTenantSchemaForAdminRequest } from "@/lib/tenant"

export const runtime = "nodejs"

const sedePhotoUrlSchema = z.string().trim().max(2048).refine((value) => {
  const pathOnly = value.split("?")[0]?.split("#")[0] ?? value
  const isLocalUploadPath =
    pathOnly.startsWith("/uploads/sedes/") &&
    !pathOnly.includes("..") &&
    /\.(jpg|jpeg|png|webp|gif)$/i.test(pathOnly)

  if (isLocalUploadPath) {
    return true
  }

  try {
    const parsed = new URL(value)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}, "Formato de foto inválido")

const paramsSchema = z.object({
  sedeId: z.coerce.number().int().positive(),
})

const sedeSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    address: z.string().trim().max(300).nullable().optional(),
    city: z.string().trim().max(120).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    phone: z
      .string()
      .trim()
      .max(20)
      .regex(/^[0-9+\-\s()]*$/)
      .nullable()
      .optional(),
    reference: z.string().trim().max(500).nullable().optional(),
    photoUrls: z.array(sedePhotoUrlSchema).max(5).optional(),
    active: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    const hasLatitude = value.latitude != null
    const hasLongitude = value.longitude != null

    if (hasLatitude !== hasLongitude) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Debes enviar latitud y longitud juntas o dejar ambas vacías.",
        path: hasLatitude ? ["longitude"] : ["latitude"],
      })
    }
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

export async function PATCH(request: Request, context: { params: Promise<{ sedeId: string }> }) {
  const rawParams = await context.params
  const parsedParams = paramsSchema.safeParse(rawParams)

  if (!parsedParams.success) {
    return jsonError(400, {
      code: "INVALID_SEDE_ID",
      error: "La sede seleccionada no es válida.",
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

  const parsed = sedeSchema.safeParse(payload)
  if (!parsed.success) {
    return jsonError(400, {
      code: "INVALID_PAYLOAD",
      error: "Datos inválidos para actualizar la sede.",
    })
  }

  try {
    const tenantSchema = await resolveTenantSchemaForAdminRequest(request)
    if (!tenantSchema) {
      return jsonError(400, {
        code: "TENANT_NOT_RESOLVED",
        error: "No se pudo resolver el tenant de la sesión.",
      })
    }

    const sede = await updateAdminSede(parsedParams.data.sedeId, {
      name: parsed.data.name,
      address: parsed.data.address ?? null,
      city: parsed.data.city ?? null,
      latitude: parsed.data.latitude ?? null,
      longitude: parsed.data.longitude ?? null,
      phone: parsed.data.phone ?? null,
      reference: parsed.data.reference ?? null,
      photoUrls: parsed.data.photoUrls ?? [],
      active: parsed.data.active,
      tenantSchema,
    })

    return NextResponse.json({ ok: true, sede }, { status: 200 })
  } catch (error) {
    if (error instanceof SedeRecordNotFoundError) {
      return jsonError(404, {
        code: "SEDE_NOT_FOUND",
        error: "No se encontró la sede seleccionada.",
      })
    }

    if (error instanceof SedesModuleNotAvailableError) {
      return jsonError(409, {
        code: "SEDES_MODULE_NOT_AVAILABLE",
        error: "El módulo de sedes aún no está habilitado para este tenant.",
      })
    }

    if (typeof error === "object" && error != null && "code" in error && (error as { code?: string }).code === "23505") {
      return jsonError(409, {
        code: "SEDE_DUPLICATE_NAME",
        error: "Ya existe una sede con ese nombre.",
      })
    }

    if (error instanceof Error && error.message === "DATABASE_URL env var is not set") {
      return jsonError(503, {
        code: "DATABASE_NOT_CONFIGURED",
        error: "El servidor no está configurado (DATABASE_URL faltante).",
      })
    }

    console.error("Admin update sede API error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudo actualizar la sede.",
    })
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ sedeId: string }> }) {
  const rawParams = await context.params
  const parsedParams = paramsSchema.safeParse(rawParams)

  if (!parsedParams.success) {
    return jsonError(400, {
      code: "INVALID_SEDE_ID",
      error: "La sede seleccionada no es válida.",
    })
  }

  try {
    const tenantSchema = await resolveTenantSchemaForAdminRequest(request)
    if (!tenantSchema) {
      return jsonError(400, {
        code: "TENANT_NOT_RESOLVED",
        error: "No se pudo resolver el tenant de la sesión.",
      })
    }

    await deleteAdminSede(parsedParams.data.sedeId, tenantSchema)
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    if (error instanceof SedeRecordNotFoundError) {
      return jsonError(404, {
        code: "SEDE_NOT_FOUND",
        error: "No se encontró la sede seleccionada.",
      })
    }

    if (error instanceof SedesModuleNotAvailableError) {
      return jsonError(409, {
        code: "SEDES_MODULE_NOT_AVAILABLE",
        error: "El módulo de sedes aún no está habilitado para este tenant.",
      })
    }

    if (error instanceof Error && error.message === "DATABASE_URL env var is not set") {
      return jsonError(503, {
        code: "DATABASE_NOT_CONFIGURED",
        error: "El servidor no está configurado (DATABASE_URL faltante).",
      })
    }

    console.error("Admin delete sede API error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudo eliminar la sede.",
    })
  }
}
