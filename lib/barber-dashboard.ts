import { pool } from "@/lib/db"

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

type EmployeeRow = {
  id: number
}

type EmployeeAppointmentRow = {
  id: number
  estado: string
  fecha_cita: Date
  fecha_cita_fin: Date | null
  cliente_nombre: string | null
  servicio_nombre: string | null
  servicio_precio: string | null
  servicio_duracion: number | null
  pago_estado: string | null
  pago_metodo: string | null
}

export type BarberAppointmentStatus = "pendiente" | "confirmada" | "completada" | "cancelada" | string

export type BarberAppointment = {
  id: number
  status: BarberAppointmentStatus
  paymentStatus: string | null
  paymentMethod: string | null
  start: string
  end: string | null
  clientName: string
  serviceName: string
  price: number | null
  durationMin: number | null
}

export type BarberAppointmentScope = "today" | "upcoming" | "history"

export async function resolveEmployeeIdForUser(userId: number): Promise<number> {
  const result = await pool.query<EmployeeRow>(
    `SELECT id
       FROM tenant_base.empleados
      WHERE user_id = $1
      LIMIT 1`,
    [userId],
  )

  const employeeId = result.rows[0]?.id
  if (typeof employeeId !== "number") {
    const error = new Error("EMPLOYEE_PROFILE_NOT_FOUND")
    ;(error as { code?: string }).code = "EMPLOYEE_PROFILE_NOT_FOUND"
    throw error
  }

  return employeeId
}

export async function getAppointmentsForEmployee(options: {
  userId: number
  scope: BarberAppointmentScope
  date?: string
  limit?: number
}): Promise<BarberAppointment[]> {
  const { userId, scope, date } = options
  const employeeId = await resolveEmployeeIdForUser(userId)

  const limit =
    typeof options.limit === "number" && Number.isFinite(options.limit)
      ? Math.min(Math.max(Math.trunc(options.limit), 1), 500)
      : 200

  const conditions: string[] = ["a.empleado_id = $1"]
  const parameters: Array<string | number> = [employeeId]

  if (scope === "today") {
    const localDate = date && date.trim().length > 0 ? date : formatDateInTimeZone(new Date(), BOOKING_TIME_ZONE)
    parameters.push(localDate)
    conditions.push(`DATE(a.fecha_cita) = $${parameters.length}::date`)
  } else {
    parameters.push(BOOKING_TIME_ZONE)
    const nowPlaceholder = `$${parameters.length}`

    if (scope === "upcoming") {
      conditions.push(`a.fecha_cita >= (now() AT TIME ZONE ${nowPlaceholder})`)
    } else {
      conditions.push(`a.fecha_cita < (now() AT TIME ZONE ${nowPlaceholder})`)
    }
  }

  parameters.push(limit)

  const query = `
    SELECT a.id,
           a.estado::text AS estado,
           a.fecha_cita,
           a.fecha_cita_fin,
           c.nombre AS cliente_nombre,
           s.nombre AS servicio_nombre,
           s.precio::text AS servicio_precio,
           s.duracion_min AS servicio_duracion,
           p.pago_estado,
           p.pago_metodo
      FROM tenant_base.agendamientos a
      LEFT JOIN tenant_base.clientes c ON c.id = a.cliente_id
      LEFT JOIN tenant_base.servicios s ON s.id = a.servicio_id
      LEFT JOIN LATERAL (
        SELECT
          pg.estado::text AS pago_estado,
          pg.metodo_pago::text AS pago_metodo
        FROM tenant_base.pagos pg
        WHERE pg.agendamiento_id = a.id
        ORDER BY pg.id DESC
        LIMIT 1
      ) p ON TRUE
     WHERE ${conditions.join(" AND ")}
     ORDER BY a.fecha_cita ASC
     LIMIT $${parameters.length}
  `

  const result = await pool.query<EmployeeAppointmentRow>(query, parameters)

  return result.rows.map((row) => ({
    id: row.id,
    status: row.estado,
    paymentStatus: row.pago_estado,
    paymentMethod: row.pago_metodo,
    start: row.fecha_cita.toISOString(),
    end: row.fecha_cita_fin ? row.fecha_cita_fin.toISOString() : null,
    clientName: row.cliente_nombre ?? "Cliente",
    serviceName: row.servicio_nombre ?? "Servicio",
    price: row.servicio_precio != null && row.servicio_precio !== "" ? Number(row.servicio_precio) : null,
    durationMin: typeof row.servicio_duracion === "number" ? row.servicio_duracion : null,
  }))
}

export async function updateEmployeeAppointmentStatus(options: {
  userId: number
  appointmentId: number
  status: "cancelada" | "completada"
}): Promise<void> {
  const employeeId = await resolveEmployeeIdForUser(options.userId)

  const allowedCurrentStates: Record<typeof options.status, string[]> = {
    completada: ["pendiente"],
    cancelada: ["pendiente"],
  }

  const allowed = allowedCurrentStates[options.status]

  const result = await pool.query(
    `UPDATE tenant_base.agendamientos
        SET estado = $1::tenant_base.estado_agendamiento_enum
      WHERE id = $2
        AND empleado_id = $3
        AND estado::text = ANY($4::text[])
      RETURNING id`,
    [options.status, options.appointmentId, employeeId, allowed],
  )

  if (result.rowCount === 0) {
    const error = new Error("APPOINTMENT_STATUS_UPDATE_FAILED")
    ;(error as { code?: string }).code = "APPOINTMENT_STATUS_UPDATE_FAILED"
    throw error
  }
}
