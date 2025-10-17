import { pool } from "@/lib/db"

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

  return result.rows.map((row) => ({
    id: row.id,
    name: row.nombre,
  }))
}

export async function getAvailabilitySlots(options: {
  serviceId: number
  employeeId: number
  date: string
}): Promise<AvailabilitySlot[]> {
  const { serviceId, employeeId, date } = options

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
        SELECT tstzrange(a.fecha_cita, a.fecha_cita_fin, '[)') AS r
          FROM tenant_base.agendamientos a
         WHERE a.empleado_id = $2
           AND DATE(a.fecha_cita) = $3::date
           AND a.estado IN ('pendiente', 'confirmada')
      ),
      grid AS (
        SELECT gs AS slot_ini,
               gs + make_interval(mins := (SELECT duracion_min FROM svc)) AS slot_fin
          FROM bloques b
          CROSS JOIN svc
          CROSS JOIN LATERAL generate_series(
            b.ini,
            b.fin - make_interval(mins := (SELECT duracion_min FROM svc)),
            interval '10 min'
          ) AS gs
      ),
      libres AS (
        SELECT g.slot_ini, g.slot_fin
          FROM grid g
         WHERE NOT EXISTS (
            SELECT 1
              FROM ocupados o
             WHERE tstzrange(g.slot_ini, g.slot_fin, '[)') && o.r
          )
      )
    SELECT slot_ini, slot_fin
      FROM libres
     ORDER BY slot_ini
     LIMIT 240`,
    [serviceId, employeeId, date],
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
  const result = await pool.query<{ sp_reservar_cita: number }>(
    `SELECT tenant_base.sp_reservar_cita($1, $2, $3, $4::timestamp) AS sp_reservar_cita`,
    [userId, employeeId, serviceId, start],
  )

  if (result.rowCount === 0) {
    throw new Error("No se pudo crear la cita")
  }

  return { appointmentId: result.rows[0].sp_reservar_cita }
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

const CANCELABLE_STATUSES: AppointmentStatus[] = ["pendiente", "confirmada"]
const RESCHEDULABLE_STATUSES: AppointmentStatus[] = ["pendiente", "confirmada"]

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
       INNER JOIN tenant_base.servicios s ON s.id = a.servicio_id
       INNER JOIN tenant_base.empleados e ON e.id = a.empleado_id
      WHERE a.cliente_id = $1
        AND a.fecha_cita ${dateComparator} now()
        AND ($2::text[] IS NULL OR a.estado::text = ANY($2::text[]))
      ORDER BY a.fecha_cita ${orderDirection}
      LIMIT $3`,
    [userId, statusArray, limit],
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
        AND cliente_id = $2
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

  const result = await pool.query<{ sp_cancelar_cita: boolean | null }>(
    `SELECT tenant_base.sp_cancelar_cita($1, $2) AS sp_cancelar_cita`,
    [userId, appointmentId],
  )

  if (result.rowCount === 0 || result.rows[0].sp_cancelar_cita === false) {
    const error = new Error("APPOINTMENT_CANCEL_FAILED")
    ;(error as { code?: string }).code = "APPOINTMENT_CANCEL_FAILED"
    throw error
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

  const slotDate = newStart.toISOString().slice(0, 10)

  const availableSlots = await getAvailabilitySlots({
    serviceId: appointment.servicio_id,
    employeeId: appointment.empleado_id,
    date: slotDate,
  })

  const hasSlot = availableSlots.some((slot) => slot.start === requestedStartISO)

  if (!hasSlot) {
    const error = new Error("SLOT_NOT_AVAILABLE")
    ;(error as { code?: string }).code = "SLOT_NOT_AVAILABLE"
    throw error
  }

  const result = await pool.query<{ sp_reprogramar_cita: boolean | null }>(
    `SELECT tenant_base.sp_reprogramar_cita($1, $2, $3::timestamp) AS sp_reprogramar_cita`,
    [userId, appointmentId, start],
  )

  if (result.rowCount === 0 || result.rows[0].sp_reprogramar_cita === false) {
    const error = new Error("APPOINTMENT_RESCHEDULE_FAILED")
    ;(error as { code?: string }).code = "APPOINTMENT_RESCHEDULE_FAILED"
    throw error
  }
}
