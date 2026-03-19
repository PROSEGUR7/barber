import { pool } from "@/lib/db"
import { tenantSql } from "@/lib/tenant"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"

type PaymentMethodRow = {
  brand: string
  last4: string
  exp_month: number
  exp_year: number
  status: string
}

type WalletRow = {
  saldo: string
}

type SubscriptionRow = {
  plan: string
  next_charge_date: string | null
}

type CouponRow = {
  code: string
  description: string
  expires_label: string | null
  expires_at: string | null
  service_names: string[] | null
  discount_percent: number
  status: string
}

type ReceiptRow = {
  id: number
  servicio_nombre: string | null
  empleado_nombre: string | null
  fecha_cita: Date | null
  monto_final: string | null
  estado: string | null
}

type ReceiptDownloadRow = {
  id: number
  servicio_nombre: string | null
  empleado_nombre: string | null
  fecha_cita: Date | null
  monto: string | null
  monto_descuento: string | null
  monto_final: string | null
  metodo_pago: string | null
  estado: string | null
}

type PromoCodeRow = {
  code: string
  description: string
  expires_label: string | null
  expires_at: string | null
  service_ids: number[] | null
  service_names?: string[] | null
  discount_percent: number
  active: boolean
  is_expired?: boolean
  created_at?: Date | null
}

type ServicePricingRow = {
  id: number
  nombre: string
  precio: number | string | null
}

export type AdminPromoCodeSummary = {
  code: string
  description: string
  expiresAt: string | null
  discountPercent: number
  active: boolean
  serviceIds: number[] | null
  serviceNames: string[]
  createdAt: string | null
}

export class PromoCodeAlreadyExistsError extends Error {
  constructor() {
    super("PROMO_CODE_ALREADY_EXISTS")
    this.name = "PromoCodeAlreadyExistsError"
  }
}

export class PromoCodeNotFoundError extends Error {
  constructor() {
    super("PROMO_CODE_NOT_FOUND")
    this.name = "PromoCodeNotFoundError"
  }
}

export class PromoCodeServiceNotFoundError extends Error {
  constructor() {
    super("PROMO_CODE_SERVICE_NOT_FOUND")
    this.name = "PromoCodeServiceNotFoundError"
  }
}

async function assertServicesExist(serviceIds: number[] | null | undefined, tenantSchema?: string | null): Promise<void> {
  if (!serviceIds || serviceIds.length === 0) {
    return
  }

  const uniqueServiceIds = Array.from(new Set(serviceIds.filter((value) => Number.isInteger(value) && value > 0)))
  if (uniqueServiceIds.length !== serviceIds.length) {
    throw new PromoCodeServiceNotFoundError()
  }

  const result = await pool.query<{ id: number }>(
    tenantSql(`SELECT id FROM tenant_base.servicios WHERE id = ANY($1::int[])`, tenantSchema),
    [uniqueServiceIds],
  )

  if (result.rowCount !== uniqueServiceIds.length) {
    throw new PromoCodeServiceNotFoundError()
  }
}

export type WalletPaymentMethod = {
  brand: string
  lastFour: string
  expiry: string
  status: string
}

export type WalletCoupon = {
  code: string
  description: string
  expires: string
  discountPercent: number
  appliesTo: string
  status: string
}

export type WalletReceipt = {
  id: number
  title: string
  subtitle: string
  dateLabel: string
  amountLabel: string
  status: string
  actionHref: string | null
}

export type WalletReceiptDownload = {
  filename: string
  contentType: string
  body: Uint8Array
}

export type WalletSummary = {
  balance: number
  subscriptionPlan: string | null
  nextChargeLabel: string | null
}

export type WalletData = {
  paymentMethods: WalletPaymentMethod[]
  summary: WalletSummary
  receipts: WalletReceipt[]
  coupons: WalletCoupon[]
}

export type ReservationPricingBreakdown = {
  originalTotal: number
  discountTotal: number
  finalTotal: number
  promo: {
    code: string
    description: string
    discountPercent: number
    appliesToServiceIds: number[] | null
    appliedServiceIds: number[]
  } | null
}

