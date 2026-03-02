import { pool } from "@/lib/db"

const TENANT_SCHEMA_PATTERN = /^tenant_[a-z0-9_]+$/i
const DEFAULT_TENANT_SCHEMA = "tenant_base"

const ALLOWED_SUBSCRIPTION_STATES = new Set(["active", "trialing"])
const BLOCKED_SUBSCRIPTION_STATES = new Set(["unpaid", "paused", "canceled", "incomplete"])

type TenantAccessSnapshot = {
  tenantId: number | null
  tenantActive: boolean | null
  subscriptionStatus: string | null
  graceUntil: string | null
  canLogin: boolean | null
  reason: string | null
}

export type TenantAccessDecision = {
  allowed: boolean
  code: string
  message: string
  status: string | null
  graceUntil: string | null
  tenantId: number | null
}

type RegisterTenantPaymentInput = {
  tenantSchema?: string | null
  tenantId?: number | null
  amount: number
  currency: string
  paymentMethod: string
  paymentProvider: string
  externalReference: string
  billingCycle?: string | null
}

type PaymentSyncClaim = {
  id: number
}

const ensuredSyncTables = new Set<string>()

function toObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function readPath(value: unknown, path: string[]): unknown {
  let current: unknown = value

  for (const key of path) {
    const obj = toObject(current)
    if (!obj || !(key in obj)) {
      return null
    }
    current = obj[key]
  }

  return current
}

function pickFirst(value: unknown, candidates: string[][]): unknown {
  for (const path of candidates) {
    const found = readPath(value, path)
    if (found !== null && found !== undefined) {
      return found
    }
  }

  return null
}

function normalizeStatus(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (normalized === "true") return true
    if (normalized === "false") return false
  }

  return null
}

function parseDateIso(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.toISOString()
}

function parseTenantId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10)
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed
    }
  }

  return null
}

function resolveTenantSchema(tenantSchema?: string | null) {
  if (!tenantSchema) {
    return DEFAULT_TENANT_SCHEMA
  }

  const normalized = tenantSchema.trim().toLowerCase()
  if (!TENANT_SCHEMA_PATTERN.test(normalized)) {
    return DEFAULT_TENANT_SCHEMA
  }

  return normalized
}

function resolveTenantId(tenantSchema?: string | null, explicitTenantId?: number | null): number | null {
  if (Number.isInteger(explicitTenantId) && (explicitTenantId as number) > 0) {
    return explicitTenantId as number
  }

  const fromEnv = parseTenantId(process.env.ADMIN_PLATFORM_TENANT_ID ?? process.env.TENANT_ADMIN_ID)
  if (fromEnv) {
    return fromEnv
  }

  const normalizedSchema = resolveTenantSchema(tenantSchema)
  const suffixMatch = /^tenant_(\d+)$/i.exec(normalizedSchema)
  if (!suffixMatch) {
    return null
  }

  return parseTenantId(suffixMatch[1])
}

function shouldFailOpenOnBillingErrors() {
  const fromEnv = (process.env.ADMIN_BILLING_FAIL_OPEN ?? "").trim().toLowerCase()
  if (fromEnv === "true") {
    return true
  }

  if (fromEnv === "false") {
    return false
  }

  return process.env.NODE_ENV !== "production"
}

function isBillingEnforcementDisabled() {
  return (process.env.ADMIN_BILLING_ENFORCEMENT_DISABLED ?? "").trim().toLowerCase() === "true"
}

function getAdminApiConfig() {
  const baseUrlRaw =
    process.env.ADMIN_BILLING_BASE_URL?.trim() ??
    process.env.ADMIN_API_BASE_URL?.trim() ??
    process.env.ADMIN_BASE_URL?.trim() ??
    ""
  const token =
    process.env.ADMIN_BILLING_SERVICE_TOKEN?.trim() ??
    process.env.ADMIN_SERVICE_TOKEN?.trim() ??
    process.env.ADMIN_API_KEY?.trim() ??
    ""

  if (!baseUrlRaw) {
    throw new Error("ADMIN_BILLING_BASE_URL_MISSING")
  }

  if (!token) {
    throw new Error("ADMIN_BILLING_SERVICE_TOKEN_MISSING")
  }

  const headerName = (process.env.ADMIN_BILLING_SERVICE_TOKEN_HEADER ?? "x-service-token").trim()
  const timeoutMs = Number.parseInt(process.env.ADMIN_BILLING_TIMEOUT_MS ?? "8000", 10)

  return {
    baseUrl: baseUrlRaw.replace(/\/$/, ""),
    token,
    headerName,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 8000,
  }
}

