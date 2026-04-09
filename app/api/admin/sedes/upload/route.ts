import { randomUUID } from "crypto"
import { mkdir, writeFile } from "fs/promises"
import path from "path"

import { NextResponse } from "next/server"

import { resolveTenantSchemaForAdminRequest } from "@/lib/tenant"

export const runtime = "nodejs"

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024
const MAX_FILES_PER_REQUEST = 5

const MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
}

function jsonError(status: number, error: string) {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    { status },
  )
}

export async function POST(request: Request) {
  const tenantSchema = await resolveTenantSchemaForAdminRequest(request)
  if (!tenantSchema) {
    return jsonError(400, "No se pudo resolver el tenant de la sesión.")
  }

  try {
    const form = await request.formData()
    const files = form.getAll("files").filter((value): value is File => value instanceof File)

    if (files.length === 0) {
      return jsonError(400, "No se recibieron archivos para subir.")
    }

    if (files.length > MAX_FILES_PER_REQUEST) {
      return jsonError(400, `Solo puedes subir hasta ${MAX_FILES_PER_REQUEST} archivos por intento.`)
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads", "sedes", tenantSchema)
    await mkdir(uploadDir, { recursive: true })

    const urls: string[] = []

    for (const file of files) {
      if (!file.type || !MIME_TO_EXTENSION[file.type]) {
        return jsonError(400, `Formato no permitido: ${file.name || "archivo"}.`)
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        return jsonError(400, `El archivo ${file.name || "seleccionado"} supera los 15MB permitidos.`)
      }

      const extension = MIME_TO_EXTENSION[file.type]
      const fileName = `${Date.now()}-${randomUUID()}.${extension}`
      const targetPath = path.join(uploadDir, fileName)

      const buffer = Buffer.from(await file.arrayBuffer())
      await writeFile(targetPath, buffer)

      urls.push(`/uploads/sedes/${tenantSchema}/${fileName}`)
    }

    return NextResponse.json(
      {
        ok: true,
        urls,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error("Admin sede upload error", error)
    return jsonError(500, "No se pudieron subir las imágenes de la sede.")
  }
}
