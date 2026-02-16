import { Pool } from "pg"

declare global {
  // eslint-disable-next-line no-var
  var pgPool: Pool | undefined
}

function createPool() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL env var is not set")
  }

  return new Pool({
    connectionString,
    // Use TLS for PostgreSQL. In development we allow self-signed certificates
    // only for this DB client without changing global Node TLS behavior.
    ssl: {
      rejectUnauthorized: false,
    },
  })
}

export const pool = global.pgPool ?? createPool()

if (process.env.NODE_ENV !== "production") {
  global.pgPool = pool
}
