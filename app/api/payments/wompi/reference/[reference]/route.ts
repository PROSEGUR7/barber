import { NextResponse } from "next/server"

import { fetchLatestWompiTransactionByReference } from "@/lib/wompi"

type Params = {
  params: Promise<{ reference: string }>
}

export async function GET(_: Request, context: Params) {
  const { reference } = await context.params

  if (!reference?.trim()) {
    return NextResponse.json({ error: "reference requerido" }, { status: 400 })
  }

  try {
    const transaction = await fetchLatestWompiTransactionByReference(reference)

    if (!transaction) {
      return NextResponse.json(
        { error: "No se encontró transacción de Wompi para la referencia" },
        { status: 404 },
      )
    }

    const transactionId =
      typeof transaction.id === "string" && transaction.id.trim()
        ? transaction.id.trim()
        : null

    return NextResponse.json(
      {
        ok: true,
        reference,
        transactionId,
        status: transaction.status ?? null,
        amountInCents: transaction.amount_in_cents ?? null,
        currency: transaction.currency ?? null,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("Error resolving Wompi transaction by reference", error)
    return NextResponse.json(
      { error: "No se pudo resolver la transacción por referencia" },
      { status: 500 },
    )
  }
}
