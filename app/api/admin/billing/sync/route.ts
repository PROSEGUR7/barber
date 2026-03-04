import { NextResponse } from "next/server"

import { triggerBillingSyncStatus } from "@/lib/admin-billing"

export const runtime = "nodejs"

function unauthorized() {
  return NextResponse.json(
    {
      ok: false,
      code: "UNAUTHORIZED",
      error: "No autorizado.",
    },
    { status: 401 },
  )
}

export async function POST(request: Request) {
  const configuredSecret = process.env.BILLING_SYNC_SECRET?.trim()

  if (configuredSecret) {
    const headerSecret = request.headers.get("x-billing-sync-secret")?.trim() ?? ""
    if (!headerSecret || headerSecret !== configuredSecret) {
      return unauthorized()
    }
  }

  try {
    const metrics = await triggerBillingSyncStatus()

    console.log("[BILLING_SYNC_STATUS_METRICS]", metrics)

    return NextResponse.json(
      {
        ok: true,
        metrics,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("[BILLING_SYNC_STATUS_ERROR]", error)
    return NextResponse.json(
      {
        ok: false,
        code: "BILLING_SYNC_FAILED",
        error: "No se pudo sincronizar estado de suscripciones.",
      },
      { status: 500 },
    )
  }
}
