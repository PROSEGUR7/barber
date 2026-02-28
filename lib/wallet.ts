import { pool } from "@/lib/db"

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
  description: string
  expires_label: string | null
  active: boolean
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
  body: string
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

async function resolveClientIdForUser(userId: number): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `SELECT id
       FROM tenant_base.clientes
      WHERE user_id = $1
      LIMIT 1`,
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

export async function getWalletDataForUser(userId: number): Promise<WalletData> {
  const clientId = await resolveClientIdForUser(userId)

  const [methods, wallet, subscription, coupons, receipts] = await Promise.all([
    pool.query<PaymentMethodRow>(
      `SELECT brand, last4, exp_month, exp_year, status
         FROM tenant_base.clientes_metodos_pago
        WHERE cliente_id = $1
        ORDER BY (status = 'Principal') DESC, created_at DESC`,
      [clientId],
    ),
    pool.query<WalletRow>(
      `SELECT saldo::text as saldo
         FROM tenant_base.clientes_wallet
        WHERE cliente_id = $1
        LIMIT 1`,
      [clientId],
    ),
    pool.query<SubscriptionRow>(
      `SELECT plan, next_charge_date::text as next_charge_date
         FROM tenant_base.clientes_suscripciones
        WHERE cliente_id = $1
        LIMIT 1`,
      [clientId],
    ),
    pool.query<CouponRow>(
      `SELECT code, description, expires_label, status
         FROM tenant_base.clientes_cupones
        WHERE cliente_id = $1
        ORDER BY created_at DESC
        LIMIT 20`,
      [clientId],
    ),
    pool.query<ReceiptRow>(
      `SELECT p.id,
              s.nombre AS servicio_nombre,
              e.nombre AS empleado_nombre,
              a.fecha_cita,
              p.monto_final::text AS monto_final,
              p.estado::text AS estado
         FROM tenant_base.pagos p
         LEFT JOIN tenant_base.agendamientos a ON a.id = p.agendamiento_id
         LEFT JOIN tenant_base.servicios s ON s.id = a.servicio_id
         LEFT JOIN tenant_base.empleados e ON e.id = a.empleado_id
         LEFT JOIN tenant_base.clientes c ON c.id = a.cliente_id
        WHERE c.id = $1
        ORDER BY COALESCE(p.fecha_pago, a.fecha_cita) DESC NULLS LAST
        LIMIT 10`,
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
    expires: row.expires_label ?? "Sin fecha de caducidad",
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
}): Promise<void> {
  const clientId = await resolveClientIdForUser(options.userId)
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    if (options.status === "Principal") {
      await client.query(
        `UPDATE tenant_base.clientes_metodos_pago
            SET status = 'Respaldo'
          WHERE cliente_id = $1`,
        [clientId],
      )
    }

    await client.query(
      `INSERT INTO tenant_base.clientes_metodos_pago
        (cliente_id, brand, last4, exp_month, exp_year, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
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
}): Promise<void> {
  const clientId = await resolveClientIdForUser(options.userId)
  await pool.query(
    `DELETE FROM tenant_base.clientes_metodos_pago
      WHERE cliente_id = $1
        AND last4 = $2`,
    [clientId, options.lastFour.trim()],
  )
}

export async function rechargeWalletForUser(options: {
  userId: number
  amount: number
}): Promise<void> {
  const clientId = await resolveClientIdForUser(options.userId)
  const amount = options.amount

  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error("INVALID_AMOUNT")
    ;(error as { code?: string }).code = "INVALID_AMOUNT"
    throw error
  }

  await pool.query(
    `INSERT INTO tenant_base.clientes_wallet (cliente_id, saldo)
     VALUES ($1, $2)
     ON CONFLICT (cliente_id)
     DO UPDATE SET saldo = tenant_base.clientes_wallet.saldo + EXCLUDED.saldo,
                   updated_at = now()`,
    [clientId, amount],
  )
}

export async function redeemPromoCodeForUser(options: {
  userId: number
  code: string
}): Promise<void> {
  const clientId = await resolveClientIdForUser(options.userId)
  const code = options.code.trim().toUpperCase()

  const promo = await pool.query<PromoCodeRow>(
    `SELECT description, expires_label, active
       FROM tenant_base.promo_codes
      WHERE UPPER(code) = $1
      LIMIT 1`,
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

  const insert = await pool.query<{ id: number }>(
    `INSERT INTO tenant_base.clientes_cupones (cliente_id, code, description, expires_label, status)
     VALUES ($1, $2, $3, $4, 'Disponible')
     ON CONFLICT (cliente_id, code) DO NOTHING
     RETURNING id`,
    [clientId, code, promo.rows[0].description, promo.rows[0].expires_label],
  )

  if (insert.rowCount === 0) {
    const error = new Error("PROMO_ALREADY_REDEEMED")
    ;(error as { code?: string }).code = "PROMO_ALREADY_REDEEMED"
    throw error
  }
}

export async function getWalletReceiptDownloadForUser(options: {
  userId: number
  receiptId: number
}): Promise<WalletReceiptDownload> {
  const clientId = await resolveClientIdForUser(options.userId)

  const receipt = await pool.query<ReceiptDownloadRow>(
    `SELECT p.id,
            s.nombre AS servicio_nombre,
            e.nombre AS empleado_nombre,
            a.fecha_cita,
            p.monto::text AS monto,
            p.monto_descuento::text AS monto_descuento,
            p.monto_final::text AS monto_final,
            p.metodo_pago::text AS metodo_pago,
            p.estado::text AS estado
       FROM tenant_base.pagos p
       INNER JOIN tenant_base.agendamientos a ON a.id = p.agendamiento_id
       LEFT JOIN tenant_base.servicios s ON s.id = a.servicio_id
       LEFT JOIN tenant_base.empleados e ON e.id = a.empleado_id
      WHERE p.id = $1
        AND a.cliente_id = $2
      LIMIT 1`,
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

  const body = [
    `Factura / Comprobante #${row.id}`,
    `Fecha: ${dateLabel}`,
    `Servicio: ${row.servicio_nombre ?? "Servicio"}`,
    `Profesional: ${row.empleado_nombre ?? "No asignado"}`,
    `Método de pago: ${row.metodo_pago ?? "No registrado"}`,
    `Estado: ${row.estado ?? "pendiente"}`,
    "",
    `Subtotal: ${formatCopAmount(amount)}`,
    `Descuento: ${formatCopAmount(discount)}`,
    `Total: ${formatCopAmount(total)}`,
  ].join("\n")

  return {
    filename: `factura-${row.id}.txt`,
    contentType: "text/plain; charset=utf-8",
    body,
  }
}
