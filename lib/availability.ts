import { pool } from "@/lib/db"

export type WeeklyAvailabilityRule = {
  dow: number // 0=Sunday ... 6=Saturday
  startTime: string // HH:mm
  endTime: string // HH:mm
  active?: boolean
}

export type AvailabilityException =
  | {
      type: "off"
      date: string // YYYY-MM-DD
      note?: string
    }
  | {
      type: "custom"
      date: string // YYYY-MM-DD
      startTime: string // HH:mm
      endTime: string // HH:mm
      note?: string
    }

type WeeklyRuleRow = {
  dow: number
  hora_inicio: string
  hora_fin: string
  activo: boolean
}

type ExceptionRow = {
  fecha: string
  tipo: "off" | "custom"
  hora_inicio: string | null
  hora_fin: string | null
}

function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    // 42P01 = undefined_table
    (error as { code?: string }).code === "42P01"
  )
}

function toDow(date: string): number {
  // Uses UTC to keep stable behavior regardless of server TZ.
  const [y, m, d] = date.split("-").map((value) => Number(value))
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCDay()
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map((value) => Number(value))
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  const yyyy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(dt.getUTCDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

export async function getWeeklyAvailability(employeeId: number): Promise<WeeklyAvailabilityRule[]> {
  try {
    const result = await pool.query<WeeklyRuleRow>(
      `SELECT dow, hora_inicio::text as hora_inicio, hora_fin::text as hora_fin, activo
         FROM tenant_base.empleados_disponibilidad_semanal
        WHERE empleado_id = $1
        ORDER BY dow ASC, hora_inicio ASC`,
      [employeeId],
    )

    return result.rows.map((row) => ({
      dow: row.dow,
      startTime: row.hora_inicio.slice(0, 5),
      endTime: row.hora_fin.slice(0, 5),
      active: row.activo,
    }))
  } catch (error) {
    if (isMissingTableError(error)) {
      return []
    }
    throw error
  }
}

export async function setWeeklyAvailability(options: {
  employeeId: number
  rules: WeeklyAvailabilityRule[]
}): Promise<void> {
  const { employeeId, rules } = options

  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    // Replace strategy: wipe and insert active rules.
    // Keeps behavior predictable and simple.
    try {
      await client.query(
        `DELETE FROM tenant_base.empleados_disponibilidad_semanal WHERE empleado_id = $1`,
        [employeeId],
      )
    } catch (error) {
      if (isMissingTableError(error)) {
        // Table not created yet.
        return
      }
      throw error
    }

    const activeRules = rules.filter((rule) => rule.active !== false)

    for (const rule of activeRules) {
      await client.query(
        `INSERT INTO tenant_base.empleados_disponibilidad_semanal
          (empleado_id, dow, hora_inicio, hora_fin, activo)
         VALUES ($1, $2, $3::time, $4::time, TRUE)`,
        [employeeId, rule.dow, rule.startTime, rule.endTime],
      )
    }

    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

export async function addAvailabilityException(options: {
  employeeId: number
  exception: AvailabilityException
}): Promise<void> {
  const { employeeId, exception } = options

  try {
    if (exception.type === "off") {
      await pool.query(
        `INSERT INTO tenant_base.empleados_disponibilidad_excepciones
          (empleado_id, fecha, tipo, hora_inicio, hora_fin, nota)
         VALUES ($1, $2::date, 'off', NULL, NULL, $3)
         ON CONFLICT DO NOTHING`,
        [employeeId, exception.date, exception.note ?? null],
      )
      return
    }

    await pool.query(
      `INSERT INTO tenant_base.empleados_disponibilidad_excepciones
        (empleado_id, fecha, tipo, hora_inicio, hora_fin, nota)
       VALUES ($1, $2::date, 'custom', $3::time, $4::time, $5)
       ON CONFLICT DO NOTHING`,
      [employeeId, exception.date, exception.startTime, exception.endTime, exception.note ?? null],
    )
  } catch (error) {
    if (isMissingTableError(error)) {
      return
    }
    throw error
  }
}

export async function listAvailabilityExceptions(options: {
  employeeId: number
  fromDate: string
  toDate: string
}): Promise<AvailabilityException[]> {
  const { employeeId, fromDate, toDate } = options

  try {
    const result = await pool.query<ExceptionRow>(
      `SELECT fecha::text as fecha, tipo, hora_inicio::text as hora_inicio, hora_fin::text as hora_fin
         FROM tenant_base.empleados_disponibilidad_excepciones
        WHERE empleado_id = $1
          AND fecha BETWEEN $2::date AND $3::date
        ORDER BY fecha ASC, tipo ASC, hora_inicio ASC NULLS FIRST`,
      [employeeId, fromDate, toDate],
    )

    return result.rows.map((row) => {
      if (row.tipo === "off") {
        return { type: "off", date: row.fecha }
      }

      return {
        type: "custom",
        date: row.fecha,
        startTime: (row.hora_inicio ?? "00:00").slice(0, 5),
        endTime: (row.hora_fin ?? "00:00").slice(0, 5),
      }
    })
  } catch (error) {
    if (isMissingTableError(error)) {
      return []
    }
    throw error
  }
}

async function hasMaterializedBlocks(employeeId: number, date: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1
         FROM tenant_base.horarios_empleados he
        WHERE he.empleado_id = $1
          AND DATE(he.fecha_hora_inicio) = $2::date
        LIMIT 1
     ) as exists`,
    [employeeId, date],
  )

  return result.rows[0]?.exists ?? false
}

export async function ensureMaterializedEmployeeAvailability(options: {
  employeeId: number
  fromDate: string
  days: number
}): Promise<void> {
  const { employeeId, fromDate, days } = options

  // If weekly tables don't exist, do nothing (keeps existing behavior).
  const weeklyRules = await getWeeklyAvailability(employeeId)
  if (weeklyRules.length === 0) {
    return
  }

  const toDate = addDays(fromDate, Math.max(0, days - 1))
  const exceptions = await listAvailabilityExceptions({ employeeId, fromDate, toDate })

  const exceptionsByDate = new Map<string, AvailabilityException[]>()
  for (const ex of exceptions) {
    const existing = exceptionsByDate.get(ex.date) ?? []
    existing.push(ex)
    exceptionsByDate.set(ex.date, existing)
  }

  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    for (let offset = 0; offset < days; offset += 1) {
      const date = addDays(fromDate, offset)

      // Build blocks for the day.
      const dayExceptions = exceptionsByDate.get(date) ?? []
      const custom = dayExceptions.filter((ex) => ex.type === "custom") as Extract<
        AvailabilityException,
        { type: "custom" }
      >[]
      const hasOff = dayExceptions.some((ex) => ex.type === "off")

      let blocks: Array<{ startTime: string; endTime: string }> = []

      if (custom.length > 0) {
        blocks = custom.map((ex) => ({ startTime: ex.startTime, endTime: ex.endTime }))
      } else if (hasOff) {
        blocks = []
      } else {
        const dow = toDow(date)
        blocks = weeklyRules
          .filter((rule) => (rule.active ?? true) && rule.dow === dow)
          .map((rule) => ({ startTime: rule.startTime, endTime: rule.endTime }))
      }

      // Replace any existing blocks for that date (idempotent and keeps queries simple).
      await client.query(
        `DELETE FROM tenant_base.horarios_empleados
          WHERE empleado_id = $1
            AND DATE(fecha_hora_inicio) = $2::date`,
        [employeeId, date],
      )

      for (const block of blocks) {
        await client.query(
          `INSERT INTO tenant_base.horarios_empleados (empleado_id, disponible, fecha_hora_inicio, fecha_hora_fin)
           VALUES ($1, TRUE, ($2::date + $3::time), ($2::date + $4::time))`,
          [employeeId, date, block.startTime, block.endTime],
        )
      }
    }

    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

export async function ensureMaterializedEmployeeDay(options: {
  employeeId: number
  date: string
}): Promise<void> {
  const { employeeId, date } = options

  try {
    const exists = await hasMaterializedBlocks(employeeId, date)
    if (exists) {
      return
    }

    await ensureMaterializedEmployeeAvailability({ employeeId, fromDate: date, days: 1 })
  } catch (error) {
    // Don't break booking flows if the new tables aren't deployed yet.
    if (isMissingTableError(error)) {
      return
    }

    throw error
  }
}