async function resolveClientIdForUser(userId: number, tenantSchema?: string | null): Promise<number> {
  const result = await pool.query<{ id: number }>(
    tenantSql(`SELECT id
       FROM tenant_base.clientes
      WHERE user_id = $1
      LIMIT 1`, tenantSchema),
    [userId],
  )

  const clientId = result.rows[0]?.id
  if (typeof clientId !== "number") {
    const error = new Error("CLIENT_PROFILE_NOT_FOUND")
    ;(error as { code?: string }).code = "CLIENT_PROFILE_NOT_FOUND"
    throw error
  }

  return clientId
}

function parseMoney(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCopAmount(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }).format(value)
}

async function buildWalletReceiptPdf(options: {
  id: number
  dateLabel: string
  serviceName: string
  barberName: string
  paymentMethod: string
  paymentStatus: string
  subtotalLabel: string
  discountLabel: string
  totalLabel: string
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595, 842])
  const { width, height } = page.getSize()

  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const colors = {
    textPrimary: rgb(0.09, 0.1, 0.13),
    textMuted: rgb(0.38, 0.41, 0.47),
    line: rgb(0.9, 0.91, 0.93),
    chipBg: rgb(0.95, 0.97, 1),
    chipText: rgb(0.15, 0.35, 0.65),
    totalBg: rgb(0.97, 0.98, 1),
  }

  const marginX = 48
  const maxWidth = width - marginX * 2
  let y = height - 64

  page.drawText("COMPROBANTE DE SERVICIO", {
    x: marginX,
    y,
    size: 18,
    font: fontBold,
    color: colors.textPrimary,
  })

  const receiptCode = `#${options.id}`
  const chipWidth = Math.max(74, fontBold.widthOfTextAtSize(receiptCode, 11) + 24)
  page.drawRectangle({
    x: width - marginX - chipWidth,
    y: y - 6,
    width: chipWidth,
    height: 24,
    color: colors.chipBg,
    borderColor: colors.line,
    borderWidth: 1,
  })
  page.drawText(receiptCode, {
    x: width - marginX - chipWidth + 12,
    y: y + 2,
    size: 11,
    font: fontBold,
    color: colors.chipText,
  })

  y -= 34
  page.drawText("Softdatai Barberia", {
    x: marginX,
    y,
    size: 12,
    font: fontRegular,
    color: colors.textMuted,
  })

  y -= 20
  page.drawLine({
    start: { x: marginX, y },
    end: { x: marginX + maxWidth, y },
    thickness: 1,
    color: colors.line,
  })

  y -= 34
  const details: Array<[string, string]> = [
    ["Fecha", options.dateLabel],
    ["Servicio", options.serviceName],
    ["Barbero", options.barberName],
    ["Metodo de pago", options.paymentMethod],
    ["Estado", options.paymentStatus],
  ]

  for (const [label, value] of details) {
    page.drawText(label, {
      x: marginX,
      y,
      size: 10,
      font: fontBold,
      color: colors.textMuted,
    })
    page.drawText(value, {
      x: marginX + 150,
      y,
      size: 11,
      font: fontRegular,
      color: colors.textPrimary,
      maxWidth: maxWidth - 150,
    })
    y -= 26
  }

  y -= 6
  page.drawLine({
    start: { x: marginX, y },
    end: { x: marginX + maxWidth, y },
    thickness: 1,
    color: colors.line,
  })

  y -= 34
  const amountRows: Array<[string, string, boolean]> = [
    ["Subtotal", options.subtotalLabel, false],
    ["Descuento", options.discountLabel, false],
    ["Total pagado", options.totalLabel, true],
  ]

  for (const [label, value, isTotal] of amountRows) {
    if (isTotal) {
      page.drawRectangle({
        x: marginX,
        y: y - 10,
        width: maxWidth,
        height: 32,
        color: colors.totalBg,
        borderColor: colors.line,
        borderWidth: 1,
      })
    }

    page.drawText(label, {
      x: marginX + 12,
      y,
      size: isTotal ? 12 : 11,
      font: isTotal ? fontBold : fontRegular,
      color: colors.textPrimary,
    })

    const valueSize = isTotal ? 13 : 11
    const valueFont = isTotal ? fontBold : fontRegular
    const valueWidth = valueFont.widthOfTextAtSize(value, valueSize)
    page.drawText(value, {
      x: marginX + maxWidth - valueWidth - 12,
      y,
      size: valueSize,
      font: valueFont,
      color: colors.textPrimary,
    })

    y -= isTotal ? 44 : 28
  }

  page.drawText("Documento generado automaticamente por Softdatai.", {
    x: marginX,
    y: 56,
    size: 9,
    font: fontRegular,
    color: colors.textMuted,
  })

  return pdf.save()
}

