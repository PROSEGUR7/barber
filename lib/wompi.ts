import { createHash } from "crypto"

import { BASE_TENANT_SCHEMA, findUserById } from "@/lib/auth"
import { pool } from "@/lib/db"
import { normalizeTenantSchema, tenantSql } from "@/lib/tenant"
import { getReservationPricingBreakdown } from "@/lib/wallet"

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

type ReservationClientSnapshot = {
  clientId: number | null
  userId: number | null
  clientName: string | null
  clientPhone: string | null
  userEmail: string | null
}

type ExistingPaymentSnapshot = {
  id: number
  estado: string | null
  wompi_status: string | null
  wompi_transaction_id: string | null
}

type N8nReservationPaymentEventPayload = {
  eventType: "reservation_payment.wompi.updated"
  source: ReconcileContext["source"]
  occurredAt: string
  tenantSchema: string
  appointmentId: number
  appointmentStatus: AppointmentState | null
  payment: {
    state: PaymentState | null
    provider: "wompi"
    method: PaymentMethod
    amount: number | null
    amountInCents: number | null
    currency: string | null
    wompiStatus: string | null
    wompiTransactionId: string | null
    wompiReference: string | null
    wompiEventName: string | null
  }
  client: {
    id: number | null
    userId: number | null
    name: string | null
    phone: string | null
    email: string | null
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

function isValidWompiPublicKey(value: string): boolean {
  const normalized = value.trim()
  return /^pub_(test|prod)_[a-zA-Z0-9]+$/.test(normalized)
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

  if (publicKey && !isValidWompiPublicKey(publicKey)) {
    const error = new Error("WOMPI_PUBLIC_KEY_INVALID")
    ;(error as { code?: string }).code = "WOMPI_PUBLIC_KEY_INVALID"
    ;(error as { meta?: unknown }).meta = {
      environment: effectiveEnvironment,
      publicKeyPrefix: publicKey.slice(0, 12),
    }
    throw error
  }

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
  promoCode?: string | null
  tenantSchema?: string | null
}): Promise<WompiCheckoutData> {
  const { userId, appointmentId, serviceIds } = options
  const resolvedTenantSchema = normalizeTenantSchema(options.tenantSchema) ?? BASE_TENANT_SCHEMA

  const { publicKey, integritySecret } = getRequiredWompiConfig()

  const user = await findUserById(userId, resolvedTenantSchema)
  if (!user) {
    const error = new Error("USER_NOT_FOUND")
    ;(error as { code?: string }).code = "USER_NOT_FOUND"
    throw error
  }

  const pricing = await getReservationPricingBreakdown({
    serviceIds,
    promoCode: options.promoCode,
    tenantSchema: resolvedTenantSchema,
  })

  const amountInCents = Math.round(pricing.finalTotal * 100)
  if (!Number.isFinite(amountInCents) || amountInCents <= 0) {
    const error = new Error("AMOUNT_INVALID")
    ;(error as { code?: string }).code = "AMOUNT_INVALID"
    throw error
  }
  const subtotalAmount = pricing.originalTotal
  const discountAmount = pricing.discountTotal
  const currency = "COP" as const
  const reference = `RES-${resolvedTenantSchema}-${appointmentId}-${Date.now()}`
  const { acceptanceToken, personalDataAuthToken } = await getAcceptanceTokens(publicKey)
  const redirectUrl = buildRedirectUrl(reference)

  const existingPayment = await pool.query<{ id: number }>(
    tenantSql(`SELECT id
       FROM tenant_base.pagos
      WHERE agendamiento_id = $1
      ORDER BY id DESC
      LIMIT 1`, resolvedTenantSchema),
    [appointmentId],
  )

  if (existingPayment.rowCount > 0) {
    await pool.query(
      tenantSql(`UPDATE tenant_base.pagos
          SET estado = 'pendiente'::tenant_base.estado_pago_enum,
              proveedor_pago = 'wompi',
              metodo_pago = COALESCE(metodo_pago, 'otro'::tenant_base.metodo_pago_enum),
              monto = COALESCE($2::numeric, monto),
              monto_descuento = COALESCE($5::numeric, monto_descuento, 0),
              wompi_reference = COALESCE($3::text, wompi_reference),
              wompi_currency = COALESCE($4::text, wompi_currency),
              wompi_status = 'PENDING',
              wompi_payload_updated_at = now(),
              fecha_pago = COALESCE(fecha_pago, now())
        WHERE id = $1`, resolvedTenantSchema),
      [existingPayment.rows[0].id, subtotalAmount, reference, currency, discountAmount],
    )
  } else {
    await pool.query(
      tenantSql(`INSERT INTO tenant_base.pagos
        (agendamiento_id, monto, monto_descuento, metodo_pago, fecha_pago, estado, proveedor_pago, wompi_reference, wompi_currency, wompi_status, wompi_payload_updated_at)
       VALUES
        ($1, $2::numeric, $5::numeric, 'otro'::tenant_base.metodo_pago_enum, now(), 'pendiente'::tenant_base.estado_pago_enum, 'wompi', $3::text, $4::text, 'PENDING', now())`, resolvedTenantSchema),
      [appointmentId, subtotalAmount, reference, currency, discountAmount],
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

export async function fetchLatestWompiTransactionByReference(reference: string): Promise<WompiTransactionData | null> {
  const normalized = reference.trim()
  if (!normalized) {
    return null
  }

  const privateKey = getRequiredWompiPrivateKey()
  const response = await fetch(
    `${getWompiBaseUrl()}/v1/transactions?reference=${encodeURIComponent(normalized)}`,
    {
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${privateKey}`,
      },
    },
  )

  const payload = (await response.json().catch(() => ({}))) as {
    data?: WompiTransactionData[]
  }

  if (!response.ok || !Array.isArray(payload?.data) || payload.data.length === 0) {
    return null
  }

  const sorted = [...payload.data].sort((left, right) => {
    const leftRecord = left as Record<string, unknown>
    const rightRecord = right as Record<string, unknown>
    const leftDate =
      typeof leftRecord.finalized_at === "string"
        ? new Date(leftRecord.finalized_at).getTime()
        : typeof leftRecord.created_at === "string"
          ? new Date(leftRecord.created_at).getTime()
          : 0
    const rightDate =
      typeof rightRecord.finalized_at === "string"
        ? new Date(rightRecord.finalized_at).getTime()
        : typeof rightRecord.created_at === "string"
          ? new Date(rightRecord.created_at).getTime()
          : 0

    return rightDate - leftDate
  })

  return sorted[0] ?? null
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

function parseReservationReference(reference: string | null | undefined): {
  appointmentId: number | null
  tenantSchemaHint: string | null
} {
  if (!reference) {
    return { appointmentId: null, tenantSchemaHint: null }
  }

  const trimmed = reference.trim()
  const tenantAware = /^RES-(tenant_[a-z0-9_]+)-(\d+)-\d+$/i.exec(trimmed)
  if (tenantAware) {
    const tenantSchemaHint = normalizeTenantSchema(tenantAware[1])
    const appointmentId = Number.parseInt(tenantAware[2], 10)
    return {
      appointmentId: Number.isFinite(appointmentId) && appointmentId > 0 ? appointmentId : null,
      tenantSchemaHint,
    }
  }

  const legacy = /^RES-(\d+)-\d+$/i.exec(trimmed)
  if (!legacy) {
    return { appointmentId: null, tenantSchemaHint: null }
  }

  const appointmentId = Number.parseInt(legacy[1], 10)
  return {
    appointmentId: Number.isFinite(appointmentId) && appointmentId > 0 ? appointmentId : null,
    tenantSchemaHint: null,
  }
}

async function getTenantSchemas(): Promise<string[]> {
  const result = await pool.query<{ nspname: string }>(
    `SELECT nspname
       FROM pg_namespace
      WHERE nspname = 'tenant_base' OR nspname LIKE 'tenant\\_%' ESCAPE '\\'
      ORDER BY nspname ASC`,
  )

  return result.rows
    .map((row) => normalizeTenantSchema(row.nspname) ?? row.nspname)
    .filter((schema, index, array) => schema && array.indexOf(schema) === index)
}

async function findTenantForReservationPayment(options: {
  wompiReference: string
  wompiTransactionId: string
  appointmentId: number | null
  tenantSchemaHint?: string | null
}): Promise<{ tenantSchema: string; appointmentId: number } | null> {
  const candidateSchemas = options.tenantSchemaHint
    ? [options.tenantSchemaHint, ...(await getTenantSchemas()).filter((schema) => schema !== options.tenantSchemaHint)]
    : await getTenantSchemas()

  for (const tenantSchema of candidateSchemas) {
    if (options.wompiReference || options.wompiTransactionId) {
      const paymentMatch = await pool.query<{ agendamiento_id: number }>(
        tenantSql(
          `SELECT agendamiento_id
             FROM tenant_base.pagos
            WHERE ($1::text <> '' AND wompi_reference = $1::text)
               OR ($2::text <> '' AND wompi_transaction_id = $2::text)
            ORDER BY id DESC
            LIMIT 1`,
          tenantSchema,
        ),
        [options.wompiReference, options.wompiTransactionId],
      )

      if (paymentMatch.rowCount > 0) {
        return {
          tenantSchema,
          appointmentId: paymentMatch.rows[0].agendamiento_id,
        }
      }
    }

    if (options.appointmentId) {
      const appointmentMatch = await pool.query<{ id: number }>(
        tenantSql(`SELECT id FROM tenant_base.agendamientos WHERE id = $1 LIMIT 1`, tenantSchema),
        [options.appointmentId],
      )

      if (appointmentMatch.rowCount > 0) {
        return {
          tenantSchema,
          appointmentId: options.appointmentId,
        }
      }
    }
  }

  return null
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

function normalizeStatusForComparison(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase()
}

function getN8nReservationPaymentWebhookUrl(): string | null {
  const configured =
    process.env.N8N_WEBHOOK_PAYMENTS_URL?.trim() ||
    process.env.N8N_WEBHOOK_URL?.trim() ||
    process.env.N8N_WEBHOOK_TEST_URL?.trim() ||
    ""

  if (!configured) {
    return null
  }

  return configured
}

async function sendReservationPaymentEventToN8n(
  payload: N8nReservationPaymentEventPayload,
): Promise<void> {
  const webhookUrl = getN8nReservationPaymentWebhookUrl()
  if (!webhookUrl) {
    return
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    })

    if (!response.ok) {
      console.error("[N8N_WOMPI_PAYMENT_WEBHOOK_FAILED]", {
        status: response.status,
        statusText: response.statusText,
        tenantSchema: payload.tenantSchema,
        appointmentId: payload.appointmentId,
        wompiTransactionId: payload.payment.wompiTransactionId,
        wompiReference: payload.payment.wompiReference,
      })
      return
    }

    console.log("[N8N_WOMPI_PAYMENT_WEBHOOK_SENT]", {
      tenantSchema: payload.tenantSchema,
      appointmentId: payload.appointmentId,
      wompiTransactionId: payload.payment.wompiTransactionId,
      wompiReference: payload.payment.wompiReference,
      wompiStatus: payload.payment.wompiStatus,
    })
  } catch (error) {
    console.error("[N8N_WOMPI_PAYMENT_WEBHOOK_ERROR]", {
      tenantSchema: payload.tenantSchema,
      appointmentId: payload.appointmentId,
      wompiTransactionId: payload.payment.wompiTransactionId,
      wompiReference: payload.payment.wompiReference,
      error,
    })
  }
}

export async function reconcileWompiTransaction(
  transaction: WompiTransactionData,
  context: ReconcileContext = {},
): Promise<{
  appointmentId: number | null
  appointmentStatus: AppointmentState | null
  paymentStatus: PaymentState | null
}> {
  const parsedReservation = parseReservationReference(transaction.reference)
  const wompiTransactionId = typeof transaction.id === "string" ? transaction.id.trim() : ""
  const wompiReference = typeof transaction.reference === "string" ? transaction.reference.trim() : ""

  const matchedTenant = await findTenantForReservationPayment({
    wompiReference,
    wompiTransactionId,
    appointmentId: parsedReservation.appointmentId,
    tenantSchemaHint: parsedReservation.tenantSchemaHint,
  })

  if (!matchedTenant) {
    return {
      appointmentId: parsedReservation.appointmentId,
      appointmentStatus: null,
      paymentStatus: null,
    }
  }

  const resolvedTenantSchema = matchedTenant.tenantSchema
  const appointmentId = matchedTenant.appointmentId

  const paymentStatus = mapWompiStatusToPaymentState(transaction.status)
  const shouldCancelAppointment = shouldCancelAppointmentFromWompiStatus(transaction.status)
  const amountInCents = typeof transaction.amount_in_cents === "number" ? transaction.amount_in_cents : null
  const amount = amountInCents != null && Number.isFinite(amountInCents) ? amountInCents / 100 : null
  const paymentMethod = mapWompiMethodToPaymentMethod(transaction.payment_method_type)
  const wompiCurrency = typeof transaction.currency === "string" ? transaction.currency.trim() : ""
  const wompiStatus = typeof transaction.status === "string" ? transaction.status.trim().toUpperCase() : ""
  const wompiPayload = JSON.stringify(transaction)
  const wompiEventName = context.eventName?.trim() || null
  const normalizedWompiStatus = normalizeStatusForComparison(wompiStatus)

  const client = await pool.connect()
  let clientSnapshot: ReservationClientSnapshot = {
    clientId: null,
    userId: null,
    clientName: null,
    clientPhone: null,
    userEmail: null,
  }
  let shouldEmitN8nWebhook = false
  let nextAppointmentStatusForEvent: AppointmentState | null = null

  try {
    await client.query("BEGIN")

    const appointmentResult = await client.query<{
      id: number
      estado: AppointmentState
      cliente_id: number | null
      user_id: number | null
      cliente_nombre: string | null
      cliente_telefono: string | null
      user_correo: string | null
    }>(
      tenantSql(`SELECT a.id,
            a.estado,
            a.cliente_id,
            c.user_id,
            c.nombre AS cliente_nombre,
            c.telefono AS cliente_telefono,
            u.correo AS user_correo
        FROM tenant_base.agendamientos a
         LEFT JOIN tenant_base.clientes c ON c.id = a.cliente_id
         LEFT JOIN tenant_base.users u ON u.id = c.user_id
        WHERE a.id = $1
        LIMIT 1
        FOR UPDATE OF a`, resolvedTenantSchema),
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

    const appointmentRow = appointmentResult.rows[0]
    const appointmentState = appointmentRow.estado
    clientSnapshot = {
      clientId: appointmentRow.cliente_id,
      userId: appointmentRow.user_id,
      clientName: appointmentRow.cliente_nombre,
      clientPhone: appointmentRow.cliente_telefono,
      userEmail: appointmentRow.user_correo,
    }

    const existingPaymentResult = await client.query<ExistingPaymentSnapshot>(
      tenantSql(`SELECT id,
            estado::text AS estado,
            wompi_status,
            wompi_transaction_id
         FROM tenant_base.pagos
        WHERE agendamiento_id = $1
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE`, resolvedTenantSchema),
      [appointmentId],
    )

    if (existingPaymentResult.rowCount > 0) {
      const existingPayment = existingPaymentResult.rows[0]
      const paymentId = existingPayment.id
      const previousPaymentState = normalizeStatusForComparison(existingPayment.estado)
      const previousWompiStatus = normalizeStatusForComparison(existingPayment.wompi_status)
      const previousTransactionId = (existingPayment.wompi_transaction_id ?? "").trim()

      shouldEmitN8nWebhook =
        previousPaymentState !== normalizeStatusForComparison(paymentStatus) ||
        previousWompiStatus !== normalizedWompiStatus ||
        previousTransactionId !== wompiTransactionId

      await client.query(
        tenantSql(`UPDATE tenant_base.pagos
            SET estado = $2::tenant_base.estado_pago_enum,
                proveedor_pago = 'wompi',
                metodo_pago = COALESCE($3::tenant_base.metodo_pago_enum, metodo_pago),
                monto = CASE
                  WHEN monto IS NOT NULL AND monto > 0 AND COALESCE(monto_descuento, 0) > 0 THEN monto
                  ELSE COALESCE($4::numeric, monto)
                END,
                wompi_transaction_id = COALESCE(NULLIF($5::text, ''), wompi_transaction_id),
                wompi_reference = COALESCE(NULLIF($6::text, ''), wompi_reference),
                wompi_currency = COALESCE(NULLIF($7::text, ''), wompi_currency),
                wompi_status = COALESCE(NULLIF($8::text, ''), wompi_status),
                wompi_event_name = COALESCE($9::text, wompi_event_name),
                wompi_payload = COALESCE($10::jsonb, wompi_payload),
                wompi_payload_updated_at = now(),
                fecha_pago = now()
          WHERE id = $1`, resolvedTenantSchema),
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
      shouldEmitN8nWebhook = true

      await client.query(
        tenantSql(`INSERT INTO tenant_base.pagos
          (agendamiento_id, monto, monto_descuento, metodo_pago, fecha_pago, estado, proveedor_pago, wompi_transaction_id, wompi_reference, wompi_currency, wompi_status, wompi_event_name, wompi_payload, wompi_payload_updated_at)
         VALUES
          ($1, COALESCE($2::numeric, 0), 0, $3::tenant_base.metodo_pago_enum, now(), $4::tenant_base.estado_pago_enum, 'wompi', NULLIF($5::text, ''), NULLIF($6::text, ''), NULLIF($7::text, ''), NULLIF($8::text, ''), $9::text, $10::jsonb, now())`, resolvedTenantSchema),
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
        tenantSql(`UPDATE tenant_base.agendamientos
            SET estado = 'cancelada'::tenant_base.estado_agendamiento_enum
          WHERE id = $1`, resolvedTenantSchema),
        [appointmentId],
      )
      nextAppointmentStatus = "cancelada"
    }

    nextAppointmentStatusForEvent = nextAppointmentStatus

    await client.query("COMMIT")

    if (shouldEmitN8nWebhook) {
      await sendReservationPaymentEventToN8n({
        eventType: "reservation_payment.wompi.updated",
        source: context.source ?? "unknown",
        occurredAt: new Date().toISOString(),
        tenantSchema: resolvedTenantSchema,
        appointmentId,
        appointmentStatus: nextAppointmentStatusForEvent,
        payment: {
          state: paymentStatus,
          provider: "wompi",
          method: paymentMethod,
          amount,
          amountInCents,
          currency: wompiCurrency || null,
          wompiStatus: normalizedWompiStatus || null,
          wompiTransactionId: wompiTransactionId || null,
          wompiReference: wompiReference || null,
          wompiEventName,
        },
        client: {
          id: clientSnapshot.clientId,
          userId: clientSnapshot.userId,
          name: clientSnapshot.clientName,
          phone: clientSnapshot.clientPhone,
          email: clientSnapshot.userEmail,
        },
      })
    }

    return {
      appointmentId,
      appointmentStatus: nextAppointmentStatusForEvent,
      paymentStatus,
    }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}
