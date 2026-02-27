import { createHash } from "crypto"

import { findUserById } from "@/lib/auth"
import { pool } from "@/lib/db"

type ServicePriceRow = {
  id: number
  precio: number | string | null
}

type WompiMerchantResponse = {
  data?: {
    presigned_acceptance?: {
      acceptance_token?: string
    }
  }
}

type AppointmentState = "pendiente" | "completada" | "cancelada"
type PaymentState = "completo" | "pendiente" | "fallido"
type PaymentMethod = "efectivo" | "tarjeta" | "nequi" | "daviplata" | "otro"

export type WompiTransactionData = {
  id?: string | null
  status?: string | null
  reference?: string | null
  amount_in_cents?: number | null
  currency?: string | null
  payment_method_type?: string | null
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

type WompiEnvironment = "sandbox" | "production"

function getWompiEnvironment(): WompiEnvironment {
  const configuredEnvironment = process.env.WOMPI_ENV?.trim().toLowerCase()
  if (configuredEnvironment === "production") {
    return "production"
  }

  if (configuredEnvironment === "sandbox") {
    return "sandbox"
  }

  const publicKey =
    process.env.WOMPI_PUBLIC_KEY?.trim().toLowerCase() ??
    process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY?.trim().toLowerCase() ??
    ""
  if (publicKey.startsWith("pub_prod_")) {
    return "production"
  }

  if (publicKey.startsWith("pub_test_")) {
    return "sandbox"
  }

  return "sandbox"
}

function resolveWompiPublicKey(environment: WompiEnvironment): string | undefined {
  if (environment === "sandbox") {
    return (
      process.env.WOMPI_SANDBOX_PUBLIC_KEY?.trim() ??
      process.env.WOMPI_PUBLIC_KEY?.trim() ??
      process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY?.trim()
    )
  }

  return (
    process.env.WOMPI_PRODUCTION_PUBLIC_KEY?.trim() ??
    process.env.WOMPI_PUBLIC_KEY?.trim() ??
    process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY?.trim()
  )
}

function resolveWompiIntegritySecret(environment: WompiEnvironment): string | undefined {
  if (environment === "sandbox") {
    return (
      process.env.WOMPI_SANDBOX_INTEGRITY_SECRET?.trim() ??
      process.env.WOMPI_INTEGRITY_SECRET?.trim() ??
      process.env.NEXT_PUBLIC_WOMPI_INTEGRITY_SECRET?.trim()
    )
  }

  return (
    process.env.WOMPI_PRODUCTION_INTEGRITY_SECRET?.trim() ??
    process.env.WOMPI_INTEGRITY_SECRET?.trim() ??
    process.env.NEXT_PUBLIC_WOMPI_INTEGRITY_SECRET?.trim()
  )
}

export function getWompiBaseUrl() {
  const configuredBaseUrl = process.env.WOMPI_API_BASE_URL?.trim()
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, "")
  }

  const environment = getWompiEnvironment()
  return (environment === "sandbox" ? "https://sandbox.wompi.co" : "https://production.wompi.co").replace(/\/$/, "")
}

