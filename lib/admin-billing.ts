import { pool } from "@/lib/db"

const TENANT_SCHEMA_PATTERN = /^tenant_[a-z0-9_]+$/i
const DEFAULT_TENANT_SCHEMA = "tenant_base"

const BILLING_CYCLES = new Set(["mensual", "trimestral", "anual"])

export type TenantAccessDecision = {
  allowed: boolean
  code: string
  reason: string | null
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

type TenantCanLoginRow = {
  can_login: boolean
  reason: string | null
}

type TenantBillingSnapshotRow = {
  estado_suscripcion: string | null
  gracia_hasta: string | null
}

type RegisterTenantPaymentRow = {
  pago_id: number
}

type ExistingPaymentRow = {
  id: number
}

type SyncBillingRow = {
  total_actualizados: number
  a_past_due: number
  a_unpaid: number
  a_paused: number
}

function normalizeBillingCycle(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase()
  if (BILLING_CYCLES.has(normalized)) {
    return normalized
  }

  const fromEnv = (process.env.ADMIN_BILLING_DEFAULT_CYCLE ?? "mensual").trim().toLowerCase()
  if (BILLING_CYCLES.has(fromEnv)) {
    return fromEnv
  }

  return "mensual"
}

export async function validateTenantAccess(options: {
  tenantSchema?: string | null
  tenantId?: number | null
}): Promise<TenantAccessDecision> {
  if (isBillingEnforcementDisabled()) {
    return {
      allowed: true,
      code: "BILLING_ENFORCEMENT_DISABLED",
      reason: null,
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
        reason: null,
        message: "No se resolvió tenantId para billing; acceso temporal permitido.",
        status: null,
        graceUntil: null,
        tenantId: null,
      }
    }

    throw new Error("BILLING_VALIDATION_UNAVAILABLE")
  }

  try {
    const canLoginResult = await pool.query<TenantCanLoginRow>(
      "SELECT * FROM admin_platform.tenant_can_login($1)",
      [tenantId],
    )

    if (canLoginResult.rowCount === 0) {
      throw new Error("TENANT_CAN_LOGIN_EMPTY")
    }

    const canLogin = canLoginResult.rows[0].can_login
    const reason = canLoginResult.rows[0].reason?.trim() || null

    const billingSnapshotResult = await pool.query<TenantBillingSnapshotRow>(
      `SELECT estado_suscripcion, gracia_hasta::text
         FROM admin_platform.tenants
        WHERE id = $1
        LIMIT 1`,
      [tenantId],
    )

    const billingSnapshot = billingSnapshotResult.rows[0]
    const status = billingSnapshot?.estado_suscripcion?.trim().toLowerCase() || null
    const graceUntil = parseDateIso(billingSnapshot?.gracia_hasta ?? null)

    if (canLogin) {
      return {
        allowed: true,
        code: "ALLOWED",
        reason,
        message: "Acceso permitido.",
        status,
        graceUntil,
        tenantId,
      }
    }

    const mappedCode = reason ? `TENANT_CAN_LOGIN_${reason.toUpperCase()}` : "SUBSCRIPTION_BLOCKED"

    return {
      allowed: false,
      code: mappedCode,
      reason,
      message: reason ? `Acceso bloqueado por política de tenant: ${reason}.` : "Acceso bloqueado por política de tenant.",
      status,
      graceUntil,
      tenantId,
    }
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
        reason: null,
        message: "No fue posible validar billing; acceso temporal permitido.",
        status: null,
        graceUntil: null,
        tenantId,
      }
    }

    throw new Error("BILLING_VALIDATION_UNAVAILABLE")
  }
}

export async function registerTenantPaymentWithIdempotency(input: RegisterTenantPaymentInput): Promise<{
  ok: boolean
  skipped: boolean
}> {
  const normalizedReference = input.externalReference.trim()
  if (!normalizedReference) {
    throw new Error("ADMIN_BILLING_REFERENCE_REQUIRED")
  }

  const tenantId = resolveTenantId(input.tenantSchema, input.tenantId)

  if (!tenantId) {
    throw new Error("ADMIN_BILLING_TENANT_ID_REQUIRED")
  }

  const client = await pool.connect()

  try {
    await client.query("BEGIN")
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [normalizedReference])

    const existingPayment = await client.query<ExistingPaymentRow>(
      `SELECT id
         FROM admin_platform.pagos_tenants
        WHERE referencia_externa = $1
        LIMIT 1`,
      [normalizedReference],
    )

    if (existingPayment.rowCount > 0) {
      await client.query("COMMIT")
      return {
        ok: true,
        skipped: true,
      }
    }

    const billingCycle = normalizeBillingCycle(input.billingCycle)

    await client.query<RegisterTenantPaymentRow>(
      `SELECT *
         FROM admin_platform.registrar_pago_tenant(
           $1,
           $2,
           $3,
           $4,
           $5,
           $6,
           $7::admin_platform.ciclo_facturacion_enum,
           $8
         )`,
      [
        tenantId,
        input.amount,
        input.currency,
        input.paymentMethod,
        input.paymentProvider,
        normalizedReference,
        billingCycle,
        new Date().toISOString(),
      ],
    )

    await client.query("COMMIT")

    return {
      ok: true,
      skipped: false,
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})

    const isDuplicateReference =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string" &&
      (error as { code: string }).code === "23505"

    if (isDuplicateReference) {
      return {
        ok: true,
        skipped: true,
      }
    }

    throw error
  } finally {
    client.release()
  }
}

export async function triggerBillingSyncStatus(): Promise<unknown> {
  const result = await pool.query<SyncBillingRow>(
    "SELECT * FROM admin_platform.sincronizar_estado_suscripciones_tenants()",
  )

  return result.rows[0] ?? {
    total_actualizados: 0,
    a_past_due: 0,
    a_unpaid: 0,
    a_paused: 0,
  }
}