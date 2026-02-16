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

export type ServiceSummary = {
  id: number
  name: string
  description: string | null
  price: number
  durationMin: number
  status: string | null
}

export type AdminAppointmentSummary = {
  id: number
  status: string | null
  startAt: string
  endAt: string | null
  createdAt: string | null
  updatedAt: string | null
  employee: {
    id: number | null
    name: string
  }
  client: {
    id: number | null
    name: string
  }
  service: {
    id: number | null
    name: string
    price: number
    durationMin: number
  }
  paidAmount: number
}

export type AdminPaymentSummary = {
  rowId: number
  appointmentId: number | null
  amount: number
  status: string | null
  appointmentDate: string | null
  clientName: string
  employeeName: string
  serviceName: string
}

export type AdminUserSettings = {
  id: number
  email: string
  status: string | null
  lastLogin: string | null
}

export type AdminSettingsSummary = {
  totalAdminUsers: number
  totalEmployees: number
  totalClients: number
  totalServices: number
  activeServices: number
  totalAppointments: number
  totalPayments: number
  totalPaymentsAmount: number
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

export class ServiceRecordNotFoundError extends Error {
  constructor(message = "SERVICE_RECORD_NOT_FOUND") {
    super(message)
    this.name = "ServiceRecordNotFoundError"
  }
}

export class AdminUserRecordNotFoundError extends Error {
  constructor(message = "ADMIN_USER_RECORD_NOT_FOUND") {
    super(message)
    this.name = "AdminUserRecordNotFoundError"
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

type ServiceSummaryRow = {
  id: number
  nombre: string
  descripcion: string | null
  precio: number | null
  duracion_min: number | null
  estado: string | null
}

type AdminAppointmentRow = {
  id: number
  estado: string | null
  fecha_cita: Date
  fecha_cita_fin: Date | null
  empleado_id: number | null
  empleado_nombre: string | null
  cliente_id: number | null
  cliente_nombre: string | null
  servicio_id: number | null
  servicio_nombre: string | null
  servicio_precio: string | null
  servicio_duracion: number | null
  paid_amount: string | null
}

type AdminPaymentRow = {
  row_id: number
  agendamiento_id: number | null
  monto: string | null
  estado_pago: string | null
  fecha_cita: Date | null
  cliente_nombre: string | null
  empleado_nombre: string | null
  servicio_nombre: string | null
}

type AdminUserSettingsRow = {
  id: number
  correo: string
  estado: string | null
  ultimo_acceso: Date | null
}

type AdminSettingsSummaryRow = {
  total_admin_users: string | null
  total_employees: string | null
  total_clients: string | null
  total_services: string | null
  active_services: string | null
  total_appointments: string | null
  total_payments: string | null
  total_payments_amount: string | null
}

const PAID_PAYMENT_STATES = [
  "pagado",
  "aprobado",
  "completado",
  "confirmado",
  "finalizado",
  "paid",
  "success",
  "succeeded",
] as const

const PAID_PAYMENT_STATES_SQL = PAID_PAYMENT_STATES.map((state) => `'${state}'`).join(", ")

const ACTIVE_APPOINTMENT_STATES = [
  "pendiente",
  "confirmada",
  "confirmado",
  "agendada",
  "agendado",
  "programada",
  "programado",
] as const

const COMPLETED_APPOINTMENT_STATES = [
  "completada",
  "completado",
  "finalizada",
  "finalizado",
  "done",
  "completed",
] as const

const ACTIVE_APPOINTMENT_STATES_SQL = ACTIVE_APPOINTMENT_STATES.map((state) => `'${state}'`).join(", ")
const COMPLETED_APPOINTMENT_STATES_SQL = COMPLETED_APPOINTMENT_STATES.map((state) => `'${state}'`).join(", ")

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

function mapServiceRow(row: ServiceSummaryRow): ServiceSummary {
  return {
    id: row.id,
    name: row.nombre,
    description: row.descripcion,
    price: Number(row.precio ?? 0),
    durationMin: Number(row.duracion_min ?? 0),
    status: row.estado,
  }
}

function mapAdminAppointmentRow(row: AdminAppointmentRow): AdminAppointmentSummary {
  return {
    id: row.id,
    status: row.estado,
    startAt: row.fecha_cita.toISOString(),
    endAt: row.fecha_cita_fin ? row.fecha_cita_fin.toISOString() : null,
    createdAt: null,
    updatedAt: null,
    employee: {
      id: row.empleado_id,
      name: row.empleado_nombre?.trim() || "Sin empleado",
    },
    client: {
      id: row.cliente_id,
      name: row.cliente_nombre?.trim() || "Sin cliente",
    },
    service: {
      id: row.servicio_id,
      name: row.servicio_nombre?.trim() || "Sin servicio",
      price: Number(row.servicio_precio ?? 0),
      durationMin: Number(row.servicio_duracion ?? 0),
    },
    paidAmount: Number(row.paid_amount ?? 0),
  }
}

function mapAdminPaymentRow(row: AdminPaymentRow): AdminPaymentSummary {
  return {
    rowId: row.row_id,
    appointmentId: row.agendamiento_id,
    amount: Number(row.monto ?? 0),
    status: row.estado_pago,
    appointmentDate: row.fecha_cita ? row.fecha_cita.toISOString() : null,
    clientName: row.cliente_nombre?.trim() || "Sin cliente",
    employeeName: row.empleado_nombre?.trim() || "Sin empleado",
    serviceName: row.servicio_nombre?.trim() || "Sin servicio",
  }
}

function mapAdminUserSettingsRow(row: AdminUserSettingsRow): AdminUserSettings {
  return {
    id: row.id,
    email: row.correo,
    status: row.estado,
    lastLogin: row.ultimo_acceso ? row.ultimo_acceso.toISOString() : null,
  }
}

function mapAdminSettingsSummaryRow(row: AdminSettingsSummaryRow): AdminSettingsSummary {
  return {
    totalAdminUsers: Number(row.total_admin_users ?? 0),
    totalEmployees: Number(row.total_employees ?? 0),
    totalClients: Number(row.total_clients ?? 0),
    totalServices: Number(row.total_services ?? 0),
    activeServices: Number(row.active_services ?? 0),
    totalAppointments: Number(row.total_appointments ?? 0),
    totalPayments: Number(row.total_payments ?? 0),
    totalPaymentsAmount: Number(row.total_payments_amount ?? 0),
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
      COALESCE(
        COUNT(a.id) FILTER (WHERE LOWER(a.estado::text) IN (${ACTIVE_APPOINTMENT_STATES_SQL})),
        0
      ) AS active_appointments,
      COALESCE(
        COUNT(a.id) FILTER (WHERE LOWER(a.estado::text) IN (${COMPLETED_APPOINTMENT_STATES_SQL})),
        0
      ) AS completed_appointments,
  COALESCE(SUM(p.monto), 0) AS total_revenue,
      COALESCE(array_agg(DISTINCT s.nombre) FILTER (WHERE s.nombre IS NOT NULL), ARRAY[]::text[]) AS services
    FROM tenant_base.empleados e
    INNER JOIN tenant_base.users u ON u.id = e.user_id
    LEFT JOIN tenant_base.agendamientos a ON a.empleado_id = e.id
    LEFT JOIN tenant_base.pagos p
      ON p.agendamiento_id = a.id
      AND LOWER(p.estado::text) IN (${PAID_PAYMENT_STATES_SQL})
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

export async function updateEmployee(input: {
  employeeId: number
  name: string
  email: string
  phone: string
}): Promise<EmployeeSummary> {
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    const employeeResult = await client.query<{ user_id: number }>(
      `UPDATE tenant_base.empleados
          SET nombre = $2,
              telefono = $3
        WHERE id = $1
        RETURNING user_id`,
      [input.employeeId, input.name, input.phone],
    )

    if (employeeResult.rowCount === 0) {
      throw new EmployeeRecordNotFoundError()
    }

    const userId = employeeResult.rows[0].user_id

    await client.query(
      `UPDATE tenant_base.users
          SET correo = $2
        WHERE id = $1`,
      [userId, input.email],
    )

    await client.query("COMMIT")
  } catch (error) {
    try {
      await client.query("ROLLBACK")
    } catch (rollbackError) {
      console.error("Failed to rollback employee update transaction", rollbackError)
    }

    throw error
  } finally {
    client.release()
  }

  const updatedEmployee = await getEmployeesWithStats({ employeeId: input.employeeId })
  if (!updatedEmployee[0]) {
    throw new EmployeeRecordNotFoundError()
  }

  return updatedEmployee[0]
}

export async function deleteEmployee(employeeId: number): Promise<void> {
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    const employeeResult = await client.query<{ user_id: number }>(
      `DELETE FROM tenant_base.empleados
        WHERE id = $1
        RETURNING user_id`,
      [employeeId],
    )

    if (employeeResult.rowCount === 0) {
      throw new EmployeeRecordNotFoundError()
    }

    const userId = employeeResult.rows[0].user_id

    await client.query(
      `DELETE FROM tenant_base.users
        WHERE id = $1`,
      [userId],
    )

    await client.query("COMMIT")
  } catch (error) {
    try {
      await client.query("ROLLBACK")
    } catch (rollbackError) {
      console.error("Failed to rollback employee delete transaction", rollbackError)
    }

    throw error
  } finally {
    client.release()
  }
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
      COALESCE(
        COUNT(a.id) FILTER (WHERE LOWER(a.estado::text) IN (${ACTIVE_APPOINTMENT_STATES_SQL})),
        0
      ) AS upcoming_appointments,
      COALESCE(
        COUNT(a.id) FILTER (WHERE LOWER(a.estado::text) IN (${COMPLETED_APPOINTMENT_STATES_SQL})),
        0
      ) AS completed_appointments,
      COALESCE(SUM(p.monto), 0) AS total_spent,
      MAX(a.fecha_cita) AS last_appointment_at,
      MAX(a.fecha_cita) FILTER (WHERE LOWER(a.estado::text) IN (${COMPLETED_APPOINTMENT_STATES_SQL})) AS last_completed_appointment_at
    FROM tenant_base.clientes c
    INNER JOIN tenant_base.users u ON u.id = c.user_id
    LEFT JOIN tenant_base.agendamientos a ON a.cliente_id = c.id
    LEFT JOIN tenant_base.pagos p
      ON p.agendamiento_id = a.id
      AND LOWER(p.estado::text) IN (${PAID_PAYMENT_STATES_SQL})
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

export async function getServicesCatalog(): Promise<ServiceSummary[]> {
  const result = await pool.query<ServiceSummaryRow>(
    `SELECT id,
            nombre,
            descripcion,
            precio,
            duracion_min,
            estado::text AS estado
       FROM tenant_base.servicios
      ORDER BY nombre ASC`,
  )

  return result.rows.map(mapServiceRow)
}

export async function createService(input: {
  name: string
  description?: string | null
  price: number
  durationMin: number
}): Promise<ServiceSummary> {
  const result = await pool.query<ServiceSummaryRow>(
    `INSERT INTO tenant_base.servicios (nombre, descripcion, precio, duracion_min)
     VALUES ($1, NULLIF($2, ''), $3, $4)
     RETURNING id, nombre, descripcion, precio, duracion_min, estado::text AS estado`,
    [input.name, input.description ?? "", input.price, input.durationMin],
  )

  if (result.rowCount === 0) {
    throw new Error("SERVICE_CREATE_FAILED")
  }

  return mapServiceRow(result.rows[0])
}

export async function updateService(
  serviceId: number,
  input: {
    name: string
    description?: string | null
    price: number
    durationMin: number
  },
): Promise<ServiceSummary> {
  const result = await pool.query<ServiceSummaryRow>(
    `UPDATE tenant_base.servicios
        SET nombre = $2,
            descripcion = NULLIF($3, ''),
            precio = $4,
        duracion_min = $5
      WHERE id = $1
      RETURNING id, nombre, descripcion, precio, duracion_min, estado::text AS estado`,
    [serviceId, input.name, input.description ?? "", input.price, input.durationMin],
  )

  if (result.rowCount === 0) {
    throw new ServiceRecordNotFoundError()
  }

  return mapServiceRow(result.rows[0])
}

export async function deleteService(serviceId: number): Promise<void> {
  const result = await pool.query<{ id: number }>(
    `DELETE FROM tenant_base.servicios
      WHERE id = $1
      RETURNING id`,
    [serviceId],
  )

  if (result.rowCount === 0) {
    throw new ServiceRecordNotFoundError()
  }
}

export async function getAdminAppointments(options?: {
  status?: string
  employeeId?: number
  clientId?: number
  fromDate?: string
  toDate?: string
  limit?: number
}): Promise<AdminAppointmentSummary[]> {
  const conditions: string[] = []
  const parameters: Array<string | number> = []

  if (options?.status && options.status.trim().length > 0 && options.status !== "all") {
    parameters.push(options.status.trim().toLowerCase())
    conditions.push(`LOWER(a.estado::text) = $${parameters.length}`)
  }

  if (typeof options?.employeeId === "number" && Number.isFinite(options.employeeId)) {
    parameters.push(options.employeeId)
    conditions.push(`a.empleado_id = $${parameters.length}`)
  }

  if (typeof options?.clientId === "number" && Number.isFinite(options.clientId)) {
    parameters.push(options.clientId)
    conditions.push(`a.cliente_id = $${parameters.length}`)
  }

  if (options?.fromDate) {
    parameters.push(options.fromDate)
    conditions.push(`a.fecha_cita >= $${parameters.length}::timestamp`)
  }

  if (options?.toDate) {
    parameters.push(options.toDate)
    conditions.push(`a.fecha_cita <= $${parameters.length}::timestamp`)
  }

  const limit =
    typeof options?.limit === "number" && Number.isFinite(options.limit)
      ? Math.min(Math.max(Math.trunc(options.limit), 1), 500)
      : 250

  parameters.push(limit)
  const limitPlaceholder = `$${parameters.length}`

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  const query = `
    SELECT
      a.id,
      a.estado::text AS estado,
      a.fecha_cita,
      a.fecha_cita_fin,
      e.id AS empleado_id,
      e.nombre AS empleado_nombre,
      c.id AS cliente_id,
      c.nombre AS cliente_nombre,
      s.id AS servicio_id,
      s.nombre AS servicio_nombre,
      s.precio::text AS servicio_precio,
      s.duracion_min AS servicio_duracion,
      COALESCE(SUM(p.monto) FILTER (WHERE LOWER(p.estado::text) IN (${PAID_PAYMENT_STATES_SQL})), 0)::text AS paid_amount
    FROM tenant_base.agendamientos a
    LEFT JOIN tenant_base.empleados e ON e.id = a.empleado_id
    LEFT JOIN tenant_base.clientes c ON c.id = a.cliente_id
    LEFT JOIN tenant_base.servicios s ON s.id = a.servicio_id
    LEFT JOIN tenant_base.pagos p ON p.agendamiento_id = a.id
    ${whereClause}
    GROUP BY
      a.id,
      a.estado,
      a.fecha_cita,
      a.fecha_cita_fin,
      e.id,
      e.nombre,
      c.id,
      c.nombre,
      s.id,
      s.nombre,
      s.precio,
      s.duracion_min
    ORDER BY a.fecha_cita DESC
    LIMIT ${limitPlaceholder}
  `

  const result = await pool.query<AdminAppointmentRow>(query, parameters)
  return result.rows.map(mapAdminAppointmentRow)
}

export async function getAdminPayments(options?: {
  status?: string
  limit?: number
}): Promise<AdminPaymentSummary[]> {
  const conditions: string[] = []
  const parameters: Array<string | number> = []

  if (options?.status && options.status.trim().length > 0 && options.status !== "all") {
    parameters.push(options.status.trim().toLowerCase())
    conditions.push(`LOWER(p.estado::text) = $${parameters.length}`)
  }

  const limit =
    typeof options?.limit === "number" && Number.isFinite(options.limit)
      ? Math.min(Math.max(Math.trunc(options.limit), 1), 1000)
      : 300

  parameters.push(limit)
  const limitPlaceholder = `$${parameters.length}`

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  const query = `
    SELECT
      ROW_NUMBER() OVER (
        ORDER BY COALESCE(a.fecha_cita, NOW()) DESC, COALESCE(p.agendamiento_id, 0) DESC
      )::int AS row_id,
      p.agendamiento_id,
      p.monto::text AS monto,
      p.estado::text AS estado_pago,
      a.fecha_cita,
      c.nombre AS cliente_nombre,
      e.nombre AS empleado_nombre,
      s.nombre AS servicio_nombre
    FROM tenant_base.pagos p
    LEFT JOIN tenant_base.agendamientos a ON a.id = p.agendamiento_id
    LEFT JOIN tenant_base.clientes c ON c.id = a.cliente_id
    LEFT JOIN tenant_base.empleados e ON e.id = a.empleado_id
    LEFT JOIN tenant_base.servicios s ON s.id = a.servicio_id
    ${whereClause}
    ORDER BY COALESCE(a.fecha_cita, NOW()) DESC, COALESCE(p.agendamiento_id, 0) DESC
    LIMIT ${limitPlaceholder}
  `

  const result = await pool.query<AdminPaymentRow>(query, parameters)
  return result.rows.map(mapAdminPaymentRow)
}

export async function getAdminSettings(): Promise<{
  summary: AdminSettingsSummary
  adminUsers: AdminUserSettings[]
}> {
  const summaryResult = await pool.query<AdminSettingsSummaryRow>(
    `SELECT
      (SELECT COUNT(*) FROM tenant_base.users u WHERE u.rol::text = 'admin')::text AS total_admin_users,
      (SELECT COUNT(*) FROM tenant_base.empleados)::text AS total_employees,
      (SELECT COUNT(*) FROM tenant_base.clientes)::text AS total_clients,
      (SELECT COUNT(*) FROM tenant_base.servicios)::text AS total_services,
      (SELECT COUNT(*) FROM tenant_base.servicios s WHERE LOWER(s.estado::text) = 'activo')::text AS active_services,
      (SELECT COUNT(*) FROM tenant_base.agendamientos)::text AS total_appointments,
      (SELECT COUNT(*) FROM tenant_base.pagos)::text AS total_payments,
      (SELECT COALESCE(SUM(p.monto), 0) FROM tenant_base.pagos p)::text AS total_payments_amount`,
  )

  let adminUsersResult

  try {
    adminUsersResult = await pool.query<AdminUserSettingsRow>(
      `SELECT id,
              correo,
              estado::text AS estado,
              ultimo_acceso
         FROM tenant_base.users
        WHERE rol::text = 'admin'
        ORDER BY id ASC`,
    )
  } catch {
    adminUsersResult = await pool.query<AdminUserSettingsRow>(
      `SELECT id,
              correo,
              NULL::text AS estado,
              ultimo_acceso
         FROM tenant_base.users
        WHERE rol::text = 'admin'
        ORDER BY id ASC`,
    )
  }

  const summary = mapAdminSettingsSummaryRow(summaryResult.rows[0] ?? {
    total_admin_users: "0",
    total_employees: "0",
    total_clients: "0",
    total_services: "0",
    active_services: "0",
    total_appointments: "0",
    total_payments: "0",
    total_payments_amount: "0",
  })

  return {
    summary,
    adminUsers: adminUsersResult.rows.map(mapAdminUserSettingsRow),
  }
}

export async function updateAdminUserEmail(input: {
  userId: number
  email: string
}): Promise<AdminUserSettings> {
  let result

  try {
    result = await pool.query<AdminUserSettingsRow>(
      `UPDATE tenant_base.users
          SET correo = $2
        WHERE id = $1
          AND rol::text = 'admin'
        RETURNING id, correo, estado::text AS estado, ultimo_acceso`,
      [input.userId, input.email],
    )
  } catch {
    result = await pool.query<AdminUserSettingsRow>(
      `UPDATE tenant_base.users
          SET correo = $2
        WHERE id = $1
          AND rol::text = 'admin'
        RETURNING id, correo, NULL::text AS estado, ultimo_acceso`,
      [input.userId, input.email],
    )
  }

  if (result.rowCount === 0) {
    throw new AdminUserRecordNotFoundError()
  }

  return mapAdminUserSettingsRow(result.rows[0])
}
