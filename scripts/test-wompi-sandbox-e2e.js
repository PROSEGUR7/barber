/* eslint-disable no-console */

const { createHash } = require("crypto")
const fs = require("fs")
const path = require("path")
const { Pool } = require("pg")

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

async function getWorkingBaseUrl() {
  const candidates = [
    process.env.APP_BASE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    "http://localhost:3000",
    "http://localhost:3001",
  ].filter(Boolean)

  for (const baseUrl of candidates) {
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/services`, {
        method: "GET",
        cache: "no-store",
      })
      if (response.ok) {
        return baseUrl.replace(/\/$/, "")
      }
    } catch {
      // try next
    }
  }

  throw new Error("No se encontró servidor local activo en /api/services (puertos 3000/3001)")
}

async function requestJson(baseUrl, endpoint, init) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init && init.headers ? init.headers : {}),
    },
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`
    throw new Error(`${endpoint} -> ${message} | payload=${JSON.stringify(payload)}`)
  }

  return payload
}

function formatDateUTC(date) {
  return date.toISOString().slice(0, 10)
}

async function findSlot(baseUrl, serviceId, barberId) {
  for (let offset = 0; offset < 21; offset += 1) {
    const day = new Date(Date.now() + offset * 24 * 60 * 60 * 1000)
    const date = formatDateUTC(day)

    const payload = await requestJson(
      baseUrl,
      `/api/availability?serviceId=${serviceId}&barberId=${barberId}&date=${date}`,
      { method: "GET" },
    )

    const slots = Array.isArray(payload.slots) ? payload.slots : []
    if (slots.length > 0) {
      return slots[0]
    }
  }

  throw new Error("No se encontró disponibilidad en los próximos 21 días")
}

async function reserveWithRetry(baseUrl, userId, serviceId, barberId) {
  let lastError = null

  for (let offset = 0; offset < 21; offset += 1) {
    const day = new Date(Date.now() + offset * 24 * 60 * 60 * 1000)
    const date = formatDateUTC(day)

    let slots = []
    try {
      const response = await fetch(
        `${baseUrl}/api/availability?serviceId=${serviceId}&barberId=${barberId}&date=${date}`,
        {
          method: "GET",
          cache: "no-store",
        },
      )

      if (!response.ok) {
        continue
      }

      const payload = await response.json().catch(() => ({}))
      slots = Array.isArray(payload.slots) ? payload.slots : []
    } catch {
      continue
    }

    for (const slot of slots) {
      try {
        return await createReservation(baseUrl, userId, serviceId, barberId, slot.start)
      } catch (error) {
        lastError = error
      }
    }
  }

  if (lastError) {
    throw lastError
  }

  throw new Error("No se pudo crear reserva con los slots disponibles")
}

async function createReservation(baseUrl, userId, serviceId, barberId, start) {
  const payload = await requestJson(baseUrl, "/api/reservations", {
    method: "POST",
    body: JSON.stringify({
      userId,
      serviceIds: [serviceId],
      barberId,
      paymentMethod: "wompi",
      start,
    }),
  })

  const appointmentId = payload?.appointment?.appointmentIds?.[0]
  const wompiCheckout = payload?.payment?.wompiCheckout

  if (!appointmentId || !wompiCheckout?.reference) {
    throw new Error("Reserva creada sin datos de checkout Wompi")
  }

  return {
    appointmentId,
    reference: wompiCheckout.reference,
    amountInCents: wompiCheckout.amountInCents,
  }
}

async function sendWebhook(baseUrl, { reference, amountInCents, status, methodType }) {
  const eventsSecret = (process.env.WOMPI_EVENTS_SECRET || "").trim()
  if (!eventsSecret) {
    throw new Error("Falta WOMPI_EVENTS_SECRET para firmar webhook de prueba")
  }

  const timestamp = String(Date.now())
  const transaction = {
    reference,
    status,
    amount_in_cents: amountInCents,
    currency: "COP",
    payment_method_type: methodType,
  }
  const properties = [
    "transaction.reference",
    "transaction.status",
    "transaction.amount_in_cents",
    "transaction.currency",
  ]
  const signatureBase = `${transaction.reference}${transaction.status}${transaction.amount_in_cents}${transaction.currency}${timestamp}${eventsSecret}`
  const checksum = createHash("sha256").update(signatureBase).digest("hex")

  return requestJson(baseUrl, "/api/payments/wompi/webhook", {
    method: "POST",
    body: JSON.stringify({
      event: "transaction.updated",
      timestamp,
      signature: {
        checksum,
        properties,
        timestamp,
      },
      data: {
        transaction,
      },
    }),
  })
}

