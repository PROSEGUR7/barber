import { pool } from "@/lib/db"
import { getAvailabilitySlots } from "@/lib/bookings"
import { getBarberRatingSummaryMap } from "@/lib/reviews"
import { tenantSql } from "@/lib/tenant"

const BOOKING_TIME_ZONE = process.env.BOOKING_TIME_ZONE ?? "America/Bogota"

function formatDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)

  const year = parts.find((p) => p.type === "year")?.value ?? "0000"
  const month = parts.find((p) => p.type === "month")?.value ?? "00"
  const day = parts.find((p) => p.type === "day")?.value ?? "00"
  return `${year}-${month}-${day}`
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

async function getAnyActiveServiceId(tenantSchema?: string | null): Promise<number | null> {
  const result = await pool.query<{ id: number }>(
    tenantSql(`SELECT id
       FROM tenant_base.servicios
      WHERE estado = 'activo'
      ORDER BY id ASC
      LIMIT 1`, tenantSchema),
  )

  return result.rows[0]?.id ?? null
}

async function computeNextAvailabilityISO(options: {
  employeeId: number
  serviceId: number
  tenantSchema?: string | null
}): Promise<string | null> {
  const { employeeId, serviceId, tenantSchema } = options

  const now = new Date()
  const today = formatDateInTimeZone(now, BOOKING_TIME_ZONE)
  const tomorrow = formatDateInTimeZone(addDays(now, 1), BOOKING_TIME_ZONE)

  const todaysSlots = await getAvailabilitySlots({
    serviceId,
    employeeId,
    date: today,
    tenantSchema,
  })

  const firstToday = todaysSlots.find((slot) => new Date(slot.start).getTime() > now.getTime())
  if (firstToday) {
    return firstToday.start
  }

  const tomorrowSlots = await getAvailabilitySlots({
    serviceId,
    employeeId,
    date: tomorrow,
    tenantSchema,
  })

  return tomorrowSlots[0]?.start ?? null
}

type BarberRow = {
  empleado_id: number
  empleado_nombre: string
  empleado_telefono: string | null
  specialties: string | null
  is_favorite: boolean
}

export type BarberCard = {
  id: number
  name: string
  phone: string | null
  specialty: string | null
  isFavorite: boolean
  ratingAverage: number | null
  ratingCount: number
  nextAvailabilityISO: string | null
}

export async function listBarbersForUser(options: {
  userId: number | null
  serviceId: number | null
  tenantSchema?: string | null
}): Promise<BarberCard[]> {
  const { userId, serviceId, tenantSchema } = options

  const availabilityServiceId = serviceId ?? (await getAnyActiveServiceId(tenantSchema))

  const result = await pool.query<BarberRow>(
    tenantSql(`WITH client AS (
        SELECT id
          FROM tenant_base.clientes
         WHERE user_id = $1
         LIMIT 1
      )
      SELECT e.id AS empleado_id,
             e.nombre AS empleado_nombre,
             e.telefono AS empleado_telefono,
             (
               SELECT string_agg(s.nombre, ', ' ORDER BY s.nombre)
                 FROM tenant_base.empleados_servicios es
                 JOIN tenant_base.servicios s ON s.id = es.servicio_id
                WHERE es.empleado_id = e.id
             ) AS specialties,
             EXISTS(
               SELECT 1
                 FROM tenant_base.clientes_favoritos_empleados f
                 JOIN client c ON c.id = f.cliente_id
                WHERE f.empleado_id = e.id
             ) AS is_favorite
        FROM tenant_base.empleados e
       WHERE LOWER(COALESCE(e.estado::text, 'activo')) = 'activo'
         AND ($2::int IS NULL OR EXISTS(
              SELECT 1
                FROM tenant_base.empleados_servicios es
               WHERE es.empleado_id = e.id
                 AND es.servicio_id = $2::int
         ))
       ORDER BY e.nombre ASC`, tenantSchema),
    [userId, serviceId],
  )

  const base = result.rows.map((row) => ({
    id: row.empleado_id,
    name: row.empleado_nombre,
    phone: row.empleado_telefono,
    specialty: row.specialties,
    isFavorite: row.is_favorite,
    ratingAverage: null,
    ratingCount: 0,
  }))

  const ratingSummaryMap = await getBarberRatingSummaryMap({
    barberIds: base.map((barber) => barber.id),
    tenantSchema,
  })

  const baseWithRatings = base.map((barber) => {
    const summary = ratingSummaryMap.get(barber.id)
    return {
      ...barber,
      ratingAverage: summary?.ratingAverage ?? null,
      ratingCount: summary?.ratingCount ?? 0,
    }
  })

  if (!availabilityServiceId) {
    return baseWithRatings.map((barber) => ({ ...barber, nextAvailabilityISO: null }))
  }

  const withNext = await Promise.all(
    baseWithRatings.map(async (barber) => ({
      ...barber,
      nextAvailabilityISO: await computeNextAvailabilityISO({
        employeeId: barber.id,
        serviceId: availabilityServiceId,
        tenantSchema,
      }),
    })),
  )

  return withNext
}
