import { NextResponse } from "next/server"

export const runtime = "nodejs"

type MetaWebhookBody = {
  object?: string
  entry?: Array<{
    id?: string
    changes?: Array<{
      field?: string
      value?: unknown
    }>
  }>
}

export async function GET(request: Request) {
  const verifyToken = process.env.META_VERIFY_TOKEN?.trim()

  if (!verifyToken) {
    return NextResponse.json(
      {
        ok: false,
        error: "META_VERIFY_TOKEN no está configurado en el servidor.",
      },
      { status: 503 },
    )
  }

  const { searchParams } = new URL(request.url)
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    })
  }

  return NextResponse.json(
    {
      ok: false,
      error: "Webhook verification failed.",
    },
    { status: 403 },
  )
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as MetaWebhookBody

    if (payload.object !== "whatsapp_business_account") {
      return NextResponse.json({ ok: true, ignored: true }, { status: 200 })
    }

    console.log("Meta webhook event received", {
      object: payload.object,
      entries: Array.isArray(payload.entry) ? payload.entry.length : 0,
    })

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error("Meta webhook parse error", error)
    return NextResponse.json(
      {
        ok: false,
        error: "No se pudo procesar el webhook de Meta.",
      },
      { status: 400 },
    )
  }
}