export async function getWalletDataForUser(userId: number, tenantSchema?: string | null): Promise<WalletData> {
  const clientId = await resolveClientIdForUser(userId, tenantSchema)

  const [methods, wallet, subscription, coupons, receipts] = await Promise.all([
    pool.query<PaymentMethodRow>(
      tenantSql(`SELECT brand, last4, exp_month, exp_year, status
         FROM tenant_base.clientes_metodos_pago
        WHERE cliente_id = $1
        ORDER BY (status = 'Principal') DESC, created_at DESC`, tenantSchema),
      [clientId],
    ),
    pool.query<WalletRow>(
      tenantSql(`SELECT saldo::text as saldo
         FROM tenant_base.clientes_wallet
        WHERE cliente_id = $1
        LIMIT 1`, tenantSchema),
      [clientId],
    ),
    pool.query<SubscriptionRow>(
      tenantSql(`SELECT plan, next_charge_date::text as next_charge_date
         FROM tenant_base.clientes_suscripciones
        WHERE cliente_id = $1
        LIMIT 1`, tenantSchema),
      [clientId],
    ),
    pool.query<CouponRow>(
      tenantSql(`SELECT c.code,
              c.description,
              c.expires_label,
              c.expires_at::text AS expires_at,
              c.discount_percent,
              COALESCE(ARRAY_REMOVE(ARRAY_AGG(DISTINCT s.nombre), NULL), '{}') AS service_names,
              c.status
         FROM tenant_base.clientes_cupones c
         LEFT JOIN tenant_base.servicios s ON c.service_ids IS NOT NULL AND s.id = ANY(c.service_ids)
        WHERE cliente_id = $1
        GROUP BY c.id, c.code, c.description, c.expires_label, c.expires_at, c.discount_percent, c.status
        ORDER BY created_at DESC
        LIMIT 20`, tenantSchema),
      [clientId],
    ),
    pool.query<ReceiptRow>(
      tenantSql(`SELECT p.id,
              s.nombre AS servicio_nombre,
              e.nombre AS empleado_nombre,
              a.fecha_cita,
              COALESCE(
                CASE
                  WHEN p.proveedor_pago = 'wompi'
                    AND jsonb_typeof(p.wompi_payload) = 'object'
                    AND (p.wompi_payload ->> 'amount_in_cents') ~ '^[0-9]+$'
                  THEN ((p.wompi_payload ->> 'amount_in_cents')::numeric / 100)
                  ELSE NULL
                END,
                CASE
                  WHEN COALESCE(p.monto_descuento, 0) > 0 AND p.monto IS NOT NULL THEN GREATEST(p.monto - p.monto_descuento, 0)
                  ELSE NULL
                END,
                p.monto_final,
                p.monto,
                0
              )::text AS monto_final,
              p.estado::text AS estado
         FROM tenant_base.pagos p
         LEFT JOIN tenant_base.agendamientos a ON a.id = p.agendamiento_id
         LEFT JOIN tenant_base.servicios s ON s.id = a.servicio_id
         LEFT JOIN tenant_base.empleados e ON e.id = a.empleado_id
         LEFT JOIN tenant_base.clientes c ON c.id = a.cliente_id
        WHERE c.id = $1
        ORDER BY COALESCE(p.fecha_pago, a.fecha_cita) DESC NULLS LAST
        LIMIT 10`, tenantSchema),
      [clientId],
    ),
  ])

  const paymentMethods: WalletPaymentMethod[] = methods.rows.map((row) => ({
    brand: row.brand,
    lastFour: row.last4,
    expiry: `${String(row.exp_month).padStart(2, "0")}/${String(row.exp_year).padStart(2, "0")}`,
    status: row.status,
  }))

  const balance = parseMoney(wallet.rows[0]?.saldo)

  const subscriptionPlan = subscription.rows[0]?.plan ?? null
  const nextChargeLabel = subscription.rows[0]?.next_charge_date ?? null

  const summary: WalletSummary = {
    balance,
    subscriptionPlan,
    nextChargeLabel: nextChargeLabel ? `Próximo cobro · ${nextChargeLabel}` : null,
  }

  const walletCoupons: WalletCoupon[] = coupons.rows.map((row) => ({
    code: row.code,
    description: row.description,
    expires: row.expires_at ?? row.expires_label ?? "Sin fecha de caducidad",
    discountPercent: row.discount_percent,
    appliesTo:
      row.service_names && row.service_names.length > 0
        ? `Servicios: ${row.service_names.join(", ")}`
        : "Aplica a todos los servicios",
    status: row.status,
  }))

  const walletReceipts: WalletReceipt[] = receipts.rows.map((row) => {
    const status = row.estado?.trim() || "pendiente"
    const title = row.estado?.toLowerCase() === "aprobado" ? `Recibo #${row.id}` : `Pago #${row.id}`
    const service = row.servicio_nombre ?? "Servicio"
    const barber = row.empleado_nombre ? ` · ${row.empleado_nombre}` : ""
    const subtitle = `${service}${barber}`
    const dateLabel = row.fecha_cita
      ? new Intl.DateTimeFormat("es-CO", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(row.fecha_cita))
      : "Sin fecha"
    const amountLabel = formatCopAmount(parseMoney(row.monto_final))

    return {
      id: row.id,
      title,
      subtitle,
      dateLabel,
      amountLabel,
      status,
      actionHref: `/api/wallet/receipts/${row.id}/download`,
    }
  })

  return {
    paymentMethods,
    summary,
    receipts: walletReceipts,
    coupons: walletCoupons,
  }
}

