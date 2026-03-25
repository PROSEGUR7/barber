import { pool } from "@/lib/db"
import { tenantSql } from "@/lib/tenant"

export type AdminGiftCardSummary = {
  id: number
  code: string
  clientId: number | null
  clientName: string | null
  balance: number
  initialAmount: number
  currency: string
  status: string
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  lastMovementAt: string | null
}

export type AdminGiftCardMovementSummary = {
  id: number
  giftCardId: number
  giftCardCode: string
  movementType: "issue" | "topup" | "redeem" | "adjustment"
  amount: number
  reference: string | null
  note: string | null
  createdBy: string | null
  createdAt: string
}

type GiftCardRow = {
  id: number
  code: string
  client_id: number | null
  client_name: string | null
  balance: string
  initial_amount: string
  currency: string
  status: string
  expires_at: Date | null
  created_at: Date
  updated_at: Date
  last_movement_at: Date | null
}

type GiftCardMovementRow = {
  id: number
  gift_card_id: number
  gift_card_code: string
  movement_type: "issue" | "topup" | "redeem" | "adjustment"
  amount: string
  reference: string | null
  note: string | null
  created_by: string | null
  created_at: Date
}

export class GiftCardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GiftCardError"
  }
}

export class GiftCardNotFoundError extends GiftCardError {
  constructor() {
    super("Tarjeta regalo no encontrada.")
    this.name = "GiftCardNotFoundError"
  }
}

export class GiftCardInactiveError extends GiftCardError {
  constructor() {
    super("La tarjeta regalo no está activa.")
    this.name = "GiftCardInactiveError"
  }
}

export class GiftCardInsufficientBalanceError extends GiftCardError {
  constructor() {
    super("Saldo insuficiente en la tarjeta regalo.")
    this.name = "GiftCardInsufficientBalanceError"
  }
}

async function ensureGiftCardsSchema(tenantSchema?: string | null): Promise<void> {
  const schemaSql = tenantSql(
    `
      CREATE TABLE IF NOT EXISTS tenant_base.gift_cards (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        client_id INTEGER NULL REFERENCES tenant_base.clientes(id) ON DELETE SET NULL,
        initial_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
        balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'COP',
        status TEXT NOT NULL DEFAULT 'active',
        expires_at TIMESTAMPTZ NULL,
        notes TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_gift_cards_client_id ON tenant_base.gift_cards(client_id);
      CREATE INDEX IF NOT EXISTS idx_gift_cards_status ON tenant_base.gift_cards(status);

      CREATE TABLE IF NOT EXISTS tenant_base.gift_card_movements (
        id SERIAL PRIMARY KEY,
        gift_card_id INTEGER NOT NULL REFERENCES tenant_base.gift_cards(id) ON DELETE CASCADE,
        movement_type TEXT NOT NULL,
        amount NUMERIC(12, 2) NOT NULL,
        reference TEXT NULL,
        note TEXT NULL,
        created_by TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_gift_card_movements_card_id ON tenant_base.gift_card_movements(gift_card_id);
      CREATE INDEX IF NOT EXISTS idx_gift_card_movements_created_at ON tenant_base.gift_card_movements(created_at DESC);
    `,
    tenantSchema,
  )

  await pool.query(schemaSql)
}

function mapGiftCardRow(row: GiftCardRow): AdminGiftCardSummary {
  return {
    id: row.id,
    code: row.code,
    clientId: row.client_id,
    clientName: row.client_name,
    balance: Number(row.balance),
    initialAmount: Number(row.initial_amount),
    currency: row.currency,
    status: row.status,
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    lastMovementAt: row.last_movement_at ? row.last_movement_at.toISOString() : null,
  }
}

function mapGiftCardMovementRow(row: GiftCardMovementRow): AdminGiftCardMovementSummary {
  return {
    id: row.id,
    giftCardId: row.gift_card_id,
    giftCardCode: row.gift_card_code,
    movementType: row.movement_type,
    amount: Number(row.amount),
    reference: row.reference,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
  }
}

async function generateGiftCardCode(tenantSchema?: string | null): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase()
    const code = `GC-${new Date().getFullYear()}-${randomPart}`
    const existsQuery = tenantSql(`SELECT 1 FROM tenant_base.gift_cards WHERE code = $1 LIMIT 1`, tenantSchema)
    const exists = await pool.query(existsQuery, [code])
    if (exists.rowCount === 0) {
      return code
    }
  }

  throw new GiftCardError("No fue posible generar un código de tarjeta único.")
}