async function getAdminPaymentByAppointment(baseUrl, appointmentId) {
  const payload = await requestJson(baseUrl, "/api/admin/payments?limit=500", { method: "GET" })
  const list = Array.isArray(payload.payments) ? payload.payments : []
  return list.find((item) => item.appointmentId === appointmentId) ?? null
}

async function getClientAppointment(baseUrl, userId, appointmentId) {
  const payload = await requestJson(
    baseUrl,
    `/api/appointments?userId=${userId}&scope=upcoming&status=all&limit=200`,
    { method: "GET" },
  )
  const list = Array.isArray(payload.appointments) ? payload.appointments : []
  return list.find((item) => item.id === appointmentId) ?? null
}

async function getBarberAppointment(baseUrl, barberUserId, appointmentId) {
  const payload = await requestJson(
    baseUrl,
    `/api/barber/appointments?userId=${barberUserId}&scope=upcoming`,
    { method: "GET" },
  )
  const list = Array.isArray(payload.appointments) ? payload.appointments : []
  return list.find((item) => item.id === appointmentId) ?? null
}

async function main() {
  loadDotEnvLocal()

  const baseUrl = await getWorkingBaseUrl()

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  try {
    const userResult = await pool.query(
      `SELECT u.id AS user_id
         FROM tenant_base.users u
         INNER JOIN tenant_base.clientes c ON c.user_id = u.id
        WHERE u.rol::text = 'cliente'
        ORDER BY u.id ASC
        LIMIT 1`,
    )

    const clientUserId = userResult.rows[0]?.user_id
    if (!clientUserId) {
      throw new Error("No se encontró usuario cliente para la prueba")
    }

    const servicesPayload = await requestJson(baseUrl, "/api/services", { method: "GET" })
    const services = Array.isArray(servicesPayload.services) ? servicesPayload.services : []
    const service = services[0]
    if (!service?.id) {
      throw new Error("No hay servicios disponibles")
    }

    const barbersPayload = await requestJson(baseUrl, `/api/services/${service.id}/barbers`, { method: "GET" })
    const barbers = Array.isArray(barbersPayload.barbers) ? barbersPayload.barbers : []
    const barber = barbers[0]
    if (!barber?.id) {
      throw new Error("No hay empleados disponibles para el servicio")
    }

    const barberUserResult = await pool.query(
      `SELECT user_id
         FROM tenant_base.empleados
        WHERE id = $1
        LIMIT 1`,
      [barber.id],
    )

    const barberUserId = barberUserResult.rows[0]?.user_id
    if (!barberUserId) {
      throw new Error("No se encontró user_id del empleado")
    }

    const approvedReservation = await reserveWithRetry(baseUrl, clientUserId, service.id, barber.id)

    const preAdminApproved = await getAdminPaymentByAppointment(baseUrl, approvedReservation.appointmentId)

    await sendWebhook(baseUrl, {
      reference: approvedReservation.reference,
      amountInCents: approvedReservation.amountInCents,
      status: "APPROVED",
      methodType: "CARD",
    })

    const adminApproved = await getAdminPaymentByAppointment(baseUrl, approvedReservation.appointmentId)
    const clientApproved = await getClientAppointment(baseUrl, clientUserId, approvedReservation.appointmentId)
    const barberApproved = await getBarberAppointment(baseUrl, barberUserId, approvedReservation.appointmentId)

    const declinedReservation = await reserveWithRetry(baseUrl, clientUserId, service.id, barber.id)

    await sendWebhook(baseUrl, {
      reference: declinedReservation.reference,
      amountInCents: declinedReservation.amountInCents,
      status: "DECLINED",
      methodType: "NEQUI",
    })

    const adminDeclined = await getAdminPaymentByAppointment(baseUrl, declinedReservation.appointmentId)
    const clientDeclined = await getClientAppointment(baseUrl, clientUserId, declinedReservation.appointmentId)
    const barberDeclined = await getBarberAppointment(baseUrl, barberUserId, declinedReservation.appointmentId)

    const errorReservation = await reserveWithRetry(baseUrl, clientUserId, service.id, barber.id)

    await sendWebhook(baseUrl, {
      reference: errorReservation.reference,
      amountInCents: errorReservation.amountInCents,
      status: "ERROR",
      methodType: "PSE",
    })

    const adminError = await getAdminPaymentByAppointment(baseUrl, errorReservation.appointmentId)
    const clientError = await getClientAppointment(baseUrl, clientUserId, errorReservation.appointmentId)
    const barberError = await getBarberAppointment(baseUrl, barberUserId, errorReservation.appointmentId)

    const wompiDbRowsResult = await pool.query(
      `SELECT agendamiento_id,
              proveedor_pago,
              wompi_transaction_id,
              wompi_reference,
              wompi_currency,
              wompi_status,
              wompi_event_name,
              (wompi_payload IS NOT NULL) AS has_payload
         FROM tenant_base.pagos
        WHERE agendamiento_id = ANY($1::int[])
        ORDER BY agendamiento_id ASC`,
      [[approvedReservation.appointmentId, declinedReservation.appointmentId, errorReservation.appointmentId]],
    )

    console.log("\n=== TEST WOMPI SANDBOX E2E (SIMULADO VIA WEBHOOK) ===")
    console.log("Base URL:", baseUrl)
    console.log("Cliente userId:", clientUserId)
    console.log("Empleado id/userId:", barber.id, barberUserId)
    console.log("Servicio id:", service.id)

    console.log("\n[APPROVED] Reserva:", approvedReservation)
    console.log("[APPROVED] Admin antes de webhook:", preAdminApproved ? preAdminApproved.status : "NO_RECORD")
    console.log("[APPROVED] Admin después:", adminApproved ? adminApproved.status : "NO_RECORD")
    console.log("[APPROVED] Cliente pago:", clientApproved?.payment?.status ?? "NO_RECORD")
    console.log("[APPROVED] Empleado pago:", barberApproved?.paymentStatus ?? "NO_RECORD")

    console.log("\n[DECLINED] Reserva:", declinedReservation)
    console.log("[DECLINED] Admin después:", adminDeclined ? adminDeclined.status : "NO_RECORD")
    console.log("[DECLINED] Cliente pago:", clientDeclined?.payment?.status ?? "NO_RECORD")
    console.log("[DECLINED] Cliente estado cita:", clientDeclined?.status ?? "NO_RECORD")
    console.log("[DECLINED] Empleado pago:", barberDeclined?.paymentStatus ?? "NO_RECORD")

    console.log("\n[ERROR] Reserva:", errorReservation)
    console.log("[ERROR] Admin después:", adminError ? adminError.status : "NO_RECORD")
    console.log("[ERROR] Cliente pago:", clientError?.payment?.status ?? "NO_RECORD")
    console.log("[ERROR] Cliente estado cita:", clientError?.status ?? "NO_RECORD")
    console.log("[ERROR] Empleado pago:", barberError?.paymentStatus ?? "NO_RECORD")

    console.log("\n[DB WOMPI FIELDS]", wompiDbRowsResult.rows)

    const success =
      preAdminApproved &&
      adminApproved?.status &&
      String(adminApproved.status).toLowerCase().includes("completo") &&
      clientApproved?.payment?.status &&
      String(clientApproved.payment.status).toLowerCase().includes("completo") &&
      barberApproved?.paymentStatus &&
      String(barberApproved.paymentStatus).toLowerCase().includes("completo") &&
      adminDeclined?.status &&
      String(adminDeclined.status).toLowerCase().includes("fall") &&
      adminError?.status &&
      String(adminError.status).toLowerCase().includes("fall") &&
      wompiDbRowsResult.rowCount >= 3 &&
      wompiDbRowsResult.rows.every(
        (row) =>
          String(row.proveedor_pago ?? "").toLowerCase() === "wompi" &&
          typeof row.wompi_reference === "string" &&
          row.wompi_reference.length > 0 &&
          typeof row.wompi_status === "string" &&
          row.wompi_status.length > 0 &&
          row.has_payload === true,
      )

    if (!success) {
      console.error("\nResultado: FALLÓ alguna validación de reflejo de estados")
      process.exit(2)
    }

    console.log("\nResultado: OK - el estado de pago se refleja en admin, cliente y empleado.")
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error("Error en prueba E2E Wompi:", error)
  process.exit(1)
})
