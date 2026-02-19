import { pool } from "@/lib/db"
import { ensureMaterializedEmployeeDay } from "@/lib/availability"

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

function formatTimestampInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date)

  const year = parts.find((p) => p.type === "year")?.value ?? "0000"
  const month = parts.find((p) => p.type === "month")?.value ?? "00"
  const day = parts.find((p) => p.type === "day")?.value ?? "00"
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00"
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00"
  const second = parts.find((p) => p.type === "second")?.value ?? "00"
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

type ServiceRow = {
  id: number
  nombre: string
  descripcion: string | null
  precio: number | null
  duracion_min: number
}

type BarberRow = {
  id: number
  nombre: string
}

type AvailabilityRow = {
  slot_ini: Date
  slot_fin: Date
}

export type Service = {
  id: number
  name: string
  description: string | null
  price: number | null
  durationMin: number
}

export type Barber = {
  id: number
  name: string
}

export type AvailabilitySlot = {
  start: string
  end: string
}

export type AppointmentStatus =
  | "pendiente"
  | "confirmada"
  | "cancelada"
  | "completada"
  | string

export type Appointment = {
  id: number
  start: string
  end: string | null
  status: AppointmentStatus
  service: {
    id: number
    name: string
    price: number | null
  }
  barber: {
    id: number
    name: string
  }
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

export async function getActiveServices(): Promise<Service[]> {
  const result = await pool.query<ServiceRow>(
    `SELECT id,
            nombre,
            descripcion,
            precio,
            duracion_min
       FROM tenant_base.servicios
      WHERE estado = 'activo'
      ORDER BY nombre ASC`,
  )

  return result.rows.map((row) => ({
    id: row.id,
    name: row.nombre,
    description: row.descripcion,
    price: row.precio,
    durationMin: row.duracion_min,
  }))
}

export async function getBarbersForService(serviceId: number): Promise<Barber[]> {
  const result = await pool.query<BarberRow>(
    `SELECT e.id,
            e.nombre
       FROM tenant_base.empleados e
       INNER JOIN tenant_base.empleados_servicios es
               ON es.empleado_id = e.id
      WHERE es.servicio_id = $1
      ORDER BY e.nombre ASC`,
    [serviceId],
  )

  if (result.rowCount === 0) {
    const fallback = await pool.query<BarberRow>(
      `SELECT id,
              nombre
         FROM tenant_base.empleados
        WHERE LOWER(COALESCE(estado::text, 'activo')) = 'activo'
        ORDER BY nombre ASC`,
    )

    return fallback.rows.map((row) => ({
      id: row.id,
      name: row.nombre,
    }))
  }

  return result.rows.map((row) => ({
    id: row.id,
    name: row.nombre,
  }))
}

export async function getAvailabilitySlots(options: {
  serviceId: number
  employeeId: number
  date: string
  excludeAppointmentId?: number
}): Promise<AvailabilitySlot[]> {
  const { serviceId, employeeId, date, excludeAppointmentId } = options

  await ensureMaterializedEmployeeDay({ employeeId, date })

  const result = await pool.query<AvailabilityRow>(
    `WITH svc AS (
        SELECT duracion_min
          FROM tenant_base.servicios
         WHERE id = $1
           AND estado = 'activo'
         LIMIT 1
      ),
      bloques AS (
        SELECT he.fecha_hora_inicio AS ini,
               he.fecha_hora_fin    AS fin
          FROM tenant_base.horarios_empleados he
         WHERE he.empleado_id = $2
           AND DATE(he.fecha_hora_inicio) = $3::date
      ),
      ocupados AS (
        SELECT tsrange(a.fecha_cita, COALESCE(a.fecha_cita_fin, a.fecha_cita), '[)') AS r
          FROM tenant_base.agendamientos a
         WHERE a.empleado_id = $2
           AND DATE(a.fecha_cita) = $3::date
           AND a.estado::text IN ('pendiente')
           AND ($4::int IS NULL OR a.id <> $4::int)
      ),
      grid AS (
        SELECT gs AS slot_ini,
               gs + make_interval(mins := (SELECT duracion_min FROM svc)) AS slot_fin
          FROM bloques b
          CROSS JOIN svc
          CROSS JOIN LATERAL generate_series(
            b.ini,
            b.fin - make_interval(mins := (SELECT duracion_min FROM svc)),
            interval '30 min'
          ) AS gs
      ),
      libres AS (
        SELECT g.slot_ini, g.slot_fin
          FROM grid g
         WHERE NOT EXISTS (
            SELECT 1
              FROM ocupados o
             WHERE tsrange(g.slot_ini, g.slot_fin, '[)') && o.r
          )
      )
    SELECT slot_ini, slot_fin
      FROM libres
     ORDER BY slot_ini
     LIMIT 240`,
    [serviceId, employeeId, date, typeof excludeAppointmentId === "number" ? excludeAppointmentId : null],
  )

  return result.rows.map((row) => ({
    start: row.slot_ini.toISOString(),
    end: row.slot_fin.toISOString(),
  }))
}

export async function reserveAppointment(options: {
  userId: number
  employeeId: number
  serviceId: number
  start: string
}): Promise<{ appointmentId: number }>
{
  const { userId, employeeId, serviceId, start } = options

  const clientId = await resolveClientIdForUser(userId)

  const startInstant = new Date(start)
  if (Number.isNaN(startInstant.getTime())) {
    const error = new Error("INVALID_START")
    ;(error as { code?: string }).code = "INVALID_START"
    throw error
  }

  // Validate that the requested start matches an available slot for the employee.
  const slotDateLocal = formatDateInTimeZone(startInstant, BOOKING_TIME_ZONE)
  const availableSlots = await getAvailabilitySlots({
    serviceId,
    employeeId,
    date: slotDateLocal,
  })

  const requestedStartISO = startInstant.toISOString()
  const hasSlot = availableSlots.some((slot) => slot.start === requestedStartISO)

  if (!hasSlot) {
    const error = new Error("SLOT_NOT_AVAILABLE")
    ;(error as { code?: string }).code = "SLOT_NOT_AVAILABLE"
    throw error
  }

  // DB uses timestamp without time zone; store the start in the business time zone.
  const startLocalTs = formatTimestampInTimeZone(startInstant, BOOKING_TIME_ZONE)

  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    // Business rule: 1 appointment per client per day (excluding cancelled).
    const dailyLimitResult = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1
           FROM tenant_base.agendamientos a
          WHERE a.cliente_id = $1
            AND DATE(a.fecha_cita) = DATE($2::timestamp)
            AND a.estado::text <> 'cancelada'
          LIMIT 1
       ) AS exists`,
      [clientId, startLocalTs],
    )

    if (dailyLimitResult.rows[0]?.exists) {
      const error = new Error("CLIENT_DAILY_LIMIT")
      ;(error as { code?: string }).code = "CLIENT_DAILY_LIMIT"
      throw error
    }

    const serviceResult = await client.query<{ duracion_min: number }>(
      `SELECT duracion_min
         FROM tenant_base.servicios
        WHERE id = $1
          AND estado = 'activo'
        LIMIT 1`,
      [serviceId],
    )

    if (serviceResult.rowCount === 0) {
      const error = new Error("SERVICE_NOT_FOUND")
      ;(error as { code?: string }).code = "SERVICE_NOT_FOUND"
      throw error
    }

    const durationMin = Number(serviceResult.rows[0].duracion_min)
    if (!Number.isFinite(durationMin) || durationMin <= 0) {
      const error = new Error("SERVICE_INVALID_DURATION")
      ;(error as { code?: string }).code = "SERVICE_INVALID_DURATION"
      throw error
    }

    // Prevent overlap with other active appointments.
    const overlapResult = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1
           FROM tenant_base.agendamientos a
          WHERE a.empleado_id = $1
            AND a.estado::text = 'pendiente'
            AND tsrange(a.fecha_cita, COALESCE(a.fecha_cita_fin, a.fecha_cita), '[)') &&
                tsrange($2::timestamp, $2::timestamp + make_interval(mins := $3), '[)')
          LIMIT 1
       ) AS exists`,
      [employeeId, startLocalTs, durationMin],
    )

    if (overlapResult.rows[0]?.exists) {
      const error = new Error("SLOT_ALREADY_TAKEN")
      ;(error as { code?: string }).code = "SLOT_ALREADY_TAKEN"
      throw error
    }

    const insertResult = await client.query<{ id: number }>(
      `INSERT INTO tenant_base.agendamientos
        (cliente_id, empleado_id, servicio_id, fecha_cita, fecha_cita_fin, estado, notificado, creado_en)
       VALUES
        ($1, $2, $3, $4::timestamp, $4::timestamp + make_interval(mins := $5),
         'pendiente'::tenant_base.estado_agendamiento_enum,
         'no notificado'::tenant_base.notificado_enum,
         now())
       RETURNING id`,
      [clientId, employeeId, serviceId, startLocalTs, durationMin],
    )

    await client.query("COMMIT")

    return { appointmentId: insertResult.rows[0].id }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

