import { createHash } from "crypto"

import { findUserById } from "@/lib/auth"
import { pool } from "@/lib/db"

type ServicePriceRow = {
  id: number
  precio: number | null
}

type WompiMerchantResponse = {
  data?: {
    presigned_acceptance?: {
      acceptance_token?: string
    }
  }
}

export type WompiCheckoutData = {
  publicKey: string
  currency: "COP"
  amountInCents: number
  reference: string
  signatureIntegrity: string
  redirectUrl: string
  customerEmail: string
  acceptanceToken: string
}

function getWompiBaseUrl() {
  return (process.env.WOMPI_API_BASE_URL ?? "https://production.wompi.co").replace(/\/$/, "")
}

function getRequiredWompiConfig() {
  const publicKey = process.env.WOMPI_PUBLIC_KEY?.trim()
  const integritySecret = process.env.WOMPI_INTEGRITY_SECRET?.trim()

  if (!publicKey || !integritySecret) {
    const error = new Error("WOMPI_NOT_CONFIGURED")
    ;(error as { code?: string }).code = "WOMPI_NOT_CONFIGURED"
    throw error
  }

  return { publicKey, integritySecret }
}

function getDefaultAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000"
}

function buildRedirectUrl(reference: string): string {
  const configured = process.env.WOMPI_REDIRECT_URL?.trim()
  if (configured) {
    return configured
  }

  const appUrl = getDefaultAppUrl().replace(/\/$/, "")
  return `${appUrl}/booking?paymentProvider=wompi&reference=${encodeURIComponent(reference)}`
}

async function getTotalAmountInCents(serviceIds: number[]): Promise<number> {
  const result = await pool.query<ServicePriceRow>(
    `SELECT id, precio
       FROM tenant_base.servicios
      WHERE id = ANY($1::int[])
        AND estado = 'activo'`,
    [serviceIds],
  )

  if (result.rowCount !== serviceIds.length) {
    const error = new Error("SERVICE_NOT_FOUND")
    ;(error as { code?: string }).code = "SERVICE_NOT_FOUND"
    throw error
  }

  let total = 0

  for (const row of result.rows) {
    if (typeof row.precio !== "number" || !Number.isFinite(row.precio) || row.precio <= 0) {
      const error = new Error("SERVICE_PRICE_INVALID")
      ;(error as { code?: string }).code = "SERVICE_PRICE_INVALID"
      throw error
    }

    total += row.precio
  }

  const amountInCents = Math.round(total * 100)
  if (!Number.isFinite(amountInCents) || amountInCents <= 0) {
    const error = new Error("AMOUNT_INVALID")
    ;(error as { code?: string }).code = "AMOUNT_INVALID"
    throw error
  }

  return amountInCents
}

async function getAcceptanceToken(publicKey: string): Promise<string> {
  const response = await fetch(`${getWompiBaseUrl()}/v1/merchants/${publicKey}`, {
    method: "GET",
    cache: "no-store",
  })

  const payload = (await response.json().catch(() => ({}))) as WompiMerchantResponse

  if (!response.ok) {
    const error = new Error("WOMPI_MERCHANT_UNAVAILABLE")
    ;(error as { code?: string }).code = "WOMPI_MERCHANT_UNAVAILABLE"
    throw error
  }

  const token = payload.data?.presigned_acceptance?.acceptance_token?.trim()
  if (!token) {
    const error = new Error("WOMPI_ACCEPTANCE_TOKEN_MISSING")
    ;(error as { code?: string }).code = "WOMPI_ACCEPTANCE_TOKEN_MISSING"
    throw error
  }

  return token
}

export async function createWompiCheckoutDataForReservation(options: {
  userId: number
  appointmentId: number
  serviceIds: number[]
}): Promise<WompiCheckoutData> {
  const { userId, appointmentId, serviceIds } = options

  const { publicKey, integritySecret } = getRequiredWompiConfig()

  const user = await findUserById(userId)
  if (!user) {
    const error = new Error("USER_NOT_FOUND")
    ;(error as { code?: string }).code = "USER_NOT_FOUND"
    throw error
  }

  const amountInCents = await getTotalAmountInCents(serviceIds)
  const currency = "COP" as const
  const reference = `RES-${appointmentId}-${Date.now()}`
  const acceptanceToken = await getAcceptanceToken(publicKey)
  const redirectUrl = buildRedirectUrl(reference)

  const signatureIntegrity = createHash("sha256")
    .update(`${reference}${amountInCents}${currency}${integritySecret}`)
    .digest("hex")

  return {
    publicKey,
    currency,
    amountInCents,
    reference,
    signatureIntegrity,
    redirectUrl,
    customerEmail: user.email,
    acceptanceToken,
  }
}