export async function listGiftCards(options: {
  tenantSchema?: string | null
  search?: string | null
}): Promise<AdminGiftCardSummary[]> {
  await ensureGiftCardsSchema(options.tenantSchema)

  const params: unknown[] = []
  const conditions: string[] = []

  if (options.search && options.search.trim().length > 0) {
    params.push(`%${options.search.trim().toLowerCase()}%`)
    conditions.push(`(LOWER(gc.code) LIKE $${params.length} OR LOWER(COALESCE(c.nombre, '')) LIKE $${params.length})`)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  const query = tenantSql(
    `
      SELECT
        gc.id,
        gc.code,
        gc.client_id,
        c.nombre AS client_name,
        gc.balance,
        gc.initial_amount,
        gc.currency,
        gc.status,
        gc.expires_at,
        gc.created_at,
        gc.updated_at,
        MAX(gcm.created_at) AS last_movement_at
      FROM tenant_base.gift_cards gc
      LEFT JOIN tenant_base.clientes c ON c.id = gc.client_id
      LEFT JOIN tenant_base.gift_card_movements gcm ON gcm.gift_card_id = gc.id
      ${where}
      GROUP BY gc.id, c.nombre
      ORDER BY gc.updated_at DESC, gc.id DESC
    `,
    options.tenantSchema,
  )

  const result = await pool.query<GiftCardRow>(query, params)
  return result.rows.map(mapGiftCardRow)
}

export async function listGiftCardMovements(options: {
  tenantSchema?: string | null
  limit?: number
}): Promise<AdminGiftCardMovementSummary[]> {
  await ensureGiftCardsSchema(options.tenantSchema)

  const limit = typeof options.limit === "number" && Number.isFinite(options.limit) && options.limit > 0 ? Math.trunc(options.limit) : 50

  const query = tenantSql(
    `
      SELECT
        gcm.id,
        gcm.gift_card_id,
        gc.code AS gift_card_code,
        gcm.movement_type,
        gcm.amount,
        gcm.reference,
        gcm.note,
        gcm.created_by,
        gcm.created_at
      FROM tenant_base.gift_card_movements gcm
      INNER JOIN tenant_base.gift_cards gc ON gc.id = gcm.gift_card_id
      ORDER BY gcm.created_at DESC, gcm.id DESC
      LIMIT $1
    `,
    options.tenantSchema,
  )

  const result = await pool.query<GiftCardMovementRow>(query, [limit])
  return result.rows.map(mapGiftCardMovementRow)
}

export async function createGiftCard(input: {
  tenantSchema?: string | null
  clientId?: number | null
  amount: number
  code?: string | null
  expiresAt?: string | null
  note?: string | null
  createdBy?: string | null
}): Promise<{ card: AdminGiftCardSummary; movement: AdminGiftCardMovementSummary | null }> {
  await ensureGiftCardsSchema(input.tenantSchema)

  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    const requestedCode = input.code?.trim().toUpperCase() ?? ""
    const code = requestedCode.length > 0 ? requestedCode : await generateGiftCardCode(input.tenantSchema)

    const amount = Number.isFinite(input.amount) ? Math.max(0, input.amount) : 0

    if (requestedCode.length > 0) {
      const existsQuery = tenantSql(`SELECT 1 FROM tenant_base.gift_cards WHERE code = $1 LIMIT 1`, input.tenantSchema)
      const existsResult = await client.query(existsQuery, [requestedCode])
      if (existsResult.rowCount > 0) {
        throw new GiftCardError("Ya existe una tarjeta con ese código.")
      }
    }

    const insertCardQuery = tenantSql(
      `
        INSERT INTO tenant_base.gift_cards (
          code,
          client_id,
          initial_amount,
          balance,
          currency,
          status,
          expires_at,
          notes,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $3, 'COP', 'active', $4, $5, NOW(), NOW())
        RETURNING id
      `,
      input.tenantSchema,
    )

    const insertedCard = await client.query<{ id: number }>(insertCardQuery, [
      code,
      input.clientId ?? null,
      amount,
      input.expiresAt ? new Date(input.expiresAt) : null,
      input.note?.trim() || null,
    ])

    const giftCardId = insertedCard.rows[0]?.id
    let movement: AdminGiftCardMovementSummary | null = null

    if (amount > 0) {
      const insertMovementQuery = tenantSql(
        `
          INSERT INTO tenant_base.gift_card_movements (
            gift_card_id,
            movement_type,
            amount,
            reference,
            note,
            created_by,
            created_at
          )
          VALUES ($1, 'issue', $2, $3, $4, $5, NOW())
          RETURNING id, gift_card_id, movement_type, amount, reference, note, created_by, created_at
        `,
        input.tenantSchema,
      )

      const reference = `EMISION-${giftCardId}`
      const insertedMovement = await client.query<
        Omit<GiftCardMovementRow, "gift_card_code">
      >(insertMovementQuery, [giftCardId, amount, reference, input.note?.trim() || null, input.createdBy ?? null])

      const movementRow = insertedMovement.rows[0]
      movement = {
        id: movementRow.id,
        giftCardId: movementRow.gift_card_id,
        giftCardCode: code,
        movementType: movementRow.movement_type,
        amount: Number(movementRow.amount),
        reference: movementRow.reference,
        note: movementRow.note,
        createdBy: movementRow.created_by,
        createdAt: movementRow.created_at.toISOString(),
      }
    }

    await client.query("COMMIT")

    const cards = await listGiftCards({ tenantSchema: input.tenantSchema, search: code })
    const card = cards.find((item) => item.code === code)

    if (!card) {
      throw new GiftCardError("No se pudo cargar la tarjeta creada.")
    }

    return { card, movement }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

export async function applyGiftCardMovement(input: {
  tenantSchema?: string | null
  giftCardId: number
  action: "topup" | "redeem"
  amount: number
  reference?: string | null
  note?: string | null
  createdBy?: string | null
}): Promise<{ card: AdminGiftCardSummary; movement: AdminGiftCardMovementSummary }> {
  await ensureGiftCardsSchema(input.tenantSchema)

  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    const amount = Number.isFinite(input.amount) ? Math.abs(input.amount) : 0
    if (amount <= 0) {
      throw new GiftCardError("El monto debe ser mayor a cero.")
    }

    const lockQuery = tenantSql(
      `
        SELECT id, code, balance, status, expires_at
        FROM tenant_base.gift_cards
        WHERE id = $1
        FOR UPDATE
      `,
      input.tenantSchema,
    )

    const cardResult = await client.query<{
      id: number
      code: string
      balance: string
      status: string
      expires_at: Date | null
    }>(lockQuery, [input.giftCardId])

    const lockedCard = cardResult.rows[0]
    if (!lockedCard) {
      throw new GiftCardNotFoundError()
    }

    const status = (lockedCard.status ?? "").trim().toLowerCase()
    if (status !== "active") {
      throw new GiftCardInactiveError()
    }

    if (lockedCard.expires_at && lockedCard.expires_at.getTime() < Date.now()) {
      throw new GiftCardInactiveError()
    }

    const currentBalance = Number(lockedCard.balance)
    let nextBalance = currentBalance

    if (input.action === "topup") {
      nextBalance = currentBalance + amount
    } else {
      if (currentBalance < amount) {
        throw new GiftCardInsufficientBalanceError()
      }
      nextBalance = currentBalance - amount
    }

    const updateCardQuery = tenantSql(
      `
        UPDATE tenant_base.gift_cards
        SET balance = $2, updated_at = NOW()
        WHERE id = $1
      `,
      input.tenantSchema,
    )

    await client.query(updateCardQuery, [input.giftCardId, nextBalance])

    const insertMovementQuery = tenantSql(
      `
        INSERT INTO tenant_base.gift_card_movements (
          gift_card_id,
          movement_type,
          amount,
          reference,
          note,
          created_by,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id, gift_card_id, movement_type, amount, reference, note, created_by, created_at
      `,
      input.tenantSchema,
    )

    const movementResult = await client.query<Omit<GiftCardMovementRow, "gift_card_code">>(insertMovementQuery, [
      input.giftCardId,
      input.action,
      amount,
      input.reference?.trim() || null,
      input.note?.trim() || null,
      input.createdBy ?? null,
    ])

    await client.query("COMMIT")

    const cards = await listGiftCards({ tenantSchema: input.tenantSchema })
    const card = cards.find((item) => item.id === input.giftCardId)

    if (!card) {
      throw new GiftCardNotFoundError()
    }

    const movementRow = movementResult.rows[0]
    const movement: AdminGiftCardMovementSummary = {
      id: movementRow.id,
      giftCardId: movementRow.gift_card_id,
      giftCardCode: lockedCard.code,
      movementType: movementRow.movement_type,
      amount: Number(movementRow.amount),
      reference: movementRow.reference,
      note: movementRow.note,
      createdBy: movementRow.created_by,
      createdAt: movementRow.created_at.toISOString(),
    }

    return { card, movement }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}
