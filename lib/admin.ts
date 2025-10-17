import { pool } from "@/lib/db"
import { createUser, type AuthUser, UserAlreadyExistsError } from "@/lib/auth"

export type EmployeeSummary = {
  id: number
  userId: number
  name: string
  email: string
  phone: string | null
  status: string | null
  joinedAt: string | null
  totalAppointments: number
  upcomingAppointments: number
  completedAppointments: number
  totalRevenue: number
  services: string[]
  rating: number | null
}

export type ClientSummary = {
  id: number
  userId: number
  name: string
  email: string
  phone: string | null
  type: string | null
  registeredAt: string | null
  totalAppointments: number
  upcomingAppointments: number
  completedAppointments: number
  totalSpent: number
  lastAppointmentAt: string | null
  lastCompletedAppointmentAt: string | null
}

export class EmployeeRecordNotFoundError extends Error {
  constructor(message = "EMPLOYEE_RECORD_NOT_FOUND") {
    super(message)
    this.name = "EmployeeRecordNotFoundError"
  }
}

export class ClientRecordNotFoundError extends Error {
  constructor(message = "CLIENT_RECORD_NOT_FOUND") {
    super(message)
    this.name = "ClientRecordNotFoundError"
  }
}

type EmployeeSummaryRow = {
  id: number
  user_id: number
  nombre: string
  correo: string
  telefono: string | null
  estado: string | null
  fecha_ingreso: Date | null
  total_appointments: string | null
  active_appointments: string | null
  completed_appointments: string | null
  total_revenue: string | null
  services: string[] | null
}

type EmployeeBasicRow = {
  id: number
  user_id: number
  nombre: string
  correo: string
  telefono: string | null
  estado: string | null
  fecha_ingreso: Date | null
}

type ClientSummaryRow = {
  id: number
  user_id: number
  nombre: string
  correo: string
  telefono: string | null
  tipo_cliente: string | null
  fecha_registro: Date | null
  total_appointments: string | null
  upcoming_appointments: string | null
  completed_appointments: string | null
  total_spent: string | null
  last_appointment_at: Date | null
  last_completed_appointment_at: Date | null
}

type ClientBasicRow = {
  id: number
  user_id: number
  nombre: string
  correo: string
  telefono: string | null
  tipo_cliente: string | null
  fecha_registro: Date | null
}

function mapEmployeeRow(row: EmployeeSummaryRow): EmployeeSummary {
  const services = Array.isArray(row.services)
    ? row.services.filter((service): service is string => typeof service === "string" && service.trim().length > 0)
    : []

  const totalAppointments = Number(row.total_appointments ?? 0)
  const upcomingAppointments = Number(row.active_appointments ?? 0)
  const completedAppointments = Number(row.completed_appointments ?? 0)
  const totalRevenue = Number(row.total_revenue ?? 0)

  return {
    id: row.id,
    userId: row.user_id,
    name: row.nombre,
    email: row.correo,
    phone: row.telefono,
    status: row.estado,
    joinedAt: row.fecha_ingreso ? row.fecha_ingreso.toISOString() : null,
    totalAppointments,
    upcomingAppointments,
    completedAppointments,
    totalRevenue,
    services,
    rating: null,
  }
}

function mapClientRow(row: ClientSummaryRow): ClientSummary {
  const totalAppointments = Number(row.total_appointments ?? 0)
  const upcomingAppointments = Number(row.upcoming_appointments ?? 0)
  const completedAppointments = Number(row.completed_appointments ?? 0)
  const totalSpent = Number(row.total_spent ?? 0)

  return {
    id: row.id,
    userId: row.user_id,
    name: row.nombre,
    email: row.correo,
    phone: row.telefono,
    type: row.tipo_cliente,
    registeredAt: row.fecha_registro ? row.fecha_registro.toISOString() : null,
    totalAppointments,
    upcomingAppointments,
    completedAppointments,
    totalSpent,
    lastAppointmentAt: row.last_appointment_at ? row.last_appointment_at.toISOString() : null,
    lastCompletedAppointmentAt: row.last_completed_appointment_at
      ? row.last_completed_appointment_at.toISOString()
      : null,
  }
}

