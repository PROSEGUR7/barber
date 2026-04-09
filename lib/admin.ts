import { pool } from "@/lib/db"
import { BASE_TENANT_SCHEMA, createUser, type AuthUser, UserAlreadyExistsError } from "@/lib/auth"
import { normalizeTenantSchema, tenantSql } from "@/lib/tenant"

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
  paidAppointments: number
  totalRevenue: number
  serviceIds: number[]
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
  serviceType: "individual" | "paquete"
  category: {
    id: number | null
    name: string | null
  }
  packageItemServiceIds: number[]
  packageItems: Array<{
    serviceId: number
    name: string
    durationMin: number
    price: number
    quantity: number
  }>
}

export type AdminAppointmentSummary = {
  id: number
  status: string | null
  paymentStatus: string | null
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

export type AdminReportsGranularity = "day" | "month" | "year"

export type AdminRevenueSeriesPoint = {
  bucketStart: string
  revenue: number
  paymentsCount: number
  appointmentsCount: number
}

export type AdminTopServiceReport = {
  serviceId: number | null
  serviceName: string
  revenue: number
  paidAppointments: number
}

export type AdminPaymentMethodBreakdown = {
  method: string
  paymentsCount: number
  revenue: number
}

export type AdminDemandHeatPoint = {
  dayOfWeek: number
  hour: number
  appointments: number
}

export type AdminRetentionMetrics = {
  firstTimeClients: number
  retainedClients: number
  retentionRatePct: number
}

export type AdminBarberPerformanceReport = {
  employeeId: number
  employeeName: string
  revenue: number
  servicesDone: number
  ratingAverage: number | null
  ratingCount: number
}

export type AdminTopClientReport = {
  clientId: number | null
  clientName: string
  paidAppointments: number
  revenue: number
}

export type AdminIncomeMetrics = {
  paymentMethods: AdminPaymentMethodBreakdown[]
  averageTicketPerClient: number
}

export type AdminEfficiencyMetrics = {
  noShowRatePct: number
  noShowAppointments: number
  totalAppointments: number
  occupancyRatePct: number | null
  productiveMinutes: number
  availableMinutes: number
  demandHeatmap: AdminDemandHeatPoint[]
}

export type AdminClientStaffMetrics = {
  retention: AdminRetentionMetrics
  barberPerformance: AdminBarberPerformanceReport[]
  topClients: AdminTopClientReport[]
}

export type AdminRevenueReport = {
  granularity: AdminReportsGranularity
  series: AdminRevenueSeriesPoint[]
  totals: {
    revenue: number
    paymentsCount: number
    appointmentsCount: number
  }
  topServices: AdminTopServiceReport[]
  income: AdminIncomeMetrics
  efficiency: AdminEfficiencyMetrics
  clientsAndStaff: AdminClientStaffMetrics
}

export type AdminSedeInsightsScope = "month" | "quarter" | "year"

export type AdminSedeTopServiceInsight = {
  serviceId: number | null
  serviceName: string
  appointments: number
  revenue: number
}

export type AdminSedeBusinessInsight = {
  sedeId: number
  sedeName: string
  revenue: number
  previousRevenue: number
  growthPct: number | null
  paidAppointments: number
  totalAppointments: number
  upcomingAppointments: number
  topService: AdminSedeTopServiceInsight | null
}

export type AdminSedeInsightsReport = {
  scope: AdminSedeInsightsScope
  scopeLabel: string
  currentMonthRevenue: number
  previousMonthRevenue: number
  monthlyGrowthPct: number | null
  bestSedeByRevenue: AdminSedeBusinessInsight | null
  bestSedeByAppointments: AdminSedeBusinessInsight | null
  sedes: AdminSedeBusinessInsight[]
}

export type AdminSedeRevenueSeriesPoint = {
  bucketStart: string
  revenue: number
  paymentsCount: number
  appointmentsCount: number
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

export class InvalidServicePackageError extends Error {
  constructor(message = "INVALID_SERVICE_PACKAGE") {
    super(message)
    this.name = "InvalidServicePackageError"
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
  paid_appointments: string | null
  total_revenue: string | null
  service_ids: number[] | null
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

type EmployeeLegacyBasicRow = {
  id: number
  user_id: number
  nombre: string
  correo: string
  telefono: string | null
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
  tipo_servicio: string | null
  categoria_id: number | null
  categoria_nombre: string | null
  package_item_service_ids: number[] | null
  package_items:
    | Array<{
        serviceId?: number
        name?: string
        durationMin?: number
        price?: number
        quantity?: number
      }>
    | null
}

type AdminAppointmentRow = {
  id: number
  estado: string | null
  estado_pago: string | null
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

type AdminRevenueSeriesRow = {
  bucket_start: Date | null
  revenue: string | null
  payments_count: string | null
  appointments_count: string | null
}

type AdminTopServiceRow = {
  servicio_id: number | null
  servicio_nombre: string | null
  revenue: string | null
  paid_appointments: string | null
}

type PaymentMethodBreakdownRow = {
  metodo_pago: string | null
  payments_count: string | null
  revenue: string | null
}

type AverageTicketRow = {
  average_ticket_per_client: string | null
}

type NoShowRow = {
  total_appointments: string | null
  no_show_appointments: string | null
}

type OccupancyRow = {
  productive_minutes: string | null
  available_minutes: string | null
}

type DemandHeatmapRow = {
  day_of_week: number | null
  hour_of_day: number | null
  appointments: string | null
}

type RetentionRow = {
  first_time_clients: string | null
  retained_clients: string | null
}

type BarberPerformanceRow = {
  employee_id: number | null
  employee_name: string | null
  revenue: string | null
  services_done: string | null
  rating_average: string | null
  rating_count: string | null
}

type TopClientRow = {
  client_id: number | null
  client_name: string | null
  paid_appointments: string | null
  revenue: string | null
}

type SedeBusinessMetricsRow = {
  sede_id: number | null
  sede_nombre: string | null
  current_revenue: string | null
  previous_revenue: string | null
  paid_appointments: string | null
  total_appointments: string | null
  upcoming_appointments: string | null
}

type SedeTopServiceRow = {
  sede_id: number | null
  service_id: number | null
  service_name: string | null
  appointments: string | null
  revenue: string | null
}

type SedeMonthlyRevenueRow = {
  current_month_revenue: string | null
  previous_month_revenue: string | null
}

const PAID_PAYMENT_STATES = [
  "completo",
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

const SEDE_INSIGHTS_SCOPE_CONFIG: Record<
  AdminSedeInsightsScope,
  {
    scopeLabel: string
    revenueCurrentPeriodClause: string
    revenuePreviousPeriodClause: string
    appointmentPeriodClause: string
  }
> = {
  month: {
    scopeLabel: "Mes actual",
    revenueCurrentPeriodClause:
      "p.fecha_pago >= date_trunc('month', now()) AND p.fecha_pago < date_trunc('month', now()) + interval '1 month'",
    revenuePreviousPeriodClause:
      "p.fecha_pago >= date_trunc('month', now()) - interval '1 month' AND p.fecha_pago < date_trunc('month', now())",
    appointmentPeriodClause:
      "a.fecha_cita >= date_trunc('month', now()) AND a.fecha_cita < date_trunc('month', now()) + interval '1 month'",
  },
  quarter: {
    scopeLabel: "Ultimos 3 meses",
    revenueCurrentPeriodClause:
      "p.fecha_pago >= date_trunc('month', now()) - interval '2 months' AND p.fecha_pago < date_trunc('month', now()) + interval '1 month'",
    revenuePreviousPeriodClause:
      "p.fecha_pago >= date_trunc('month', now()) - interval '5 months' AND p.fecha_pago < date_trunc('month', now()) - interval '2 months'",
    appointmentPeriodClause:
      "a.fecha_cita >= date_trunc('month', now()) - interval '2 months' AND a.fecha_cita < date_trunc('month', now()) + interval '1 month'",
  },
  year: {
    scopeLabel: "Ano actual",
    revenueCurrentPeriodClause:
      "p.fecha_pago >= date_trunc('year', now()) AND p.fecha_pago < date_trunc('year', now()) + interval '1 year'",
    revenuePreviousPeriodClause:
      "p.fecha_pago >= date_trunc('year', now()) - interval '1 year' AND p.fecha_pago < date_trunc('year', now())",
    appointmentPeriodClause:
      "a.fecha_cita >= date_trunc('year', now()) AND a.fecha_cita < date_trunc('year', now()) + interval '1 year'",
  },
}

function mapEmployeeRow(row: EmployeeSummaryRow): EmployeeSummary {
  const serviceIds = Array.isArray(row.service_ids)
    ? row.service_ids.filter((serviceId): serviceId is number => Number.isInteger(serviceId) && serviceId > 0)
    : []

  const services = Array.isArray(row.services)
    ? row.services.filter((service): service is string => typeof service === "string" && service.trim().length > 0)
    : []

  const totalAppointments = Number(row.total_appointments ?? 0)
  const upcomingAppointments = Number(row.active_appointments ?? 0)
  const completedAppointments = Number(row.completed_appointments ?? 0)
  const paidAppointments = Number(row.paid_appointments ?? 0)
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
    paidAppointments,
    totalRevenue,
    serviceIds,
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
  const packageItemServiceIds = Array.isArray(row.package_item_service_ids)
    ? row.package_item_service_ids.filter((item): item is number => Number.isInteger(item) && item > 0)
    : []

  const packageItems = Array.isArray(row.package_items)
    ? row.package_items
        .map((item) => ({
          serviceId: Number(item?.serviceId ?? 0),
          name: String(item?.name ?? "").trim(),
          durationMin: Number(item?.durationMin ?? 0),
          price: Number(item?.price ?? 0),
          quantity: Number(item?.quantity ?? 1),
        }))
        .filter(
          (item) =>
            Number.isInteger(item.serviceId) &&
            item.serviceId > 0 &&
            item.name.length > 0 &&
            Number.isFinite(item.durationMin) &&
            item.durationMin > 0 &&
            Number.isFinite(item.price) &&
            Number.isFinite(item.quantity) &&
            item.quantity > 0,
        )
    : []

  const serviceType = row.tipo_servicio?.trim().toLowerCase() === "paquete" ? "paquete" : "individual"

  return {
    id: row.id,
    name: row.nombre,
    description: row.descripcion,
    price: Number(row.precio ?? 0),
    durationMin: Number(row.duracion_min ?? 0),
    status: row.estado,
    serviceType,
    category: {
      id: row.categoria_id,
      name: row.categoria_nombre?.trim() || null,
    },
    packageItemServiceIds,
    packageItems,
  }
}

const ensuredServiceCatalogSchemas = new Set<string>()

function getServiceCatalogSchemaKey(tenantSchema?: string | null): string {
  return (tenantSchema ?? "tenant_base").trim().toLowerCase() || "tenant_base"
}

async function ensureServiceCatalogSchema(
  queryable: { query: (queryText: string, values?: unknown[]) => Promise<unknown> },
  tenantSchema?: string | null,
) {
  const schemaKey = getServiceCatalogSchemaKey(tenantSchema)
  if (ensuredServiceCatalogSchemas.has(schemaKey)) {
    return
  }

  await queryable.query(
    tenantSql(
      `CREATE TABLE IF NOT EXISTS tenant_base.servicio_categorias (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(120) NOT NULL UNIQUE,
        descripcion TEXT,
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
      );`,
      tenantSchema,
    ),
  )

  await queryable.query(
    tenantSql(
      `ALTER TABLE tenant_base.servicios
         ADD COLUMN IF NOT EXISTS categoria_id INTEGER,
         ADD COLUMN IF NOT EXISTS tipo_servicio VARCHAR(20) NOT NULL DEFAULT 'individual';`,
      tenantSchema,
    ),
  )

  await queryable.query(
    tenantSql(
      `DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = 'servicios_categoria_id_fk'
        ) THEN
          ALTER TABLE tenant_base.servicios
            ADD CONSTRAINT servicios_categoria_id_fk
            FOREIGN KEY (categoria_id)
            REFERENCES tenant_base.servicio_categorias(id)
            ON DELETE SET NULL;
        END IF;
      END
      $$;`,
      tenantSchema,
    ),
  )

  await queryable.query(
    tenantSql(
      `DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = 'servicios_tipo_servicio_chk'
        ) THEN
          ALTER TABLE tenant_base.servicios
            ADD CONSTRAINT servicios_tipo_servicio_chk
            CHECK (LOWER(tipo_servicio) IN ('individual', 'paquete'));
        END IF;
      END
      $$;`,
      tenantSchema,
    ),
  )

  await queryable.query(
    tenantSql(
      `CREATE TABLE IF NOT EXISTS tenant_base.servicio_paquetes_items (
        id BIGSERIAL PRIMARY KEY,
        servicio_paquete_id INTEGER NOT NULL REFERENCES tenant_base.servicios(id) ON DELETE CASCADE,
        servicio_individual_id INTEGER NOT NULL REFERENCES tenant_base.servicios(id) ON DELETE RESTRICT,
        cantidad INTEGER NOT NULL DEFAULT 1,
        orden INTEGER NOT NULL DEFAULT 0,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT servicio_paquetes_items_cantidad_chk CHECK (cantidad > 0),
        CONSTRAINT servicio_paquetes_items_unq UNIQUE (servicio_paquete_id, servicio_individual_id)
      );`,
      tenantSchema,
    ),
  )

  await queryable.query(
    tenantSql(
      `CREATE INDEX IF NOT EXISTS servicio_paquetes_items_paquete_idx
         ON tenant_base.servicio_paquetes_items (servicio_paquete_id, orden, id);`,
      tenantSchema,
    ),
  )

  ensuredServiceCatalogSchemas.add(schemaKey)
}

type QueryResultWithRows<T> = {
  rowCount: number
  rows: T[]
}

async function resolveCategoryId(
  client: {
    query: <T>(queryText: string, values?: unknown[]) => Promise<QueryResultWithRows<T>>
  },
  categoryName: string | null | undefined,
  tenantSchema?: string | null,
): Promise<number | null> {
  const normalizedName = String(categoryName ?? "").trim()
  if (!normalizedName) {
    return null
  }

  const existing = await client.query<{ id: number }>(
    tenantSql(
      `SELECT id
         FROM tenant_base.servicio_categorias
        WHERE LOWER(nombre) = LOWER($1)
        LIMIT 1`,
      tenantSchema,
    ),
    [normalizedName],
  )

  if (existing.rowCount > 0) {
    return Number(existing.rows[0].id)
  }

  const created = await client.query<{ id: number }>(
    tenantSql(
      `INSERT INTO tenant_base.servicio_categorias (nombre, activo)
       VALUES ($1, TRUE)
       RETURNING id`,
      tenantSchema,
    ),
    [normalizedName],
  )

  if (created.rowCount === 0) {
    return null
  }

  return Number(created.rows[0].id)
}

async function syncServicePackageItems(
  client: {
    query: <T>(queryText: string, values?: unknown[]) => Promise<QueryResultWithRows<T>>
  },
  options: {
    packageServiceId: number
    packageItemServiceIds: number[]
    tenantSchema?: string | null
  },
) {
  const uniqueServiceIds = [...new Set(options.packageItemServiceIds)]
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0)

  if (uniqueServiceIds.length === 0) {
    throw new InvalidServicePackageError("PACKAGE_ITEMS_REQUIRED")
  }

  if (uniqueServiceIds.includes(options.packageServiceId)) {
    throw new InvalidServicePackageError("PACKAGE_SELF_REFERENCE")
  }

  const validServices = await client.query<{ id: number }>(
    tenantSql(
      `SELECT id
         FROM tenant_base.servicios
        WHERE id = ANY($1::int[])
          AND LOWER(COALESCE(tipo_servicio, 'individual')) = 'individual'`,
      options.tenantSchema,
    ),
    [uniqueServiceIds],
  )

  if (validServices.rowCount !== uniqueServiceIds.length) {
    throw new InvalidServicePackageError("PACKAGE_ITEMS_INVALID")
  }

  await client.query(
    tenantSql(
      `DELETE FROM tenant_base.servicio_paquetes_items
        WHERE servicio_paquete_id = $1`,
      options.tenantSchema,
    ),
    [options.packageServiceId],
  )

  await client.query(
    tenantSql(
      `INSERT INTO tenant_base.servicio_paquetes_items
        (servicio_paquete_id, servicio_individual_id, cantidad, orden)
       SELECT $1, t.service_id, 1, t.ord::int
         FROM unnest($2::int[]) WITH ORDINALITY AS t(service_id, ord)`,
      options.tenantSchema,
    ),
    [options.packageServiceId, uniqueServiceIds],
  )
}

async function getServiceById(serviceId: number, tenantSchema?: string | null): Promise<ServiceSummary | null> {
  const result = await pool.query<ServiceSummaryRow>(
    tenantSql(
      `SELECT
        s.id,
        s.nombre,
        s.descripcion,
        s.precio,
        s.duracion_min,
        s.estado::text AS estado,
        LOWER(COALESCE(s.tipo_servicio, 'individual'))::text AS tipo_servicio,
        s.categoria_id,
        sc.nombre AS categoria_nombre,
        COALESCE(pkg.service_ids, ARRAY[]::int[]) AS package_item_service_ids,
        COALESCE(pkg.items, '[]'::json) AS package_items
      FROM tenant_base.servicios s
      LEFT JOIN tenant_base.servicio_categorias sc ON sc.id = s.categoria_id
      LEFT JOIN LATERAL (
        SELECT
          array_agg(spi.servicio_individual_id ORDER BY spi.orden, spi.id) AS service_ids,
          json_agg(
            json_build_object(
              'serviceId', si.id,
              'name', si.nombre,
              'durationMin', si.duracion_min,
              'price', si.precio,
              'quantity', spi.cantidad
            )
            ORDER BY spi.orden, spi.id
          ) AS items
        FROM tenant_base.servicio_paquetes_items spi
        INNER JOIN tenant_base.servicios si ON si.id = spi.servicio_individual_id
        WHERE spi.servicio_paquete_id = s.id
      ) pkg ON TRUE
      WHERE s.id = $1
      LIMIT 1`,
      tenantSchema,
    ),
    [serviceId],
  )

  if (result.rowCount === 0) {
    return null
  }

  return mapServiceRow(result.rows[0])
}

function mapAdminAppointmentRow(row: AdminAppointmentRow): AdminAppointmentSummary {
  const startAt = row.fecha_cita
  const serviceDurationRaw = Number(row.servicio_duracion ?? 0)
  const serviceDuration = Number.isFinite(serviceDurationRaw) && serviceDurationRaw > 0 ? Math.trunc(serviceDurationRaw) : 30

  const hasValidEndAt =
    row.fecha_cita_fin instanceof Date &&
    !Number.isNaN(row.fecha_cita_fin.getTime()) &&
    row.fecha_cita_fin.getTime() > startAt.getTime()

  const endAt = hasValidEndAt
    ? row.fecha_cita_fin
    : new Date(startAt.getTime() + serviceDuration * 60 * 1000)

  return {
    id: row.id,
    status: row.estado,
    paymentStatus: row.estado_pago,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
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
      durationMin: serviceDuration,
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

export async function getEmployeesWithStats(filter?: {
  employeeId?: number
  userId?: number
  tenantSchema?: string | null
}): Promise<EmployeeSummary[]> {
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
      COALESCE(appointments.total_appointments, 0)::text AS total_appointments,
      COALESCE(appointments.active_appointments, 0)::text AS active_appointments,
      COALESCE(appointments.completed_appointments, 0)::text AS completed_appointments,
      COALESCE(revenue.paid_appointments, 0)::text AS paid_appointments,
      COALESCE(revenue.total_revenue, 0)::text AS total_revenue,
      COALESCE(assigned_services.service_ids, ARRAY[]::int[]) AS service_ids,
      COALESCE(assigned_services.services, ARRAY[]::text[]) AS services
    FROM tenant_base.empleados e
    INNER JOIN tenant_base.users u ON u.id = e.user_id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(a.id) AS total_appointments,
        COUNT(a.id) FILTER (WHERE LOWER(a.estado::text) IN (${ACTIVE_APPOINTMENT_STATES_SQL})) AS active_appointments,
        COUNT(a.id) FILTER (WHERE LOWER(a.estado::text) IN (${COMPLETED_APPOINTMENT_STATES_SQL})) AS completed_appointments
      FROM tenant_base.agendamientos a
      WHERE a.empleado_id = e.id
    ) appointments ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) AS paid_appointments,
        COALESCE(
          SUM(
            CASE
              WHEN COALESCE(latest_paid_payment.monto, 0) > 0 THEN latest_paid_payment.monto
              ELSE COALESCE(s.precio, 0)
            END
          ),
          0
        ) AS total_revenue
      FROM tenant_base.agendamientos a
      LEFT JOIN tenant_base.servicios s ON s.id = a.servicio_id
      LEFT JOIN LATERAL (
        SELECT
          p.monto,
          p.estado::text AS estado,
          p.wompi_status
        FROM tenant_base.pagos p
        WHERE p.agendamiento_id = a.id
        ORDER BY p.fecha_pago DESC NULLS LAST, p.id DESC
        LIMIT 1
      ) latest_paid_payment ON TRUE
      WHERE a.empleado_id = e.id
        AND (
          LOWER(COALESCE(latest_paid_payment.estado, '')) IN (${PAID_PAYMENT_STATES_SQL})
          OR UPPER(COALESCE(latest_paid_payment.wompi_status, '')) = 'APPROVED'
          OR (latest_paid_payment.estado IS NULL AND LOWER(a.estado::text) IN (${COMPLETED_APPOINTMENT_STATES_SQL}))
        )
    ) revenue ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(array_agg(DISTINCT es.servicio_id) FILTER (WHERE es.servicio_id IS NOT NULL), ARRAY[]::int[]) AS service_ids,
        COALESCE(array_agg(DISTINCT s.nombre) FILTER (WHERE s.nombre IS NOT NULL), ARRAY[]::text[]) AS services
      FROM tenant_base.empleados_servicios es
      LEFT JOIN tenant_base.servicios s ON s.id = es.servicio_id
      WHERE es.empleado_id = e.id
    ) assigned_services ON TRUE
    ${whereClause}
    ORDER BY e.nombre ASC
  `

  try {
    const result = await pool.query<EmployeeSummaryRow>(tenantSql(query, filter?.tenantSchema), parameters)
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

    try {
      const fallbackResult = await pool.query<EmployeeBasicRow>(tenantSql(fallbackQuery, filter?.tenantSchema), parameters)
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
        paidAppointments: 0,
        totalRevenue: 0,
        serviceIds: [],
        services: [],
        rating: null,
      }))
    } catch (fallbackError) {
      console.warn("Falling back to legacy employee query", { filter, fallbackError })

      const legacyFallbackQuery = `
        SELECT
          e.id,
          e.user_id,
          e.nombre,
          e.telefono,
          u.correo
        FROM tenant_base.empleados e
        INNER JOIN tenant_base.users u ON u.id = e.user_id
        ${whereClause}
        ORDER BY e.nombre ASC
      `

      const legacyFallbackResult = await pool.query<EmployeeLegacyBasicRow>(
        tenantSql(legacyFallbackQuery, filter?.tenantSchema),
        parameters,
      )

      return legacyFallbackResult.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        name: row.nombre,
        email: row.correo,
        phone: row.telefono,
        status: null,
        joinedAt: null,
        totalAppointments: 0,
        upcomingAppointments: 0,
        completedAppointments: 0,
        paidAppointments: 0,
        totalRevenue: 0,
        serviceIds: [],
        services: [],
        rating: null,
      }))
    }
  }
}

export async function getEmployeeByUserId(userId: number, tenantSchema?: string | null): Promise<EmployeeSummary | null> {
  const employees = await getEmployeesWithStats({ userId, tenantSchema })
  return employees[0] ?? null
}

export async function registerEmployee(input: {
  name: string
  email: string
  password: string
  phone: string
  tenantSchema?: string | null
}): Promise<EmployeeSummary> {
  let user: AuthUser

  try {
    const sanitizedPhone = input.phone.trim()

    user = await createUser({
      email: input.email,
      password: input.password,
      role: "barber",
      tenantSchema: input.tenantSchema ?? undefined,
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

  const employee = await getEmployeeByUserId(user.id, input.tenantSchema)
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
  serviceIds?: number[]
  tenantSchema?: string | null
}): Promise<EmployeeSummary> {
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    const employeeResult = await client.query<{ user_id: number }>(
      tenantSql(`UPDATE tenant_base.empleados
          SET nombre = $2,
              telefono = $3
        WHERE id = $1
        RETURNING user_id`, input.tenantSchema),
      [input.employeeId, input.name, input.phone],
    )

    if (employeeResult.rowCount === 0) {
      throw new EmployeeRecordNotFoundError()
    }

    const userId = employeeResult.rows[0].user_id

    await client.query(
      tenantSql(`UPDATE tenant_base.users
          SET correo = $2
        WHERE id = $1`, input.tenantSchema),
      [userId, input.email],
    )

    if (Array.isArray(input.serviceIds)) {
      const uniqueServiceIds = Array.from(
        new Set(input.serviceIds.filter((serviceId) => Number.isInteger(serviceId) && serviceId > 0)),
      )

      await client.query(
        tenantSql(`DELETE FROM tenant_base.empleados_servicios
          WHERE empleado_id = $1`,
          input.tenantSchema),
        [input.employeeId],
      )

      if (uniqueServiceIds.length > 0) {
        const insertResult = await client.query(
          tenantSql(`INSERT INTO tenant_base.empleados_servicios (empleado_id, servicio_id)
            SELECT $1, s.id
              FROM tenant_base.servicios s
             WHERE s.id = ANY($2::int[])`, input.tenantSchema),
          [input.employeeId, uniqueServiceIds],
        )

        if (insertResult.rowCount !== uniqueServiceIds.length) {
          throw new ServiceRecordNotFoundError()
        }
      }
    }

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

  const updatedEmployee = await getEmployeesWithStats({ employeeId: input.employeeId, tenantSchema: input.tenantSchema })
  if (!updatedEmployee[0]) {
    throw new EmployeeRecordNotFoundError()
  }

  return updatedEmployee[0]
}

export async function deleteEmployee(employeeId: number, tenantSchema?: string | null): Promise<void> {
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    const employeeResult = await client.query<{ user_id: number }>(
      tenantSql(`DELETE FROM tenant_base.empleados
        WHERE id = $1
        RETURNING user_id`, tenantSchema),
      [employeeId],
    )

    if (employeeResult.rowCount === 0) {
      throw new EmployeeRecordNotFoundError()
    }

    const userId = employeeResult.rows[0].user_id

    await client.query(
      tenantSql(`DELETE FROM tenant_base.users
        WHERE id = $1`,
        tenantSchema),
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

export async function getClientsWithStats(filter?: {
  clientId?: number
  userId?: number
  tenantSchema?: string | null
}): Promise<ClientSummary[]> {
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
    const result = await pool.query<ClientSummaryRow>(tenantSql(query, filter?.tenantSchema), parameters)
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

    const fallbackResult = await pool.query<ClientBasicRow>(tenantSql(fallbackQuery, filter?.tenantSchema), parameters)
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

export async function getClientByUserId(userId: number, tenantSchema?: string | null): Promise<ClientSummary | null> {
  const clients = await getClientsWithStats({ userId, tenantSchema })
  return clients[0] ?? null
}

export async function registerClient(input: {
  name: string
  email: string
  password: string
  phone: string
  tenantSchema?: string | null
}): Promise<ClientSummary> {
  let user: AuthUser

  try {
    const sanitizedPhone = input.phone.trim()

    user = await createUser({
      email: input.email,
      password: input.password,
      role: "client",
      tenantSchema: input.tenantSchema ?? undefined,
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

  const client = await getClientByUserId(user.id, input.tenantSchema)
  if (!client) {
    throw new ClientRecordNotFoundError()
  }

  return client
}

export async function updateClient(input: {
  clientId: number
  name: string
  email: string
  phone: string
  tenantSchema?: string | null
}): Promise<ClientSummary> {
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    const clientResult = await client.query<{ user_id: number }>(
      tenantSql(`UPDATE tenant_base.clientes
          SET nombre = $2,
              telefono = $3
        WHERE id = $1
        RETURNING user_id`, input.tenantSchema),
      [input.clientId, input.name, input.phone],
    )

    if (clientResult.rowCount === 0) {
      throw new ClientRecordNotFoundError()
    }

    const userId = clientResult.rows[0].user_id

    await client.query(
      tenantSql(`UPDATE tenant_base.users
          SET correo = $2
        WHERE id = $1`, input.tenantSchema),
      [userId, input.email],
    )

    await client.query("COMMIT")
  } catch (error) {
    try {
      await client.query("ROLLBACK")
    } catch (rollbackError) {
      console.error("Failed to rollback client update transaction", rollbackError)
    }

    throw error
  } finally {
    client.release()
  }

  const updatedClient = await getClientsWithStats({ clientId: input.clientId, tenantSchema: input.tenantSchema })
  if (!updatedClient[0]) {
    throw new ClientRecordNotFoundError()
  }

  return updatedClient[0]
}

export async function deleteClient(clientId: number, tenantSchema?: string | null): Promise<void> {
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    const clientResult = await client.query<{ user_id: number }>(
      tenantSql(`DELETE FROM tenant_base.clientes
        WHERE id = $1
        RETURNING user_id`, tenantSchema),
      [clientId],
    )

    if (clientResult.rowCount === 0) {
      throw new ClientRecordNotFoundError()
    }

    const userId = clientResult.rows[0].user_id

    await client.query(
      tenantSql(`DELETE FROM tenant_base.users
        WHERE id = $1`,
        tenantSchema),
      [userId],
    )

    await client.query("COMMIT")
  } catch (error) {
    try {
      await client.query("ROLLBACK")
    } catch (rollbackError) {
      console.error("Failed to rollback client delete transaction", rollbackError)
    }

    throw error
  } finally {
    client.release()
  }
}

export async function getServicesCatalog(tenantSchema?: string | null): Promise<ServiceSummary[]> {
  await ensureServiceCatalogSchema(pool, tenantSchema)

  const result = await pool.query<ServiceSummaryRow>(
    tenantSql(
      `SELECT
        s.id,
        s.nombre,
        s.descripcion,
        s.precio,
        s.duracion_min,
        s.estado::text AS estado,
        LOWER(COALESCE(s.tipo_servicio, 'individual'))::text AS tipo_servicio,
        s.categoria_id,
        sc.nombre AS categoria_nombre,
        COALESCE(pkg.service_ids, ARRAY[]::int[]) AS package_item_service_ids,
        COALESCE(pkg.items, '[]'::json) AS package_items
      FROM tenant_base.servicios s
      LEFT JOIN tenant_base.servicio_categorias sc ON sc.id = s.categoria_id
      LEFT JOIN LATERAL (
        SELECT
          array_agg(spi.servicio_individual_id ORDER BY spi.orden, spi.id) AS service_ids,
          json_agg(
            json_build_object(
              'serviceId', si.id,
              'name', si.nombre,
              'durationMin', si.duracion_min,
              'price', si.precio,
              'quantity', spi.cantidad
            )
            ORDER BY spi.orden, spi.id
          ) AS items
        FROM tenant_base.servicio_paquetes_items spi
        INNER JOIN tenant_base.servicios si ON si.id = spi.servicio_individual_id
        WHERE spi.servicio_paquete_id = s.id
      ) pkg ON TRUE
      ORDER BY s.nombre ASC`,
      tenantSchema,
    ),
  )

  return result.rows.map(mapServiceRow)
}

export async function createService(input: {
  name: string
  description?: string | null
  price: number
  durationMin: number
  status?: string
  serviceType?: "individual" | "paquete"
  categoryName?: string | null
  packageItemServiceIds?: number[]
  tenantSchema?: string | null
}): Promise<ServiceSummary> {
  const client = await pool.connect()

  try {
    await client.query("BEGIN")
    await ensureServiceCatalogSchema(client, input.tenantSchema)

    const categoryId = await resolveCategoryId(client, input.categoryName, input.tenantSchema)
    const serviceType = input.serviceType === "paquete" ? "paquete" : "individual"

    const result = await client.query<{ id: number }>(
      tenantSql(
        `INSERT INTO tenant_base.servicios (nombre, descripcion, precio, duracion_min, estado, tipo_servicio, categoria_id)
         VALUES ($1, NULLIF($2, ''), $3, $4, $5, $6, $7)
         RETURNING id`,
        input.tenantSchema,
      ),
      [
        input.name,
        input.description ?? "",
        input.price,
        input.durationMin,
        input.status ?? "activo",
        serviceType,
        categoryId,
      ],
    )

    if (result.rowCount === 0) {
      throw new Error("SERVICE_CREATE_FAILED")
    }

    const createdServiceId = Number(result.rows[0].id)

    if (serviceType === "paquete") {
      await syncServicePackageItems(client, {
        packageServiceId: createdServiceId,
        packageItemServiceIds: input.packageItemServiceIds ?? [],
        tenantSchema: input.tenantSchema,
      })
    }

    await client.query("COMMIT")

    const createdService = await getServiceById(createdServiceId, input.tenantSchema)
    if (!createdService) {
      throw new Error("SERVICE_CREATE_FAILED")
    }

    return createdService
  } catch (error) {
    try {
      await client.query("ROLLBACK")
    } catch (rollbackError) {
      console.error("Failed to rollback service create transaction", rollbackError)
    }

    throw error
  } finally {
    client.release()
  }
}

export async function updateService(
  serviceId: number,
  input: {
    name: string
    description?: string | null
    price: number
    durationMin: number
    status?: string
    serviceType?: "individual" | "paquete"
    categoryName?: string | null
    packageItemServiceIds?: number[]
    tenantSchema?: string | null
  },
): Promise<ServiceSummary> {
  const client = await pool.connect()

  try {
    await client.query("BEGIN")
    await ensureServiceCatalogSchema(client, input.tenantSchema)

    const categoryId = await resolveCategoryId(client, input.categoryName, input.tenantSchema)
    const serviceType = input.serviceType === "paquete" ? "paquete" : "individual"

    const result = await client.query<{ id: number }>(
      tenantSql(
        `UPDATE tenant_base.servicios
            SET nombre = $2,
                descripcion = NULLIF($3, ''),
                precio = $4,
                duracion_min = $5,
                estado = $6,
                tipo_servicio = $7,
                categoria_id = $8
          WHERE id = $1
          RETURNING id`,
        input.tenantSchema,
      ),
      [
        serviceId,
        input.name,
        input.description ?? "",
        input.price,
        input.durationMin,
        input.status ?? "activo",
        serviceType,
        categoryId,
      ],
    )

    if (result.rowCount === 0) {
      throw new ServiceRecordNotFoundError()
    }

    if (serviceType === "paquete") {
      await syncServicePackageItems(client, {
        packageServiceId: serviceId,
        packageItemServiceIds: input.packageItemServiceIds ?? [],
        tenantSchema: input.tenantSchema,
      })
    } else {
      await client.query(
        tenantSql(
          `DELETE FROM tenant_base.servicio_paquetes_items
            WHERE servicio_paquete_id = $1`,
          input.tenantSchema,
        ),
        [serviceId],
      )
    }

    await client.query("COMMIT")

    const updatedService = await getServiceById(serviceId, input.tenantSchema)
    if (!updatedService) {
      throw new ServiceRecordNotFoundError()
    }

    return updatedService
  } catch (error) {
    try {
      await client.query("ROLLBACK")
    } catch (rollbackError) {
      console.error("Failed to rollback service update transaction", rollbackError)
    }

    throw error
  } finally {
    client.release()
  }
}

export async function deleteService(serviceId: number, tenantSchema?: string | null): Promise<void> {
  await ensureServiceCatalogSchema(pool, tenantSchema)

  const result = await pool.query<{ id: number }>(
    tenantSql(`DELETE FROM tenant_base.servicios
      WHERE id = $1
      RETURNING id`, tenantSchema),
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
  tenantSchema?: string | null
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
    conditions.push(`a.fecha_cita >= $${parameters.length}::timestamptz`)
  }

  if (options?.toDate) {
    parameters.push(options.toDate)
    conditions.push(`a.fecha_cita <= $${parameters.length}::timestamptz`)
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
      lp.estado_pago,
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
    LEFT JOIN LATERAL (
      SELECT pg.estado::text AS estado_pago
      FROM tenant_base.pagos pg
      WHERE pg.agendamiento_id = a.id
      ORDER BY pg.id DESC
      LIMIT 1
    ) lp ON TRUE
    LEFT JOIN tenant_base.pagos p ON p.agendamiento_id = a.id
    ${whereClause}
    GROUP BY
      a.id,
      a.estado,
      lp.estado_pago,
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

  const result = await pool.query<AdminAppointmentRow>(tenantSql(query, options?.tenantSchema), parameters)
  return result.rows.map(mapAdminAppointmentRow)
}

export async function getAdminPayments(options?: {
  status?: string
  limit?: number
  tenantSchema?: string | null
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

  const result = await pool.query<AdminPaymentRow>(tenantSql(query, options?.tenantSchema), parameters)
  return result.rows.map(mapAdminPaymentRow)
}

export async function getAdminSettings(tenantSchema?: string | null): Promise<{
  summary: AdminSettingsSummary
  adminUsers: AdminUserSettings[]
}> {
  const summaryResult = await pool.query<AdminSettingsSummaryRow>(
    tenantSql(`SELECT
      (SELECT COUNT(*) FROM tenant_base.users u WHERE u.rol::text = 'admin')::text AS total_admin_users,
      (SELECT COUNT(*) FROM tenant_base.empleados)::text AS total_employees,
      (SELECT COUNT(*) FROM tenant_base.clientes)::text AS total_clients,
      (SELECT COUNT(*) FROM tenant_base.servicios)::text AS total_services,
      (SELECT COUNT(*) FROM tenant_base.servicios s WHERE LOWER(s.estado::text) = 'activo')::text AS active_services,
      (SELECT COUNT(*) FROM tenant_base.agendamientos)::text AS total_appointments,
      (SELECT COUNT(*) FROM tenant_base.pagos)::text AS total_payments,
      (SELECT COALESCE(SUM(p.monto), 0) FROM tenant_base.pagos p)::text AS total_payments_amount`, tenantSchema),
  )

  let adminUsersResult

  try {
    adminUsersResult = await pool.query<AdminUserSettingsRow>(
      tenantSql(`SELECT id,
              correo,
              estado::text AS estado,
              ultimo_acceso
         FROM tenant_base.users
        WHERE rol::text = 'admin'
        ORDER BY id ASC`, tenantSchema),
    )
  } catch {
    adminUsersResult = await pool.query<AdminUserSettingsRow>(
      tenantSql(`SELECT id,
              correo,
              NULL::text AS estado,
              ultimo_acceso
         FROM tenant_base.users
        WHERE rol::text = 'admin'
        ORDER BY id ASC`, tenantSchema),
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
  tenantSchema?: string | null
}): Promise<AdminUserSettings> {
  let result

  try {
    result = await pool.query<AdminUserSettingsRow>(
      tenantSql(`UPDATE tenant_base.users
          SET correo = $2
        WHERE id = $1
          AND rol::text = 'admin'
        RETURNING id, correo, estado::text AS estado, ultimo_acceso`, input.tenantSchema),
      [input.userId, input.email],
    )
  } catch {
    result = await pool.query<AdminUserSettingsRow>(
      tenantSql(`UPDATE tenant_base.users
          SET correo = $2
        WHERE id = $1
          AND rol::text = 'admin'
        RETURNING id, correo, NULL::text AS estado, ultimo_acceso`, input.tenantSchema),
      [input.userId, input.email],
    )
  }

  if (result.rowCount === 0) {
    throw new AdminUserRecordNotFoundError()
  }

  return mapAdminUserSettingsRow(result.rows[0])
}

export async function getAdminRevenueReport(options?: {
  tenantSchema?: string | null
  granularity?: AdminReportsGranularity
  topServicesLimit?: number
}): Promise<AdminRevenueReport> {
  const isRecoverableSchemaError = (error: unknown): boolean => {
    if (!error || typeof error !== "object") {
      return false
    }

    const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : ""
    return code === "42P01" || code === "42703"
  }

  const safePercent = (numerator: number, denominator: number): number => {
    if (denominator <= 0) {
      return 0
    }

    return Number(((numerator / denominator) * 100).toFixed(2))
  }

  const granularity = options?.granularity ?? "day"
  const topServicesLimit =
    typeof options?.topServicesLimit === "number" && Number.isFinite(options.topServicesLimit)
      ? Math.min(Math.max(Math.trunc(options.topServicesLimit), 1), 20)
      : 5

  const granularitySql: Record<AdminReportsGranularity, string> = {
    day: "day",
    month: "month",
    year: "year",
  }

  const periodClauseSql: Record<AdminReportsGranularity, string> = {
    day: "p.fecha_pago >= date_trunc('day', now()) - interval '29 days'",
    month: "p.fecha_pago >= date_trunc('month', now()) - interval '11 months'",
    year: "p.fecha_pago >= date_trunc('year', now()) - interval '4 years'",
  }

  const appointmentPeriodClauseSql: Record<AdminReportsGranularity, string> = {
    day: "a.fecha_cita >= date_trunc('day', now()) - interval '29 days'",
    month: "a.fecha_cita >= date_trunc('month', now()) - interval '11 months'",
    year: "a.fecha_cita >= date_trunc('year', now()) - interval '4 years'",
  }

  const slotsPeriodClauseSql: Record<AdminReportsGranularity, string> = {
    day: "he.fecha_hora_inicio >= date_trunc('day', now()) - interval '29 days'",
    month: "he.fecha_hora_inicio >= date_trunc('month', now()) - interval '11 months'",
    year: "he.fecha_hora_inicio >= date_trunc('year', now()) - interval '4 years'",
  }

  const bucketExpression = `date_trunc('${granularitySql[granularity]}', p.fecha_pago)`
  const fallbackBucketExpression = `date_trunc('${granularitySql[granularity]}', COALESCE(a.fecha_cita, NOW()))`
  const periodClause = periodClauseSql[granularity]
  const appointmentPeriodClause = appointmentPeriodClauseSql[granularity]
  const slotsPeriodClause = slotsPeriodClauseSql[granularity]

  const seriesQuery = `
    SELECT
      ${bucketExpression} AS bucket_start,
      COALESCE(
        SUM(
          CASE
            WHEN COALESCE(p.monto, 0) > 0 THEN p.monto
            ELSE COALESCE(s.precio, 0)
          END
        ),
        0
      )::text AS revenue,
      COUNT(p.id)::text AS payments_count,
      COUNT(DISTINCT p.agendamiento_id)::text AS appointments_count
    FROM tenant_base.pagos p
    LEFT JOIN tenant_base.agendamientos a ON a.id = p.agendamiento_id
    LEFT JOIN tenant_base.servicios s ON s.id = a.servicio_id
    WHERE LOWER(p.estado::text) IN (${PAID_PAYMENT_STATES_SQL})
      AND p.fecha_pago IS NOT NULL
      AND ${periodClause}
    GROUP BY 1
    ORDER BY 1 ASC
  `

  const topServicesQuery = `
    SELECT
      s.id AS servicio_id,
      s.nombre AS servicio_nombre,
      COALESCE(
        SUM(
          CASE
            WHEN COALESCE(p.monto, 0) > 0 THEN p.monto
            ELSE COALESCE(s.precio, 0)
          END
        ),
        0
      )::text AS revenue,
      COUNT(DISTINCT p.agendamiento_id)::text AS paid_appointments
    FROM tenant_base.pagos p
    LEFT JOIN tenant_base.agendamientos a ON a.id = p.agendamiento_id
    LEFT JOIN tenant_base.servicios s ON s.id = a.servicio_id
    WHERE LOWER(p.estado::text) IN (${PAID_PAYMENT_STATES_SQL})
      AND p.fecha_pago IS NOT NULL
      AND ${periodClause}
    GROUP BY s.id, s.nombre
    ORDER BY
      COALESCE(
        SUM(
          CASE
            WHEN COALESCE(p.monto, 0) > 0 THEN p.monto
            ELSE COALESCE(s.precio, 0)
          END
        ),
        0
      ) DESC,
      COUNT(DISTINCT p.agendamiento_id) DESC
    LIMIT $1
  `

  let seriesResult
  let topServicesResult

  try {
    ;[seriesResult, topServicesResult] = await Promise.all([
      pool.query<AdminRevenueSeriesRow>(tenantSql(seriesQuery, options?.tenantSchema)),
      pool.query<AdminTopServiceRow>(tenantSql(topServicesQuery, options?.tenantSchema), [topServicesLimit]),
    ])
  } catch (primaryError) {
    console.warn("Admin reports primary query failed, using fallback", primaryError)

    const fallbackSeriesQuery = `
      SELECT
        ${fallbackBucketExpression} AS bucket_start,
        COALESCE(SUM(COALESCE(p.monto, 0)), 0)::text AS revenue,
        COUNT(p.id)::text AS payments_count,
        COUNT(DISTINCT p.agendamiento_id)::text AS appointments_count
      FROM tenant_base.pagos p
      LEFT JOIN tenant_base.agendamientos a ON a.id = p.agendamiento_id
      WHERE LOWER(p.estado::text) IN (${PAID_PAYMENT_STATES_SQL})
      GROUP BY 1
      ORDER BY 1 ASC
    `

    const fallbackTopServicesQuery = `
      SELECT
        NULL::int AS servicio_id,
        'Facturación general'::text AS servicio_nombre,
        COALESCE(SUM(COALESCE(p.monto, 0)), 0)::text AS revenue,
        COUNT(DISTINCT p.agendamiento_id)::text AS paid_appointments
      FROM tenant_base.pagos p
      WHERE LOWER(p.estado::text) IN (${PAID_PAYMENT_STATES_SQL})
    `

    ;[seriesResult, topServicesResult] = await Promise.all([
      pool.query<AdminRevenueSeriesRow>(tenantSql(fallbackSeriesQuery, options?.tenantSchema)),
      pool.query<AdminTopServiceRow>(tenantSql(fallbackTopServicesQuery, options?.tenantSchema)),
    ])
  }

  const series = seriesResult.rows
    .filter((row) => row.bucket_start)
    .map((row) => ({
      bucketStart: row.bucket_start!.toISOString(),
      revenue: Number(row.revenue ?? 0),
      paymentsCount: Number(row.payments_count ?? 0),
      appointmentsCount: Number(row.appointments_count ?? 0),
    }))

  const totals = series.reduce(
    (acc, point) => {
      acc.revenue += point.revenue
      acc.paymentsCount += point.paymentsCount
      acc.appointmentsCount += point.appointmentsCount
      return acc
    },
    {
      revenue: 0,
      paymentsCount: 0,
      appointmentsCount: 0,
    },
  )

  const topServices = topServicesResult.rows.map((row) => ({
    serviceId: row.servicio_id,
    serviceName: row.servicio_nombre?.trim() || "Servicio no asignado",
    revenue: Number(row.revenue ?? 0),
    paidAppointments: Number(row.paid_appointments ?? 0),
  }))

  const paymentMethodsResult = await pool.query<PaymentMethodBreakdownRow>(
    tenantSql(
      `SELECT
          LOWER(COALESCE(p.metodo_pago::text, 'sin_metodo')) AS metodo_pago,
          COUNT(*)::text AS payments_count,
          COALESCE(SUM(COALESCE(p.monto, 0)), 0)::text AS revenue
       FROM tenant_base.pagos p
      WHERE LOWER(p.estado::text) IN (${PAID_PAYMENT_STATES_SQL})
        AND p.fecha_pago IS NOT NULL
        AND ${periodClause}
      GROUP BY 1
      ORDER BY
        COALESCE(SUM(COALESCE(p.monto, 0)), 0) DESC,
        COUNT(*) DESC`,
      options?.tenantSchema,
    ),
  )

  const averageTicketResult = await pool.query<AverageTicketRow>(
    tenantSql(
      `WITH spend_by_client AS (
          SELECT
            a.cliente_id,
            SUM(COALESCE(p.monto, 0)) AS total_cliente
          FROM tenant_base.pagos p
          JOIN tenant_base.agendamientos a ON a.id = p.agendamiento_id
         WHERE LOWER(p.estado::text) IN (${PAID_PAYMENT_STATES_SQL})
           AND p.fecha_pago IS NOT NULL
           AND ${periodClause}
         GROUP BY a.cliente_id
       )
       SELECT COALESCE(AVG(total_cliente), 0)::text AS average_ticket_per_client
         FROM spend_by_client`,
      options?.tenantSchema,
    ),
  )

  const noShowResult = await pool.query<NoShowRow>(
    tenantSql(
      `SELECT
          COUNT(*)::text AS total_appointments,
          COUNT(*) FILTER (
            WHERE LOWER(a.estado::text) IN ('cancelada', 'no_show', 'noshow', 'inasistencia', 'inasistencia_cliente')
          )::text AS no_show_appointments
       FROM tenant_base.agendamientos a
      WHERE ${appointmentPeriodClause}`,
      options?.tenantSchema,
    ),
  )

  const productiveMinutesResult = await pool.query<OccupancyRow>(
    tenantSql(
      `SELECT
          COALESCE(
            SUM(
              GREATEST(
                EXTRACT(EPOCH FROM (COALESCE(a.fecha_cita_fin, a.fecha_cita + interval '30 minutes') - a.fecha_cita)) / 60.0,
                0
              )
            ) FILTER (
              WHERE (
                LOWER(a.estado::text) IN (${ACTIVE_APPOINTMENT_STATES_SQL})
                OR LOWER(a.estado::text) IN (${COMPLETED_APPOINTMENT_STATES_SQL})
              )
            ),
            0
          )::text AS productive_minutes,
          0::text AS available_minutes
       FROM tenant_base.agendamientos a
      WHERE ${appointmentPeriodClause}`,
      options?.tenantSchema,
    ),
  )

  let availableMinutes = 0
  try {
    const availabilityResult = await pool.query<OccupancyRow>(
      tenantSql(
        `SELECT
            0::text AS productive_minutes,
            COALESCE(
              SUM(
                GREATEST(EXTRACT(EPOCH FROM (he.fecha_hora_fin - he.fecha_hora_inicio)) / 60.0, 0)
              ) FILTER (WHERE COALESCE(he.disponible, TRUE) = TRUE),
              0
            )::text AS available_minutes
         FROM tenant_base.horarios_empleados he
        WHERE ${slotsPeriodClause}`,
        options?.tenantSchema,
      ),
    )

    availableMinutes = Number(availabilityResult.rows[0]?.available_minutes ?? 0)
  } catch (error) {
    if (!isRecoverableSchemaError(error)) {
      throw error
    }
  }

  const demandHeatmapResult = await pool.query<DemandHeatmapRow>(
    tenantSql(
      `SELECT
          EXTRACT(ISODOW FROM a.fecha_cita)::int AS day_of_week,
          EXTRACT(HOUR FROM a.fecha_cita)::int AS hour_of_day,
          COUNT(*)::text AS appointments
       FROM tenant_base.agendamientos a
      WHERE ${appointmentPeriodClause}
        AND (
          LOWER(a.estado::text) IN (${ACTIVE_APPOINTMENT_STATES_SQL})
          OR LOWER(a.estado::text) IN (${COMPLETED_APPOINTMENT_STATES_SQL})
        )
      GROUP BY 1, 2
      ORDER BY 1, 2`,
      options?.tenantSchema,
    ),
  )

  const retentionResult = await pool.query<RetentionRow>(
    tenantSql(
      `WITH ordered_appointments AS (
          SELECT
            a.cliente_id,
            a.fecha_cita,
            ROW_NUMBER() OVER (PARTITION BY a.cliente_id ORDER BY a.fecha_cita ASC) AS rn
          FROM tenant_base.agendamientos a
          WHERE LOWER(a.estado::text) <> 'cancelada'
        ),
        first_second AS (
          SELECT
            o1.cliente_id,
            o1.fecha_cita AS first_appointment,
            o2.fecha_cita AS second_appointment
          FROM ordered_appointments o1
          LEFT JOIN ordered_appointments o2
            ON o2.cliente_id = o1.cliente_id
           AND o2.rn = 2
          WHERE o1.rn = 1
        )
        SELECT
          COUNT(*)::text AS first_time_clients,
          COUNT(*) FILTER (WHERE second_appointment IS NOT NULL)::text AS retained_clients
        FROM first_second
        WHERE first_appointment >= (
          CASE
            WHEN '${granularity}' = 'day' THEN date_trunc('day', now()) - interval '29 days'
            WHEN '${granularity}' = 'month' THEN date_trunc('month', now()) - interval '11 months'
            ELSE date_trunc('year', now()) - interval '4 years'
          END
        )`,
        options?.tenantSchema,
      ),
  )

  let barberPerformanceResult
  try {
    barberPerformanceResult = await pool.query<BarberPerformanceRow>(
      tenantSql(
        `SELECT
            e.id AS employee_id,
            e.nombre AS employee_name,
            COALESCE(
              SUM(COALESCE(p.monto, 0)) FILTER (WHERE LOWER(p.estado::text) IN (${PAID_PAYMENT_STATES_SQL})),
              0
            )::text AS revenue,
            COUNT(DISTINCT a.id) FILTER (
              WHERE LOWER(a.estado::text) IN (${COMPLETED_APPOINTMENT_STATES_SQL})
                 OR LOWER(p.estado::text) IN (${PAID_PAYMENT_STATES_SQL})
            )::text AS services_done,
            ROUND(AVG(r.rating)::numeric, 2)::text AS rating_average,
            COUNT(r.id)::text AS rating_count
         FROM tenant_base.empleados e
         LEFT JOIN tenant_base.agendamientos a
           ON a.empleado_id = e.id
          AND ${appointmentPeriodClause}
         LEFT JOIN tenant_base.pagos p ON p.agendamiento_id = a.id
         LEFT JOIN tenant_base.empleados_resenas r ON r.empleado_id = e.id
         GROUP BY e.id, e.nombre
         ORDER BY
           COALESCE(SUM(COALESCE(p.monto, 0)) FILTER (WHERE LOWER(p.estado::text) IN (${PAID_PAYMENT_STATES_SQL})), 0) DESC,
           COUNT(DISTINCT a.id) FILTER (
             WHERE LOWER(a.estado::text) IN (${COMPLETED_APPOINTMENT_STATES_SQL})
                OR LOWER(p.estado::text) IN (${PAID_PAYMENT_STATES_SQL})
           ) DESC`,
        options?.tenantSchema,
      ),
    )
  } catch (error) {
    if (!isRecoverableSchemaError(error)) {
      throw error
    }

    barberPerformanceResult = await pool.query<BarberPerformanceRow>(
      tenantSql(
        `SELECT
            e.id AS employee_id,
            e.nombre AS employee_name,
            COALESCE(
              SUM(COALESCE(p.monto, 0)) FILTER (WHERE LOWER(p.estado::text) IN (${PAID_PAYMENT_STATES_SQL})),
              0
            )::text AS revenue,
            COUNT(DISTINCT a.id) FILTER (
              WHERE LOWER(a.estado::text) IN (${COMPLETED_APPOINTMENT_STATES_SQL})
                 OR LOWER(p.estado::text) IN (${PAID_PAYMENT_STATES_SQL})
            )::text AS services_done,
            NULL::text AS rating_average,
            0::text AS rating_count
         FROM tenant_base.empleados e
         LEFT JOIN tenant_base.agendamientos a
           ON a.empleado_id = e.id
          AND ${appointmentPeriodClause}
         LEFT JOIN tenant_base.pagos p ON p.agendamiento_id = a.id
         GROUP BY e.id, e.nombre
         ORDER BY
           COALESCE(SUM(COALESCE(p.monto, 0)) FILTER (WHERE LOWER(p.estado::text) IN (${PAID_PAYMENT_STATES_SQL})), 0) DESC,
           COUNT(DISTINCT a.id) FILTER (
             WHERE LOWER(a.estado::text) IN (${COMPLETED_APPOINTMENT_STATES_SQL})
                OR LOWER(p.estado::text) IN (${PAID_PAYMENT_STATES_SQL})
           ) DESC`,
        options?.tenantSchema,
      ),
    )
  }

  const topClientsResult = await pool.query<TopClientRow>(
    tenantSql(
      `SELECT
          c.id AS client_id,
          c.nombre AS client_name,
          COUNT(DISTINCT a.id) FILTER (
            WHERE LOWER(a.estado::text) IN (${COMPLETED_APPOINTMENT_STATES_SQL})
               OR LOWER(lp.estado_pago) IN (${PAID_PAYMENT_STATES_SQL})
          )::text AS paid_appointments,
          COALESCE(
            SUM(
              CASE
                WHEN COALESCE(lp.monto, 0) > 0 THEN lp.monto
                ELSE COALESCE(s.precio, 0)
              END
            ) FILTER (
              WHERE LOWER(a.estado::text) IN (${COMPLETED_APPOINTMENT_STATES_SQL})
                 OR LOWER(lp.estado_pago) IN (${PAID_PAYMENT_STATES_SQL})
            ),
            0
          )::text AS revenue
       FROM tenant_base.agendamientos a
       LEFT JOIN tenant_base.clientes c ON c.id = a.cliente_id
       LEFT JOIN tenant_base.servicios s ON s.id = a.servicio_id
       LEFT JOIN LATERAL (
         SELECT
           p.estado::text AS estado_pago,
           p.monto
         FROM tenant_base.pagos p
         WHERE p.agendamiento_id = a.id
         ORDER BY p.fecha_pago DESC NULLS LAST, p.id DESC
         LIMIT 1
       ) lp ON TRUE
      WHERE ${appointmentPeriodClause}
      GROUP BY c.id, c.nombre
      HAVING COALESCE(
        SUM(
          CASE
            WHEN COALESCE(lp.monto, 0) > 0 THEN lp.monto
            ELSE COALESCE(s.precio, 0)
          END
        ) FILTER (
          WHERE LOWER(a.estado::text) IN (${COMPLETED_APPOINTMENT_STATES_SQL})
             OR LOWER(lp.estado_pago) IN (${PAID_PAYMENT_STATES_SQL})
        ),
        0
      ) > 0
      ORDER BY
        COALESCE(
          SUM(
            CASE
              WHEN COALESCE(lp.monto, 0) > 0 THEN lp.monto
              ELSE COALESCE(s.precio, 0)
            END
          ) FILTER (
            WHERE LOWER(a.estado::text) IN (${COMPLETED_APPOINTMENT_STATES_SQL})
               OR LOWER(lp.estado_pago) IN (${PAID_PAYMENT_STATES_SQL})
          ),
          0
        ) DESC,
        COUNT(DISTINCT a.id) FILTER (
          WHERE LOWER(a.estado::text) IN (${COMPLETED_APPOINTMENT_STATES_SQL})
             OR LOWER(lp.estado_pago) IN (${PAID_PAYMENT_STATES_SQL})
        ) DESC
      LIMIT 10`,
      options?.tenantSchema,
    ),
  )

  const paymentMethods = paymentMethodsResult.rows.map((row) => ({
    method: row.metodo_pago?.trim() || "sin_metodo",
    paymentsCount: Number(row.payments_count ?? 0),
    revenue: Number(row.revenue ?? 0),
  }))

  const averageTicketPerClient = Number(averageTicketResult.rows[0]?.average_ticket_per_client ?? 0)

  const totalAppointments = Number(noShowResult.rows[0]?.total_appointments ?? 0)
  const noShowAppointments = Number(noShowResult.rows[0]?.no_show_appointments ?? 0)
  const noShowRatePct = safePercent(noShowAppointments, totalAppointments)

  const productiveMinutes = Number(productiveMinutesResult.rows[0]?.productive_minutes ?? 0)
  const occupancyRatePct = availableMinutes > 0 ? safePercent(productiveMinutes, availableMinutes) : null

  const demandHeatmap = demandHeatmapResult.rows
    .filter((row) => Number.isInteger(row.day_of_week) && Number.isInteger(row.hour_of_day))
    .map((row) => ({
      dayOfWeek: Number(row.day_of_week),
      hour: Number(row.hour_of_day),
      appointments: Number(row.appointments ?? 0),
    }))

  const firstTimeClients = Number(retentionResult.rows[0]?.first_time_clients ?? 0)
  const retainedClients = Number(retentionResult.rows[0]?.retained_clients ?? 0)

  const barberPerformance = barberPerformanceResult.rows
    .filter((row) => Number.isInteger(row.employee_id))
    .map((row) => ({
      employeeId: Number(row.employee_id),
      employeeName: row.employee_name?.trim() || "Sin nombre",
      revenue: Number(row.revenue ?? 0),
      servicesDone: Number(row.services_done ?? 0),
      ratingAverage: row.rating_average == null ? null : Number(row.rating_average),
      ratingCount: Number(row.rating_count ?? 0),
    }))

  const topClients = topClientsResult.rows.map((row) => ({
    clientId: row.client_id,
    clientName: row.client_name?.trim() || "Cliente",
    paidAppointments: Number(row.paid_appointments ?? 0),
    revenue: Number(row.revenue ?? 0),
  }))

  return {
    granularity,
    series,
    totals,
    topServices,
    income: {
      paymentMethods,
      averageTicketPerClient,
    },
    efficiency: {
      noShowRatePct,
      noShowAppointments,
      totalAppointments,
      occupancyRatePct,
      productiveMinutes,
      availableMinutes,
      demandHeatmap,
    },
    clientsAndStaff: {
      retention: {
        firstTimeClients,
        retainedClients,
        retentionRatePct: safePercent(retainedClients, firstTimeClients),
      },
      barberPerformance,
      topClients,
    },
  }
}

export async function getAdminSedeInsightsReport(options?: {
  tenantSchema?: string | null
  scope?: AdminSedeInsightsScope
}): Promise<AdminSedeInsightsReport> {
  const scope = options?.scope ?? "month"
  const scopeConfig = SEDE_INSIGHTS_SCOPE_CONFIG[scope]

  await assertSedesModuleAvailable(options?.tenantSchema)

  const sedeMetricsResult = await pool.query<SedeBusinessMetricsRow>(
    tenantSql(
      `WITH revenue_by_sede AS (
         SELECT
           a.sede_id,
           COALESCE(
             SUM(
               CASE
                 WHEN COALESCE(p.monto, 0) > 0 THEN p.monto
                 ELSE COALESCE(s.precio, 0)
               END
             ) FILTER (WHERE ${scopeConfig.revenueCurrentPeriodClause}),
             0
           )::text AS current_revenue,
           COALESCE(
             SUM(
               CASE
                 WHEN COALESCE(p.monto, 0) > 0 THEN p.monto
                 ELSE COALESCE(s.precio, 0)
               END
             ) FILTER (WHERE ${scopeConfig.revenuePreviousPeriodClause}),
             0
           )::text AS previous_revenue,
           COUNT(DISTINCT p.agendamiento_id) FILTER (WHERE ${scopeConfig.revenueCurrentPeriodClause})::text AS paid_appointments
         FROM tenant_base.pagos p
         LEFT JOIN tenant_base.agendamientos a ON a.id = p.agendamiento_id
         LEFT JOIN tenant_base.servicios s ON s.id = a.servicio_id
         WHERE LOWER(p.estado::text) IN (${PAID_PAYMENT_STATES_SQL})
           AND p.fecha_pago IS NOT NULL
         GROUP BY a.sede_id
       ),
       appointments_by_sede AS (
         SELECT
           a.sede_id,
           COUNT(*) FILTER (WHERE ${scopeConfig.appointmentPeriodClause})::text AS total_appointments,
           COUNT(*) FILTER (
             WHERE a.fecha_cita >= NOW()
               AND LOWER(COALESCE(a.estado::text, '')) NOT IN ('cancelada', 'cancelado', 'cancel')
           )::text AS upcoming_appointments
         FROM tenant_base.agendamientos a
         GROUP BY a.sede_id
       )
       SELECT
         sd.id AS sede_id,
         sd.nombre AS sede_nombre,
         COALESCE(rb.current_revenue, '0') AS current_revenue,
         COALESCE(rb.previous_revenue, '0') AS previous_revenue,
         COALESCE(rb.paid_appointments, '0') AS paid_appointments,
         COALESCE(ab.total_appointments, '0') AS total_appointments,
         COALESCE(ab.upcoming_appointments, '0') AS upcoming_appointments
       FROM tenant_base.sedes sd
       LEFT JOIN revenue_by_sede rb ON rb.sede_id = sd.id
       LEFT JOIN appointments_by_sede ab ON ab.sede_id = sd.id
       ORDER BY
         COALESCE(rb.current_revenue, '0')::numeric DESC,
         COALESCE(ab.total_appointments, '0')::numeric DESC,
         sd.nombre ASC`,
      options?.tenantSchema,
    ),
  )

  const topServiceResult = await pool.query<SedeTopServiceRow>(
    tenantSql(
      `WITH service_performance AS (
         SELECT
           a.sede_id,
           sv.id AS service_id,
           sv.nombre AS service_name,
           COUNT(DISTINCT a.id) FILTER (
             WHERE ${scopeConfig.appointmentPeriodClause}
               AND (
                 LOWER(COALESCE(a.estado::text, '')) IN (${COMPLETED_APPOINTMENT_STATES_SQL})
                 OR LOWER(COALESCE(lp.estado_pago, '')) IN (${PAID_PAYMENT_STATES_SQL})
               )
           )::text AS appointments,
           COALESCE(
             SUM(
               CASE
                 WHEN COALESCE(lp.monto, 0) > 0 THEN lp.monto
                 ELSE COALESCE(sv.precio, 0)
               END
             ) FILTER (
               WHERE ${scopeConfig.appointmentPeriodClause}
                 AND (
                   LOWER(COALESCE(a.estado::text, '')) IN (${COMPLETED_APPOINTMENT_STATES_SQL})
                   OR LOWER(COALESCE(lp.estado_pago, '')) IN (${PAID_PAYMENT_STATES_SQL})
                 )
             ),
             0
           )::text AS revenue
         FROM tenant_base.agendamientos a
         LEFT JOIN tenant_base.servicios sv ON sv.id = a.servicio_id
         LEFT JOIN LATERAL (
           SELECT
             p.estado::text AS estado_pago,
             p.monto
           FROM tenant_base.pagos p
           WHERE p.agendamiento_id = a.id
           ORDER BY p.fecha_pago DESC NULLS LAST, p.id DESC
           LIMIT 1
         ) lp ON TRUE
         WHERE a.sede_id IS NOT NULL
         GROUP BY a.sede_id, sv.id, sv.nombre
       ),
       ranked AS (
         SELECT
           sp.sede_id,
           sp.service_id,
           sp.service_name,
           sp.appointments,
           sp.revenue,
           ROW_NUMBER() OVER (
             PARTITION BY sp.sede_id
             ORDER BY
               COALESCE(sp.revenue, '0')::numeric DESC,
               COALESCE(sp.appointments, '0')::numeric DESC,
               sp.service_name ASC NULLS LAST
           ) AS ranking
         FROM service_performance sp
         WHERE COALESCE(sp.revenue, '0')::numeric > 0
            OR COALESCE(sp.appointments, '0')::numeric > 0
       )
       SELECT
         sede_id,
         service_id,
         service_name,
         appointments,
         revenue
       FROM ranked
       WHERE ranking = 1`,
      options?.tenantSchema,
    ),
  )

  const monthlyRevenueResult = await pool.query<SedeMonthlyRevenueRow>(
    tenantSql(
      `SELECT
         COALESCE(
           SUM(
             CASE
               WHEN COALESCE(p.monto, 0) > 0 THEN p.monto
               ELSE COALESCE(s.precio, 0)
             END
           ) FILTER (
             WHERE p.fecha_pago >= date_trunc('month', now())
               AND p.fecha_pago < date_trunc('month', now()) + interval '1 month'
           ),
           0
         )::text AS current_month_revenue,
         COALESCE(
           SUM(
             CASE
               WHEN COALESCE(p.monto, 0) > 0 THEN p.monto
               ELSE COALESCE(s.precio, 0)
             END
           ) FILTER (
             WHERE p.fecha_pago >= date_trunc('month', now()) - interval '1 month'
               AND p.fecha_pago < date_trunc('month', now())
           ),
           0
         )::text AS previous_month_revenue
       FROM tenant_base.pagos p
       LEFT JOIN tenant_base.agendamientos a ON a.id = p.agendamiento_id
       LEFT JOIN tenant_base.servicios s ON s.id = a.servicio_id
       WHERE LOWER(p.estado::text) IN (${PAID_PAYMENT_STATES_SQL})
         AND p.fecha_pago IS NOT NULL`,
      options?.tenantSchema,
    ),
  )

  const topServiceBySede = new Map<number, AdminSedeTopServiceInsight>()
  for (const row of topServiceResult.rows) {
    if (!Number.isInteger(row.sede_id)) {
      continue
    }

    topServiceBySede.set(Number(row.sede_id), {
      serviceId: row.service_id,
      serviceName: row.service_name?.trim() || "Servicio sin nombre",
      appointments: Number(row.appointments ?? 0),
      revenue: Number(row.revenue ?? 0),
    })
  }

  const sedes = sedeMetricsResult.rows
    .filter((row) => Number.isInteger(row.sede_id))
    .map((row) => {
      const sedeId = Number(row.sede_id)
      const revenue = Number(row.current_revenue ?? 0)
      const previousRevenue = Number(row.previous_revenue ?? 0)
      const growthPct =
        previousRevenue > 0
          ? Number((((revenue - previousRevenue) / previousRevenue) * 100).toFixed(2))
          : revenue > 0
            ? 100
            : null

      return {
        sedeId,
        sedeName: row.sede_nombre?.trim() || `Sede ${sedeId}`,
        revenue,
        previousRevenue,
        growthPct,
        paidAppointments: Number(row.paid_appointments ?? 0),
        totalAppointments: Number(row.total_appointments ?? 0),
        upcomingAppointments: Number(row.upcoming_appointments ?? 0),
        topService: topServiceBySede.get(sedeId) ?? null,
      }
    })

  const bestSedeByRevenue =
    [...sedes].sort((a, b) => {
      if (b.revenue !== a.revenue) {
        return b.revenue - a.revenue
      }

      if (b.paidAppointments !== a.paidAppointments) {
        return b.paidAppointments - a.paidAppointments
      }

      return b.totalAppointments - a.totalAppointments
    })[0] ?? null

  const bestSedeByAppointments =
    [...sedes].sort((a, b) => {
      if (b.totalAppointments !== a.totalAppointments) {
        return b.totalAppointments - a.totalAppointments
      }

      if (b.paidAppointments !== a.paidAppointments) {
        return b.paidAppointments - a.paidAppointments
      }

      return b.revenue - a.revenue
    })[0] ?? null

  const currentMonthRevenue = Number(monthlyRevenueResult.rows[0]?.current_month_revenue ?? 0)
  const previousMonthRevenue = Number(monthlyRevenueResult.rows[0]?.previous_month_revenue ?? 0)
  const monthlyGrowthPct =
    previousMonthRevenue > 0
      ? Number((((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100).toFixed(2))
      : currentMonthRevenue > 0
        ? 100
        : null

  return {
    scope,
    scopeLabel: scopeConfig.scopeLabel,
    currentMonthRevenue,
    previousMonthRevenue,
    monthlyGrowthPct,
    bestSedeByRevenue,
    bestSedeByAppointments,
    sedes,
  }
}

export async function getAdminSedeRevenueSeries(options: {
  tenantSchema?: string | null
  sedeId: number
  granularity?: AdminReportsGranularity
}): Promise<AdminSedeRevenueSeriesPoint[]> {
  const granularity = options.granularity ?? "day"

  const granularitySql: Record<AdminReportsGranularity, string> = {
    day: "day",
    month: "month",
    year: "year",
  }

  const periodClauseSql: Record<AdminReportsGranularity, string> = {
    day: "p.fecha_pago >= date_trunc('day', now()) - interval '29 days'",
    month: "p.fecha_pago >= date_trunc('month', now()) - interval '11 months'",
    year: "p.fecha_pago >= date_trunc('year', now()) - interval '4 years'",
  }

  const result = await pool.query<AdminRevenueSeriesRow>(
    tenantSql(
      `SELECT
         date_trunc('${granularitySql[granularity]}', p.fecha_pago) AS bucket_start,
         COALESCE(
           SUM(
             CASE
               WHEN COALESCE(p.monto, 0) > 0 THEN p.monto
               ELSE COALESCE(s.precio, 0)
             END
           ),
           0
         )::text AS revenue,
         COUNT(p.id)::text AS payments_count,
         COUNT(DISTINCT p.agendamiento_id)::text AS appointments_count
       FROM tenant_base.pagos p
       JOIN tenant_base.agendamientos a ON a.id = p.agendamiento_id
       LEFT JOIN tenant_base.servicios s ON s.id = a.servicio_id
       WHERE a.sede_id = $1
         AND LOWER(p.estado::text) IN (${PAID_PAYMENT_STATES_SQL})
         AND p.fecha_pago IS NOT NULL
         AND ${periodClauseSql[granularity]}
       GROUP BY 1
       ORDER BY 1 ASC`,
      options.tenantSchema,
    ),
    [options.sedeId],
  )

  return result.rows
    .filter((row) => row.bucket_start)
    .map((row) => ({
      bucketStart: row.bucket_start!.toISOString(),
      revenue: Number(row.revenue ?? 0),
      paymentsCount: Number(row.payments_count ?? 0),
      appointmentsCount: Number(row.appointments_count ?? 0),
    }))
}

export type AdminSedeSummary = {
  id: number
  name: string
  address: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  phone: string | null
  reference: string | null
  photoUrls: string[]
  active: boolean
  totalEmployees: number
  totalServices: number
  upcomingAppointments: number
  createdAt: string | null
  updatedAt: string | null
}

type AdminSedeRow = {
  id: number
  nombre: string
  direccion: string | null
  ciudad: string | null
  latitud: string | null
  longitud: string | null
  telefono: string | null
  referencia: string | null
  activo: boolean
  created_at: Date | null
  updated_at: Date | null
  total_empleados: string | null
  total_servicios: string | null
  proximas_citas: string | null
}

export class SedeRecordNotFoundError extends Error {
  constructor(message = "SEDE_RECORD_NOT_FOUND") {
    super(message)
    this.name = "SedeRecordNotFoundError"
  }
}

export class SedesModuleNotAvailableError extends Error {
  constructor(message = "SEDES_MODULE_NOT_AVAILABLE") {
    super(message)
    this.name = "SedesModuleNotAvailableError"
  }
}

function resolveTenantSchemaForAdmin(tenantSchema?: string | null): string {
  return normalizeTenantSchema(tenantSchema) ?? BASE_TENANT_SCHEMA
}

const SEDE_MEDIA_MARKER = "[[SOFTDATAI_SEDE_MEDIA]]"
const MAX_SEDE_PHOTOS = 5

function normalizeSedePhotoUrl(raw: string): string | null {
  const normalizedRaw = raw.trim()
  if (!normalizedRaw) {
    return null
  }

  const pathOnly = normalizedRaw.split("?")[0]?.split("#")[0] ?? normalizedRaw
  const isLocalUploadPath =
    pathOnly.startsWith("/uploads/sedes/") &&
    !pathOnly.includes("..") &&
    /\.(jpg|jpeg|png|webp|gif)$/i.test(pathOnly)

  if (isLocalUploadPath) {
    return normalizedRaw
  }

  try {
    const parsed = new URL(normalizedRaw)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null
    }

    return parsed.toString()
  } catch {
    return null
  }
}

function normalizeSedePhotoUrls(photoUrls: Array<string | null | undefined> | null | undefined): string[] {
  const normalized: string[] = []
  const unique = new Set<string>()

  for (const candidate of photoUrls ?? []) {
    const normalizedUrl = normalizeSedePhotoUrl(candidate ?? "")
    if (!normalizedUrl) {
      continue
    }

    if (unique.has(normalizedUrl)) {
      continue
    }

    unique.add(normalizedUrl)
    normalized.push(normalizedUrl)

    if (normalized.length >= MAX_SEDE_PHOTOS) {
      break
    }
  }

  return normalized
}

function splitSedeReference(reference: string | null | undefined): {
  plainReference: string | null
  photoUrls: string[]
} {
  const raw = (reference ?? "").trim()
  if (!raw) {
    return {
      plainReference: null,
      photoUrls: [],
    }
  }

  const markerIndex = raw.indexOf(SEDE_MEDIA_MARKER)
  if (markerIndex < 0) {
    return {
      plainReference: raw,
      photoUrls: [],
    }
  }

  const plainReference = raw.slice(0, markerIndex).trim()
  const metadataRaw = raw.slice(markerIndex + SEDE_MEDIA_MARKER.length).trim()

  if (!metadataRaw) {
    return {
      plainReference: plainReference || null,
      photoUrls: [],
    }
  }

  try {
    const parsed = JSON.parse(metadataRaw) as { photoUrls?: unknown }
    const photoUrls = Array.isArray(parsed?.photoUrls)
      ? normalizeSedePhotoUrls(parsed.photoUrls as Array<string | null | undefined>)
      : []

    return {
      plainReference: plainReference || null,
      photoUrls,
    }
  } catch {
    return {
      plainReference: raw,
      photoUrls: [],
    }
  }
}

function composeSedeReference(input: { reference?: string | null; photoUrls?: string[] | null }): string | null {
  const plainReference = (input.reference ?? "").trim()
  const photoUrls = normalizeSedePhotoUrls(input.photoUrls)

  if (photoUrls.length === 0) {
    return plainReference || null
  }

  const metadata = JSON.stringify({ photoUrls })
  if (!plainReference) {
    return `${SEDE_MEDIA_MARKER}\n${metadata}`
  }

  return `${plainReference}\n\n${SEDE_MEDIA_MARKER}\n${metadata}`
}

async function assertSedesModuleAvailable(tenantSchema?: string | null): Promise<void> {
  const resolvedSchema = resolveTenantSchemaForAdmin(tenantSchema)
  const result = await pool.query<{ sedes_available: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.tables
        WHERE table_schema = $1
          AND table_name = 'sedes'
     ) AS sedes_available`,
    [resolvedSchema],
  )

  if (!result.rows[0]?.sedes_available) {
    throw new SedesModuleNotAvailableError()
  }
}

function mapAdminSedeRow(row: AdminSedeRow): AdminSedeSummary {
  const latitude = row.latitud == null ? null : Number(row.latitud)
  const longitude = row.longitud == null ? null : Number(row.longitud)
  const { plainReference, photoUrls } = splitSedeReference(row.referencia)

  return {
    id: row.id,
    name: row.nombre,
    address: row.direccion,
    city: row.ciudad,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    phone: row.telefono,
    reference: plainReference,
    photoUrls,
    active: Boolean(row.activo),
    totalEmployees: Number(row.total_empleados ?? 0),
    totalServices: Number(row.total_servicios ?? 0),
    upcomingAppointments: Number(row.proximas_citas ?? 0),
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  }
}

async function getAdminSedeById(sedeId: number, tenantSchema?: string | null): Promise<AdminSedeSummary | null> {
  await assertSedesModuleAvailable(tenantSchema)

  const result = await pool.query<AdminSedeRow>(
    tenantSql(
      `SELECT
         s.id,
         s.nombre,
         s.direccion,
         s.ciudad,
         s.latitud::text AS latitud,
         s.longitud::text AS longitud,
         s.telefono,
         s.referencia,
         s.activo,
         s.created_at,
         s.updated_at,
         COALESCE(stats.total_empleados, 0)::text AS total_empleados,
         COALESCE(stats.total_servicios, 0)::text AS total_servicios,
         COALESCE(stats.proximas_citas, 0)::text AS proximas_citas
       FROM tenant_base.sedes s
       LEFT JOIN LATERAL (
         SELECT
           (SELECT COUNT(DISTINCT se.empleado_id) FROM tenant_base.sedes_empleados se WHERE se.sede_id = s.id) AS total_empleados,
           (
             SELECT COUNT(DISTINCT ss.servicio_id)
               FROM tenant_base.sedes_servicios ss
              WHERE ss.sede_id = s.id
                AND COALESCE(ss.activo, TRUE) = TRUE
           ) AS total_servicios,
           (
             SELECT COUNT(*)
               FROM tenant_base.agendamientos a
              WHERE a.sede_id = s.id
                AND a.fecha_cita >= NOW()
                AND LOWER(COALESCE(a.estado::text, '')) NOT IN ('cancelada', 'cancelado', 'cancel')
           ) AS proximas_citas
       ) stats ON TRUE
       WHERE s.id = $1
       LIMIT 1`,
      tenantSchema,
    ),
    [sedeId],
  )

  if (result.rowCount === 0) {
    return null
  }

  return mapAdminSedeRow(result.rows[0])
}

export async function getAdminSedes(tenantSchema?: string | null): Promise<AdminSedeSummary[]> {
  await assertSedesModuleAvailable(tenantSchema)

  const result = await pool.query<AdminSedeRow>(
    tenantSql(
      `SELECT
         s.id,
         s.nombre,
         s.direccion,
         s.ciudad,
         s.latitud::text AS latitud,
         s.longitud::text AS longitud,
         s.telefono,
         s.referencia,
         s.activo,
         s.created_at,
         s.updated_at,
         COALESCE(stats.total_empleados, 0)::text AS total_empleados,
         COALESCE(stats.total_servicios, 0)::text AS total_servicios,
         COALESCE(stats.proximas_citas, 0)::text AS proximas_citas
       FROM tenant_base.sedes s
       LEFT JOIN LATERAL (
         SELECT
           (SELECT COUNT(DISTINCT se.empleado_id) FROM tenant_base.sedes_empleados se WHERE se.sede_id = s.id) AS total_empleados,
           (
             SELECT COUNT(DISTINCT ss.servicio_id)
               FROM tenant_base.sedes_servicios ss
              WHERE ss.sede_id = s.id
                AND COALESCE(ss.activo, TRUE) = TRUE
           ) AS total_servicios,
           (
             SELECT COUNT(*)
               FROM tenant_base.agendamientos a
              WHERE a.sede_id = s.id
                AND a.fecha_cita >= NOW()
                AND LOWER(COALESCE(a.estado::text, '')) NOT IN ('cancelada', 'cancelado', 'cancel')
           ) AS proximas_citas
       ) stats ON TRUE
       ORDER BY s.activo DESC, s.nombre ASC`,
      tenantSchema,
    ),
  )

  return result.rows.map(mapAdminSedeRow)
}

export async function createAdminSede(input: {
  name: string
  address?: string | null
  city?: string | null
  latitude?: number | null
  longitude?: number | null
  phone?: string | null
  reference?: string | null
  photoUrls?: string[] | null
  active?: boolean
  tenantSchema?: string | null
}): Promise<AdminSedeSummary> {
  await assertSedesModuleAvailable(input.tenantSchema)

  const encodedReference = composeSedeReference({
    reference: input.reference,
    photoUrls: input.photoUrls,
  })

  const result = await pool.query<{ id: number }>(
    tenantSql(
      `INSERT INTO tenant_base.sedes (nombre, direccion, ciudad, latitud, longitud, telefono, referencia, activo)
       VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), $4, $5, NULLIF($6, ''), NULLIF($7, ''), $8)
       RETURNING id`,
      input.tenantSchema,
    ),
    [
      input.name,
      input.address ?? "",
      input.city ?? "",
      input.latitude ?? null,
      input.longitude ?? null,
      input.phone ?? "",
      encodedReference ?? "",
      input.active ?? true,
    ],
  )

  if (result.rowCount === 0) {
    throw new Error("SEDE_CREATE_FAILED")
  }

  const created = await getAdminSedeById(result.rows[0].id, input.tenantSchema)
  if (!created) {
    throw new Error("SEDE_CREATE_FAILED")
  }

  return created
}

export async function updateAdminSede(
  sedeId: number,
  input: {
    name: string
    address?: string | null
    city?: string | null
    latitude?: number | null
    longitude?: number | null
    phone?: string | null
    reference?: string | null
    photoUrls?: string[] | null
    active?: boolean
    tenantSchema?: string | null
  },
): Promise<AdminSedeSummary> {
  await assertSedesModuleAvailable(input.tenantSchema)

  const encodedReference = composeSedeReference({
    reference: input.reference,
    photoUrls: input.photoUrls,
  })

  const result = await pool.query<{ id: number }>(
    tenantSql(
      `UPDATE tenant_base.sedes
          SET nombre = $2,
              direccion = NULLIF($3, ''),
              ciudad = NULLIF($4, ''),
              latitud = $5,
              longitud = $6,
              telefono = NULLIF($7, ''),
              referencia = NULLIF($8, ''),
              activo = $9,
              updated_at = NOW()
        WHERE id = $1
        RETURNING id`,
      input.tenantSchema,
    ),
    [
      sedeId,
      input.name,
      input.address ?? "",
      input.city ?? "",
      input.latitude ?? null,
      input.longitude ?? null,
      input.phone ?? "",
      encodedReference ?? "",
      input.active ?? true,
    ],
  )

  if (result.rowCount === 0) {
    throw new SedeRecordNotFoundError()
  }

  const updated = await getAdminSedeById(sedeId, input.tenantSchema)
  if (!updated) {
    throw new SedeRecordNotFoundError()
  }

  return updated
}

export async function deleteAdminSede(sedeId: number, tenantSchema?: string | null): Promise<void> {
  await assertSedesModuleAvailable(tenantSchema)

  const result = await pool.query<{ id: number }>(
    tenantSql(
      `DELETE FROM tenant_base.sedes
        WHERE id = $1
        RETURNING id`,
      tenantSchema,
    ),
    [sedeId],
  )

  if (result.rowCount === 0) {
    throw new SedeRecordNotFoundError()
  }
}