type AppointmentRow = {
  id: number
  fecha_cita: Date
  fecha_cita_fin: Date | null
  estado: string
  servicio_id: number
  servicio_nombre: string
  servicio_precio: number | null
  empleado_id: number
  empleado_nombre: string
}

const CANCELABLE_STATUSES: AppointmentStatus[] = ["pendiente"]
const RESCHEDULABLE_STATUSES: AppointmentStatus[] = ["pendiente"]

export async function getAppointmentsForUser(options: {
  userId: number
  scope: "upcoming" | "history"
  statuses?: AppointmentStatus[]
  limit?: number
}): Promise<Appointment[]> {
  const { userId, scope, statuses = [], limit = 100 } = options

  const statusArray = statuses.length > 0 ? statuses : null
  const dateComparator = scope === "upcoming" ? ">=" : "<"
  const orderDirection = scope === "upcoming" ? "ASC" : "DESC"

  const result = await pool.query<AppointmentRow>(
    `SELECT a.id,
            a.fecha_cita,
            a.fecha_cita_fin,
            a.estado,
            s.id  AS servicio_id,
            s.nombre AS servicio_nombre,
            s.precio AS servicio_precio,
            e.id  AS empleado_id,
            e.nombre AS empleado_nombre
       FROM tenant_base.agendamientos a
       INNER JOIN tenant_base.clientes c ON c.id = a.cliente_id
       INNER JOIN tenant_base.servicios s ON s.id = a.servicio_id
       INNER JOIN tenant_base.empleados e ON e.id = a.empleado_id
      WHERE c.user_id = $1
        AND a.fecha_cita ${dateComparator} (now() AT TIME ZONE $4)
        AND ($2::text[] IS NULL OR a.estado::text = ANY($2::text[]))
      ORDER BY a.fecha_cita ${orderDirection}
      LIMIT $3`,
    [userId, statusArray, limit, BOOKING_TIME_ZONE],
  )

  return result.rows.map((row) => ({
    id: row.id,
    start: row.fecha_cita.toISOString(),
    end: row.fecha_cita_fin ? row.fecha_cita_fin.toISOString() : null,
    status: row.estado,
    service: {
      id: row.servicio_id,
      name: row.servicio_nombre,
      price: row.servicio_precio,
    },
    barber: {
      id: row.empleado_id,
      name: row.empleado_nombre,
    },
  }))
}

