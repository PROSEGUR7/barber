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
  requestedPlanCode?: string | null
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

  const normalizedSchema = resolveTenantSchema(tenantSchema)
  if (tenantSchema && TENANT_SCHEMA_PATTERN.test(normalizedSchema)) {
    const suffixMatch = /^tenant_(\d+)$/i.exec(normalizedSchema)
    if (suffixMatch) {
      return parseTenantId(suffixMatch[1])
    }

    return null
  }

  const fromEnv = parseTenantId(process.env.ADMIN_PLATFORM_TENANT_ID ?? process.env.TENANT_ADMIN_ID)
  if (fromEnv) {
    return fromEnv
  }

  const suffixMatch = /^tenant_(\d+)$/i.exec(normalizedSchema)
  if (!suffixMatch) {
    return null
  }

  return parseTenantId(suffixMatch[1])
}

async function resolveTenantIdFromSchema(tenantSchema?: string | null): Promise<number | null> {
  const normalizedSchema = resolveTenantSchema(tenantSchema)

  if (!TENANT_SCHEMA_PATTERN.test(normalizedSchema)) {
    return null
  }

  try {
    const result = await pool.query<TenantIdBySchemaRow>(
      `SELECT id
         FROM admin_platform.tenants
        WHERE lower(trim(esquema)) = lower($1)
        LIMIT 1`,
      [normalizedSchema],
    )

    if (result.rowCount === 0) {
      return null
    }

    return result.rows[0].id
  } catch (error) {
    console.warn("Failed to resolve tenant id by schema", {
      tenantSchema: normalizedSchema,
      error,
    })
    return null
  }
}