export async function addPaymentMethodForUser(options: {
  userId: number
  brand: string
  lastFour: string
  expMonth: number
  expYear: number
  status: "Principal" | "Respaldo"
  tenantSchema?: string | null
}): Promise<void> {
  const clientId = await resolveClientIdForUser(options.userId, options.tenantSchema)
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    if (options.status === "Principal") {
      await client.query(
        tenantSql(`UPDATE tenant_base.clientes_metodos_pago
            SET status = 'Respaldo'
          WHERE cliente_id = $1`, options.tenantSchema),
        [clientId],
      )
    }

    await client.query(
      tenantSql(`INSERT INTO tenant_base.clientes_metodos_pago
        (cliente_id, brand, last4, exp_month, exp_year, status)
       VALUES ($1, $2, $3, $4, $5, $6)`, options.tenantSchema),
      [
        clientId,
        options.brand.trim(),
        options.lastFour.trim(),
        options.expMonth,
        options.expYear,
        options.status,
      ],
    )

    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

export async function deletePaymentMethodForUser(options: {
  userId: number
  lastFour: string
  tenantSchema?: string | null
}): Promise<void> {
  const clientId = await resolveClientIdForUser(options.userId, options.tenantSchema)
  await pool.query(
    tenantSql(`DELETE FROM tenant_base.clientes_metodos_pago
      WHERE cliente_id = $1
        AND last4 = $2`, options.tenantSchema),
    [clientId, options.lastFour.trim()],
  )
}

export async function rechargeWalletForUser(options: {
  userId: number
  amount: number
  tenantSchema?: string | null
}): Promise<void> {
  const clientId = await resolveClientIdForUser(options.userId, options.tenantSchema)
  const amount = options.amount

  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error("INVALID_AMOUNT")
    ;(error as { code?: string }).code = "INVALID_AMOUNT"
    throw error
  }

  await pool.query(
    tenantSql(`INSERT INTO tenant_base.clientes_wallet (cliente_id, saldo)
     VALUES ($1, $2)
     ON CONFLICT (cliente_id)
     DO UPDATE SET saldo = tenant_base.clientes_wallet.saldo + EXCLUDED.saldo,
                   updated_at = now()`, options.tenantSchema),
    [clientId, amount],
  )
}

