import { NextResponse } from "next/server"

type Params = {
  params: Promise<{ transactionId: string }>
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

function getWompiBaseUrl() {
  return (process.env.WOMPI_API_BASE_URL ?? "https://production.wompi.co").replace(/\/$/, "")
}

export async function GET(_: Request, context: Params) {
  const { transactionId } = await context.params

  if (!transactionId?.trim()) {
    return NextResponse.json({ error: "transactionId requerido" }, { status: 400 })
  }

  try {
    const response = await fetch(`${getWompiBaseUrl()}/v1/transactions/${encodeURIComponent(transactionId)}`, {
      method: "GET",
      cache: "no-store",
    })

    const payload = (await response.json().catch(() => ({}))) as WompiTransactionResponse

    if (!response.ok || !payload.data) {
      return NextResponse.json(
        { error: "No se pudo consultar la transacción en Wompi" },
        { status: 502 },
      )
    }

    return NextResponse.json(
      {
        id: payload.data.id ?? transactionId,
        status: payload.data.status ?? "UNKNOWN",
        reference: payload.data.reference ?? null,
        amountInCents: payload.data.amount_in_cents ?? null,
        currency: payload.data.currency ?? "COP",
        paymentMethodType: payload.data.payment_method_type ?? null,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("Error fetching Wompi transaction", error)
    return NextResponse.json(
      { error: "Error consultando estado de pago en Wompi" },
      { status: 500 },
    )
  }
}
