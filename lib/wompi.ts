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
    presigned_personal_data_auth?: {
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
  [key: string]: unknown
}

type ReconcileContext = {
  source?: "webhook" | "transaction_query" | "unknown"
  eventName?: string | null
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
  personalDataAuthToken: string | null
}

const PLAN_CODE_TO_REFERENCE_TOKEN: Record<string, string> = {
  fullstack: "fs",
  "fullstack-sedes": "fss",
  "fullstack-ia": "fsi",
  "fullstack-sedes-ia": "fssi",
}

const REFERENCE_TOKEN_TO_PLAN_CODE: Record<string, string> = Object.entries(PLAN_CODE_TO_REFERENCE_TOKEN).reduce(
  (accumulator, [planCode, token]) => {
    accumulator[token] = planCode
    return accumulator
  },
  {} as Record<string, string>,
)

type WompiWebhookSignature = {
  checksum?: string | null
  properties?: string[]
  timestamp?: string | number | null
}

type WompiWebhookEvent = {
  event?: string
  sent_at?: string | null
  timestamp?: string | number | null
  signature?: WompiWebhookSignature | null
  data?: Record<string, unknown>
}

type WompiEnvironment = "sandbox" | "production"

function inferEnvironmentFromPublicKey(publicKey: string | undefined): WompiEnvironment | null {
  const normalized = (publicKey ?? "").trim().toLowerCase()
  if (normalized.startsWith("pub_test_")) {
    return "sandbox"
  }

  if (normalized.startsWith("pub_prod_")) {
    return "production"
  }

  return null
}

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

function resolveWompiPrivateKey(environment: WompiEnvironment): string | undefined {
  if (environment === "sandbox") {
    return process.env.WOMPI_SANDBOX_PRIVATE_KEY?.trim() ?? process.env.WOMPI_PRIVATE_KEY?.trim()
  }

  return process.env.WOMPI_PRODUCTION_PRIVATE_KEY?.trim() ?? process.env.WOMPI_PRIVATE_KEY?.trim()
}

function resolveWompiEventsSecret(environment: WompiEnvironment): string | undefined {
  if (environment === "sandbox") {
    return process.env.WOMPI_SANDBOX_EVENTS_SECRET?.trim() ?? process.env.WOMPI_EVENTS_SECRET?.trim()
  }

  return process.env.WOMPI_PRODUCTION_EVENTS_SECRET?.trim() ?? process.env.WOMPI_EVENTS_SECRET?.trim()
}

function getRequiredWompiPrivateKey() {
  const environment = getWompiEnvironment()
  const privateKey = resolveWompiPrivateKey(environment)

  if (!privateKey) {
    const error = new Error("WOMPI_PRIVATE_KEY_NOT_CONFIGURED")
    ;(error as { code?: string }).code = "WOMPI_PRIVATE_KEY_NOT_CONFIGURED"
    throw error
  }

  return privateKey
}