export async function redeemPromoCodeForUser(options: {
  userId: number
  code: string
  tenantSchema?: string | null
}): Promise<void> {
  const clientId = await resolveClientIdForUser(options.userId, options.tenantSchema)
  const code = options.code.trim().toUpperCase()

  const promo = await pool.query<PromoCodeRow>(
    tenantSql(`SELECT description,
            expires_label,
            expires_at::text AS expires_at,
            service_ids,
            discount_percent,
            active,
            (expires_at IS NOT NULL AND expires_at < CURRENT_DATE) AS is_expired
       FROM tenant_base.promo_codes
      WHERE UPPER(code) = $1
      LIMIT 1`, options.tenantSchema),
    [code],
  )

  if (promo.rowCount === 0) {
    const error = new Error("PROMO_NOT_FOUND")
    ;(error as { code?: string }).code = "PROMO_NOT_FOUND"
    throw error
  }

  if (!promo.rows[0].active) {
    const error = new Error("PROMO_INACTIVE")
    ;(error as { code?: string }).code = "PROMO_INACTIVE"
    throw error
  }

  if (promo.rows[0].is_expired) {
    const error = new Error("PROMO_EXPIRED")
    ;(error as { code?: string }).code = "PROMO_EXPIRED"
    throw error
  }

  const insert = await pool.query<{ id: number }>(
    tenantSql(`INSERT INTO tenant_base.clientes_cupones (cliente_id, code, description, expires_label, expires_at, service_ids, discount_percent, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'Disponible')
     ON CONFLICT (cliente_id, code) DO NOTHING
     RETURNING id`, options.tenantSchema),
    [
      clientId,
      code,
      promo.rows[0].description,
      promo.rows[0].expires_label,
      promo.rows[0].expires_at,
      promo.rows[0].service_ids,
      promo.rows[0].discount_percent,
    ],
  )

  if (insert.rowCount === 0) {
    const error = new Error("PROMO_ALREADY_REDEEMED")
    ;(error as { code?: string }).code = "PROMO_ALREADY_REDEEMED"
    throw error
  }
}

export async function listPromoCodesForAdmin(options?: {
  tenantSchema?: string | null
}): Promise<AdminPromoCodeSummary[]> {
  const result = await pool.query<PromoCodeRow>(
    tenantSql(
      `SELECT p.code,
              p.description,
              p.expires_at::text AS expires_at,
              p.service_ids,
              p.discount_percent,
              p.active,
              p.created_at,
              COALESCE(ARRAY_REMOVE(ARRAY_AGG(DISTINCT s.nombre), NULL), '{}') AS service_names
         FROM tenant_base.promo_codes p
         LEFT JOIN tenant_base.servicios s ON p.service_ids IS NOT NULL AND s.id = ANY(p.service_ids)
        GROUP BY p.code, p.description, p.expires_at, p.service_ids, p.discount_percent, p.active, p.created_at
        ORDER BY p.created_at DESC, p.code ASC`,
      options?.tenantSchema,
    ),
  )

  return result.rows.map((row) => ({
    code: row.code,
    description: row.description,
    expiresAt: row.expires_at,
    discountPercent: row.discount_percent,
    active: row.active,
    serviceIds: row.service_ids,
    serviceNames: row.service_names ?? [],
    createdAt: row.created_at ? row.created_at.toISOString() : null,
  }))
}