type AppointmentOwnershipRow = {
  servicio_id: number
  empleado_id: number
  estado: string
  fecha_cita: Date
  fecha_cita_fin: Date | null
}

async function ensureAppointmentOwnership(appointmentId: number, userId: number): Promise<AppointmentOwnershipRow> {
  const result = await pool.query<AppointmentOwnershipRow>(
    `SELECT servicio_id,
            empleado_id,
            estado,
            fecha_cita,
            fecha_cita_fin
       FROM tenant_base.agendamientos
      WHERE id = $1
        AND cliente_id = (SELECT id FROM tenant_base.clientes WHERE user_id = $2 LIMIT 1)
      LIMIT 1`,
    [appointmentId, userId],
  )

  if (result.rowCount === 0) {
    const error = new Error("APPOINTMENT_NOT_FOUND")
    ;(error as { code?: string }).code = "APPOINTMENT_NOT_FOUND"
    throw error
  }

  return result.rows[0]
}

export async function cancelAppointment(options: {
  appointmentId: number
  userId: number
}): Promise<void> {
  const { appointmentId, userId } = options
  const appointment = await ensureAppointmentOwnership(appointmentId, userId)

  if (!CANCELABLE_STATUSES.includes(appointment.estado as AppointmentStatus)) {
    const error = new Error("APPOINTMENT_NOT_CANCELABLE")
    ;(error as { code?: string }).code = "APPOINTMENT_NOT_CANCELABLE"
    throw error
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const update = await client.query(
      `UPDATE tenant_base.agendamientos
          SET estado = 'cancelada'::tenant_base.estado_agendamiento_enum
        WHERE id = $1
          AND cliente_id = (SELECT id FROM tenant_base.clientes WHERE user_id = $2 LIMIT 1)
          AND estado::text = 'pendiente'`,
      [appointmentId, userId],
    )

    if (update.rowCount === 0) {
      const error = new Error("APPOINTMENT_CANCEL_FAILED")
      ;(error as { code?: string }).code = "APPOINTMENT_CANCEL_FAILED"
      throw error
    }

    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

export async function rescheduleAppointment(options: {
  appointmentId: number
  userId: number
  start: string
}): Promise<void> {
  const { appointmentId, userId, start } = options

  const newStart = new Date(start)
  if (Number.isNaN(newStart.getTime())) {
    const error = new Error("INVALID_START")
    ;(error as { code?: string }).code = "INVALID_START"
    throw error
  }

  const appointment = await ensureAppointmentOwnership(appointmentId, userId)

  if (!RESCHEDULABLE_STATUSES.includes(appointment.estado as AppointmentStatus)) {
    const error = new Error("APPOINTMENT_NOT_RESCHEDULABLE")
    ;(error as { code?: string }).code = "APPOINTMENT_NOT_RESCHEDULABLE"
    throw error
  }

  const currentStartISO = appointment.fecha_cita.toISOString()
  const requestedStartISO = newStart.toISOString()

  if (currentStartISO === requestedStartISO) {
    return
  }

  const slotDate = formatDateInTimeZone(newStart, BOOKING_TIME_ZONE)

  const availableSlots = await getAvailabilitySlots({
    serviceId: appointment.servicio_id,
    employeeId: appointment.empleado_id,
    date: slotDate,
    excludeAppointmentId: appointmentId,
  })

  const hasSlot = availableSlots.some((slot) => slot.start === requestedStartISO)

  if (!hasSlot) {
    const error = new Error("SLOT_NOT_AVAILABLE")
    ;(error as { code?: string }).code = "SLOT_NOT_AVAILABLE"
    throw error
  }

  const clientId = await resolveClientIdForUser(userId)
  const newStartLocalTs = formatTimestampInTimeZone(newStart, BOOKING_TIME_ZONE)

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    // Enforce 1 appointment per client per day (excluding this appointment).
    const dailyLimitResult = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1
           FROM tenant_base.agendamientos a
          WHERE a.cliente_id = $1
            AND a.id <> $2
            AND DATE(a.fecha_cita) = DATE($3::timestamp)
            AND a.estado::text <> 'cancelada'
          LIMIT 1
       ) AS exists`,
      [clientId, appointmentId, newStartLocalTs],
    )

    if (dailyLimitResult.rows[0]?.exists) {
      const error = new Error("CLIENT_DAILY_LIMIT")
      ;(error as { code?: string }).code = "CLIENT_DAILY_LIMIT"
      throw error
    }

    const serviceResult = await client.query<{ duracion_min: number }>(
      `SELECT duracion_min
         FROM tenant_base.servicios
        WHERE id = $1
          AND estado = 'activo'
        LIMIT 1`,
      [appointment.servicio_id],
    )

    if (serviceResult.rowCount === 0) {
      const error = new Error("SERVICE_NOT_FOUND")
      ;(error as { code?: string }).code = "SERVICE_NOT_FOUND"
      throw error
    }

    const durationMin = Number(serviceResult.rows[0].duracion_min)

    const overlapResult = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1
           FROM tenant_base.agendamientos a
          WHERE a.empleado_id = $1
            AND a.id <> $2
            AND a.estado::text = 'pendiente'
            AND tsrange(a.fecha_cita, COALESCE(a.fecha_cita_fin, a.fecha_cita), '[)') &&
                tsrange($3::timestamp, $3::timestamp + make_interval(mins := $4), '[)')
          LIMIT 1
       ) AS exists`,
      [appointment.empleado_id, appointmentId, newStartLocalTs, durationMin],
    )

    if (overlapResult.rows[0]?.exists) {
      const error = new Error("SLOT_ALREADY_TAKEN")
      ;(error as { code?: string }).code = "SLOT_ALREADY_TAKEN"
      throw error
    }

    const update = await client.query(
      `UPDATE tenant_base.agendamientos
          SET fecha_cita = $1::timestamp,
              fecha_cita_fin = $1::timestamp + make_interval(mins := $2),
              notificado = 'no notificado'::tenant_base.notificado_enum
        WHERE id = $3
          AND cliente_id = $4
          AND estado::text = 'pendiente'`,
      [newStartLocalTs, durationMin, appointmentId, clientId],
    )

    if (update.rowCount === 0) {
      const error = new Error("APPOINTMENT_RESCHEDULE_FAILED")
      ;(error as { code?: string }).code = "APPOINTMENT_RESCHEDULE_FAILED"
      throw error
    }

    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}
