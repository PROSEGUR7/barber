const fs = require("fs")
const path = require("path")
const { Pool } = require("pg")

async function main() {
  const envPath = path.resolve(__dirname, "..", ".env.local")
  const envContent = fs.readFileSync(envPath, "utf8")
  for (const line of envContent.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue
    const [key, ...rest] = line.split("=")
    if (!key || rest.length === 0) continue
    const value = rest.join("=")
    if (!process.env[key]) {
      process.env[key] = value
    }
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  try {
    const result = await pool.query(
      `SELECT pg_type.typname, pg_namespace.nspname, pg_enum.enumlabel
         FROM pg_type
         JOIN pg_namespace ON pg_type.typnamespace = pg_namespace.oid
         LEFT JOIN pg_enum ON pg_enum.enumtypid = pg_type.oid
        WHERE pg_type.typtype = 'e'
          AND pg_type.typname LIKE '%role%'
        ORDER BY pg_type.typname, pg_enum.enumsortorder`,
    )
    console.log(result.rows)
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