export async function createPromoCodeForAdmin(options: {
  code: string
  description: string
  expiresAt?: string | null
  serviceIds?: number[] | null
  discountPercent: number
  active?: boolean
  tenantSchema?: string | null
}): Promise<AdminPromoCodeSummary> {
  const normalizedCode = options.code.trim().toUpperCase()
  const normalizedServiceIds =
    options.serviceIds && options.serviceIds.length > 0
      ? Array.from(new Set(options.serviceIds.filter((value) => Number.isInteger(value) && value > 0)))
      : null

  if (!Number.isFinite(options.discountPercent) || options.discountPercent <= 0 || options.discountPercent > 100) {
    const error = new Error("PROMO_INVALID_DISCOUNT")
    ;(error as { code?: string }).code = "PROMO_INVALID_DISCOUNT"
    throw error
  }

  await assertServicesExist(normalizedServiceIds, options.tenantSchema)

  try {
    const result = await pool.query<PromoCodeRow>(
      tenantSql(
        `INSERT INTO tenant_base.promo_codes (code, description, expires_label, expires_at, service_ids, discount_percent, active)
         VALUES (
           $1,
           $2,
           CASE WHEN $3::date IS NULL THEN NULL ELSE CONCAT('Válido hasta ', TO_CHAR($3::date, 'DD/MM/YYYY')) END,
           $3::date,
           $4,
           $5,
           COALESCE($6, TRUE)
         )
         RETURNING code, description, expires_at::text AS expires_at, service_ids, discount_percent, active, created_at`,
        options.tenantSchema,
      ),
      [
        normalizedCode,
        options.description.trim(),
        options.expiresAt?.trim() || null,
        normalizedServiceIds,
        Math.round(options.discountPercent),
        options.active ?? true,
      ],
    )

    const row = result.rows[0]
    const serviceNames =
      row.service_ids && row.service_ids.length > 0
        ? (
            await pool.query<{ name: string }>(
              tenantSql(`SELECT nombre AS name FROM tenant_base.servicios WHERE id = ANY($1::int[]) ORDER BY nombre ASC`, options.tenantSchema),
              [row.service_ids],
            )
          ).rows.map((item) => item.name)
        : []

    return {
      code: row.code,
      description: row.description,
      expiresAt: row.expires_at,
      discountPercent: row.discount_percent,
      active: row.active,
      serviceIds: row.service_ids,
      serviceNames,
      createdAt: row.created_at ? row.created_at.toISOString() : null,
    }
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      throw new PromoCodeAlreadyExistsError()
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "23503"
    ) {
      throw new PromoCodeServiceNotFoundError()
    }

    throw error
  }
}

export async function updatePromoCodeForAdmin(options: {
  code: string
  description?: string
  expiresAt?: string | null
  serviceIds?: number[] | null
  discountPercent?: number
  active?: boolean
  tenantSchema?: string | null
}): Promise<AdminPromoCodeSummary> {
  const normalizedCode = options.code.trim().toUpperCase()
  const updates: string[] = []
  const values: Array<string | boolean | number | number[] | null> = []

  if (typeof options.description === "string") {
    values.push(options.description.trim())
    updates.push(`description = $${values.length}`)
  }

  if (options.expiresAt !== undefined) {
    values.push(options.expiresAt?.trim() || null)
    updates.push(`expires_at = $${values.length}::date`)
    updates.push(`expires_label = CASE WHEN $${values.length}::date IS NULL THEN NULL ELSE CONCAT('Válido hasta ', TO_CHAR($${values.length}::date, 'DD/MM/YYYY')) END`)
  }

  if (options.serviceIds !== undefined) {
    const normalizedServiceIds =
      options.serviceIds && options.serviceIds.length > 0
        ? Array.from(new Set(options.serviceIds.filter((value) => Number.isInteger(value) && value > 0)))
        : null

    await assertServicesExist(normalizedServiceIds, options.tenantSchema)
    values.push(normalizedServiceIds)
    updates.push(`service_ids = $${values.length}`)
  }

  if (options.discountPercent !== undefined) {
    if (!Number.isFinite(options.discountPercent) || options.discountPercent <= 0 || options.discountPercent > 100) {
      const error = new Error("PROMO_INVALID_DISCOUNT")
      ;(error as { code?: string }).code = "PROMO_INVALID_DISCOUNT"
      throw error
    }

    values.push(Math.round(options.discountPercent))
    updates.push(`discount_percent = $${values.length}`)
  }

  if (typeof options.active === "boolean") {
    values.push(options.active)
    updates.push(`active = $${values.length}`)
  }

  if (updates.length === 0) {
    const current = await pool.query<PromoCodeRow>(
      tenantSql(
        `SELECT p.code,
                p.description,
                p.expires_at::text AS expires_at,
                p.service_ids,
                p.discount_percent,
                p.active,
                p.created_at,
                COALESCE(ARRAY_REMOVE(ARRAY_AGG(DISTINCT s.nombre), NULL), '{}') AS service_names
               FROM tenant_base.promo_codes p
           LEFT JOIN tenant_base.servicios s ON p.service_ids IS NOT NULL AND s.id = ANY(p.service_ids)
          WHERE UPPER(code) = $1
          GROUP BY p.code, p.description, p.expires_at, p.service_ids, p.discount_percent, p.active, p.created_at
          LIMIT 1`,
        options.tenantSchema,
      ),
      [normalizedCode],
    )

    if (current.rowCount === 0) {
      throw new PromoCodeNotFoundError()
    }

    const row = current.rows[0]
    return {
      code: row.code,
      description: row.description,
      expiresAt: row.expires_at,
      discountPercent: row.discount_percent,
      active: row.active,
      serviceIds: row.service_ids,
      serviceNames: row.service_names ?? [],
      createdAt: row.created_at ? row.created_at.toISOString() : null,
    }
  }

  values.push(normalizedCode)

  const result = await pool.query<PromoCodeRow>(
    tenantSql(
      `UPDATE tenant_base.promo_codes
          SET ${updates.join(", ")}
        WHERE UPPER(code) = $${values.length}
        RETURNING code, description, expires_at::text AS expires_at, service_ids, discount_percent, active, created_at`,
      options.tenantSchema,
    ),
    values,
  )

  if (result.rowCount === 0) {
    throw new PromoCodeNotFoundError()
  }

  const row = result.rows[0]
  const serviceNames =
    row.service_ids && row.service_ids.length > 0
      ? (
          await pool.query<{ name: string }>(
            tenantSql(`SELECT nombre AS name FROM tenant_base.servicios WHERE id = ANY($1::int[]) ORDER BY nombre ASC`, options.tenantSchema),
            [row.service_ids],
          )
        ).rows.map((item) => item.name)
      : []

  return {
    code: row.code,
    description: row.description,
    expiresAt: row.expires_at,
    discountPercent: row.discount_percent,
    active: row.active,
    serviceIds: row.service_ids,
    serviceNames,
    createdAt: row.created_at ? row.created_at.toISOString() : null,
  }
}

