import { NextResponse } from "next/server"

import {
  getAdminPayments,
  getAdminRevenueReport,
  getAdminSedeInsightsReport,
  getAdminSedeRevenueSeries,
  SedesModuleNotAvailableError,
  type AdminReportsGranularity,
  type AdminSedeInsightsScope,
} from "@/lib/admin"
import { resolveTenantSchemaForAdminRequest } from "@/lib/tenant"

export const runtime = "nodejs"

const ALLOWED_GRANULARITIES = new Set<AdminReportsGranularity>(["day", "month", "year"])
const ALLOWED_SCOPES = new Set<AdminSedeInsightsScope>(["month", "quarter", "year"])

function jsonError(status: number, payload: { error: string; code?: string }) {
  return NextResponse.json(
    {
      ok: false,
      ...payload,
    },
    { status },
  )
}

function resolveGranularity(value: string | null): AdminReportsGranularity {
  const normalized = (value ?? "").trim().toLowerCase() as AdminReportsGranularity
  if (ALLOWED_GRANULARITIES.has(normalized)) {
    return normalized
  }

  return "day"
}

function resolveScope(value: string | null): AdminSedeInsightsScope {
  const normalized = (value ?? "").trim().toLowerCase() as AdminSedeInsightsScope
  if (ALLOWED_SCOPES.has(normalized)) {
    return normalized
  }

  return "month"
}

function resolveSedeId(value: string | null): number | null {
  if (!value) {
    return null
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null
  }

  return parsed
}