async function resolveTenantIdWithFallback(
  tenantSchema?: string | null,
  explicitTenantId?: number | null,
): Promise<number | null> {
  const directTenantId = resolveTenantId(tenantSchema, explicitTenantId)
  if (directTenantId) {
    return directTenantId
  }

  return resolveTenantIdFromSchema(tenantSchema)
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

function shouldBypassTenantNotFoundInDevelopment() {
  const fromEnv = (process.env.ADMIN_BILLING_ALLOW_TENANT_NOT_FOUND_IN_DEV ?? "").trim().toLowerCase()
  if (fromEnv === "true") {
    return true
  }

  if (fromEnv === "false") {
    return false
  }

  return process.env.NODE_ENV !== "production"
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

type FunctionAvailabilityRow = {
  fn: string | null
}

type ExistingPaymentRow = {
  id: number
}

type TenantIdBySchemaRow = {
  id: number
}

type SyncBillingRow = {
  total_actualizados: number
  a_past_due: number
  a_unpaid: number
  a_paused: number
}

type BillingPlanRow = {
  id: number
  nombre: string
  codigo: string
  descripcion: string | null
  precio_mensual: string | null
  precio_trimestral: string | null
  precio_anual: string | null
  moneda: string | null
  activo: boolean
}

type TenantChargeContextRow = {
  tenant_id: number
  tenant_schema: string | null
  tenant_subscription_status: string | null
  subscription_id: number | null
  subscription_plan_code: string | null
  plan_id: number | null
  plan_code: string | null
  plan_name: string | null
  plan_currency: string | null
  subscription_cycle: string | null
  subscription_amount: string | null
  plan_monthly: string | null
  plan_quarterly: string | null
  plan_yearly: string | null
}

type TenantBillingPaymentRow = {
  pago_id: number
  fecha_pago_registro: string | null
  pagado_en: string | null
  estado_pago: string | null
  monto: string | null
  moneda: string | null
  metodo_pago: string | null
  proveedor_pago: string | null
  referencia_externa: string | null
  tenant_id: number
  tenant_nombre: string | null
  tenant_esquema: string | null
  suscripcion_id: number | null
  ciclo_facturacion: string | null
  plan_codigo: string | null
  plan_nombre: string | null
  factura_id: number | null
  numero_factura: string | null
  estado_factura: string | null
}

type TenantSubscriptionSnapshotRow = {
  tenant_id: number
  tenant_name: string | null
  tenant_schema: string | null
  subscription_id: number | null
  plan_code: string | null
  plan_name: string | null
  subscription_status: string | null
  billing_cycle: string | null
  period_end: string | null
  next_charge_at: string | null
}

export type BillingPlanSummary = {
  id: number
  name: string
  code: string
  description: string | null
  monthlyPrice: number
  quarterlyPrice: number
  yearlyPrice: number
  currency: string
  active: boolean
}

export type TenantBillingPaymentSummary = {
  paymentId: number
  amount: number
  currency: string
  paymentStatus: string | null
  paidAt: string | null
  createdAt: string | null
  paymentMethod: string | null
  paymentProvider: string | null
  externalReference: string | null
  billingCycle: string | null
  planCode: string | null
  planName: string | null
  invoiceNumber: string | null
  invoiceStatus: string | null
  tenantId: number
  tenantName: string
  tenantSchema: string | null
}

export type TenantSubscriptionSnapshot = {
  tenantId: number
  tenantName: string
  tenantSchema: string | null
  subscriptionId: number | null
  planCode: string | null
  planName: string | null
  subscriptionStatus: string | null
  billingCycle: string | null
  periodEnd: string | null
  nextChargeAt: string | null
  hasPaidAccess: boolean
}

export type TenantBillingChargeContext = {
  tenantId: number
  tenantSchema: string | null
  tenantSubscriptionStatus: string | null
  subscriptionId: number | null
  currentSubscriptionPlanCode: string | null
  planId: number
  planCode: string
  planName: string
  billingCycle: "mensual" | "trimestral" | "anual"
  amount: number
  currency: string
}

type PgLikeError = {
  code?: string
  message?: string
}

type BillingRejectReason = "amount_mismatch" | "invalid_currency" | "invalid_cycle" | "payment_validation_failed"

function mapBillingValidationError(pgMessage: string | null | undefined): {
  reason: BillingRejectReason
  businessMessage: string
} {
  const normalized = (pgMessage ?? "").trim().toLowerCase()

  if (normalized.includes("monto inválido") || normalized.includes("monto invalido")) {
    return {
      reason: "amount_mismatch",
      businessMessage: "Monto no coincide con el plan.",
    }
  }

  if (normalized.includes("moneda inválida") || normalized.includes("moneda invalida")) {
    return {
      reason: "invalid_currency",
      businessMessage: "Moneda inválida para la suscripción.",
    }
  }

  if (normalized.includes("ciclo")) {
    return {
      reason: "invalid_cycle",
      businessMessage: "Ciclo de facturación inválido para la suscripción.",
    }
  }

  return {
    reason: "payment_validation_failed",
    businessMessage: "No fue posible registrar el pago por validación de billing.",
  }
}

function normalizeBillingCycle(value: string | null | undefined): "mensual" | "trimestral" | "anual" {
  const normalized = (value ?? "").trim().toLowerCase()
  if (normalized === "mensual" || normalized === "trimestral" || normalized === "anual") {
    return normalized
  }

  const fromEnv = (process.env.ADMIN_BILLING_DEFAULT_CYCLE ?? "mensual").trim().toLowerCase()
  if (fromEnv === "mensual" || fromEnv === "trimestral" || fromEnv === "anual") {
    return fromEnv
  }

  return "mensual"
}

function normalizeBillingPlanCode(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim().toLowerCase()
  return normalized ? normalized : null
}

function parseNumericAmount(value: string | null | undefined): number | null {
  if (typeof value !== "string") {
    return null
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }

  return parsed
}

function pickAmountByCycle(row: TenantChargeContextRow, cycle: "mensual" | "trimestral" | "anual"): number | null {
  if (cycle === "trimestral") {
    return parseNumericAmount(row.plan_quarterly)
  }

  if (cycle === "anual") {
    return parseNumericAmount(row.plan_yearly)
  }

  return parseNumericAmount(row.plan_monthly)
}

export async function resolveTenantBillingChargeContext(options?: {
  tenantSchema?: string | null
  tenantId?: number | null
  requestedPlanCode?: string | null
  requestedBillingCycle?: string | null
}): Promise<TenantBillingChargeContext> {
  const tenantId = await resolveTenantIdWithFallback(options?.tenantSchema, options?.tenantId)

  if (!tenantId) {
    throw new Error("ADMIN_BILLING_TENANT_ID_REQUIRED")
  }

  const rowResult = await pool.query<TenantChargeContextRow>(
    `SELECT t.id AS tenant_id,
            t.esquema AS tenant_schema,
            t.estado_suscripcion::text AS tenant_subscription_status,
            s.id AS subscription_id,
            p.codigo AS subscription_plan_code,
            s.plan_id AS plan_id,
            p.codigo AS plan_code,
            p.nombre AS plan_name,
            p.moneda AS plan_currency,
            s.ciclo_facturacion::text AS subscription_cycle,
            s.monto_ciclo::text AS subscription_amount,
            p.precio_mensual::text AS plan_monthly,
            p.precio_trimestral::text AS plan_quarterly,
            p.precio_anual::text AS plan_yearly
       FROM admin_platform.tenants t
       LEFT JOIN admin_platform.suscripciones_tenants s ON s.tenant_id = t.id
       LEFT JOIN admin_platform.planes_suscripcion p ON p.id = s.plan_id
      WHERE t.id = $1
      LIMIT 1`,
    [tenantId],
  )

  if (rowResult.rowCount === 0) {
    throw new Error("ADMIN_BILLING_TENANT_NOT_FOUND")
  }

  const row = rowResult.rows[0]
  const requestedPlanCode = normalizeBillingPlanCode(options?.requestedPlanCode)
  const hasRequestedBillingCycle = typeof options?.requestedBillingCycle === "string" && options.requestedBillingCycle.trim().length > 0
  const requestedCycle = normalizeBillingCycle(options?.requestedBillingCycle)
  const subscriptionPlanCode = normalizeBillingPlanCode(row.plan_code)
  const planCodeToUse = requestedPlanCode ?? subscriptionPlanCode

  let effectiveRow = row

  if (!effectiveRow.plan_id || !effectiveRow.plan_code || (requestedPlanCode && requestedPlanCode !== subscriptionPlanCode)) {
    if (!planCodeToUse) {
      throw new Error("ADMIN_BILLING_PLAN_NOT_RESOLVED")
    }

    const fallbackPlanResult = await pool.query<{
      id: number
      codigo: string
      nombre: string
      moneda: string | null
      precio_mensual: string | null
      precio_trimestral: string | null
      precio_anual: string | null
    }>(
      `SELECT p.id,
              p.codigo,
              p.nombre,
              p.moneda,
              p.precio_mensual::text,
              p.precio_trimestral::text,
              p.precio_anual::text
         FROM admin_platform.planes_suscripcion p
        WHERE lower(trim(p.codigo)) = $1
          AND p.activo = true
        LIMIT 1`,
      [planCodeToUse],
    )

    if (fallbackPlanResult.rowCount === 0) {
      throw new Error("ADMIN_BILLING_PLAN_NOT_FOUND")
    }

    const fallback = fallbackPlanResult.rows[0]
    effectiveRow = {
      ...effectiveRow,
      plan_id: fallback.id,
      plan_code: fallback.codigo,
      plan_name: fallback.nombre,
      plan_currency: fallback.moneda,
      plan_monthly: fallback.precio_mensual,
      plan_quarterly: fallback.precio_trimestral,
      plan_yearly: fallback.precio_anual,
    }
  }

  const explicitPlanOrCycleRequested = Boolean(requestedPlanCode) || hasRequestedBillingCycle
  const billingCycle = explicitPlanOrCycleRequested
    ? requestedCycle
    : normalizeBillingCycle(effectiveRow.subscription_cycle)
  const amountFromSelectedPlan = pickAmountByCycle(effectiveRow, billingCycle)
  const amountFromCurrentSubscription = parseNumericAmount(effectiveRow.subscription_amount)

  const amount = explicitPlanOrCycleRequested
    ? amountFromSelectedPlan ?? amountFromCurrentSubscription
    : amountFromCurrentSubscription ?? amountFromSelectedPlan

  if (!amount) {
    throw new Error("ADMIN_BILLING_AMOUNT_NOT_RESOLVED")
  }

  const planId = effectiveRow.plan_id
  const planCode = effectiveRow.plan_code?.trim()
  const planName = effectiveRow.plan_name?.trim() || "Plan"

  if (!planId || !planCode) {
    throw new Error("ADMIN_BILLING_PLAN_NOT_RESOLVED")
  }

  return {
    tenantId,
    tenantSchema: effectiveRow.tenant_schema,
    tenantSubscriptionStatus: effectiveRow.tenant_subscription_status,
    subscriptionId: effectiveRow.subscription_id,
    currentSubscriptionPlanCode: normalizeBillingPlanCode(row.subscription_plan_code),
    planId,
    planCode,
    planName,
    billingCycle,
    amount,
    currency: (effectiveRow.plan_currency ?? "COP").trim().toUpperCase() || "COP",
  }
}

export async function validateTenantAccess(options: {
  tenantSchema?: string | null
  tenantId?: number | null
}): Promise<TenantAccessDecision> {
  const tenantId = await resolveTenantIdWithFallback(options.tenantSchema, options.tenantId)

  if (isBillingEnforcementDisabled()) {
    return {
      allowed: true,
      code: "BILLING_ENFORCEMENT_DISABLED",
      reason: null,
      message: "Validación de billing deshabilitada por configuración.",
      status: null,
      graceUntil: null,
      tenantId,
    }
  }

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

    if (reason === "tenant_not_found" && shouldBypassTenantNotFoundInDevelopment()) {
      return {
        allowed: true,
        code: "TENANT_NOT_FOUND_FAIL_OPEN_DEV",
        reason,
        message: "Tenant no registrado en billing local; acceso temporal permitido en entorno no productivo.",
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
  const transport = (process.env.BILLING_TRANSPORT ?? "db").trim().toLowerCase()
  if (transport !== "db") {
    throw new Error("ADMIN_BILLING_TRANSPORT_NOT_SUPPORTED")
  }

  const normalizedReference = input.externalReference.trim()
  if (!normalizedReference) {
    throw new Error("ADMIN_BILLING_REFERENCE_REQUIRED")
  }

  const tenantId = await resolveTenantIdWithFallback(input.tenantSchema, input.tenantId)

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
    const requestedPlanCode = normalizeBillingPlanCode(input.requestedPlanCode)

    if (requestedPlanCode) {
      const fnAvailability = await client.query<FunctionAvailabilityRow>(
        "SELECT to_regprocedure('admin_platform.registrar_pago_tenant_con_plan(integer,text,numeric,text,text,text,text,admin_platform.ciclo_facturacion_enum,timestamp with time zone)')::text AS fn",
      )

      if (!fnAvailability.rows[0]?.fn) {
        throw new Error("PLAN_CHANGE_NOT_SUPPORTED")
      }

      await client.query<RegisterTenantPaymentRow>(
        `SELECT *
           FROM admin_platform.registrar_pago_tenant_con_plan(
             $1,
             $2,
             $3,
             $4,
             $5,
             $6,
             $7,
             $8::admin_platform.ciclo_facturacion_enum,
             $9
           )`,
        [
          tenantId,
          requestedPlanCode,
          input.amount,
          input.currency,
          input.paymentMethod,
          input.paymentProvider,
          normalizedReference,
          billingCycle,
          new Date().toISOString(),
        ],
      )
    } else {
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
    }

    await client.query("COMMIT")

    return {
      ok: true,
      skipped: false,
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})

    const pgError = error as PgLikeError
    const pgCode = typeof pgError?.code === "string" ? pgError.code : null

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

    if (pgCode === "P0001") {
      const mapped = mapBillingValidationError(pgError?.message)
      const wrappedError = new Error("ADMIN_BILLING_PAYMENT_VALIDATION_FAILED")
      ;(wrappedError as { meta?: unknown }).meta = {
        pgCode,
        reason: mapped.reason,
        businessMessage: mapped.businessMessage,
        pgMessage: pgError?.message ?? null,
      }
      throw wrappedError
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

function mapBillingPlanRow(row: BillingPlanRow): BillingPlanSummary {
  return {
    id: row.id,
    name: row.nombre,
    code: row.codigo,
    description: row.descripcion,
    monthlyPrice: Number(row.precio_mensual ?? 0),
    quarterlyPrice: Number(row.precio_trimestral ?? 0),
    yearlyPrice: Number(row.precio_anual ?? 0),
    currency: row.moneda?.trim() || "COP",
    active: Boolean(row.activo),
  }
}

function mapTenantBillingPaymentRow(row: TenantBillingPaymentRow): TenantBillingPaymentSummary {
  return {
    paymentId: row.pago_id,
    amount: Number(row.monto ?? 0),
    currency: row.moneda?.trim() || "COP",
    paymentStatus: row.estado_pago,
    paidAt: row.pagado_en,
    createdAt: row.fecha_pago_registro,
    paymentMethod: row.metodo_pago,
    paymentProvider: row.proveedor_pago,
    externalReference: row.referencia_externa,
    billingCycle: row.ciclo_facturacion,
    planCode: row.plan_codigo,
    planName: row.plan_nombre,
    invoiceNumber: row.numero_factura,
    invoiceStatus: row.estado_factura,
    tenantId: row.tenant_id,
    tenantName: row.tenant_nombre?.trim() || "Sin tenant",
    tenantSchema: row.tenant_esquema,
  }
}

export async function getBillingPlans(options?: { activeOnly?: boolean }): Promise<BillingPlanSummary[]> {
  const activeOnly = options?.activeOnly !== false
  const conditions: string[] = []
  const parameters: Array<boolean> = []

  if (activeOnly) {
    parameters.push(true)
    conditions.push(`p.activo = $${parameters.length}`)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  const result = await pool.query<BillingPlanRow>(
    `SELECT p.id,
            p.nombre,
            p.codigo,
            p.descripcion,
            p.precio_mensual::text AS precio_mensual,
          p.precio_trimestral::text AS precio_trimestral,
          p.precio_anual::text AS precio_anual,
            p.moneda,
            p.activo
       FROM admin_platform.planes_suscripcion p
      ${whereClause}
      ORDER BY p.precio_mensual ASC, p.id ASC`,
    parameters,
  )

  return result.rows.map(mapBillingPlanRow)
}

export async function getTenantBillingPayments(options?: {
  tenantSchema?: string | null
  tenantId?: number | null
  status?: string | null
  limit?: number
}): Promise<TenantBillingPaymentSummary[]> {
  const tenantId = await resolveTenantIdWithFallback(options?.tenantSchema, options?.tenantId)
  if (!tenantId) {
    return []
  }

  const conditions: string[] = ["v.tenant_id = $1"]
  const parameters: Array<number | string> = [tenantId]

  if (options?.status && options.status.trim().length > 0 && options.status !== "all") {
    parameters.push(options.status.trim().toLowerCase())
    conditions.push(`LOWER(COALESCE(v.estado_pago::text, '')) = $${parameters.length}`)
  }

  const limit =
    typeof options?.limit === "number" && Number.isFinite(options.limit)
      ? Math.min(Math.max(Math.trunc(options.limit), 1), 1000)
      : 300

  parameters.push(limit)
  const limitPlaceholder = `$${parameters.length}`

  const result = await pool.query<TenantBillingPaymentRow>(
    `SELECT v.pago_id,
            v.fecha_pago_registro::text,
            v.pagado_en::text,
            v.estado_pago::text,
            v.monto::text,
            v.moneda,
            v.metodo_pago,
            v.proveedor_pago,
            v.referencia_externa,
            v.tenant_id,
            v.tenant_nombre,
            v.tenant_esquema,
            v.suscripcion_id,
            v.ciclo_facturacion::text,
            v.plan_codigo,
            v.plan_nombre,
            v.factura_id,
            v.numero_factura,
            v.estado_factura::text
       FROM admin_platform.vw_hechos_pagos_tenants v
      WHERE ${conditions.join(" AND ")}
      ORDER BY COALESCE(v.pagado_en, v.fecha_pago_registro) DESC, v.pago_id DESC
      LIMIT ${limitPlaceholder}`,
    parameters,
  )

  return result.rows.map(mapTenantBillingPaymentRow)
}

type TenantPaidAccessRow = {
  has_paid_access: boolean
}

export async function hasTenantPaidSubscription(options?: {
  tenantSchema?: string | null
  tenantId?: number | null
}): Promise<boolean> {
  const tenantId = await resolveTenantIdWithFallback(options?.tenantSchema, options?.tenantId)
  if (!tenantId) {
    return false
  }

  const result = await pool.query<TenantPaidAccessRow>(
    `SELECT EXISTS (
        SELECT 1
          FROM admin_platform.pagos_tenants p
         WHERE p.tenant_id = $1
           AND LOWER(COALESCE(p.estado::text, '')) IN ('aprobado', 'pagado', 'completo', 'paid', 'success', 'succeeded')
      ) AS has_paid_access`,
    [tenantId],
  )

  return Boolean(result.rows[0]?.has_paid_access)
}

export async function getTenantSubscriptionSnapshot(options?: {
  tenantSchema?: string | null
  tenantId?: number | null
}): Promise<TenantSubscriptionSnapshot | null> {
  const tenantId = await resolveTenantIdWithFallback(options?.tenantSchema, options?.tenantId)
  if (!tenantId) {
    return null
  }

  const result = await pool.query<TenantSubscriptionSnapshotRow>(
    `SELECT t.id AS tenant_id,
            t.nombre AS tenant_name,
            t.esquema AS tenant_schema,
            s.id AS subscription_id,
            p.codigo AS plan_code,
            p.nombre AS plan_name,
            t.estado_suscripcion::text AS subscription_status,
              s.ciclo_facturacion::text AS billing_cycle,
            s.fecha_fin_periodo::text AS period_end,
            s.proximo_cobro::text AS next_charge_at
       FROM admin_platform.tenants t
       LEFT JOIN admin_platform.suscripciones_tenants s ON s.tenant_id = t.id
       LEFT JOIN admin_platform.planes_suscripcion p ON p.id = s.plan_id
      WHERE t.id = $1
      LIMIT 1`,
    [tenantId],
  )

  if (result.rowCount === 0) {
    return null
  }

  const hasPaidAccess = await hasTenantPaidSubscription({ tenantId })
  const row = result.rows[0]

  return {
    tenantId: row.tenant_id,
    tenantName: row.tenant_name?.trim() || "Sin tenant",
    tenantSchema: row.tenant_schema,
    subscriptionId: row.subscription_id,
    planCode: row.plan_code,
    planName: row.plan_name,
    subscriptionStatus: row.subscription_status,
    billingCycle: row.billing_cycle,
    periodEnd: row.period_end,
    nextChargeAt: row.next_charge_at,
    hasPaidAccess,
  }
}

export async function isPlanChangeBillingEnabled(): Promise<boolean> {
  const result = await pool.query<FunctionAvailabilityRow>(
    "SELECT to_regprocedure('admin_platform.registrar_pago_tenant_con_plan(integer,text,numeric,text,text,text,text,admin_platform.ciclo_facturacion_enum,timestamp with time zone)')::text AS fn",
  )

  return Boolean(result.rows[0]?.fn)
}