function getRequiredWompiConfig() {
  const environment = getWompiEnvironment()
  const publicKey = resolveWompiPublicKey(environment)
  const integritySecret = resolveWompiIntegritySecret(environment)

  if (!publicKey || !integritySecret) {
    const missing: string[] = []

    if (!publicKey) {
      missing.push(
        environment === "sandbox"
          ? "WOMPI_SANDBOX_PUBLIC_KEY (o WOMPI_PUBLIC_KEY)"
          : "WOMPI_PRODUCTION_PUBLIC_KEY (o WOMPI_PUBLIC_KEY)",
      )
    }

    if (!integritySecret) {
      missing.push(
        environment === "sandbox"
          ? "WOMPI_SANDBOX_INTEGRITY_SECRET (o WOMPI_INTEGRITY_SECRET)"
          : "WOMPI_PRODUCTION_INTEGRITY_SECRET (o WOMPI_INTEGRITY_SECRET)",
      )
    }

    const error = new Error("WOMPI_NOT_CONFIGURED")
    ;(error as { code?: string }).code = "WOMPI_NOT_CONFIGURED"
    ;(error as { meta?: unknown }).meta = {
      environment,
      missing,
    }
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
    const numericPrice =
      typeof row.precio === "number"
        ? row.precio
        : typeof row.precio === "string"
          ? Number.parseFloat(row.precio)
          : Number.NaN

    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      const error = new Error("SERVICE_PRICE_INVALID")
      ;(error as { code?: string }).code = "SERVICE_PRICE_INVALID"
      throw error
    }

    total += numericPrice
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

function parseAppointmentIdFromReference(reference: string | null | undefined): number | null {
  if (!reference) return null
  const trimmed = reference.trim()
  const match = /^RES-(\d+)-\d+$/i.exec(trimmed)
  if (!match) return null
  const appointmentId = Number.parseInt(match[1], 10)
  return Number.isFinite(appointmentId) && appointmentId > 0 ? appointmentId : null
}

function mapWompiStatusToPaymentState(status: string | null | undefined): PaymentState {
  const normalized = (status ?? "").trim().toUpperCase()

  if (normalized === "APPROVED") return "completo"
  if (normalized === "DECLINED" || normalized === "ERROR" || normalized === "VOIDED") return "fallido"
  return "pendiente"
}

function shouldCancelAppointmentFromWompiStatus(status: string | null | undefined): boolean {
  const normalized = (status ?? "").trim().toUpperCase()
  return normalized === "DECLINED" || normalized === "ERROR" || normalized === "VOIDED"
}

function mapWompiMethodToPaymentMethod(method: string | null | undefined): PaymentMethod {
  const normalized = (method ?? "").trim().toUpperCase()

  if (normalized === "CARD") return "tarjeta"
  if (normalized === "NEQUI") return "nequi"
  if (normalized === "DAVIPLATA") return "daviplata"
  if (normalized === "PSE") return "tarjeta"

  return "otro"
}

export async function reconcileWompiTransaction(transaction: WompiTransactionData): Promise<{
  appointmentId: number | null
  appointmentStatus: AppointmentState | null
  paymentStatus: PaymentState | null
}> {
  const appointmentId = parseAppointmentIdFromReference(transaction.reference)
  if (!appointmentId) {
    return {
      appointmentId: null,
      appointmentStatus: null,
      paymentStatus: null,
    }
  }

  const paymentStatus = mapWompiStatusToPaymentState(transaction.status)
  const shouldCancelAppointment = shouldCancelAppointmentFromWompiStatus(transaction.status)
  const amountInCents = typeof transaction.amount_in_cents === "number" ? transaction.amount_in_cents : null
  const amount = amountInCents != null && Number.isFinite(amountInCents) ? amountInCents / 100 : null
  const paymentMethod = mapWompiMethodToPaymentMethod(transaction.payment_method_type)

  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    const appointmentResult = await client.query<{ id: number; estado: AppointmentState }>(
      `SELECT id, estado
         FROM tenant_base.agendamientos
        WHERE id = $1
        LIMIT 1
        FOR UPDATE`,
      [appointmentId],
    )

    if (appointmentResult.rowCount === 0) {
      await client.query("COMMIT")
      return {
        appointmentId,
        appointmentStatus: null,
        paymentStatus,
      }
    }

    const appointmentState = appointmentResult.rows[0].estado

    const existingPaymentResult = await client.query<{ id: number }>(
      `SELECT id
         FROM tenant_base.pagos
        WHERE agendamiento_id = $1
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE`,
      [appointmentId],
    )

    if (existingPaymentResult.rowCount > 0) {
      const paymentId = existingPaymentResult.rows[0].id
      await client.query(
        `UPDATE tenant_base.pagos
            SET estado = $2::tenant_base.estado_pago_enum,
                metodo_pago = COALESCE($3::tenant_base.metodo_pago_enum, metodo_pago),
                monto = COALESCE($4::numeric, monto),
                monto_final = COALESCE($4::numeric, monto_final),
                fecha_pago = now()
          WHERE id = $1`,
        [paymentId, paymentStatus, paymentMethod, amount],
      )
    } else {
      await client.query(
        `INSERT INTO tenant_base.pagos
          (agendamiento_id, monto, monto_descuento, monto_final, metodo_pago, fecha_pago, estado)
         VALUES
          ($1, COALESCE($2::numeric, 0), 0, COALESCE($2::numeric, 0), $3::tenant_base.metodo_pago_enum, now(), $4::tenant_base.estado_pago_enum)`,
        [appointmentId, amount, paymentMethod, paymentStatus],
      )
    }

    let nextAppointmentStatus: AppointmentState = appointmentState
    if (shouldCancelAppointment && appointmentState !== "cancelada") {
      await client.query(
        `UPDATE tenant_base.agendamientos
            SET estado = 'cancelada'::tenant_base.estado_agendamiento_enum
          WHERE id = $1`,
        [appointmentId],
      )
      nextAppointmentStatus = "cancelada"
    }

    await client.query("COMMIT")

    return {
      appointmentId,
      appointmentStatus: nextAppointmentStatus,
      paymentStatus,
    }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}