export async function getReservationPricingBreakdown(options: {
  serviceIds: number[]
  promoCode?: string | null
  tenantSchema?: string | null
}): Promise<ReservationPricingBreakdown> {
  const uniqueServiceIds = Array.from(
    new Set(options.serviceIds.filter((value) => Number.isInteger(value) && value > 0)),
  )

  if (uniqueServiceIds.length === 0) {
    const error = new Error("SERVICE_NOT_FOUND")
    ;(error as { code?: string }).code = "SERVICE_NOT_FOUND"
    throw error
  }

  const services = await pool.query<ServicePricingRow>(
    tenantSql(
      `SELECT id, nombre, precio
         FROM tenant_base.servicios
        WHERE id = ANY($1::int[])
          AND estado = 'activo'`,
      options.tenantSchema,
    ),
    [uniqueServiceIds],
  )

  if (services.rowCount !== uniqueServiceIds.length) {
    const error = new Error("SERVICE_NOT_FOUND")
    ;(error as { code?: string }).code = "SERVICE_NOT_FOUND"
    throw error
  }

  const servicePriceById = new Map<number, number>()
  let originalTotal = 0

  for (const row of services.rows) {
    const price =
      typeof row.precio === "number"
        ? row.precio
        : typeof row.precio === "string"
          ? Number.parseFloat(row.precio)
          : Number.NaN

    if (!Number.isFinite(price) || price <= 0) {
      const error = new Error("SERVICE_PRICE_INVALID")
      ;(error as { code?: string }).code = "SERVICE_PRICE_INVALID"
      throw error
    }

    servicePriceById.set(row.id, price)
    originalTotal += price
  }

  const promoCode = options.promoCode?.trim().toUpperCase() ?? ""
  if (!promoCode) {
    return {
      originalTotal,
      discountTotal: 0,
      finalTotal: originalTotal,
      promo: null,
    }
  }

  const promo = await pool.query<PromoCodeRow>(
    tenantSql(
      `SELECT code,
              description,
              service_ids,
              discount_percent,
              active,
              (expires_at IS NOT NULL AND expires_at < CURRENT_DATE) AS is_expired
         FROM tenant_base.promo_codes
        WHERE UPPER(code) = $1
        LIMIT 1`,
      options.tenantSchema,
    ),
    [promoCode],
  )

  if (promo.rowCount === 0) {
    const error = new Error("PROMO_NOT_FOUND")
    ;(error as { code?: string }).code = "PROMO_NOT_FOUND"
    throw error
  }

  const promoRow = promo.rows[0]

  if (!promoRow.active) {
    const error = new Error("PROMO_INACTIVE")
    ;(error as { code?: string }).code = "PROMO_INACTIVE"
    throw error
  }

  if (promoRow.is_expired) {
    const error = new Error("PROMO_EXPIRED")
    ;(error as { code?: string }).code = "PROMO_EXPIRED"
    throw error
  }

  const appliesToServiceIds = promoRow.service_ids && promoRow.service_ids.length > 0 ? promoRow.service_ids : null
  const appliedServiceIds = appliesToServiceIds
    ? uniqueServiceIds.filter((serviceId) => appliesToServiceIds.includes(serviceId))
    : uniqueServiceIds

  if (appliedServiceIds.length === 0) {
    const error = new Error("PROMO_NOT_APPLICABLE")
    ;(error as { code?: string }).code = "PROMO_NOT_APPLICABLE"
    throw error
  }

  const discountPercent = Math.max(1, Math.min(100, Math.round(promoRow.discount_percent)))
  const applicableAmount = appliedServiceIds.reduce((accumulator, serviceId) => {
    return accumulator + (servicePriceById.get(serviceId) ?? 0)
  }, 0)

  const discountTotal = Math.round((applicableAmount * discountPercent) / 100)
  const finalTotal = Math.max(0, originalTotal - discountTotal)

  return {
    originalTotal,
    discountTotal,
    finalTotal,
    promo: {
      code: promoRow.code,
      description: promoRow.description,
      discountPercent,
      appliesToServiceIds,
      appliedServiceIds,
    },
  }
}

