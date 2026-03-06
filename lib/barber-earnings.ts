import { pool } from "@/lib/db"
import { resolveEmployeeIdForUser } from "@/lib/barber-dashboard"
import { tenantSql } from "@/lib/tenant"

const BOOKING_TIME_ZONE = process.env.BOOKING_TIME_ZONE ?? "America/Bogota"

type EarningsRow = {
  earned_amount: string | null
  completed_count: string | null
  total_count: string | null
}

export type BarberEarningsSummary = {
  paidAmount: number
  completedCount: number
  totalCount: number
}

export type BarberMonthlyEarningsPoint = {
  month: string // YYYY-MM
  amount: number
  count: number
}

export type BarberTopClient = {
  clientId: number
  clientName: string
  count: number
  amount: number
}

type MonthlyRow = {
  month: string
  amount: string | null
  count: string | null
}

type TopClientRow = {
  client_id: number
  client_name: string | null
  count: string | null
  amount: string | null
}

function monthsBackList(options: { todayYMD: string; monthsBack: number }): string[] {
  const months = Math.min(Math.max(Math.trunc(options.monthsBack), 1), 24)
  const [yStr, mStr] = options.todayYMD.split("-")
  let y = Number(yStr)
  let m = Number(mStr)

  const out: string[] = []
  for (let i = 0; i < months; i += 1) {
    const mm = String(m).padStart(2, "0")
    out.push(`${y}-${mm}`)
    m -= 1
    if (m <= 0) {
      m = 12
      y -= 1
    }
  }

  return out.reverse()
}

function startOfMonthFromYYYYMM(yyyyMm: string): string {
  return `${yyyyMm}-01`
}

function endOfMonthFromYYYYMM(yyyyMm: string): string {
  const [yStr, mStr] = yyyyMm.split("-")
  const y = Number(yStr)
  const m = Number(mStr)
  const nextMonth = m === 12 ? 1 : m + 1
  const nextYear = m === 12 ? y + 1 : y
  const firstNext = new Date(Date.UTC(nextYear, nextMonth - 1, 1))
  firstNext.setUTCDate(firstNext.getUTCDate() - 1)
  const yyyy = firstNext.getUTCFullYear()
  const mm = String(firstNext.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(firstNext.getUTCDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

export async function getBarberEarnings(options: {
  userId: number
  fromDate: string
  toDate: string
  tenantSchema?: string | null
}): Promise<BarberEarningsSummary> {
  const employeeId = await resolveEmployeeIdForUser(options.userId, options.tenantSchema)

  const result = await pool.query<EarningsRow>(
    tenantSql(`SELECT
       COALESCE(SUM(COALESCE(s.precio, 0)) FILTER (WHERE a.estado::text = 'completada'), 0)::text AS earned_amount,
       COALESCE(COUNT(*) FILTER (WHERE a.estado::text = 'completada'), 0)::text AS completed_count,
       COALESCE(COUNT(*), 0)::text AS total_count
     FROM tenant_base.agendamientos a
     LEFT JOIN tenant_base.servicios s ON s.id = a.servicio_id
    WHERE a.empleado_id = $1
      AND a.fecha_cita >= $2::timestamptz
      AND a.fecha_cita <= $3::timestamptz`, options.tenantSchema),
    [employeeId, `${options.fromDate} 00:00:00`, `${options.toDate} 23:59:59`],
  )

  const row = result.rows[0]
  return {
    paidAmount: row?.earned_amount ? Number(row.earned_amount) : 0,
    completedCount: row?.completed_count ? Number(row.completed_count) : 0,
    totalCount: row?.total_count ? Number(row.total_count) : 0,
  }
}

export async function getMonthlyEarningsForBarber(options: {
  userId: number
  monthsBack?: number
  tenantSchema?: string | null
}): Promise<BarberMonthlyEarningsPoint[]> {
  const employeeId = await resolveEmployeeIdForUser(options.userId, options.tenantSchema)
  const today = getTodayInBusinessTZ()

  const months = monthsBackList({ todayYMD: today, monthsBack: options.monthsBack ?? 6 })
  const fromMonth = months[0]
  const toMonth = months[months.length - 1]
  const fromDate = startOfMonthFromYYYYMM(fromMonth)
  const toDate = endOfMonthFromYYYYMM(toMonth)

  const result = await pool.query<MonthlyRow>(
    tenantSql(`SELECT to_char(date_trunc('month', a.fecha_cita), 'YYYY-MM') AS month,
            COALESCE(SUM(COALESCE(s.precio, 0)) FILTER (WHERE a.estado::text = 'completada'), 0)::text AS amount,
            COALESCE(COUNT(*) FILTER (WHERE a.estado::text = 'completada'), 0)::text AS count
       FROM tenant_base.agendamientos a
       LEFT JOIN tenant_base.servicios s ON s.id = a.servicio_id
      WHERE a.empleado_id = $1
        AND a.fecha_cita >= $2::timestamptz
        AND a.fecha_cita <= $3::timestamptz
      GROUP BY 1
      ORDER BY 1 ASC`, options.tenantSchema),
    [employeeId, `${fromDate} 00:00:00`, `${toDate} 23:59:59`],
  )

  const byMonth = new Map<string, BarberMonthlyEarningsPoint>()
  for (const row of result.rows) {
    const month = String(row.month)
    byMonth.set(month, {
      month,
      amount: row.amount ? Number(row.amount) : 0,
      count: row.count ? Number(row.count) : 0,
    })
  }

  return months.map((month) => byMonth.get(month) ?? { month, amount: 0, count: 0 })
}

export async function getTopClientsForBarber(options: {
  userId: number
  fromDate: string
  toDate: string
  limit?: number
  tenantSchema?: string | null
}): Promise<BarberTopClient[]> {
  const employeeId = await resolveEmployeeIdForUser(options.userId, options.tenantSchema)
  const limit =
    typeof options.limit === "number" && Number.isFinite(options.limit)
      ? Math.min(Math.max(Math.trunc(options.limit), 1), 20)
      : 5

  const result = await pool.query<TopClientRow>(
    tenantSql(`SELECT c.id AS client_id,
            c.nombre AS client_name,
            COALESCE(COUNT(*), 0)::text AS count,
            COALESCE(SUM(COALESCE(s.precio, 0)), 0)::text AS amount
       FROM tenant_base.agendamientos a
       INNER JOIN tenant_base.clientes c ON c.id = a.cliente_id
       LEFT JOIN tenant_base.servicios s ON s.id = a.servicio_id
      WHERE a.empleado_id = $1
        AND a.estado::text = 'completada'
        AND a.fecha_cita >= $2::timestamptz
        AND a.fecha_cita <= $3::timestamptz
      GROUP BY c.id, c.nombre
      ORDER BY COUNT(*) DESC, SUM(COALESCE(s.precio, 0)) DESC
      LIMIT $4`, options.tenantSchema),
    [employeeId, `${options.fromDate} 00:00:00`, `${options.toDate} 23:59:59`, limit],
  )

  return result.rows.map((row) => ({
    clientId: Number(row.client_id),
    clientName: row.client_name ?? "Cliente",
    count: row.count ? Number(row.count) : 0,
    amount: row.amount ? Number(row.amount) : 0,
  }))
}

export function getTodayInBusinessTZ(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOOKING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())

  const year = parts.find((p) => p.type === "year")?.value ?? "0000"
  const month = parts.find((p) => p.type === "month")?.value ?? "00"
  const day = parts.find((p) => p.type === "day")?.value ?? "00"
  return `${year}-${month}-${day}`
}
