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
      COALESCE(SUM(p.monto_final), 0) AS total_revenue,
      COALESCE(array_agg(DISTINCT s.nombre) FILTER (WHERE s.nombre IS NOT NULL), ARRAY[]::text[]) AS services
    FROM tenant_base.empleados e
    INNER JOIN tenant_base.users u ON u.id = e.user_id
    LEFT JOIN tenant_base.agendamientos a ON a.empleado_id = e.id
    LEFT JOIN tenant_base.pagos p ON p.agendamiento_id = a.id AND p.estado = 'pagado'
    LEFT JOIN tenant_base.empleados_servicios es ON es.empleado_id = e.id
    LEFT JOIN tenant_base.servicios s ON s.id = es.servicio_id
    ${whereClause}
    GROUP BY e.id, u.correo
    ORDER BY e.nombre ASC
  `

  const result = await pool.query<EmployeeSummaryRow>(query, parameters)
  return result.rows.map(mapEmployeeRow)
}

export async function getEmployeeByUserId(userId: number): Promise<EmployeeSummary | null> {
  const employees = await getEmployeesWithStats({ userId })
  return employees[0] ?? null
}

export async function registerEmployee(input: {
  name: string
  email: string
  password: string
  phone?: string | null
}): Promise<EmployeeSummary> {
  let user: AuthUser

  try {
    user = await createUser({
      email: input.email,
      password: input.password,
      role: "barber",
      profile: {
        name: input.name,
        phone: input.phone ?? undefined,
      },
    })
  } catch (error) {
    if (error instanceof UserAlreadyExistsError) {
      throw error
    }

    throw error
  }

  if (input.phone) {
    await pool.query(
      `UPDATE tenant_base.empleados
         SET telefono = $1
       WHERE user_id = $2`,
      [input.phone, user.id],
    )
  }

  const employee = await getEmployeeByUserId(user.id)
  if (!employee) {
    throw new Error("EMPLOYEE_NOT_CREATED")
  }

  return employee
}