function getRequiredWompiEventsSecret() {
  const environment = getWompiEnvironment()
  const eventsSecret = resolveWompiEventsSecret(environment)

  if (!eventsSecret) {
    const error = new Error("WOMPI_EVENTS_SECRET_NOT_CONFIGURED")
    ;(error as { code?: string }).code = "WOMPI_EVENTS_SECRET_NOT_CONFIGURED"
    throw error
  }

  return eventsSecret
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
  const configuredEnvironment = getWompiEnvironment()
  const publicKey = resolveWompiPublicKey(configuredEnvironment)
  const inferredEnvironment = inferEnvironmentFromPublicKey(publicKey)
  const effectiveEnvironment = inferredEnvironment ?? configuredEnvironment

  const sandboxPublicKey = process.env.WOMPI_SANDBOX_PUBLIC_KEY?.trim() ?? null
  const generalPublicKey = process.env.WOMPI_PUBLIC_KEY?.trim() ?? null
  const sandboxIntegritySecret = process.env.WOMPI_SANDBOX_INTEGRITY_SECRET?.trim() ?? null
  const generalIntegritySecret = process.env.WOMPI_INTEGRITY_SECRET?.trim() ?? null

  if (effectiveEnvironment === "sandbox") {
    if (sandboxPublicKey && generalPublicKey && sandboxPublicKey !== generalPublicKey) {
      const error = new Error("WOMPI_CONFIG_CONFLICT")
      ;(error as { code?: string }).code = "WOMPI_CONFIG_CONFLICT"
      ;(error as { meta?: unknown }).meta = {
        environment: effectiveEnvironment,
        field: "public_key",
        message: "WOMPI_SANDBOX_PUBLIC_KEY y WOMPI_PUBLIC_KEY tienen valores diferentes.",
      }
      throw error
    }

    if (sandboxIntegritySecret && generalIntegritySecret && sandboxIntegritySecret !== generalIntegritySecret) {
      const error = new Error("WOMPI_CONFIG_CONFLICT")
      ;(error as { code?: string }).code = "WOMPI_CONFIG_CONFLICT"
      ;(error as { meta?: unknown }).meta = {
        environment: effectiveEnvironment,
        field: "integrity_secret",
        message: "WOMPI_SANDBOX_INTEGRITY_SECRET y WOMPI_INTEGRITY_SECRET tienen valores diferentes.",
      }
      throw error
    }
  }

  const integritySecret = resolveWompiIntegritySecret(effectiveEnvironment)

  if (!publicKey || !integritySecret) {
    const missing: string[] = []

    if (!publicKey) {
      missing.push(
        configuredEnvironment === "sandbox"
          ? "WOMPI_SANDBOX_PUBLIC_KEY (o WOMPI_PUBLIC_KEY)"
          : "WOMPI_PRODUCTION_PUBLIC_KEY (o WOMPI_PUBLIC_KEY)",
      )
    }

    if (!integritySecret) {
      missing.push(
        effectiveEnvironment === "sandbox"
          ? "WOMPI_SANDBOX_INTEGRITY_SECRET (o WOMPI_INTEGRITY_SECRET)"
          : "WOMPI_PRODUCTION_INTEGRITY_SECRET (o WOMPI_INTEGRITY_SECRET)",
      )
    }

    const error = new Error("WOMPI_NOT_CONFIGURED")
    ;(error as { code?: string }).code = "WOMPI_NOT_CONFIGURED"
    ;(error as { meta?: unknown }).meta = {
      environment: effectiveEnvironment,
      configuredEnvironment,
      inferredEnvironment,
      missing,
    }
    throw error
  }

  return { publicKey, integritySecret }
}

function getDefaultAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000"
}

