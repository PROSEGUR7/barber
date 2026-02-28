import { NextResponse } from "next/server"

import { getWompiBaseUrl, reconcileWompiTransaction } from "@/lib/wompi"

export const runtime = "nodejs"

type WompiWebhookPayload = {
  event?: string
  data?: {
    transaction?: {
      id?: string
      status?: string
      reference?: string
      amount_in_cents?: number
      currency?: string
      payment_method_type?: string
    }
  }
}

type WompiTransactionResponse = {
  data?: {
    id?: string
    status?: string
    reference?: string
    amount_in_cents?: number
    currency?: string
    payment_method_type?: string
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

    console.log("[WOMPI_WEBHOOK_RECEIVED]", {
      event: eventName,
      transactionId,
      transactionStatus,
      reference,
    })

    let transactionForReconciliation = payload?.data?.transaction ?? null

    if (transactionId !== "unknown") {
      const response = await fetch(`${getWompiBaseUrl()}/v1/transactions/${encodeURIComponent(transactionId)}`, {
        method: "GET",
        cache: "no-store",
      })

      const latest = (await response.json().catch(() => ({}))) as WompiTransactionResponse
      if (response.ok && latest.data) {
        transactionForReconciliation = latest.data
      }
    }

    let reconciliation = null
    if (transactionForReconciliation) {
      reconciliation = await reconcileWompiTransaction(transactionForReconciliation, {
        source: "webhook",
        eventName,
      })
    }

    console.log("[WOMPI_WEBHOOK_RECONCILED]", {
      event: eventName,
      transactionId,
      reconciliation,
    })

    return NextResponse.json({ ok: true, received: true, reconciliation }, { status: 200 })
  } catch (error) {
    console.error("[WOMPI_WEBHOOK_ERROR]", error)
    return NextResponse.json({ ok: false, error: "Invalid webhook payload" }, { status: 400 })
  }
}