export async function getEmployeesWithStats(filter?: { employeeId?: number; userId?: number }): Promise<EmployeeSummary[]> {
  const conditions: string[] = []
  const parameters: (number)[] = []

  if (filter?.employeeId) {
    parameters.push(filter.employeeId)
    conditions.push(`e.id = $${parameters.length}`)
  }

  if (filter?.userId) {
    parameters.push(filter.userId)
    conditions.push(`e.user_id = $${parameters.length}`)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  const query = `
    SELECT
      e.id,
      e.user_id,
      e.nombre,
      e.telefono,
      e.estado,
      e.fecha_ingreso,
      u.correo,
      COALESCE(COUNT(a.id), 0) AS total_appointments,
      COALESCE(COUNT(a.id) FILTER (WHERE a.estado IN ('pendiente', 'confirmada')), 0) AS active_appointments,
      COALESCE(COUNT(a.id) FILTER (WHERE a.estado = 'completada'), 0) AS completed_appointments,
  COALESCE(SUM(p.monto), 0) AS total_revenue,
      COALESCE(array_agg(DISTINCT s.nombre) FILTER (WHERE s.nombre IS NOT NULL), ARRAY[]::text[]) AS services
    FROM tenant_base.empleados e
    INNER JOIN tenant_base.users u ON u.id = e.user_id
    LEFT JOIN tenant_base.agendamientos a ON a.empleado_id = e.id
    LEFT JOIN tenant_base.pagos p ON p.agendamiento_id = a.id AND p.estado = 'pagado'
    LEFT JOIN tenant_base.empleados_servicios es ON es.empleado_id = e.id
    LEFT JOIN tenant_base.servicios s ON s.id = es.servicio_id
    ${whereClause}
    GROUP BY
      e.id,
      e.user_id,
      e.nombre,
      e.telefono,
      e.estado,
      e.fecha_ingreso,
      u.correo
    ORDER BY e.nombre ASC
  `

  try {
    const result = await pool.query<EmployeeSummaryRow>(query, parameters)
    return result.rows.map(mapEmployeeRow)
  } catch (error) {
    console.warn("Falling back to basic employee query", { filter, error })

    const fallbackQuery = `
      SELECT
        e.id,
        e.user_id,
        e.nombre,
        e.telefono,
        e.estado,
        e.fecha_ingreso,
        u.correo
      FROM tenant_base.empleados e
      INNER JOIN tenant_base.users u ON u.id = e.user_id
      ${whereClause}
      ORDER BY e.nombre ASC
    `

    const fallbackResult = await pool.query<EmployeeBasicRow>(fallbackQuery, parameters)
    return fallbackResult.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.nombre,
      email: row.correo,
      phone: row.telefono,
      status: row.estado,
      joinedAt: row.fecha_ingreso ? row.fecha_ingreso.toISOString() : null,
      totalAppointments: 0,
      upcomingAppointments: 0,
      completedAppointments: 0,
      totalRevenue: 0,
      services: [],
      rating: null,
    }))
  }
}

export async function getEmployeeByUserId(userId: number): Promise<EmployeeSummary | null> {
  const employees = await getEmployeesWithStats({ userId })
  return employees[0] ?? null
}

export async function registerEmployee(input: {
  name: string
  email: string
  password: string
  phone: string
}): Promise<EmployeeSummary> {
  let user: AuthUser

  try {
    const sanitizedPhone = input.phone.trim()

    user = await createUser({
      email: input.email,
      password: input.password,
      role: "barber",
      profile: {
        name: input.name,
        phone: sanitizedPhone,
      },
    })
  } catch (error) {
    if (error instanceof UserAlreadyExistsError) {
      throw error
    }

    throw error
  }

  const employee = await getEmployeeByUserId(user.id)
  if (!employee) {
    throw new EmployeeRecordNotFoundError()
  }

  return employee
}

