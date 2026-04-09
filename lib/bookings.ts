import { pool } from "@/lib/db"
import { ensureMaterializedEmployeeDay } from "@/lib/availability"
import { normalizeTenantSchema, tenantSql } from "@/lib/tenant"

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

type ServiceRow = {
  id: number
  nombre: string
  descripcion: string | null
  precio: number | null
  duracion_min: number
}

type SedeRow = {
  id: number
  nombre: string
  direccion: string | null
  ciudad: string | null
  telefono: string | null
  activo: boolean
  latitud: number | null
  longitud: number | null
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

export type Sede = {
  id: number
  name: string
  address: string | null
  city: string | null
  phone: string | null
  isActive: boolean
  latitude: number | null
  longitude: number | null
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

const PAID_PAYMENT_STATES = ["completo", "pagado", "aprobado", "paid", "success", "succeeded"] as const

function isPaidPaymentStatus(status: string | null | undefined): boolean {
  const normalized = (status ?? "").trim().toLowerCase()
  return PAID_PAYMENT_STATES.includes(normalized as (typeof PAID_PAYMENT_STATES)[number])
}

export type Appointment = {
  id: number
  start: string
  end: string | null
  status: AppointmentStatus
  sede: {
    id: number
    name: string
    address: string | null
    city: string | null
    phone: string | null
    latitude: number | null
    longitude: number | null
  } | null
  payment: {
    status: string | null
    method: string | null
    amount: number | null
    isPaid: boolean
  }
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

type TenantSedeFeatures = {
  hasSedesTable: boolean
  hasSedesServiciosTable: boolean
  hasSedesEmpleadosTable: boolean
  hasServiciosSedeColumn: boolean
  hasEmpleadosSedeColumn: boolean
  hasHorariosSedeColumn: boolean
  hasAgendamientosSedeColumn: boolean
  hasAgendamientosComentariosColumn: boolean
  hasAgendamientosSolicitudesColumn: boolean
}

type TenantSedeFeaturesRow = {
  has_sedes_table: boolean | string
  has_sedes_servicios_table: boolean | string
  has_sedes_empleados_table: boolean | string
  has_servicios_sede_column: boolean | string
  has_empleados_sede_column: boolean | string
  has_horarios_sede_column: boolean | string
  has_agendamientos_sede_column: boolean | string
  has_agendamientos_comentarios_column: boolean | string
  has_agendamientos_solicitudes_column: boolean | string
}

const tenantSedeFeaturesCache = new Map<string, TenantSedeFeatures>()

function toBoolean(value: unknown): boolean {
  if (value === true) return true
  if (value === false) return false
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    return normalized === "true" || normalized === "t" || normalized === "1"
  }

  if (typeof value === "number") {
    return value === 1
  }

  return false
}

function resolveTenantSchemaName(tenantSchema?: string | null): string {
  return normalizeTenantSchema(tenantSchema) ?? "tenant_base"
}

function normalizeSedeId(value: number | null | undefined): number | null {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    return null
  }

  return Number(value)
}

function buildServiceSedeFilterSql(features: TenantSedeFeatures, parameterRef: string): string | null {
  if (features.hasSedesServiciosTable && features.hasServiciosSedeColumn) {
    return `(
      EXISTS (
        SELECT 1
          FROM tenant_base.sedes_servicios ss
         WHERE ss.servicio_id = s.id
           AND ss.activo = TRUE
           AND ss.sede_id = ${parameterRef}
      )
      OR s.sede_id = ${parameterRef}
      OR (
        NOT EXISTS (
          SELECT 1
            FROM tenant_base.sedes_servicios ss2
           WHERE ss2.servicio_id = s.id
             AND ss2.activo = TRUE
        )
        AND s.sede_id IS NULL
      )
    )`
  }

  if (features.hasSedesServiciosTable) {
    return `(
      EXISTS (
        SELECT 1
          FROM tenant_base.sedes_servicios ss
         WHERE ss.servicio_id = s.id
           AND ss.activo = TRUE
           AND ss.sede_id = ${parameterRef}
      )
      OR NOT EXISTS (
        SELECT 1
          FROM tenant_base.sedes_servicios ss2
         WHERE ss2.servicio_id = s.id
           AND ss2.activo = TRUE
      )
    )`
  }

  if (features.hasServiciosSedeColumn) {
    return `(s.sede_id = ${parameterRef} OR s.sede_id IS NULL)`
  }

  return null
}

function buildEmployeeSedeFilterSql(features: TenantSedeFeatures, parameterRef: string): string | null {
  if (features.hasSedesEmpleadosTable && features.hasEmpleadosSedeColumn) {
    return `(
      EXISTS (
        SELECT 1
          FROM tenant_base.sedes_empleados se
         WHERE se.empleado_id = e.id
           AND se.sede_id = ${parameterRef}
      )
      OR e.sede_id = ${parameterRef}
    )`
  }

  if (features.hasSedesEmpleadosTable) {
    return `(EXISTS (
      SELECT 1
        FROM tenant_base.sedes_empleados se
       WHERE se.empleado_id = e.id
         AND se.sede_id = ${parameterRef}
    ))`
  }

  if (features.hasEmpleadosSedeColumn) {
    return `(e.sede_id = ${parameterRef})`
  }

  return null
}

async function getTenantSedeFeatures(tenantSchema?: string | null): Promise<TenantSedeFeatures> {
  const schemaName = resolveTenantSchemaName(tenantSchema)
  const cacheKey = schemaName.toLowerCase()

  const cached = tenantSedeFeaturesCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const result = await pool.query<TenantSedeFeaturesRow>(
    `SELECT
      EXISTS (
        SELECT 1
          FROM information_schema.tables
         WHERE table_schema = $1
           AND table_name = 'sedes'
      ) AS has_sedes_table,
      EXISTS (
        SELECT 1
          FROM information_schema.tables
         WHERE table_schema = $1
           AND table_name = 'sedes_servicios'
      ) AS has_sedes_servicios_table,
      EXISTS (
        SELECT 1
          FROM information_schema.tables
         WHERE table_schema = $1
           AND table_name = 'sedes_empleados'
      ) AS has_sedes_empleados_table,
      EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = $1
           AND table_name = 'servicios'
           AND column_name = 'sede_id'
      ) AS has_servicios_sede_column,
      EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = $1
           AND table_name = 'empleados'
           AND column_name = 'sede_id'
      ) AS has_empleados_sede_column,
      EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = $1
           AND table_name = 'horarios_empleados'
           AND column_name = 'sede_id'
      ) AS has_horarios_sede_column,
      EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = $1
           AND table_name = 'agendamientos'
           AND column_name = 'sede_id'
      ) AS has_agendamientos_sede_column,
      EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = $1
           AND table_name = 'agendamientos'
           AND column_name = 'comentarios_cliente'
      ) AS has_agendamientos_comentarios_column,
      EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = $1
           AND table_name = 'agendamientos'
           AND column_name = 'solicitudes_cliente'
      ) AS has_agendamientos_solicitudes_column`,
    [schemaName],
  )

  const row = result.rows[0]
  const features: TenantSedeFeatures = {
    hasSedesTable: toBoolean(row?.has_sedes_table),
    hasSedesServiciosTable: toBoolean(row?.has_sedes_servicios_table),
    hasSedesEmpleadosTable: toBoolean(row?.has_sedes_empleados_table),
    hasServiciosSedeColumn: toBoolean(row?.has_servicios_sede_column),
    hasEmpleadosSedeColumn: toBoolean(row?.has_empleados_sede_column),
    hasHorariosSedeColumn: toBoolean(row?.has_horarios_sede_column),
    hasAgendamientosSedeColumn: toBoolean(row?.has_agendamientos_sede_column),
    hasAgendamientosComentariosColumn: toBoolean(row?.has_agendamientos_comentarios_column),
    hasAgendamientosSolicitudesColumn: toBoolean(row?.has_agendamientos_solicitudes_column),
  }

  tenantSedeFeaturesCache.set(cacheKey, features)

  return features
}

export async function getActiveSedes(tenantSchema?: string | null): Promise<Sede[]> {
  const features = await getTenantSedeFeatures(tenantSchema)

  if (!features.hasSedesTable) {
    return []
  }

  const result = await pool.query<SedeRow>(
    tenantSql(
      `SELECT id,
              nombre,
              direccion,
              ciudad,
              telefono,
              activo,
              latitud,
              longitud
         FROM tenant_base.sedes
        WHERE activo = TRUE
        ORDER BY nombre ASC`,
      tenantSchema,
    ),
  )

  return result.rows.map((row) => ({
    id: row.id,
    name: row.nombre,
    address: row.direccion,
    city: row.ciudad,
    phone: row.telefono,
    isActive: row.activo,
    latitude: row.latitud,
    longitude: row.longitud,
  }))
}

export async function getSedeById(
  sedeId: number,
  tenantSchema?: string | null,
): Promise<Sede | null> {
  const normalizedSedeId = normalizeSedeId(sedeId)
  if (normalizedSedeId == null) {
    return null
  }

  const features = await getTenantSedeFeatures(tenantSchema)
  if (!features.hasSedesTable) {
    return null
  }

  const result = await pool.query<SedeRow>(
    tenantSql(
      `SELECT id,
              nombre,
              direccion,
              ciudad,
              telefono,
              activo,
              latitud,
              longitud
         FROM tenant_base.sedes
        WHERE id = $1
        LIMIT 1`,
      tenantSchema,
    ),
    [normalizedSedeId],
  )

  if (result.rowCount === 0) {
    return null
  }

  const row = result.rows[0]
  return {
    id: row.id,
    name: row.nombre,
    address: row.direccion,
    city: row.ciudad,
    phone: row.telefono,
    isActive: row.activo,
    latitude: row.latitud,
    longitude: row.longitud,
  }
}

export async function getActiveBarbersBySede(
  sedeId: number,
  tenantSchema?: string | null,
): Promise<Barber[]> {
  const normalizedSedeId = normalizeSedeId(sedeId)
  if (normalizedSedeId == null) {
    return []
  }

  const features = await getTenantSedeFeatures(tenantSchema)
  const employeeSedeFilter = buildEmployeeSedeFilterSql(features, "$1")

  const query = tenantSql(
    `SELECT e.id,
            e.nombre
       FROM tenant_base.empleados e
      WHERE LOWER(COALESCE(e.estado::text, 'activo')) = 'activo'
        ${employeeSedeFilter ? `AND ${employeeSedeFilter}` : ""}
      ORDER BY e.nombre ASC`,
    tenantSchema,
  )

  const result = await pool.query<BarberRow>(query, employeeSedeFilter ? [normalizedSedeId] : [])

  return result.rows.map((row) => ({
    id: row.id,
    name: row.nombre,
  }))
}

async function resolveClientIdForUser(userId: number, tenantSchema?: string | null): Promise<number> {
  const result = await pool.query<{ id: number }>(
    tenantSql(`SELECT id
       FROM tenant_base.clientes
      WHERE user_id = $1
      LIMIT 1`, tenantSchema),
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

export async function getActiveServices(tenantSchema?: string | null, sedeId?: number | null): Promise<Service[]> {
  const normalizedSedeId = normalizeSedeId(sedeId)
  const features = await getTenantSedeFeatures(tenantSchema)
  const serviceSedeFilter =
    normalizedSedeId !== null ? buildServiceSedeFilterSql(features, "$1") : null

  const result = await pool.query<ServiceRow>(
    tenantSql(
      `SELECT s.id,
              s.nombre,
              s.descripcion,
              s.precio,
              s.duracion_min
         FROM tenant_base.servicios s
        WHERE s.estado = 'activo'
          ${serviceSedeFilter ? `AND ${serviceSedeFilter}` : ""}
        ORDER BY s.nombre ASC`,
      tenantSchema,
    ),
    normalizedSedeId !== null && serviceSedeFilter ? [normalizedSedeId] : [],
  )

  return result.rows.map((row) => ({
    id: row.id,
    name: row.nombre,
    description: row.descripcion,
    price: row.precio,
    durationMin: row.duracion_min,
  }))
}

export async function getBarbersForService(
  serviceId: number,
  tenantSchema?: string | null,
  sedeId?: number | null,
): Promise<Barber[]> {
  const normalizedSedeId = normalizeSedeId(sedeId)
  const features = await getTenantSedeFeatures(tenantSchema)
  const employeeSedeFilterForService =
    normalizedSedeId !== null ? buildEmployeeSedeFilterSql(features, "$2") : null
  const employeeSedeFilterFallback =
    normalizedSedeId !== null ? buildEmployeeSedeFilterSql(features, "$1") : null

  const result = await pool.query<BarberRow>(
    tenantSql(
      `SELECT e.id,
              e.nombre
         FROM tenant_base.empleados e
         INNER JOIN tenant_base.empleados_servicios es
                 ON es.empleado_id = e.id
        WHERE es.servicio_id = $1
          ${employeeSedeFilterForService ? `AND ${employeeSedeFilterForService}` : ""}
        ORDER BY e.nombre ASC`,
      tenantSchema,
    ),
    normalizedSedeId !== null && employeeSedeFilterForService ? [serviceId, normalizedSedeId] : [serviceId],
  )

  if (result.rowCount === 0) {
    const fallback = await pool.query<BarberRow>(
      tenantSql(
        `SELECT e.id,
                e.nombre
           FROM tenant_base.empleados e
          WHERE LOWER(COALESCE(e.estado::text, 'activo')) = 'activo'
            ${employeeSedeFilterFallback ? `AND ${employeeSedeFilterFallback}` : ""}
          ORDER BY e.nombre ASC`,
        tenantSchema,
      ),
      normalizedSedeId !== null && employeeSedeFilterFallback ? [normalizedSedeId] : [],
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
  durationMinOverride?: number
  sedeId?: number | null
  tenantSchema?: string | null
}): Promise<AvailabilitySlot[]> {
  const { serviceId, employeeId, date, excludeAppointmentId, durationMinOverride, tenantSchema } = options
  const normalizedSedeId = normalizeSedeId(options.sedeId)

  const features = await getTenantSedeFeatures(tenantSchema)
  const hasHorariosSedeFilter = normalizedSedeId !== null && features.hasHorariosSedeColumn

  await ensureMaterializedEmployeeDay({ employeeId, date, tenantSchema })

  const result = await pool.query<AvailabilityRow>(
    tenantSql(`WITH svc AS (
        SELECT COALESCE(
                 $5::int,
                 (SELECT duracion_min
                    FROM tenant_base.servicios
                   WHERE id = $1
                     AND estado = 'activo'
                   LIMIT 1)
               ) AS duracion_min
        WHERE COALESCE(
                 $5::int,
                 (SELECT duracion_min
                    FROM tenant_base.servicios
                   WHERE id = $1
                     AND estado = 'activo'
                   LIMIT 1)
               ) IS NOT NULL
      ),
      bloques AS (
        SELECT he.fecha_hora_inicio AS ini,
               he.fecha_hora_fin    AS fin
          FROM tenant_base.horarios_empleados he
         WHERE he.empleado_id = $2
           AND DATE(he.fecha_hora_inicio AT TIME ZONE $6) = $3::date
         ${hasHorariosSedeFilter ? "AND (he.sede_id = $7::int OR he.sede_id IS NULL)" : ""}
      ),
      ocupados AS (
        SELECT tstzrange(a.fecha_cita, COALESCE(a.fecha_cita_fin, a.fecha_cita), '[)') AS r
          FROM tenant_base.agendamientos a
         WHERE a.empleado_id = $2
           AND DATE(a.fecha_cita AT TIME ZONE $6) = $3::date
           AND a.estado::text <> 'cancelada'
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
            interval '10 minutes'
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
     LIMIT 240`, tenantSchema),
    hasHorariosSedeFilter
      ? [
          serviceId,
          employeeId,
          date,
          typeof excludeAppointmentId === "number" ? excludeAppointmentId : null,
          typeof durationMinOverride === "number" ? durationMinOverride : null,
          BOOKING_TIME_ZONE,
          normalizedSedeId,
        ]
      : [
          serviceId,
          employeeId,
          date,
          typeof excludeAppointmentId === "number" ? excludeAppointmentId : null,
          typeof durationMinOverride === "number" ? durationMinOverride : null,
          BOOKING_TIME_ZONE,
        ],
  )

  const mapped = result.rows.map((row) => ({
    start: row.slot_ini.toISOString(),
    end: row.slot_fin.toISOString(),
  }))

  const todayLocal = formatDateInTimeZone(new Date(), BOOKING_TIME_ZONE)
  if (date !== todayLocal) {
    return mapped
  }

  const now = Date.now()
  return mapped.filter((slot) => {
    const slotStart = new Date(slot.start).getTime()
    return Number.isFinite(slotStart) && slotStart > now
  })
}

export async function getAvailabilitySlotsWithoutPreference(options: {
  serviceId: number
  date: string
  excludeAppointmentId?: number
  sedeId?: number | null
  tenantSchema?: string | null
}): Promise<AvailabilitySlot[]> {
  const { serviceId, date, excludeAppointmentId, tenantSchema } = options
  const normalizedSedeId = normalizeSedeId(options.sedeId)

  const barbers = await getBarbersForService(serviceId, tenantSchema, normalizedSedeId)
  if (barbers.length === 0) {
    return []
  }

  const slotGroups = await Promise.all(
    barbers.map((barber) =>
      getAvailabilitySlots({
        serviceId,
        employeeId: barber.id,
        date,
        excludeAppointmentId,
        sedeId: normalizedSedeId,
        tenantSchema,
      }),
    ),
  )

  const dedup = new Map<string, AvailabilitySlot>()
  for (const slots of slotGroups) {
    for (const slot of slots) {
      if (!dedup.has(slot.start)) {
        dedup.set(slot.start, slot)
      }
    }
  }

  return Array.from(dedup.values()).sort((a, b) => {
    const left = new Date(a.start).getTime()
    const right = new Date(b.start).getTime()
    return left - right
  })
}

export async function reserveAppointment(options: {
  userId: number
  employeeId: number
  serviceId: number
  start: string
  sedeId?: number | null
  customerComment?: string | null
  customerRequest?: string | null
  tenantSchema?: string | null
}): Promise<{ appointmentId: number }>
{
  const result = await reserveAppointments({
    userId: options.userId,
    employeeId: options.employeeId,
    serviceIds: [options.serviceId],
    start: options.start,
    sedeId: options.sedeId,
    customerComment: options.customerComment,
    customerRequest: options.customerRequest,
    tenantSchema: options.tenantSchema,
  })

  return { appointmentId: result.appointmentIds[0] }
}

export async function reserveAppointments(options: {
  userId: number
  employeeId: number
  serviceIds: number[]
  start: string
  sedeId?: number | null
  customerComment?: string | null
  customerRequest?: string | null
  tenantSchema?: string | null
}): Promise<{ appointmentIds: number[] }>
{
  const { userId, employeeId, serviceIds, start, tenantSchema } = options
  const normalizedSedeId = normalizeSedeId(options.sedeId)
  const normalizedCustomerComment =
    typeof options.customerComment === "string" && options.customerComment.trim().length > 0
      ? options.customerComment.trim().slice(0, 1000)
      : null
  const normalizedCustomerRequest =
    typeof options.customerRequest === "string" && options.customerRequest.trim().length > 0
      ? options.customerRequest.trim().slice(0, 1000)
      : null

  const features = await getTenantSedeFeatures(tenantSchema)

  if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
    const error = new Error("SERVICE_NOT_FOUND")
    ;(error as { code?: string }).code = "SERVICE_NOT_FOUND"
    throw error
  }

  if (serviceIds.length > 2) {
    const error = new Error("SERVICE_SELECTION_LIMIT")
    ;(error as { code?: string }).code = "SERVICE_SELECTION_LIMIT"
    throw error
  }

  const clientId = await resolveClientIdForUser(userId, tenantSchema)

  const startInstant = new Date(start)
  if (Number.isNaN(startInstant.getTime())) {
    const error = new Error("INVALID_START")
    ;(error as { code?: string }).code = "INVALID_START"
    throw error
  }

  if (startInstant.getTime() <= Date.now()) {
    const error = new Error("START_IN_PAST")
    ;(error as { code?: string }).code = "START_IN_PAST"
    throw error
  }

  const requestedStartISO = startInstant.toISOString()
  const slotDateLocal = formatDateInTimeZone(startInstant, BOOKING_TIME_ZONE)

  await ensureMaterializedEmployeeDay({ employeeId, date: slotDateLocal, tenantSchema })

  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    if (normalizedSedeId !== null && features.hasSedesTable) {
      const sedeResult = await client.query<{ id: number }>(
        tenantSql(
          `SELECT id
             FROM tenant_base.sedes
            WHERE id = $1
              AND activo = TRUE
            LIMIT 1`,
          tenantSchema,
        ),
        [normalizedSedeId],
      )

      if (sedeResult.rowCount === 0) {
        const error = new Error("SEDE_NOT_FOUND")
        ;(error as { code?: string }).code = "SEDE_NOT_FOUND"
        throw error
      }

      const employeeSedeFilter = buildEmployeeSedeFilterSql(features, "$2")
      if (employeeSedeFilter) {
        const employeeInSedeResult = await client.query<{ exists: boolean }>(
          tenantSql(
            `SELECT EXISTS(
               SELECT 1
                 FROM tenant_base.empleados e
                WHERE e.id = $1
                  AND ${employeeSedeFilter}
               LIMIT 1
             ) AS exists`,
            tenantSchema,
          ),
          [employeeId, normalizedSedeId],
        )

        if (!employeeInSedeResult.rows[0]?.exists) {
          const error = new Error("BARBER_NOT_IN_SEDE")
          ;(error as { code?: string }).code = "BARBER_NOT_IN_SEDE"
          throw error
        }
      }
    }

    // Business rule: max 2 appointments per client per day (excluding cancelled).
    const dailyCountResult = await client.query<{ count: number }>(
      tenantSql(`SELECT COUNT(*)::int AS count
         FROM tenant_base.agendamientos a
        WHERE a.cliente_id = $1
          AND (a.fecha_cita AT TIME ZONE $3)::date = ($2::timestamptz AT TIME ZONE $3)::date
          AND a.estado::text IN ('pendiente', 'confirmada')`, tenantSchema),
      [clientId, requestedStartISO, BOOKING_TIME_ZONE],
    )

    const existingCount = Number(dailyCountResult.rows[0]?.count ?? 0)
    const maxPerDay = 2
    if (!Number.isFinite(existingCount)) {
      const error = new Error("CLIENT_DAILY_LIMIT")
      ;(error as { code?: string }).code = "CLIENT_DAILY_LIMIT"
      throw error
    }

    if (existingCount + 1 > maxPerDay) {
      const error = new Error("CLIENT_DAILY_LIMIT")
      ;(error as { code?: string }).code = "CLIENT_DAILY_LIMIT"
      ;(error as { meta?: unknown }).meta = { maxPerDay, existingCount }
      throw error
    }

    const serviceSedeFilter =
      normalizedSedeId !== null ? buildServiceSedeFilterSql(features, "$2") : null

    const durationsResult = await client.query<{ id: number; duracion_min: number }>(
      tenantSql(
        `SELECT s.id, s.duracion_min
           FROM tenant_base.servicios s
          WHERE s.id = ANY($1::int[])
            AND s.estado = 'activo'
            ${serviceSedeFilter ? `AND ${serviceSedeFilter}` : ""}`,
        tenantSchema,
      ),
      normalizedSedeId !== null && serviceSedeFilter ? [serviceIds, normalizedSedeId] : [serviceIds],
    )

    if (durationsResult.rowCount !== serviceIds.length) {
      const error = new Error(normalizedSedeId !== null ? "SERVICE_NOT_IN_SEDE" : "SERVICE_NOT_FOUND")
      ;(error as { code?: string }).code = normalizedSedeId !== null ? "SERVICE_NOT_IN_SEDE" : "SERVICE_NOT_FOUND"
      throw error
    }

    const durationById = new Map<number, number>()
    for (const row of durationsResult.rows) {
      durationById.set(Number(row.id), Number(row.duracion_min))
    }

    const totalDurationMin = serviceIds.reduce((acc, serviceId) => {
      const durationMin = Number(durationById.get(serviceId))
      if (!Number.isFinite(durationMin) || durationMin <= 0) {
        const error = new Error("SERVICE_INVALID_DURATION")
        ;(error as { code?: string }).code = "SERVICE_INVALID_DURATION"
        throw error
      }
      return acc + durationMin
    }, 0)

    const primaryServiceId = serviceIds[0]

    const availableSlots = await getAvailabilitySlots({
      serviceId: primaryServiceId,
      employeeId,
      date: slotDateLocal,
      durationMinOverride: totalDurationMin,
      sedeId: normalizedSedeId,
      tenantSchema,
    })

    const hasSlot = availableSlots.some((slot) => slot.start === requestedStartISO)

    if (!hasSlot) {
      const error = new Error("SLOT_NOT_AVAILABLE")
      ;(error as { code?: string }).code = "SLOT_NOT_AVAILABLE"
      throw error
    }

    const startForInsert = requestedStartISO

    const overlapResult = await client.query<{ exists: boolean }>(
      tenantSql(`SELECT EXISTS(
         SELECT 1
           FROM tenant_base.agendamientos a
          WHERE a.empleado_id = $1
            AND a.estado::text <> 'cancelada'
            AND tstzrange(a.fecha_cita, COALESCE(a.fecha_cita_fin, a.fecha_cita), '[)') &&
              tstzrange($2::timestamptz, $2::timestamptz + make_interval(mins := $3), '[)')
          LIMIT 1
       ) AS exists`, tenantSchema),
      [employeeId, startForInsert, totalDurationMin],
    )

    if (overlapResult.rows[0]?.exists) {
      const error = new Error("SLOT_ALREADY_TAKEN")
      ;(error as { code?: string }).code = "SLOT_ALREADY_TAKEN"
      throw error
    }

    const insertColumns = [
      "cliente_id",
      "empleado_id",
      "servicio_id",
      "fecha_cita",
      "fecha_cita_fin",
      "estado",
      "notificado",
      "creado_en",
    ]

    const insertValues = [
      "$1",
      "$2",
      "$3",
      "$4::timestamptz",
      "$4::timestamptz + make_interval(mins := $5)",
      "'pendiente'::tenant_base.estado_agendamiento_enum",
      "'no notificado'::tenant_base.notificado_enum",
      "now()",
    ]

    const insertParams: Array<number | string | null> = [
      clientId,
      employeeId,
      primaryServiceId,
      startForInsert,
      totalDurationMin,
    ]

    if (features.hasAgendamientosSedeColumn) {
      insertColumns.push("sede_id")
      insertParams.push(normalizedSedeId)
      insertValues.push(`$${insertParams.length}::int`)
    }

    if (features.hasAgendamientosComentariosColumn) {
      insertColumns.push("comentarios_cliente")
      insertParams.push(normalizedCustomerComment)
      insertValues.push(`$${insertParams.length}::text`)
    }

    if (features.hasAgendamientosSolicitudesColumn) {
      insertColumns.push("solicitudes_cliente")
      insertParams.push(normalizedCustomerRequest)
      insertValues.push(`$${insertParams.length}::text`)
    }

    const insertResult = await client.query<{ id: number }>(
      tenantSql(
        `INSERT INTO tenant_base.agendamientos
        (${insertColumns.join(", ")})
       VALUES
        (${insertValues.join(", ")})
       RETURNING id`,
        tenantSchema,
      ),
      insertParams,
    )

    const insertedId = insertResult.rows[0]?.id
    if (typeof insertedId !== "number") {
      throw new Error("INSERT_FAILED")
    }

    await client.query("COMMIT")

    return { appointmentIds: [insertedId] }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

export async function reserveAppointmentsWithoutPreference(options: {
  userId: number
  serviceIds: number[]
  start: string
  sedeId?: number | null
  customerComment?: string | null
  customerRequest?: string | null
  tenantSchema?: string | null
}): Promise<{ appointmentIds: number[]; employeeId: number }> {
  const normalizedSedeId = normalizeSedeId(options.sedeId)
  const primaryServiceId = options.serviceIds[0]

  if (!Number.isInteger(primaryServiceId) || primaryServiceId <= 0) {
    const error = new Error("SERVICE_NOT_FOUND")
    ;(error as { code?: string }).code = "SERVICE_NOT_FOUND"
    throw error
  }

  const barbers = await getBarbersForService(primaryServiceId, options.tenantSchema, normalizedSedeId)

  for (const barber of barbers) {
    try {
      const result = await reserveAppointments({
        userId: options.userId,
        employeeId: barber.id,
        serviceIds: options.serviceIds,
        start: options.start,
        sedeId: normalizedSedeId,
        customerComment: options.customerComment,
        customerRequest: options.customerRequest,
        tenantSchema: options.tenantSchema,
      })

      return {
        appointmentIds: result.appointmentIds,
        employeeId: barber.id,
      }
    } catch (error) {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof (error as { code?: unknown }).code === "string"
          ? ((error as { code?: string }).code as string)
          : null

      if (code === "SLOT_NOT_AVAILABLE" || code === "SLOT_ALREADY_TAKEN" || code === "BARBER_NOT_IN_SEDE") {
        continue
      }

      throw error
    }
  }

  const error = new Error("SLOT_NOT_AVAILABLE")
  ;(error as { code?: string }).code = "SLOT_NOT_AVAILABLE"
  throw error
}

type AppointmentRow = {
  id: number
  fecha_cita: Date
  fecha_cita_fin: Date | null
  estado: string
  sede_id: number | null
  sede_nombre: string | null
  sede_direccion: string | null
  sede_ciudad: string | null
  sede_telefono: string | null
  sede_latitud: number | null
  sede_longitud: number | null
  servicio_id: number
  servicio_nombre: string
  servicio_precio: number | null
  empleado_id: number
  empleado_nombre: string
  pago_estado: string | null
  pago_metodo: string | null
  pago_monto: string | null
}

const CANCELABLE_STATUSES: AppointmentStatus[] = ["pendiente"]
const RESCHEDULABLE_STATUSES: AppointmentStatus[] = ["pendiente"]
const COMPLETABLE_STATUSES: AppointmentStatus[] = ["pendiente", "confirmada", "provisional"]

let hasEnsuredRescheduleAuditTable = false

async function ensureRescheduleAuditTable(
  client: { query: (sql: string) => Promise<unknown> },
  tenantSchema?: string | null,
) {
  if (hasEnsuredRescheduleAuditTable) {
    return
  }

  await client.query(tenantSql(`CREATE TABLE IF NOT EXISTS tenant_base.agendamientos_reprogramaciones (
    id BIGSERIAL PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES tenant_base.clientes(id) ON DELETE CASCADE,
    agendamiento_id INTEGER NOT NULL REFERENCES tenant_base.agendamientos(id) ON DELETE CASCADE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
  );`, tenantSchema))

  await client.query(
    tenantSql(`CREATE INDEX IF NOT EXISTS agendamientos_reprogramaciones_cliente_creado_idx
       ON tenant_base.agendamientos_reprogramaciones (cliente_id, creado_en);`, tenantSchema),
  )

  hasEnsuredRescheduleAuditTable = true
}

export async function getAppointmentsForUser(options: {
  userId: number
  scope: "upcoming" | "history"
  statuses?: AppointmentStatus[]
  limit?: number
  tenantSchema?: string | null
}): Promise<Appointment[]> {
  const { userId, scope, statuses = [], limit = 100, tenantSchema } = options
  const sedeFeatures = await getTenantSedeFeatures(tenantSchema)
  const includeSedeInQuery = sedeFeatures.hasSedesTable && sedeFeatures.hasAgendamientosSedeColumn

  const statusArray = statuses.length > 0 ? statuses : null
  const orderDirection = scope === "upcoming" ? "ASC" : "DESC"
  const scopeCondition =
    scope === "upcoming"
      ? "(a.fecha_cita >= now() OR a.estado::text IN ('pendiente', 'confirmada', 'provisional'))"
      : "(a.fecha_cita < now() AND a.estado::text NOT IN ('pendiente', 'confirmada', 'provisional'))"

  const buildQuery = (withSedeData: boolean) => {
    const sedeSelectSql = withSedeData
      ? `,
            sd.id AS sede_id,
            sd.nombre AS sede_nombre,
            sd.direccion AS sede_direccion,
            sd.ciudad AS sede_ciudad,
            sd.telefono AS sede_telefono,
            sd.latitud::double precision AS sede_latitud,
            sd.longitud::double precision AS sede_longitud`
      : `,
            NULL::int AS sede_id,
            NULL::text AS sede_nombre,
            NULL::text AS sede_direccion,
            NULL::text AS sede_ciudad,
            NULL::text AS sede_telefono,
            NULL::double precision AS sede_latitud,
            NULL::double precision AS sede_longitud`

    const sedeJoinSql = withSedeData
      ? "LEFT JOIN tenant_base.sedes sd ON sd.id = a.sede_id"
      : ""

    return tenantSql(`SELECT a.id,
            a.fecha_cita,
            a.fecha_cita_fin,
            a.estado
          ${sedeSelectSql},
            s.id  AS servicio_id,
            s.nombre AS servicio_nombre,
            s.precio AS servicio_precio,
            e.id  AS empleado_id,
            e.nombre AS empleado_nombre,
            p.pago_estado,
            p.pago_metodo,
            p.pago_monto
       FROM tenant_base.agendamientos a
       INNER JOIN tenant_base.clientes c ON c.id = a.cliente_id
       INNER JOIN tenant_base.servicios s ON s.id = a.servicio_id
       INNER JOIN tenant_base.empleados e ON e.id = a.empleado_id
       ${sedeJoinSql}
       LEFT JOIN LATERAL (
         SELECT
           pg.estado::text AS pago_estado,
           pg.metodo_pago::text AS pago_metodo,
             COALESCE(
               CASE
                 WHEN pg.proveedor_pago = 'wompi'
                   AND jsonb_typeof(pg.wompi_payload) = 'object'
                   AND (pg.wompi_payload ->> 'amount_in_cents') ~ '^[0-9]+$'
                 THEN ((pg.wompi_payload ->> 'amount_in_cents')::numeric / 100)
                 ELSE NULL
               END,
               CASE
                 WHEN COALESCE(pg.monto_descuento, 0) > 0 AND pg.monto IS NOT NULL THEN GREATEST(pg.monto - pg.monto_descuento, 0)
                 ELSE NULL
               END,
               pg.monto_final,
               pg.monto,
               0
             )::text AS pago_monto
         FROM tenant_base.pagos pg
         WHERE pg.agendamiento_id = a.id
         ORDER BY pg.id DESC
         LIMIT 1
       ) p ON TRUE
      WHERE c.user_id = $1
        AND ${scopeCondition}
        AND ($2::text[] IS NULL OR a.estado::text = ANY($2::text[]))
      ORDER BY a.fecha_cita ${orderDirection}
      LIMIT $3`, tenantSchema)
  }

  let result: { rows: AppointmentRow[] }

  try {
    result = await pool.query<AppointmentRow>(buildQuery(includeSedeInQuery), [userId, statusArray, limit])
  } catch (error) {
    const errorCode =
      typeof error === "object" && error !== null && "code" in error
        ? ((error as { code?: string }).code ?? "")
        : ""

    // Fallback for tenants with partial or custom sede schema rollout.
    if (includeSedeInQuery) {
      console.warn("Falling back to appointments query without sede metadata", {
        tenantSchema,
        errorCode,
      })
      result = await pool.query<AppointmentRow>(buildQuery(false), [userId, statusArray, limit])
    } else {
      throw error
    }
  }

  return result.rows.map((row) => ({
    id: row.id,
    start: row.fecha_cita.toISOString(),
    end: row.fecha_cita_fin ? row.fecha_cita_fin.toISOString() : null,
    status: row.estado,
    sede:
      typeof row.sede_id === "number"
        ? {
            id: row.sede_id,
            name: row.sede_nombre ?? "Sede",
            address: row.sede_direccion,
            city: row.sede_ciudad,
            phone: row.sede_telefono,
            latitude: row.sede_latitud,
            longitude: row.sede_longitud,
          }
        : null,
    payment: {
      status: row.pago_estado,
      method: row.pago_metodo,
      amount: row.pago_monto != null && row.pago_monto !== "" ? Number(row.pago_monto) : null,
      isPaid: isPaidPaymentStatus(row.pago_estado),
    },
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

async function ensureAppointmentOwnership(
  appointmentId: number,
  userId: number,
  tenantSchema?: string | null,
): Promise<AppointmentOwnershipRow> {
  const result = await pool.query<AppointmentOwnershipRow>(
    tenantSql(`SELECT servicio_id,
            empleado_id,
            estado,
            fecha_cita,
            fecha_cita_fin
       FROM tenant_base.agendamientos
      WHERE id = $1
        AND cliente_id = (SELECT id FROM tenant_base.clientes WHERE user_id = $2 LIMIT 1)
      LIMIT 1`, tenantSchema),
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
  tenantSchema?: string | null
}): Promise<void> {
  const { appointmentId, userId, tenantSchema } = options
  const appointment = await ensureAppointmentOwnership(appointmentId, userId, tenantSchema)

  if (!CANCELABLE_STATUSES.includes(appointment.estado as AppointmentStatus)) {
    const error = new Error("APPOINTMENT_NOT_CANCELABLE")
    ;(error as { code?: string }).code = "APPOINTMENT_NOT_CANCELABLE"
    throw error
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const update = await client.query(
      tenantSql(`UPDATE tenant_base.agendamientos
          SET estado = 'cancelada'::tenant_base.estado_agendamiento_enum
        WHERE id = $1
          AND cliente_id = (SELECT id FROM tenant_base.clientes WHERE user_id = $2 LIMIT 1)
          AND estado::text = 'pendiente'`, tenantSchema),
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
  tenantSchema?: string | null
}): Promise<void> {
  const { appointmentId, userId, start, tenantSchema } = options

  const newStart = new Date(start)
  if (Number.isNaN(newStart.getTime())) {
    const error = new Error("INVALID_START")
    ;(error as { code?: string }).code = "INVALID_START"
    throw error
  }

  const appointment = await ensureAppointmentOwnership(appointmentId, userId, tenantSchema)

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
    tenantSchema,
  })

  const hasSlot = availableSlots.some((slot) => slot.start === requestedStartISO)

  if (!hasSlot) {
    const error = new Error("SLOT_NOT_AVAILABLE")
    ;(error as { code?: string }).code = "SLOT_NOT_AVAILABLE"
    throw error
  }

  const clientId = await resolveClientIdForUser(userId, tenantSchema)

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    await ensureRescheduleAuditTable(client, tenantSchema)

    const rescheduleCountResult = await client.query<{ count: number }>(
      tenantSql(`SELECT COUNT(*)::int AS count
         FROM tenant_base.agendamientos_reprogramaciones r
        WHERE r.cliente_id = $1
          AND (r.creado_en AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date`, tenantSchema),
      [clientId, BOOKING_TIME_ZONE],
    )

    const reschedulesToday = Number(rescheduleCountResult.rows[0]?.count ?? 0)
    const maxReschedulesPerDay = 2

    if (Number.isFinite(reschedulesToday) && reschedulesToday >= maxReschedulesPerDay) {
      const error = new Error("RESCHEDULE_DAILY_LIMIT")
      ;(error as { code?: string }).code = "RESCHEDULE_DAILY_LIMIT"
      ;(error as { meta?: unknown }).meta = { maxReschedulesPerDay, reschedulesToday }
      throw error
    }

    // Enforce max 2 appointments per client per day (excluding this appointment).
    const dailyCountResult = await client.query<{ count: number }>(
      tenantSql(`SELECT COUNT(*)::int AS count
         FROM tenant_base.agendamientos a
        WHERE a.cliente_id = $1
          AND a.id <> $2
          AND (a.fecha_cita AT TIME ZONE $4)::date = ($3::timestamptz AT TIME ZONE $4)::date
          AND a.estado::text IN ('pendiente', 'confirmada')`, tenantSchema),
      [clientId, appointmentId, requestedStartISO, BOOKING_TIME_ZONE],
    )

    const existingCount = Number(dailyCountResult.rows[0]?.count ?? 0)
    const maxPerDay = 2

    if (Number.isFinite(existingCount) && existingCount >= maxPerDay) {
      const error = new Error("CLIENT_DAILY_LIMIT")
      ;(error as { code?: string }).code = "CLIENT_DAILY_LIMIT"
      ;(error as { meta?: unknown }).meta = { maxPerDay, existingCount }
      throw error
    }

    const serviceResult = await client.query<{ duracion_min: number }>(
      tenantSql(`SELECT duracion_min
         FROM tenant_base.servicios
        WHERE id = $1
          AND estado = 'activo'
        LIMIT 1`, tenantSchema),
      [appointment.servicio_id],
    )

    if (serviceResult.rowCount === 0) {
      const error = new Error("SERVICE_NOT_FOUND")
      ;(error as { code?: string }).code = "SERVICE_NOT_FOUND"
      throw error
    }

    const durationMin = Number(serviceResult.rows[0].duracion_min)

    const overlapResult = await client.query<{ exists: boolean }>(
      tenantSql(`SELECT EXISTS(
         SELECT 1
           FROM tenant_base.agendamientos a
          WHERE a.empleado_id = $1
            AND a.id <> $2
            AND a.estado::text <> 'cancelada'
            AND tstzrange(a.fecha_cita, COALESCE(a.fecha_cita_fin, a.fecha_cita), '[)') &&
              tstzrange($3::timestamptz, $3::timestamptz + make_interval(mins := $4), '[)')
          LIMIT 1
       ) AS exists`, tenantSchema),
      [appointment.empleado_id, appointmentId, requestedStartISO, durationMin],
    )

    if (overlapResult.rows[0]?.exists) {
      const error = new Error("SLOT_ALREADY_TAKEN")
      ;(error as { code?: string }).code = "SLOT_ALREADY_TAKEN"
      throw error
    }

    const update = await client.query(
      tenantSql(`UPDATE tenant_base.agendamientos
            SET fecha_cita = $1::timestamptz,
              fecha_cita_fin = $1::timestamptz + make_interval(mins := $2),
              notificado = 'no notificado'::tenant_base.notificado_enum
        WHERE id = $3
          AND cliente_id = $4
          AND estado::text = 'pendiente'`, tenantSchema),
      [requestedStartISO, durationMin, appointmentId, clientId],
    )

    if (update.rowCount === 0) {
      const error = new Error("APPOINTMENT_RESCHEDULE_FAILED")
      ;(error as { code?: string }).code = "APPOINTMENT_RESCHEDULE_FAILED"
      throw error
    }

    await client.query(
      tenantSql(`INSERT INTO tenant_base.agendamientos_reprogramaciones (cliente_id, agendamiento_id)
       VALUES ($1, $2)`, tenantSchema),
      [clientId, appointmentId],
    )

    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

export async function completeAppointment(options: {
  appointmentId: number
  userId: number
  tenantSchema?: string | null
}): Promise<void> {
  const { appointmentId, userId, tenantSchema } = options
  const appointment = await ensureAppointmentOwnership(appointmentId, userId, tenantSchema)

  if (!COMPLETABLE_STATUSES.includes(appointment.estado as AppointmentStatus)) {
    const error = new Error("APPOINTMENT_NOT_COMPLETABLE")
    ;(error as { code?: string }).code = "APPOINTMENT_NOT_COMPLETABLE"
    throw error
  }

  const appointmentEnd = appointment.fecha_cita_fin ?? appointment.fecha_cita
  if (!(appointmentEnd instanceof Date) || Number.isNaN(appointmentEnd.getTime()) || appointmentEnd.getTime() > Date.now()) {
    const error = new Error("APPOINTMENT_NOT_FINISHED_YET")
    ;(error as { code?: string }).code = "APPOINTMENT_NOT_FINISHED_YET"
    throw error
  }

  const result = await pool.query(
    tenantSql(`UPDATE tenant_base.agendamientos
        SET estado = 'completada'::tenant_base.estado_agendamiento_enum
      WHERE id = $1
        AND cliente_id = (SELECT id FROM tenant_base.clientes WHERE user_id = $2 LIMIT 1)
        AND estado::text = ANY($3::text[])`, tenantSchema),
    [appointmentId, userId, COMPLETABLE_STATUSES],
  )

  if (result.rowCount === 0) {
    const error = new Error("APPOINTMENT_COMPLETE_FAILED")
    ;(error as { code?: string }).code = "APPOINTMENT_COMPLETE_FAILED"
    throw error
  }
}
