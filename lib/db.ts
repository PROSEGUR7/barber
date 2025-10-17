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

  // In development we may be connecting to databases (eg. Railway, Railway proxy,
  // or other dev endpoints) that present self-signed certificates. For a
  // smooth developer experience only, disable Node's TLS certificate
  // verification when not in production. This is intentional and restricted
  // to non-production runs. If you need to explicitly disable verification in
  // another environment, set PGSSLMODE=no-verify.
  if (process.env.NODE_ENV !== "production" || process.env.PGSSLMODE === "no-verify") {
    // This tells Node's TLS layer to skip certificate chain verification.
    // NOTE: do NOT enable this in production.
    // eslint-disable-next-line no-process-env
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
    console.warn(
      "lib/db: running with NODE_TLS_REJECT_UNAUTHORIZED=0 — only use this in development",
    )
  }

  return new Pool({
    connectionString,
    // Provide an explicit ssl config so the pg client will use TLS but not
    // reject self-signed certs in development.
    ssl: {
      rejectUnauthorized: false,
    },
  })
}

export const pool = global.pgPool ?? createPool()

if (process.env.NODE_ENV !== "production") {
  global.pgPool = pool
}
