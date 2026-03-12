require("dotenv/config")
const { registerEmployee } = require("../lib/admin")

async function main() {
  const tenant = process.argv[2]
  if (!tenant) {
    throw new Error("TENANT_REQUIRED")
  }

  const now = Date.now()
  try {
    const employee = await registerEmployee({
      name: "Debug Employee",
      email: `debug.employee.${now}@example.com`,
      password: "debugpass123",
      phone: "3000000000",
      tenantSchema: tenant,
    })
    console.log("created:", employee)
  } catch (error) {
    console.error("registerEmployee failed:", {
      message: error?.message,
      name: error?.name,
      code: error?.code,
      detail: error?.detail,
      schema: error?.schema,
      table: error?.table,
      column: error?.column,
      constraint: error?.constraint,
    })
  }
}

main().catch((error) => {
  console.error("fatal:", error)
  process.exit(1)
})