export async function getClientsWithStats(filter?: { clientId?: number; userId?: number }): Promise<ClientSummary[]> {
  const conditions: string[] = []
  const parameters: number[] = []

  if (filter?.clientId) {
    parameters.push(filter.clientId)
    conditions.push(`c.id = $${parameters.length}`)
  }

  if (filter?.userId) {
    parameters.push(filter.userId)
    conditions.push(`c.user_id = $${parameters.length}`)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  const query = `
    SELECT
      c.id,
      c.user_id,
      c.nombre,
      c.telefono,
      c.tipo_cliente,
      c.fecha_registro,
      u.correo,
      COALESCE(COUNT(a.id), 0) AS total_appointments,
      COALESCE(COUNT(a.id) FILTER (WHERE a.estado IN ('pendiente', 'confirmada')), 0) AS upcoming_appointments,
      COALESCE(COUNT(a.id) FILTER (WHERE a.estado = 'completada'), 0) AS completed_appointments,
      COALESCE(SUM(p.monto), 0) AS total_spent,
      MAX(a.fecha_cita) AS last_appointment_at,
      MAX(a.fecha_cita) FILTER (WHERE a.estado = 'completada') AS last_completed_appointment_at
    FROM tenant_base.clientes c
    INNER JOIN tenant_base.users u ON u.id = c.user_id
    LEFT JOIN tenant_base.agendamientos a ON a.cliente_id = c.id
    LEFT JOIN tenant_base.pagos p ON p.agendamiento_id = a.id AND p.estado = 'pagado'
    ${whereClause}
    GROUP BY
      c.id,
      c.user_id,
      c.nombre,
      c.telefono,
      c.tipo_cliente,
      c.fecha_registro,
      u.correo
    ORDER BY c.nombre ASC
  `

  try {
    const result = await pool.query<ClientSummaryRow>(query, parameters)
    return result.rows.map(mapClientRow)
  } catch (error) {
    console.warn("Falling back to basic client query", { filter, error })

    const fallbackQuery = `
      SELECT
        c.id,
        c.user_id,
        c.nombre,
        c.telefono,
        c.tipo_cliente,
        c.fecha_registro,
        u.correo
      FROM tenant_base.clientes c
      INNER JOIN tenant_base.users u ON u.id = c.user_id
      ${whereClause}
      ORDER BY c.nombre ASC
    `

    const fallbackResult = await pool.query<ClientBasicRow>(fallbackQuery, parameters)
    return fallbackResult.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.nombre,
      email: row.correo,
      phone: row.telefono,
      type: row.tipo_cliente,
      registeredAt: row.fecha_registro ? row.fecha_registro.toISOString() : null,
      totalAppointments: 0,
      upcomingAppointments: 0,
      completedAppointments: 0,
      totalSpent: 0,
      lastAppointmentAt: null,
      lastCompletedAppointmentAt: null,
    }))
  }
}

export async function getClientByUserId(userId: number): Promise<ClientSummary | null> {
  const clients = await getClientsWithStats({ userId })
  return clients[0] ?? null
}

export async function registerClient(input: {
  name: string
  email: string
  password: string
  phone: string
}): Promise<ClientSummary> {
  let user: AuthUser

  try {
    const sanitizedPhone = input.phone.trim()

    user = await createUser({
      email: input.email,
      password: input.password,
      role: "client",
      profile: {
        name: input.name,
        phone: sanitizedPhone,
      },
    })
  } catch (error) {
    if (error instanceof UserAlreadyExistsError) {
      throw error
    }

    throw error
  }

  const client = await getClientByUserId(user.id)
  if (!client) {
    throw new ClientRecordNotFoundError()
  }

  return client
}