async function adminApiRequest(path: string, init: RequestInit = {}) {
  const config = getAdminApiConfig()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)

  try {
    const headers = new Headers(init.headers ?? {})
    headers.set(config.headerName, config.token)
    headers.set("Accept", "application/json")

    if (init.method && init.method.toUpperCase() !== "GET") {
      headers.set("Content-Type", "application/json")
    }

    return await fetch(`${config.baseUrl}${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers,
    })
  } finally {
    clearTimeout(timeout)
  }
}

function parseTenantAccessSnapshot(payload: unknown): TenantAccessSnapshot {
  const tenantId = parseTenantId(
    pickFirst(payload, [
      ["tenantId"],
      ["tenant_id"],
      ["tenant", "id"],
      ["data", "tenantId"],
      ["data", "tenant_id"],
      ["data", "tenant", "id"],
    ]),
  )

  const tenantActive = parseBoolean(
    pickFirst(payload, [
      ["tenantActivo"],
      ["tenant_activo"],
      ["tenant", "activo"],
      ["tenant", "active"],
      ["data", "tenantActivo"],
      ["data", "tenant_activo"],
      ["data", "tenant", "activo"],
      ["data", "tenant", "active"],
    ]),
  )

  const subscriptionStatus = normalizeStatus(
    pickFirst(payload, [
      ["estadoSuscripcion"],
      ["estado_suscripcion"],
      ["subscriptionStatus"],
      ["suscripcion", "estado"],
      ["tenant", "estadoSuscripcion"],
      ["tenant", "estado_suscripcion"],
      ["tenant", "subscriptionStatus"],
      ["data", "estadoSuscripcion"],
      ["data", "estado_suscripcion"],
      ["data", "subscriptionStatus"],
      ["data", "tenant", "estadoSuscripcion"],
      ["data", "tenant", "estado_suscripcion"],
      ["data", "tenant", "subscriptionStatus"],
    ]),
  )

  const graceUntil = parseDateIso(
    pickFirst(payload, [
      ["graciaHasta"],
      ["gracia_hasta"],
      ["graceUntil"],
      ["grace_until"],
      ["tenant", "graciaHasta"],
      ["tenant", "gracia_hasta"],
      ["tenant", "graceUntil"],
      ["data", "graciaHasta"],
      ["data", "gracia_hasta"],
      ["data", "graceUntil"],
      ["data", "tenant", "graciaHasta"],
      ["data", "tenant", "gracia_hasta"],
      ["data", "tenant", "graceUntil"],
    ]),
  )

  const canLogin = parseBoolean(
    pickFirst(payload, [
      ["can_login"],
      ["canLogin"],
      ["data", "can_login"],
      ["data", "canLogin"],
      ["tenant", "can_login"],
      ["tenant", "canLogin"],
    ]),
  )

  const reasonCandidate = pickFirst(payload, [
    ["reason"],
    ["motivo"],
    ["data", "reason"],
    ["data", "motivo"],
    ["tenant", "reason"],
    ["tenant", "motivo"],
  ])
  const reason = typeof reasonCandidate === "string" ? reasonCandidate.trim() || null : null

  return {
    tenantId,
    tenantActive,
    subscriptionStatus,
    graceUntil,
    canLogin,
    reason,
  }
}

function evaluateTenantAccess(snapshot: TenantAccessSnapshot, fallbackTenantId: number | null): TenantAccessDecision {
  if (snapshot.canLogin === true) {
    return {
      allowed: true,
      code: "ALLOWED",
      message: "Acceso permitido.",
      status: snapshot.subscriptionStatus,
      graceUntil: snapshot.graceUntil,
      tenantId: snapshot.tenantId ?? fallbackTenantId,
    }
  }

  if (snapshot.canLogin === false) {
    const mappedCode = snapshot.reason ? `TENANT_CAN_LOGIN_${snapshot.reason.toUpperCase()}` : "SUBSCRIPTION_BLOCKED"
    return {
      allowed: false,
      code: mappedCode,
      message: snapshot.reason
        ? `Acceso bloqueado por política de tenant: ${snapshot.reason}.`
        : "Acceso bloqueado por política de tenant.",
      status: snapshot.subscriptionStatus,
      graceUntil: snapshot.graceUntil,
      tenantId: snapshot.tenantId ?? fallbackTenantId,
    }
  }

  const now = Date.now()

  if (snapshot.tenantActive === false) {
    return {
      allowed: false,
      code: "TENANT_INACTIVE",
      message: "Tu tenant está inactivo. Contacta al administrador de la plataforma.",
      status: snapshot.subscriptionStatus,
      graceUntil: snapshot.graceUntil,
      tenantId: snapshot.tenantId ?? fallbackTenantId,
    }
  }

  if (!snapshot.subscriptionStatus) {
    return {
      allowed: false,
      code: "SUBSCRIPTION_STATUS_UNKNOWN",
      message: "No fue posible validar el estado de suscripción del tenant.",
      status: null,
      graceUntil: snapshot.graceUntil,
      tenantId: snapshot.tenantId ?? fallbackTenantId,
    }
  }

  if (ALLOWED_SUBSCRIPTION_STATES.has(snapshot.subscriptionStatus)) {
    return {
      allowed: true,
      code: "ALLOWED",
      message: "Acceso permitido.",
      status: snapshot.subscriptionStatus,
      graceUntil: snapshot.graceUntil,
      tenantId: snapshot.tenantId ?? fallbackTenantId,
    }
  }

  if (snapshot.subscriptionStatus === "past_due") {
    const graceTimestamp = snapshot.graceUntil ? new Date(snapshot.graceUntil).getTime() : Number.NaN
    if (Number.isFinite(graceTimestamp) && graceTimestamp >= now) {
      return {
        allowed: true,
        code: "PAST_DUE_IN_GRACE",
        message: "Acceso temporal en período de gracia.",
        status: snapshot.subscriptionStatus,
        graceUntil: snapshot.graceUntil,
        tenantId: snapshot.tenantId ?? fallbackTenantId,
      }
    }

    return {
      allowed: false,
      code: "PAST_DUE_NO_GRACE",
      message: "Tu suscripción está vencida y sin período de gracia vigente.",
      status: snapshot.subscriptionStatus,
      graceUntil: snapshot.graceUntil,
      tenantId: snapshot.tenantId ?? fallbackTenantId,
    }
  }

  if (BLOCKED_SUBSCRIPTION_STATES.has(snapshot.subscriptionStatus)) {
    return {
      allowed: false,
      code: "SUBSCRIPTION_BLOCKED",
      message: `Acceso bloqueado por estado de suscripción: ${snapshot.subscriptionStatus}.`,
      status: snapshot.subscriptionStatus,
      graceUntil: snapshot.graceUntil,
      tenantId: snapshot.tenantId ?? fallbackTenantId,
    }
  }

  return {
    allowed: false,
    code: "SUBSCRIPTION_STATE_NOT_ALLOWED",
    message: `Estado de suscripción no permitido: ${snapshot.subscriptionStatus}.`,
    status: snapshot.subscriptionStatus,
    graceUntil: snapshot.graceUntil,
    tenantId: snapshot.tenantId ?? fallbackTenantId,
  }
}

async function fetchTenantAccessSnapshot(tenantId: number): Promise<TenantAccessSnapshot> {
  const configuredPath = (process.env.ADMIN_BILLING_ACCESS_PATH ?? "/api/billing/overview").trim()
  const primaryPath = configuredPath.startsWith("/") ? configuredPath : `/${configuredPath}`
  const queryGlue = primaryPath.includes("?") ? "&" : "?"
  const requestPath = `${primaryPath}${queryGlue}tenantId=${encodeURIComponent(String(tenantId))}`

  const primaryResponse = await adminApiRequest(requestPath, { method: "GET" })
  const primaryPayload = (await primaryResponse.json().catch(() => ({}))) as unknown

  if (!primaryResponse.ok) {
    throw new Error("ADMIN_BILLING_ACCESS_REQUEST_FAILED")
  }

  const snapshot = parseTenantAccessSnapshot(primaryPayload)

  if (snapshot.subscriptionStatus || configuredPath.includes("overview")) {
    return snapshot
  }

  const fallbackPath = `/api/billing/overview?tenantId=${encodeURIComponent(String(tenantId))}`
  const fallbackResponse = await adminApiRequest(fallbackPath, { method: "GET" })
  const fallbackPayload = (await fallbackResponse.json().catch(() => ({}))) as unknown

  if (!fallbackResponse.ok) {
    throw new Error("ADMIN_BILLING_ACCESS_REQUEST_FAILED")
  }

  return parseTenantAccessSnapshot(fallbackPayload)
}

export async function validateTenantAccess(options: {
  tenantSchema?: string | null
  tenantId?: number | null
}): Promise<TenantAccessDecision> {
  if (isBillingEnforcementDisabled()) {
    return {
      allowed: true,
      code: "BILLING_ENFORCEMENT_DISABLED",
      message: "Validación de billing deshabilitada por configuración.",
      status: null,
      graceUntil: null,
      tenantId: resolveTenantId(options.tenantSchema, options.tenantId),
    }
  }

  const tenantId = resolveTenantId(options.tenantSchema, options.tenantId)

  if (!tenantId) {
    const failOpen = shouldFailOpenOnBillingErrors()
    if (failOpen) {
      return {
        allowed: true,
        code: "TENANT_ID_NOT_RESOLVED_FAIL_OPEN",
        message: "No se resolvió tenantId para billing; acceso temporal permitido.",
        status: null,
        graceUntil: null,
        tenantId: null,
      }
    }

    throw new Error("BILLING_VALIDATION_UNAVAILABLE")
  }

  try {
    const snapshot = await fetchTenantAccessSnapshot(tenantId)
    return evaluateTenantAccess(snapshot, tenantId)
  } catch (error) {
    const failOpen = shouldFailOpenOnBillingErrors()
    if (failOpen) {
      console.warn("Billing validation failed; allowing access due to fail-open mode", {
        tenantId,
        error,
      })
      return {
        allowed: true,
        code: "BILLING_CHECK_FAILED_FAIL_OPEN",
        message: "No fue posible validar billing; acceso temporal permitido.",
        status: null,
        graceUntil: null,
        tenantId,
      }
    }

    throw new Error("BILLING_VALIDATION_UNAVAILABLE")
  }
}

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

async function ensurePaymentSyncTable(tenantSchema: string) {
  if (ensuredSyncTables.has(tenantSchema)) {
    return
  }

  const schema = quoteIdentifier(tenantSchema)

  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${schema}.billing_admin_payment_sync (
      id BIGSERIAL PRIMARY KEY,
      referencia_externa TEXT NOT NULL UNIQUE,
      tenant_id INTEGER NOT NULL,
      appointment_id INTEGER NULL,
      monto NUMERIC(12,2) NULL,
      moneda TEXT NULL,
      estado TEXT NOT NULL DEFAULT 'processing',
      intentos INTEGER NOT NULL DEFAULT 1,
      respuesta_payload JSONB NULL,
      ultimo_error TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )

  ensuredSyncTables.add(tenantSchema)
}

async function claimPaymentReference(options: {
  tenantSchema: string
  reference: string
  tenantId: number
  appointmentId: number | null
  amount: number
  currency: string
}): Promise<PaymentSyncClaim | null> {
  await ensurePaymentSyncTable(options.tenantSchema)

  const table = `${quoteIdentifier(options.tenantSchema)}.${quoteIdentifier("billing_admin_payment_sync")}`

  const result = await pool.query<PaymentSyncClaim>(
    `INSERT INTO ${table}
      (referencia_externa, tenant_id, appointment_id, monto, moneda, estado, intentos, created_at, updated_at)
     VALUES
      ($1, $2, $3, $4::numeric, $5, 'processing', 1, now(), now())
     ON CONFLICT (referencia_externa)
     DO UPDATE
        SET estado = CASE WHEN ${table}.estado = 'error' THEN 'processing' ELSE ${table}.estado END,
            intentos = CASE WHEN ${table}.estado = 'error' THEN ${table}.intentos + 1 ELSE ${table}.intentos END,
            ultimo_error = CASE WHEN ${table}.estado = 'error' THEN NULL ELSE ${table}.ultimo_error END,
            updated_at = CASE WHEN ${table}.estado = 'error' THEN now() ELSE ${table}.updated_at END
      WHERE ${table}.estado = 'error'
      RETURNING id`,
    [options.reference, options.tenantId, options.appointmentId, options.amount, options.currency],
  )

  if (result.rowCount === 0) {
    return null
  }

  return result.rows[0]
}

async function completePaymentClaim(options: {
  tenantSchema: string
  claimId: number
  responsePayload: unknown
}) {
  const table = `${quoteIdentifier(options.tenantSchema)}.${quoteIdentifier("billing_admin_payment_sync")}`

  await pool.query(
    `UPDATE ${table}
        SET estado = 'sent',
            respuesta_payload = $2::jsonb,
            updated_at = now()
      WHERE id = $1`,
    [options.claimId, JSON.stringify(options.responsePayload ?? {})],
  )
}

async function failPaymentClaim(options: {
  tenantSchema: string
  claimId: number
  errorMessage: string
  responsePayload?: unknown
}) {
  const table = `${quoteIdentifier(options.tenantSchema)}.${quoteIdentifier("billing_admin_payment_sync")}`

  await pool.query(
    `UPDATE ${table}
        SET estado = 'error',
            ultimo_error = $2,
            respuesta_payload = COALESCE($3::jsonb, respuesta_payload),
            updated_at = now()
      WHERE id = $1`,
    [options.claimId, options.errorMessage, options.responsePayload ? JSON.stringify(options.responsePayload) : null],
  )
}

export async function registerTenantPaymentWithIdempotency(input: RegisterTenantPaymentInput): Promise<{
  ok: boolean
  skipped: boolean
}> {
  const normalizedReference = input.externalReference.trim()
  if (!normalizedReference) {
    throw new Error("ADMIN_BILLING_REFERENCE_REQUIRED")
  }

  const tenantSchema = resolveTenantSchema(input.tenantSchema)
  const tenantId = resolveTenantId(tenantSchema, input.tenantId)

  if (!tenantId) {
    throw new Error("ADMIN_BILLING_TENANT_ID_REQUIRED")
  }

  const claim = await claimPaymentReference({
    tenantSchema,
    reference: normalizedReference,
    tenantId,
    appointmentId: null,
    amount: input.amount,
    currency: input.currency,
  })

  if (!claim) {
    return {
      ok: true,
      skipped: true,
    }
  }

  try {
    const registerPath = (process.env.ADMIN_BILLING_REGISTER_PAYMENT_PATH ?? "/api/billing/payments/register").trim()
    const normalizedPath = registerPath.startsWith("/") ? registerPath : `/${registerPath}`

    const response = await adminApiRequest(normalizedPath, {
      method: "POST",
      body: JSON.stringify({
        tenantId,
        monto: input.amount,
        moneda: input.currency,
        metodoPago: input.paymentMethod,
        proveedorPago: input.paymentProvider,
        referenciaExterna: normalizedReference,
        cicloFacturacion: input.billingCycle?.trim() || process.env.ADMIN_BILLING_DEFAULT_CYCLE || "mensual",
      }),
    })

    const payload = (await response.json().catch(() => ({}))) as unknown

    if (!response.ok) {
      const message = `ADMIN_BILLING_REGISTER_FAILED_${response.status}`
      await failPaymentClaim({
        tenantSchema,
        claimId: claim.id,
        errorMessage: message,
        responsePayload: payload,
      })
      throw new Error("ADMIN_BILLING_REGISTER_FAILED")
    }

    await completePaymentClaim({
      tenantSchema,
      claimId: claim.id,
      responsePayload: payload,
    })

    return {
      ok: true,
      skipped: false,
    }
  } catch (error) {
    if (error instanceof Error && error.message === "ADMIN_BILLING_REGISTER_FAILED") {
      throw error
    }

    await failPaymentClaim({
      tenantSchema,
      claimId: claim.id,
      errorMessage: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    })
    throw error
  }
}

export async function triggerBillingSyncStatus(): Promise<unknown> {
  const syncPath = (process.env.ADMIN_BILLING_SYNC_STATUS_PATH ?? "/api/billing/sync-status").trim()
  const normalizedPath = syncPath.startsWith("/") ? syncPath : `/${syncPath}`
  const response = await adminApiRequest(normalizedPath, {
    method: "POST",
    body: JSON.stringify({}),
  })

  const payload = (await response.json().catch(() => ({}))) as unknown
  if (!response.ok) {
    throw new Error("ADMIN_BILLING_SYNC_STATUS_FAILED")
  }

  return payload
}