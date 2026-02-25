import { NextResponse } from "next/server"

import { fetchMetaMedia } from "@/lib/meta-chat"

export const runtime = "nodejs"

type Params = {
  params: Promise<{ mediaId: string }>
}

export async function GET(_: Request, context: Params) {
  const { mediaId } = await context.params

  try {
    const media = await fetchMetaMedia(decodeURIComponent(mediaId))

    return new NextResponse(media.buffer, {
      status: 200,
      headers: {
        "Content-Type": media.contentType,
        "Cache-Control": "private, max-age=120",
      },
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : "MEDIA_FETCH_ERROR"
    console.error("Conversation media API error", error)

    return NextResponse.json(
      {
        ok: false,
        code: "MEDIA_FETCH_ERROR",
        error: "No se pudo cargar el archivo multimedia.",
        detail,
      },
      { status: 500 },
    )
  }
}
