import { pool } from "@/lib/db"
import { resolveEmployeeIdForUser } from "@/lib/barber-dashboard"
import { tenantSql } from "@/lib/tenant"

export type BarberService = {
  id: number
  name: string
  price: number | null
  durationMin: number | null
}

type ServiceRow = {
  id: number
  nombre: string
  precio: string | number | null
  duracion_min: number | null
}

export async function getEmployeeServices(options: { userId: number; tenantSchema?: string | null }): Promise<BarberService[]> {
  const employeeId = await resolveEmployeeIdForUser(options.userId, options.tenantSchema)

  const result = await pool.query<ServiceRow>(
    tenantSql(`SELECT s.id,
            s.nombre,
            s.precio::text AS precio,
            s.duracion_min
       FROM tenant_base.empleados_servicios es
       JOIN tenant_base.servicios s ON s.id = es.servicio_id
      WHERE es.empleado_id = $1
      ORDER BY s.nombre ASC`, options.tenantSchema),
    [employeeId],
  )

  return result.rows.map((row) => ({
    id: row.id,
    name: row.nombre,
    price: row.precio != null && row.precio !== "" ? Number(row.precio) : null,
    durationMin: row.duracion_min,
  }))
}

export async function setEmployeeServices(options: { userId: number; serviceIds: number[]; tenantSchema?: string | null }): Promise<void> {
  const employeeId = await resolveEmployeeIdForUser(options.userId, options.tenantSchema)

  const serviceIds = Array.from(new Set(options.serviceIds.map((id) => Math.trunc(id)).filter((id) => id > 0)))

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    await client.query(tenantSql(`DELETE FROM tenant_base.empleados_servicios WHERE empleado_id = $1`, options.tenantSchema), [employeeId])

    if (serviceIds.length > 0) {
      const active = await client.query<{ id: number }>(
        tenantSql(`SELECT id
           FROM tenant_base.servicios
          WHERE estado = 'activo'
            AND id = ANY($1::int[])`, options.tenantSchema),
        [serviceIds],
      )

      const activeIds = active.rows.map((row) => row.id)

      for (const serviceId of activeIds) {
        await client.query(
          tenantSql(`INSERT INTO tenant_base.empleados_servicios (empleado_id, servicio_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`, options.tenantSchema),
          [employeeId, serviceId],
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