function buildRedirectUrl(reference: string, path: string = "/booking"): string {
  const configured = process.env.WOMPI_REDIRECT_URL?.trim()
  if (configured) {
    return configured
  }

  const appUrl = getDefaultAppUrl().replace(/\/$/, "")
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${appUrl}${normalizedPath}?paymentProvider=wompi&reference=${encodeURIComponent(reference)}`
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

async function getAcceptanceTokens(publicKey: string): Promise<{
  acceptanceToken: string
  personalDataAuthToken: string | null
}> {
  const response = await fetch(`${getWompiBaseUrl()}/v1/merchants/${publicKey}`, {
    method: "GET",
    cache: "no-store",
  })

  const payload = (await response.json().catch(() => ({}))) as WompiMerchantResponse

  if (!response.ok) {
    const error = new Error("WOMPI_MERCHANT_UNAVAILABLE")
    ;(error as { code?: string }).code = "WOMPI_MERCHANT_UNAVAILABLE"
    ;(error as { meta?: unknown }).meta = {
      status: response.status,
      statusText: response.statusText,
      publicKeyPrefix: publicKey.slice(0, 12),
      wompiMessage:
        typeof (payload as { error?: unknown }).error === "object" &&
        (payload as { error?: unknown }).error !== null &&
        "messages" in ((payload as { error?: unknown }).error as Record<string, unknown>)
          ? ((payload as { error: { messages?: unknown } }).error.messages ?? null)
          : null,
    }
    throw error
  }

  const token = payload.data?.presigned_acceptance?.acceptance_token?.trim()
  if (!token) {
    const error = new Error("WOMPI_ACCEPTANCE_TOKEN_MISSING")
    ;(error as { code?: string }).code = "WOMPI_ACCEPTANCE_TOKEN_MISSING"
    ;(error as { meta?: unknown }).meta = {
      status: response.status,
      publicKeyPrefix: publicKey.slice(0, 12),
    }
    throw error
  }

  const personalDataAuthToken = payload.data?.presigned_personal_data_auth?.acceptance_token?.trim() ?? null

  return {
    acceptanceToken: token,
    personalDataAuthToken,
  }
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
  const amount = amountInCents / 100
  const currency = "COP" as const
  const reference = `RES-${appointmentId}-${Date.now()}`
  const { acceptanceToken, personalDataAuthToken } = await getAcceptanceTokens(publicKey)
  const redirectUrl = buildRedirectUrl(reference)

  const existingPayment = await pool.query<{ id: number }>(
    `SELECT id
       FROM tenant_base.pagos
      WHERE agendamiento_id = $1
      ORDER BY id DESC
      LIMIT 1`,
    [appointmentId],
  )

  if (existingPayment.rowCount > 0) {
    await pool.query(
      `UPDATE tenant_base.pagos
          SET estado = 'pendiente'::tenant_base.estado_pago_enum,
              proveedor_pago = 'wompi',
              metodo_pago = COALESCE(metodo_pago, 'otro'::tenant_base.metodo_pago_enum),
              monto = COALESCE(monto, $2::numeric),
              wompi_reference = COALESCE($3::text, wompi_reference),
              wompi_currency = COALESCE($4::text, wompi_currency),
              wompi_status = 'PENDING',
              wompi_payload_updated_at = now(),
              fecha_pago = COALESCE(fecha_pago, now())
        WHERE id = $1`,
      [existingPayment.rows[0].id, amount, reference, currency],
    )
  } else {
    await pool.query(
      `INSERT INTO tenant_base.pagos
        (agendamiento_id, monto, monto_descuento, metodo_pago, fecha_pago, estado, proveedor_pago, wompi_reference, wompi_currency, wompi_status, wompi_payload_updated_at)
       VALUES
        ($1, $2::numeric, 0, 'otro'::tenant_base.metodo_pago_enum, now(), 'pendiente'::tenant_base.estado_pago_enum, 'wompi', $3::text, $4::text, 'PENDING', now())`,
      [appointmentId, amount, reference, currency],
    )
  }

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
    personalDataAuthToken,
  }
}

export async function createWompiCheckoutDataForSaasPlan(options: {
  tenantId: number
  planCode: string
  billingCycle: "mensual" | "trimestral" | "anual"
  amountInCop: number
  currency?: "COP"
}): Promise<WompiCheckoutData> {
  const { tenantId, planCode, billingCycle, amountInCop } = options
  const normalizedPlanCode = planCode.trim().toLowerCase()
  const normalizedCycle = billingCycle.trim().toLowerCase()
  const planToken = PLAN_CODE_TO_REFERENCE_TOKEN[normalizedPlanCode] ?? "custom"
  const cycleToken = normalizedCycle === "trimestral" ? "t" : normalizedCycle === "anual" ? "a" : "m"
  const amountInCents = Math.round(amountInCop * 100)

  if (!Number.isFinite(amountInCents) || amountInCents <= 0) {
    const error = new Error("AMOUNT_INVALID")
    ;(error as { code?: string }).code = "AMOUNT_INVALID"
    throw error
  }

  const { publicKey, integritySecret } = getRequiredWompiConfig()
  const timestampToken = Date.now().toString(36).toUpperCase()
  const reference = `B${tenantId}-P${planToken.toUpperCase()}-C${cycleToken.toUpperCase()}-${timestampToken}`
  const { acceptanceToken, personalDataAuthToken } = await getAcceptanceTokens(publicKey)
  const signatureIntegrity = createHash("sha256")
    .update(`${reference}${amountInCents}COP${integritySecret}`)
    .digest("hex")

  const fallbackCustomerEmail =
    process.env.WOMPI_DEFAULT_CUSTOMER_EMAIL?.trim() ||
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() ||
    "cliente@softdatai.co"

  return {
    publicKey,
    currency: "COP",
    amountInCents,
    reference,
    signatureIntegrity,
    redirectUrl: buildRedirectUrl(reference, "/admin/planes"),
    customerEmail: fallbackCustomerEmail,
    acceptanceToken,
    personalDataAuthToken,
  }
}

function getNestedValueByPath(source: Record<string, unknown>, path: string): string {
  const segments = path
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean)

  let current: unknown = source

  for (const segment of segments) {
    if (typeof current !== "object" || current === null || !(segment in current)) {
      return ""
    }

    current = (current as Record<string, unknown>)[segment]
  }

  if (current === null || typeof current === "undefined") {
    return ""
  }

  if (typeof current === "string") {
    return current
  }

  if (typeof current === "number" || typeof current === "boolean") {
    return String(current)
  }

  return ""
}

function normalizeWebhookSignatureProperties(properties: unknown): string[] {
  if (!Array.isArray(properties)) {
    return []
  }

  return properties
    .filter((property): property is string => typeof property === "string")
    .map((property) => property.trim())
    .filter(Boolean)
}

export function parseTenantBillingReference(reference: string | null | undefined): {
  tenantId: number | null
  planCode: string | null
  billingCycle: "mensual" | "trimestral" | "anual" | null
} {
  if (typeof reference !== "string") {
    return {
      tenantId: null,
      planCode: null,
      billingCycle: null,
    }
  }

  const trimmed = reference.trim().toUpperCase()
  const normalizedPlanTokens = Object.keys(REFERENCE_TOKEN_TO_PLAN_CODE)
    .map((token) => token.toUpperCase())
    .sort((left, right) => right.length - left.length)

  const tokenPattern = normalizedPlanTokens.join("|")
  const delimitedPattern = new RegExp(`^B(\\d+)-P(${tokenPattern})-C([MTA])-[A-Z0-9]+$`, "i")
  const legacyCompactPattern = new RegExp(`^B(\\d+)P(${tokenPattern})C([MTA])[A-Z0-9]+$`, "i")

  const match = delimitedPattern.exec(trimmed) ?? legacyCompactPattern.exec(trimmed)

  if (!match) {
    return {
      tenantId: null,
      planCode: null,
      billingCycle: null,
    }
  }

  const tenantId = Number.parseInt(match[1], 10)
  const planToken = match[2].toLowerCase()
  const cycleToken = match[3].toUpperCase()
  const decodedPlanCode = REFERENCE_TOKEN_TO_PLAN_CODE[planToken] ?? null
  const decodedCycle = cycleToken === "T" ? "trimestral" : cycleToken === "A" ? "anual" : "mensual"

  return {
    tenantId: Number.isInteger(tenantId) && tenantId > 0 ? tenantId : null,
    planCode: decodedPlanCode,
    billingCycle: decodedCycle,
  }
}

export async function fetchWompiTransactionById(transactionId: string): Promise<WompiTransactionData | null> {
  const normalized = transactionId.trim()
  if (!normalized) {
    return null
  }

  const privateKey = getRequiredWompiPrivateKey()
  const response = await fetch(`${getWompiBaseUrl()}/v1/transactions/${encodeURIComponent(normalized)}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${privateKey}`,
    },
  })

  const payload = (await response.json().catch(() => ({}))) as { data?: WompiTransactionData }
  if (!response.ok || !payload?.data) {
    return null
  }

  return payload.data
}

export function verifyWompiWebhookSignature(rawBody: string, payload: WompiWebhookEvent): {
  valid: boolean
  reason: string | null
} {
  const eventsSecret = getRequiredWompiEventsSecret()
  const signature = payload.signature

  if (!signature || typeof signature !== "object") {
    return { valid: false, reason: "missing_signature" }
  }

  const checksum = typeof signature.checksum === "string" ? signature.checksum.trim().toLowerCase() : ""
  if (!checksum) {
    return { valid: false, reason: "missing_checksum" }
  }

  const properties = normalizeWebhookSignatureProperties(signature.properties)
  if (properties.length === 0) {
    return { valid: false, reason: "missing_properties" }
  }

  const timestampRaw = signature.timestamp ?? payload.timestamp ?? payload.sent_at ?? ""
  const timestamp = typeof timestampRaw === "number" ? String(timestampRaw) : String(timestampRaw ?? "").trim()
  if (!timestamp) {
    return { valid: false, reason: "missing_timestamp" }
  }

  const values = properties.map((propertyPath) => getNestedValueByPath((payload.data ?? {}) as Record<string, unknown>, propertyPath))
  const expected = createHash("sha256")
    .update(`${values.join("")}${timestamp}${eventsSecret}`)
    .digest("hex")
    .toLowerCase()

  const valid = checksum === expected
  if (valid) {
    return { valid: true, reason: null }
  }

  const fallbackFromRaw = createHash("sha256")
    .update(`${rawBody}${eventsSecret}`)
    .digest("hex")
    .toLowerCase()

  return {
    valid: checksum === fallbackFromRaw,
    reason: checksum === fallbackFromRaw ? null : "checksum_mismatch",
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

export async function reconcileWompiTransaction(
  transaction: WompiTransactionData,
  context: ReconcileContext = {},
): Promise<{
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
  const wompiTransactionId = typeof transaction.id === "string" ? transaction.id.trim() : ""
  const wompiReference = typeof transaction.reference === "string" ? transaction.reference.trim() : ""
  const wompiCurrency = typeof transaction.currency === "string" ? transaction.currency.trim() : ""
  const wompiStatus = typeof transaction.status === "string" ? transaction.status.trim().toUpperCase() : ""
  const wompiPayload = JSON.stringify(transaction)
  const wompiEventName = context.eventName?.trim() || null

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
                proveedor_pago = 'wompi',
                metodo_pago = COALESCE($3::tenant_base.metodo_pago_enum, metodo_pago),
                monto = COALESCE($4::numeric, monto),
                wompi_transaction_id = COALESCE(NULLIF($5::text, ''), wompi_transaction_id),
                wompi_reference = COALESCE(NULLIF($6::text, ''), wompi_reference),
                wompi_currency = COALESCE(NULLIF($7::text, ''), wompi_currency),
                wompi_status = COALESCE(NULLIF($8::text, ''), wompi_status),
                wompi_event_name = COALESCE($9::text, wompi_event_name),
                wompi_payload = COALESCE($10::jsonb, wompi_payload),
                wompi_payload_updated_at = now(),
                fecha_pago = now()
          WHERE id = $1`,
        [
          paymentId,
          paymentStatus,
          paymentMethod,
          amount,
          wompiTransactionId,
          wompiReference,
          wompiCurrency,
          wompiStatus,
          wompiEventName,
          wompiPayload,
        ],
      )
    } else {
      await client.query(
        `INSERT INTO tenant_base.pagos
          (agendamiento_id, monto, monto_descuento, metodo_pago, fecha_pago, estado, proveedor_pago, wompi_transaction_id, wompi_reference, wompi_currency, wompi_status, wompi_event_name, wompi_payload, wompi_payload_updated_at)
         VALUES
          ($1, COALESCE($2::numeric, 0), 0, $3::tenant_base.metodo_pago_enum, now(), $4::tenant_base.estado_pago_enum, 'wompi', NULLIF($5::text, ''), NULLIF($6::text, ''), NULLIF($7::text, ''), NULLIF($8::text, ''), $9::text, $10::jsonb, now())`,
        [
          appointmentId,
          amount,
          paymentMethod,
          paymentStatus,
          wompiTransactionId,
          wompiReference,
          wompiCurrency,
          wompiStatus,
          wompiEventName,
          wompiPayload,
        ],
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