export async function getWalletReceiptDownloadForUser(options: {
  userId: number
  receiptId: number
  tenantSchema?: string | null
}): Promise<WalletReceiptDownload> {
  const clientId = await resolveClientIdForUser(options.userId, options.tenantSchema)

  const receipt = await pool.query<ReceiptDownloadRow>(
    tenantSql(`SELECT p.id,
            s.nombre AS servicio_nombre,
            e.nombre AS empleado_nombre,
            a.fecha_cita,
            p.monto::text AS monto,
            p.monto_descuento::text AS monto_descuento,
            COALESCE(
              CASE
                WHEN p.proveedor_pago = 'wompi'
                  AND jsonb_typeof(p.wompi_payload) = 'object'
                  AND (p.wompi_payload ->> 'amount_in_cents') ~ '^[0-9]+$'
                THEN ((p.wompi_payload ->> 'amount_in_cents')::numeric / 100)
                ELSE NULL
              END,
              CASE
                WHEN COALESCE(p.monto_descuento, 0) > 0 AND p.monto IS NOT NULL THEN GREATEST(p.monto - p.monto_descuento, 0)
                ELSE NULL
              END,
              p.monto_final,
              p.monto,
              0
            )::text AS monto_final,
            p.metodo_pago::text AS metodo_pago,
            p.estado::text AS estado
       FROM tenant_base.pagos p
       INNER JOIN tenant_base.agendamientos a ON a.id = p.agendamiento_id
       LEFT JOIN tenant_base.servicios s ON s.id = a.servicio_id
       LEFT JOIN tenant_base.empleados e ON e.id = a.empleado_id
      WHERE p.id = $1
        AND a.cliente_id = $2
      LIMIT 1`, options.tenantSchema),
    [options.receiptId, clientId],
  )

  if (receipt.rowCount === 0) {
    const error = new Error("RECEIPT_NOT_FOUND")
    ;(error as { code?: string }).code = "RECEIPT_NOT_FOUND"
    throw error
  }

  const row = receipt.rows[0]
  const amount = parseMoney(row.monto)
  const discount = parseMoney(row.monto_descuento)
  const total = parseMoney(row.monto_final)
  const dateLabel = row.fecha_cita
    ? new Intl.DateTimeFormat("es-CO", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(row.fecha_cita))
    : "N/A"

  const body = await buildWalletReceiptPdf({
    id: row.id,
    dateLabel,
    serviceName: row.servicio_nombre ?? "Servicio",
    barberName: row.empleado_nombre ?? "No asignado",
    paymentMethod: row.metodo_pago ?? "No registrado",
    paymentStatus: row.estado ?? "pendiente",
    subtotalLabel: formatCopAmount(amount),
    discountLabel: formatCopAmount(discount),
    totalLabel: formatCopAmount(total),
  })

  return {
    filename: `factura-${row.id}.pdf`,
    contentType: "application/pdf",
    body,
  }
}
