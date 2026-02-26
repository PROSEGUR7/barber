import { NextResponse } from "next/server"

export const runtime = "nodejs"

type WompiWebhookPayload = {
  event?: string
  data?: {
    transaction?: {
      id?: string
      status?: string
      reference?: string
    }
  }
}

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      provider: "wompi",
      message: "Webhook endpoint ready",
    },
    { status: 200 },
  )
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as WompiWebhookPayload

    const eventName = payload?.event ?? "unknown"
    const transactionId = payload?.data?.transaction?.id ?? "unknown"
    const transactionStatus = payload?.data?.transaction?.status ?? "unknown"
    const reference = payload?.data?.transaction?.reference ?? "unknown"

    console.log("[WOMPI_WEBHOOK]", {
      event: eventName,
      transactionId,
      transactionStatus,
      reference,
    })

    return NextResponse.json({ ok: true, received: true }, { status: 200 })
  } catch (error) {
    console.error("[WOMPI_WEBHOOK_ERROR]", error)
    return NextResponse.json({ ok: false, error: "Invalid webhook payload" }, { status: 400 })
  }
}
