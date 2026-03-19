import { pool } from "@/lib/db"
import { tenantSql } from "@/lib/tenant"

const ensuredReviewSchemas = new Set<string>()

type ReviewRow = {
  id: number
  rating: number
  comment: string | null
  created_at: Date
  updated_at: Date
  client_name: string | null
}

type SummaryRow = {
  rating_average: string | null
  rating_count: string
}

export type BarberReviewSummary = {
  ratingAverage: number | null
  ratingCount: number
}

export type BarberReview = {
  id: number
  rating: number
  comment: string | null
  clientName: string
  createdAt: string
  updatedAt: string
}

async function ensureReviewsSchema(tenantSchema?: string | null): Promise<void> {
  const tenantKey = (tenantSchema ?? "tenant_base").trim().toLowerCase() || "tenant_base"
  if (ensuredReviewSchemas.has(tenantKey)) {
    return
  }

  await pool.query(
    tenantSql(
      `CREATE TABLE IF NOT EXISTS tenant_base.empleados_resenas (
        id BIGSERIAL PRIMARY KEY,
        cliente_id INTEGER NOT NULL REFERENCES tenant_base.clientes(id) ON DELETE CASCADE,
        empleado_id INTEGER NOT NULL REFERENCES tenant_base.empleados(id) ON DELETE CASCADE,
        rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT empleados_resenas_unique_cliente_empleado UNIQUE (cliente_id, empleado_id)
      );`,
      tenantSchema,
    ),
  )

  await pool.query(
    tenantSql(
      `CREATE INDEX IF NOT EXISTS empleados_resenas_empleado_idx
         ON tenant_base.empleados_resenas (empleado_id, updated_at DESC);`,
      tenantSchema,
    ),
  )

  // Keep only the latest review per (cliente_id, empleado_id) so we can enforce one-review-per-client.
  await pool.query(
    tenantSql(
      `WITH ranked AS (
         SELECT
           id,
           ROW_NUMBER() OVER (
             PARTITION BY cliente_id, empleado_id
             ORDER BY updated_at DESC, created_at DESC, id DESC
           ) AS rn
         FROM tenant_base.empleados_resenas
       )
       DELETE FROM tenant_base.empleados_resenas r
       USING ranked x
       WHERE r.id = x.id
         AND x.rn > 1;`,
      tenantSchema,
    ),
  )

  await pool.query(
    tenantSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS empleados_resenas_unique_cliente_empleado_idx
         ON tenant_base.empleados_resenas (cliente_id, empleado_id);`,
      tenantSchema,
    ),
  )

  ensuredReviewSchemas.add(tenantKey)
}

export async function getBarberRatingSummaryMap(options: {
  barberIds: number[]
  tenantSchema?: string | null
}): Promise<Map<number, BarberReviewSummary>> {
  const { barberIds, tenantSchema } = options

  if (barberIds.length === 0) {
    return new Map()
  }

  await ensureReviewsSchema(tenantSchema)

  const result = await pool.query<{
    empleado_id: number
    rating_average: string | null
    rating_count: string
  }>(
    tenantSql(
      `SELECT r.empleado_id,
              ROUND(AVG(r.rating)::numeric, 2)::text AS rating_average,
              COUNT(*)::text AS rating_count
         FROM tenant_base.empleados_resenas r
        WHERE r.empleado_id = ANY($1::int[])
        GROUP BY r.empleado_id`,
      tenantSchema,
    ),
    [barberIds],
  )

  const map = new Map<number, BarberReviewSummary>()
  for (const row of result.rows) {
    map.set(row.empleado_id, {
      ratingAverage: row.rating_average == null ? null : Number(row.rating_average),
      ratingCount: Number(row.rating_count),
    })
  }

  return map
}

export async function listBarberReviews(options: {
  barberId: number
  limit?: number
  tenantSchema?: string | null
}): Promise<{ summary: BarberReviewSummary; reviews: BarberReview[] }> {
  const { barberId, limit = 10, tenantSchema } = options

  await ensureReviewsSchema(tenantSchema)

  const [summaryResult, reviewsResult] = await Promise.all([
    pool.query<SummaryRow>(
      tenantSql(
        `SELECT ROUND(AVG(rating)::numeric, 2)::text AS rating_average,
                COUNT(*)::text AS rating_count
           FROM tenant_base.empleados_resenas
          WHERE empleado_id = $1`,
        tenantSchema,
      ),
      [barberId],
    ),
    pool.query<ReviewRow>(
      tenantSql(
        `SELECT r.id,
                r.rating,
                r.comment,
                r.created_at,
                r.updated_at,
                c.nombre AS client_name
           FROM tenant_base.empleados_resenas r
           JOIN tenant_base.clientes c ON c.id = r.cliente_id
          WHERE r.empleado_id = $1
          ORDER BY r.updated_at DESC
          LIMIT $2`,
        tenantSchema,
      ),
      [barberId, limit],
    ),
  ])

  const summaryRow = summaryResult.rows[0]
  const summary: BarberReviewSummary = {
    ratingAverage: summaryRow?.rating_average == null ? null : Number(summaryRow.rating_average),
    ratingCount: Number(summaryRow?.rating_count ?? 0),
  }

  const reviews: BarberReview[] = reviewsResult.rows.map((row) => ({
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    clientName: row.client_name?.trim() || "Cliente",
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }))

  return { summary, reviews }
}

export async function upsertBarberReview(options: {
  userId: number
  barberId: number
  rating: number
  comment?: string | null
  tenantSchema?: string | null
}): Promise<{ summary: BarberReviewSummary; review: BarberReview }> {
  const { userId, barberId, rating, comment, tenantSchema } = options

  await ensureReviewsSchema(tenantSchema)

  const clientResult = await pool.query<{ id: number; nombre: string | null }>(
    tenantSql(
      `SELECT id, nombre
         FROM tenant_base.clientes
        WHERE user_id = $1
        LIMIT 1`,
      tenantSchema,
    ),
    [userId],
  )

  const client = clientResult.rows[0]
  if (!client) {
    const error = new Error("CLIENT_PROFILE_NOT_FOUND")
    ;(error as { code?: string }).code = "CLIENT_PROFILE_NOT_FOUND"
    throw error
  }

  const canReviewResult = await pool.query<{ can_review: boolean }>(
    tenantSql(
      `SELECT EXISTS(
              SELECT 1
                FROM tenant_base.agendamientos a
               WHERE a.cliente_id = $1
                 AND a.empleado_id = $2
                 AND a.estado::text = 'completada'
                 AND a.fecha_cita <= now()
            ) AS can_review`,
      tenantSchema,
    ),
    [client.id, barberId],
  )

  if (!canReviewResult.rows[0]?.can_review) {
    const error = new Error("REVIEW_REQUIRES_COMPLETED_APPOINTMENT")
    ;(error as { code?: string }).code = "REVIEW_REQUIRES_COMPLETED_APPOINTMENT"
    throw error
  }

  const trimmedComment = comment?.trim() || null

  const upsertResult = await pool.query<ReviewRow>(
    tenantSql(
      `INSERT INTO tenant_base.empleados_resenas (cliente_id, empleado_id, rating, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (cliente_id, empleado_id)
       DO UPDATE
           SET rating = EXCLUDED.rating,
               comment = EXCLUDED.comment,
               updated_at = now()
       RETURNING id,
                 rating,
                 comment,
                 created_at,
                 updated_at,
                 $5::text AS client_name`,
      tenantSchema,
    ),
    [client.id, barberId, rating, trimmedComment, client.nombre?.trim() || "Cliente"],
  )

  const savedReview = upsertResult.rows[0]

  const summaryResult = await pool.query<SummaryRow>(
    tenantSql(
      `SELECT ROUND(AVG(rating)::numeric, 2)::text AS rating_average,
              COUNT(*)::text AS rating_count
         FROM tenant_base.empleados_resenas
        WHERE empleado_id = $1`,
      tenantSchema,
    ),
    [barberId],
  )

  const summaryRow = summaryResult.rows[0]
  const summary: BarberReviewSummary = {
    ratingAverage: summaryRow?.rating_average == null ? null : Number(summaryRow.rating_average),
    ratingCount: Number(summaryRow?.rating_count ?? 0),
  }

  return {
    summary,
    review: {
      id: savedReview.id,
      rating: savedReview.rating,
      comment: savedReview.comment,
      clientName: savedReview.client_name?.trim() || "Cliente",
      createdAt: savedReview.created_at.toISOString(),
      updatedAt: savedReview.updated_at.toISOString(),
    },
  }
}
