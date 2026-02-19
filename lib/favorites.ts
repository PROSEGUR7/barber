import { pool } from "@/lib/db"
import { getAvailabilitySlots } from "@/lib/bookings"

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

type FavoriteRow = {
  empleado_id: number
  empleado_nombre: string
  empleado_telefono: string | null
  specialties: string | null
}

export type FavoriteBarber = {
  id: number
  name: string
  phone: string | null
  specialty: string | null
  nextAvailabilityISO: string | null
}

async function getAnyActiveServiceId(): Promise<number | null> {
  const result = await pool.query<{ id: number }>(
    `SELECT id
       FROM tenant_base.servicios
      WHERE estado = 'activo'
      ORDER BY id ASC
      LIMIT 1`,
  )

  return result.rows[0]?.id ?? null
}

async function computeNextAvailabilityISO(options: {
  employeeId: number
  serviceId: number
}): Promise<string | null> {
  const { employeeId, serviceId } = options

  const now = new Date()
  const today = formatDateInTimeZone(now, BOOKING_TIME_ZONE)
  const tomorrow = formatDateInTimeZone(addDays(now, 1), BOOKING_TIME_ZONE)

  const todaysSlots = await getAvailabilitySlots({
    serviceId,
    employeeId,
    date: today,
  })

  const firstToday = todaysSlots.find((slot) => new Date(slot.start).getTime() > now.getTime())
  if (firstToday) {
    return firstToday.start
  }

  const tomorrowSlots = await getAvailabilitySlots({
    serviceId,
    employeeId,
    date: tomorrow,
  })

  return tomorrowSlots[0]?.start ?? null
}

export async function listFavoriteBarbersForUser(userId: number): Promise<FavoriteBarber[]> {
  const serviceId = await getAnyActiveServiceId()

  const result = await pool.query<FavoriteRow>(
    `SELECT e.id AS empleado_id,
            e.nombre AS empleado_nombre,
            e.telefono AS empleado_telefono,
            (
              SELECT string_agg(s.nombre, ', ' ORDER BY s.nombre)
                FROM tenant_base.empleados_servicios es
                JOIN tenant_base.servicios s ON s.id = es.servicio_id
               WHERE es.empleado_id = e.id
            ) AS specialties
       FROM tenant_base.clientes_favoritos_empleados f
       JOIN tenant_base.clientes c ON c.id = f.cliente_id
       JOIN tenant_base.empleados e ON e.id = f.empleado_id
      WHERE c.user_id = $1
      ORDER BY f.created_at DESC, e.nombre ASC`,
    [userId],
  )

  const base = result.rows.map((row) => ({
    id: row.empleado_id,
    name: row.empleado_nombre,
    phone: row.empleado_telefono,
    specialty: row.specialties,
  }))

  if (!serviceId) {
    return base.map((barber) => ({ ...barber, nextAvailabilityISO: null }))
  }

  const withNext = await Promise.all(
    base.map(async (barber) => ({
      ...barber,
      nextAvailabilityISO: await computeNextAvailabilityISO({ employeeId: barber.id, serviceId }),
    })),
  )

  return withNext
}

export async function addFavoriteBarber(options: {
  userId: number
  barberId: number
}): Promise<void> {
  const { userId, barberId } = options

  const clientResult = await pool.query<{ id: number }>(
    `SELECT id
       FROM tenant_base.clientes
      WHERE user_id = $1
      LIMIT 1`,
    [userId],
  )

  const clientId = clientResult.rows[0]?.id
  if (typeof clientId !== "number") {
    const error = new Error("CLIENT_PROFILE_NOT_FOUND")
    ;(error as { code?: string }).code = "CLIENT_PROFILE_NOT_FOUND"
    throw error
  }

  await pool.query(
    `INSERT INTO tenant_base.clientes_favoritos_empleados (cliente_id, empleado_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [clientId, barberId],
  )
}

export async function removeFavoriteBarber(options: {
  userId: number
  barberId: number
}): Promise<void> {
  const { userId, barberId } = options

  await pool.query(
    `DELETE FROM tenant_base.clientes_favoritos_empleados f
      USING tenant_base.clientes c
      WHERE c.id = f.cliente_id
        AND c.user_id = $1
        AND f.empleado_id = $2`,
    [userId, barberId],
  )
}
