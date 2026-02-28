/* eslint-disable no-console */

const fs = require("fs")
const path = require("path")
const { Pool } = require("pg")

const TARGET_DATE = "2026-07-04"
const TARGET_LOCAL_TIME = "09:00"
const TARGET_CLIENT_EMAIL = "brandond@brandond.com"
const TARGET_EMPLOYEE_EMAIL = "empleado@empleado.com"
const TARGET_SERVICE_NAME = "lineas"

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local")
  if (!fs.existsSync(envPath)) return

  const content = fs.readFileSync(envPath, "utf8")
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const eqIndex = line.indexOf("=")
    if (eqIndex === -1) continue

    const key = line.slice(0, eqIndex).trim()
    let value = line.slice(eqIndex + 1).trim()

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    if (!process.env[key]) process.env[key] = value
  }
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function toBogotaHHmm(isoString) {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return null

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

async function requestJson(baseUrl, endpoint, init = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(`${endpoint} -> HTTP ${response.status} | ${JSON.stringify(payload)}`)
  }

  return payload
}

async function main() {
  loadDotEnvLocal()

  const baseUrl = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  try {
    const peopleResult = await pool.query(
      `SELECT u.id AS user_id,
              u.correo,
              u.rol::text AS rol,
              c.id AS cliente_id,
              e.id AS empleado_id,
              e.user_id AS empleado_user_id
         FROM tenant_base.users u
         LEFT JOIN tenant_base.clientes c ON c.user_id = u.id
         LEFT JOIN tenant_base.empleados e ON e.user_id = u.id
        WHERE LOWER(u.correo) IN (LOWER($1), LOWER($2))
        ORDER BY u.id ASC`,
      [TARGET_CLIENT_EMAIL, TARGET_EMPLOYEE_EMAIL],
    )

    const clientRow = peopleResult.rows.find((row) => normalizeText(row.correo) === normalizeText(TARGET_CLIENT_EMAIL))
    const employeeRow = peopleResult.rows.find((row) => normalizeText(row.correo) === normalizeText(TARGET_EMPLOYEE_EMAIL))

    if (!clientRow?.user_id || !clientRow?.cliente_id) {
      throw new Error(`No se encontró cliente con correo ${TARGET_CLIENT_EMAIL}`)
    }

    if (!employeeRow?.empleado_id || !employeeRow?.empleado_user_id) {
      throw new Error(`No se encontró empleado con correo ${TARGET_EMPLOYEE_EMAIL}`)
    }

    const clientUserId = Number(clientRow.user_id)
    const employeeId = Number(employeeRow.empleado_id)
    const employeeUserId = Number(employeeRow.empleado_user_id)

    const servicesPayload = await requestJson(baseUrl, "/api/services", { method: "GET" })
    const services = Array.isArray(servicesPayload.services) ? servicesPayload.services : []

    const targetService = services.find((service) => normalizeText(service.name).includes(normalizeText(TARGET_SERVICE_NAME)))

    if (!targetService?.id) {
      throw new Error(`No se encontró servicio '${TARGET_SERVICE_NAME}' en /api/services`)
    }

    const serviceId = Number(targetService.id)

    const barbersPayload = await requestJson(baseUrl, `/api/services/${serviceId}/barbers`, { method: "GET" })
    const barbers = Array.isArray(barbersPayload.barbers) ? barbersPayload.barbers : []
    const employeeInService = barbers.some((barber) => Number(barber.id) === employeeId)

    if (!employeeInService) {
      throw new Error(
        `El empleado ${TARGET_EMPLOYEE_EMAIL} (id=${employeeId}) no está asignado al servicio '${targetService.name}'.`,
      )
    }

    await requestJson(baseUrl, `/api/availability/weekly?userId=${employeeUserId}`, {
      method: "PUT",
      body: JSON.stringify({
        employeeId,
        fromDate: TARGET_DATE,
        materializeDays: 7,
        rules: [
          { dow: 6, startTime: "09:00", endTime: "18:00", active: true },
        ],
      }),
    })

    await requestJson(baseUrl, `/api/availability/exceptions`, {
      method: "POST",
      body: JSON.stringify({
        employeeId,
        materializeDays: 7,
        exception: {
          type: "custom",
          date: TARGET_DATE,
          startTime: "09:00",
          endTime: "18:00",
          note: "Prueba específica de agendamiento",
        },
      }),
    }).catch(() => {})

    const availabilityPayload = await requestJson(
      baseUrl,
      `/api/availability?serviceId=${serviceId}&barberId=${employeeId}&date=${TARGET_DATE}`,
      { method: "GET" },
    )

    const slots = Array.isArray(availabilityPayload.slots) ? availabilityPayload.slots : []
    const targetSlot = slots.find((slot) => toBogotaHHmm(slot.start) === TARGET_LOCAL_TIME)

    if (!targetSlot?.start) {
      const sampled = slots.slice(0, 8).map((slot) => ({ start: slot.start, bogota: toBogotaHHmm(slot.start) }))
      throw new Error(`No hay slot exacto ${TARGET_LOCAL_TIME} para ${TARGET_DATE}. Slots detectados: ${JSON.stringify(sampled)}`)
    }

    let appointmentId = null
    let wompiCheckout = null

    try {
      const reservationPayload = await requestJson(baseUrl, "/api/reservations", {
        method: "POST",
        body: JSON.stringify({
          userId: clientUserId,
          serviceIds: [serviceId],
          barberId: employeeId,
          paymentMethod: "wompi",
          start: targetSlot.start,
        }),
      })

      appointmentId = reservationPayload?.appointment?.appointmentIds?.[0] ?? null
      wompiCheckout = reservationPayload?.payment?.wompiCheckout ?? null

      if (!appointmentId || !wompiCheckout?.reference || !wompiCheckout?.amountInCents) {
        throw new Error(`La reserva no devolvió datos de pago esperados: ${JSON.stringify(reservationPayload)}`)
      }

      await requestJson(baseUrl, "/api/payments/wompi/webhook", {
        method: "POST",
        body: JSON.stringify({
          event: "transaction.updated",
          data: {
            transaction: {
              reference: wompiCheckout.reference,
              status: "APPROVED",
              amount_in_cents: wompiCheckout.amountInCents,
              currency: wompiCheckout.currency || "COP",
              payment_method_type: "CARD",
            },
          },
        }),
      })
    } catch (error) {
      const message = String(error?.message ?? "")
      if (!message.includes("HTTP 409")) {
        throw error
      }

      const existingAdmin = await requestJson(baseUrl, "/api/admin/appointments?limit=1000", { method: "GET" })
      const existingList = Array.isArray(existingAdmin.appointments) ? existingAdmin.appointments : []

      const reused = existingList.find((item) => {
        const idMatches = Number(item?.employee?.id) === employeeId && Number(item?.client?.id) === Number(clientRow.cliente_id)
        const serviceMatches = Number(item?.service?.id) === serviceId
        const dateMatches = String(item?.startAt ?? "").startsWith(`${TARGET_DATE}T09:00:00`)
        return idMatches && serviceMatches && dateMatches
      })

      if (!reused?.id) {
        throw new Error(`Horario ocupado y no se encontró cita existente para reutilizar. Error original: ${message}`)
      }

      appointmentId = Number(reused.id)
      console.log(`Se reutiliza cita existente en el mismo horario: appointmentId=${appointmentId}`)
    }

    const clientUpcoming = await requestJson(
      baseUrl,
      `/api/appointments?userId=${clientUserId}&scope=upcoming&limit=200`,
      { method: "GET" },
    )
    const clientHistory = await requestJson(
      baseUrl,
      `/api/appointments?userId=${clientUserId}&scope=history&limit=200`,
      { method: "GET" },
    )

    const clientList = [
      ...(Array.isArray(clientUpcoming.appointments) ? clientUpcoming.appointments : []),
      ...(Array.isArray(clientHistory.appointments) ? clientHistory.appointments : []),
    ]
    const clientAppointment = clientList.find((item) => Number(item.id) === Number(appointmentId))

    const employeeUpcoming = await requestJson(
      baseUrl,
      `/api/barber/appointments?userId=${employeeUserId}&scope=upcoming`,
      { method: "GET" },
    )
    const employeeHistory = await requestJson(
      baseUrl,
      `/api/barber/appointments?userId=${employeeUserId}&scope=history`,
      { method: "GET" },
    )

    const employeeList = [
      ...(Array.isArray(employeeUpcoming.appointments) ? employeeUpcoming.appointments : []),
      ...(Array.isArray(employeeHistory.appointments) ? employeeHistory.appointments : []),
    ]
    const employeeAppointment = employeeList.find((item) => Number(item.id) === Number(appointmentId))

    const otherEmployeeResult = await pool.query(
      `SELECT user_id
         FROM tenant_base.empleados
        WHERE user_id <> $1
        ORDER BY id ASC
        LIMIT 1`,
      [employeeUserId],
    )

    let visibleForOtherEmployee = false
    const otherEmployeeUserId = otherEmployeeResult.rows[0]?.user_id
    if (otherEmployeeUserId) {
      const otherEmployeeAppointments = await requestJson(
        baseUrl,
        `/api/barber/appointments?userId=${Number(otherEmployeeUserId)}&scope=upcoming`,
        { method: "GET" },
      )

      const otherList = Array.isArray(otherEmployeeAppointments.appointments) ? otherEmployeeAppointments.appointments : []
      visibleForOtherEmployee = otherList.some((item) => Number(item.id) === Number(appointmentId))
    }

    const adminAppointments = await requestJson(baseUrl, "/api/admin/appointments?limit=500", { method: "GET" })
    const adminList = Array.isArray(adminAppointments.appointments) ? adminAppointments.appointments : []
    const adminAppointment = adminList.find((item) => Number(item.id) === Number(appointmentId))

    const adminPayments = await requestJson(baseUrl, "/api/admin/payments?limit=500", { method: "GET" })
    const adminPaymentsList = Array.isArray(adminPayments.payments) ? adminPayments.payments : []
    const adminPayment = adminPaymentsList.find((item) => Number(item.appointmentId) === Number(appointmentId))

    const checks = {
      correctEmployeeInAppointment: Number(adminAppointment?.employee?.id) === employeeId,
      paymentVisibleClient: normalizeText(clientAppointment?.payment?.status).includes("completo"),
      paymentVisibleEmployee: normalizeText(employeeAppointment?.paymentStatus).includes("completo"),
      paymentHiddenOtherEmployees: visibleForOtherEmployee === false,
      paymentVisibleAdminAppointments: normalizeText(adminAppointment?.paymentStatus).includes("completo"),
      paymentVisibleAdminPayments: normalizeText(adminPayment?.status).includes("completo"),
    }

    const allOk = Object.values(checks).every(Boolean)

    console.log("\n=== PRUEBA ESPECIFICA CLIENTE/EMPLEADO/ADMIN ===")
    console.log("Base URL:", baseUrl)
    console.log("Cliente:", TARGET_CLIENT_EMAIL, "userId=", clientUserId)
    console.log("Empleado:", TARGET_EMPLOYEE_EMAIL, "employeeId=", employeeId, "userId=", employeeUserId)
    console.log("Servicio:", targetService.name, "serviceId=", serviceId)
    console.log("Fecha/hora objetivo:", `${TARGET_DATE} ${TARGET_LOCAL_TIME}`)
    console.log("Slot usado:", targetSlot.start, "(Bogotá:", toBogotaHHmm(targetSlot.start), ")")
    console.log("Appointment ID:", appointmentId)
    console.log("\nChecks:", checks)
    console.log("\nCliente appointment:", clientAppointment)
    console.log("\nEmpleado appointment:", employeeAppointment)
    console.log("\nAdmin appointment:", adminAppointment)
    console.log("\nAdmin payment:", adminPayment)

    if (!allOk) {
      console.error("\nResultado: FALLÓ alguna validación de visibilidad/estado.")
      process.exit(2)
    }

    console.log("\nResultado: OK - el pago se refleja en cliente/admin y solo para el empleado objetivo.")
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error("Error en prueba específica:", error)
  process.exit(1)
})