export async function GET(request: Request) {
  try {
    const tenantSchema = await resolveTenantSchemaForAdminRequest(request)
    if (!tenantSchema) {
      return jsonError(400, {
        code: "TENANT_NOT_RESOLVED",
        error: "No se pudo resolver el tenant de la sesión.",
      })
    }

    const url = new URL(request.url)
    const granularity = resolveGranularity(url.searchParams.get("granularity"))
    const scope = resolveScope(url.searchParams.get("scope"))
    const sedeId = resolveSedeId(url.searchParams.get("sedeId"))

    const report = await getAdminRevenueReport({
      tenantSchema,
      granularity,
      topServicesLimit: 6,
    })

    let sedeInsights: Awaited<ReturnType<typeof getAdminSedeInsightsReport>> | null = null
    let focusedSeries: Awaited<ReturnType<typeof getAdminSedeRevenueSeries>> = []
    let warning: string | undefined

    try {
      sedeInsights = await getAdminSedeInsightsReport({
        tenantSchema,
        scope,
      })

      if (sedeId) {
        focusedSeries = await getAdminSedeRevenueSeries({
          tenantSchema,
          sedeId,
          granularity,
        })
      }
    } catch (insightsError) {
      if (insightsError instanceof SedesModuleNotAvailableError) {
        warning = "El modulo de sedes aun no esta habilitado para este tenant."
      } else {
        throw insightsError
      }
    }

    return NextResponse.json(
      {
        ok: true,
        report,
        sedeInsights,
        focusedSeries,
        warning,
      },
      { status: 200 },
    )
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_URL env var is not set") {
      return jsonError(503, {
        code: "DATABASE_NOT_CONFIGURED",
        error: "El servidor no está configurado (DATABASE_URL faltante).",
      })
    }

    console.error("Admin reports API error", error)

    try {
      const tenantSchema = await resolveTenantSchemaForAdminRequest(request)
      if (!tenantSchema) {
        return jsonError(400, {
          code: "TENANT_NOT_RESOLVED",
          error: "No se pudo resolver el tenant de la sesión.",
        })
      }

      const url = new URL(request.url)
      const granularity = resolveGranularity(url.searchParams.get("granularity"))
      const scope = resolveScope(url.searchParams.get("scope"))
      const sedeId = resolveSedeId(url.searchParams.get("sedeId"))
      const payments = await getAdminPayments({ tenantSchema, limit: 500 })

      const buckets = new Map<string, { revenue: number; paymentsCount: number; appointments: Set<number> }>()

      for (const payment of payments) {
        const sourceDate = payment.appointmentDate ? new Date(payment.appointmentDate) : null
        if (!sourceDate || Number.isNaN(sourceDate.getTime())) {
          continue
        }

        const bucketDate = new Date(sourceDate)
        if (granularity === "month") {
          bucketDate.setUTCDate(1)
          bucketDate.setUTCHours(0, 0, 0, 0)
        } else if (granularity === "year") {
          bucketDate.setUTCMonth(0, 1)
          bucketDate.setUTCHours(0, 0, 0, 0)
        } else {
          bucketDate.setUTCHours(0, 0, 0, 0)
        }

        const key = bucketDate.toISOString()
        const current = buckets.get(key) ?? { revenue: 0, paymentsCount: 0, appointments: new Set<number>() }
        current.revenue += Number(payment.amount ?? 0)
        current.paymentsCount += 1
        if (typeof payment.appointmentId === "number") {
          current.appointments.add(payment.appointmentId)
        }
        buckets.set(key, current)
      }

      const series = [...buckets.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([bucketStart, value]) => ({
          bucketStart,
          revenue: value.revenue,
          paymentsCount: value.paymentsCount,
          appointmentsCount: value.appointments.size,
        }))

      const topClientsMap = new Map<string, { clientName: string; revenue: number; appointments: Set<number> }>()
      for (const payment of payments) {
        const clientName = (payment.clientName ?? "Sin cliente").trim() || "Sin cliente"
        const key = clientName.toLowerCase()
        const current = topClientsMap.get(key) ?? { clientName, revenue: 0, appointments: new Set<number>() }
        current.revenue += Number(payment.amount ?? 0)
        if (typeof payment.appointmentId === "number") {
          current.appointments.add(payment.appointmentId)
        }
        topClientsMap.set(key, current)
      }

      const topClients = [...topClientsMap.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)
        .map((client, index) => ({
          clientId: -(index + 1),
          clientName: client.clientName,
          paidAppointments: client.appointments.size,
          revenue: client.revenue,
        }))

      const totals = series.reduce(
        (acc, point) => {
          acc.revenue += point.revenue
          acc.paymentsCount += point.paymentsCount
          acc.appointmentsCount += point.appointmentsCount
          return acc
        },
        { revenue: 0, paymentsCount: 0, appointmentsCount: 0 },
      )

      const fallbackReport = {
        granularity,
        series,
        totals,
        topServices: [],
        income: {
          paymentMethods: [],
          averageTicketPerClient: 0,
        },
        efficiency: {
          noShowRatePct: 0,
          noShowAppointments: 0,
          totalAppointments: 0,
          occupancyRatePct: null,
          productiveMinutes: 0,
          availableMinutes: 0,
          demandHeatmap: [],
        },
        clientsAndStaff: {
          retention: {
            firstTimeClients: 0,
            retainedClients: 0,
            retentionRatePct: 0,
          },
          barberPerformance: [],
          topClients,
        },
      }

      let sedeInsights: Awaited<ReturnType<typeof getAdminSedeInsightsReport>> | null = null
      let focusedSeries: Awaited<ReturnType<typeof getAdminSedeRevenueSeries>> = []
      let warning = "Se cargó un reporte base por incompatibilidad temporal de consultas avanzadas."

      try {
        sedeInsights = await getAdminSedeInsightsReport({
          tenantSchema,
          scope,
        })

        if (sedeId) {
          focusedSeries = await getAdminSedeRevenueSeries({
            tenantSchema,
            sedeId,
            granularity,
          })
        }
      } catch (insightsError) {
        if (insightsError instanceof SedesModuleNotAvailableError) {
          warning = `${warning} El modulo de sedes aun no esta habilitado para este tenant.`
        } else {
          throw insightsError
        }
      }

      return NextResponse.json(
        {
          ok: true,
          report: fallbackReport,
          sedeInsights,
          focusedSeries,
          warning,
        },
        { status: 200 },
      )
    } catch (fallbackError) {
      console.error("Admin reports fallback API error", fallbackError)
      return jsonError(500, {
        code: "SERVER_ERROR",
        error: "No se pudieron cargar los reportes.",
      })
    }
  }
}
