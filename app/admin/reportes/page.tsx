"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatCurrency, formatDate, formatNumber } from "@/lib/formatters"
import { cn } from "@/lib/utils"

type Granularity = "day" | "month" | "year"
type SeriesMetric = "revenue" | "paymentsCount" | "appointmentsCount"

type RevenueSeriesPoint = {
  bucketStart: string
  revenue: number
  paymentsCount: number
  appointmentsCount: number
}

type TopServicePoint = {
  serviceId: number | null
  serviceName: string
  revenue: number
  paidAppointments: number
}

type PaymentMethodBreakdown = {
  method: string
  paymentsCount: number
  revenue: number
}

type DemandHeatPoint = {
  dayOfWeek: number
  hour: number
  appointments: number
}

type BarberPerformancePoint = {
  employeeId: number
  employeeName: string
  revenue: number
  servicesDone: number
  ratingAverage: number | null
  ratingCount: number
}

type TopClientPoint = {
  clientId: number | null
  clientName: string
  paidAppointments: number
  revenue: number
}

type RevenueReport = {
  granularity: Granularity
  series: RevenueSeriesPoint[]
  totals: {
    revenue: number
    paymentsCount: number
    appointmentsCount: number
  }
  topServices: TopServicePoint[]
  income: {
    paymentMethods: PaymentMethodBreakdown[]
    averageTicketPerClient: number
  }
  efficiency: {
    noShowRatePct: number
    noShowAppointments: number
    totalAppointments: number
    occupancyRatePct: number | null
    productiveMinutes: number
    availableMinutes: number
    demandHeatmap: DemandHeatPoint[]
  }
  clientsAndStaff: {
    retention: {
      firstTimeClients: number
      retainedClients: number
      retentionRatePct: number
    }
    barberPerformance: BarberPerformancePoint[]
    topClients: TopClientPoint[]
  }
}

type ReportsResponse = {
  ok?: boolean
  report?: RevenueReport
  error?: string
}

const chartConfig = {
  revenue: {
    label: "Facturación",
    color: "var(--chart-1)",
  },
  paymentsCount: {
    label: "Pagos",
    color: "var(--chart-2)",
  },
  appointmentsCount: {
    label: "Citas pagadas",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig

const paymentMethodsChartConfig = {
  revenue: {
    label: "Monto",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig

const METRIC_LABELS: Record<SeriesMetric, string> = {
  revenue: "Facturación",
  paymentsCount: "Pagos",
  appointmentsCount: "Citas pagadas",
}

const GRANULARITY_LABELS: Record<Granularity, string> = {
  day: "Diario",
  month: "Mensual",
  year: "Anual",
}

const WEEKDAY_LABELS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"]

function buildTenantHeaders(): HeadersInit {
  if (typeof window === "undefined") {
    return {}
  }

  const headers: Record<string, string> = {}
  const tenant = (localStorage.getItem("tenantSchema") ?? localStorage.getItem("userTenant") ?? "").trim()
  const userEmail = (localStorage.getItem("userEmail") ?? "").trim().toLowerCase()

  if (tenant) {
    headers["x-tenant"] = tenant
  }

  if (userEmail) {
    headers["x-user-email"] = userEmail
  }

  return headers
}

function formatAxisDate(value: string, granularity: Granularity): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ""
  }

  if (granularity === "day") {
    return date.toLocaleDateString("es-ES", { month: "short", day: "2-digit" })
  }

  if (granularity === "month") {
    return date.toLocaleDateString("es-ES", { month: "short" })
  }

  return date.toLocaleDateString("es-ES", { year: "numeric" })
}

function normalizeBucketIso(value: string, granularity: Granularity): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  if (granularity === "day") {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString()
  }

  if (granularity === "month") {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString()
  }

  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1)).toISOString()
}

function buildExpectedBuckets(granularity: Granularity): string[] {
  const now = new Date()
  const currentYear = now.getUTCFullYear()
  const currentMonth = now.getUTCMonth()

  if (granularity === "day") {
    const daysInMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 0)).getUTCDate()
    return Array.from({ length: daysInMonth }, (_, index) =>
      new Date(Date.UTC(currentYear, currentMonth, index + 1)).toISOString(),
    )
  }

  if (granularity === "month") {
    return Array.from({ length: 12 }, (_, monthIndex) => new Date(Date.UTC(currentYear, monthIndex, 1)).toISOString())
  }

  const startYear = currentYear - 4
  return Array.from({ length: 5 }, (_, index) => new Date(Date.UTC(startYear + index, 0, 1)).toISOString())
}

function formatHoursFromMinutes(minutes: number): string {
  const safeMinutes = Number.isFinite(minutes) ? Math.max(0, minutes) : 0
  const hours = safeMinutes / 60
  return `${hours.toFixed(1)} h`
}

export default function AdminReportsPage() {
  const [granularity, setGranularity] = useState<Granularity>("day")
  const [metric, setMetric] = useState<SeriesMetric>("revenue")
  const [report, setReport] = useState<RevenueReport | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadReports = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/admin/reports?granularity=${granularity}`, {
          signal,
          cache: "no-store",
          headers: buildTenantHeaders(),
        })

        const data: ReportsResponse = await response.json().catch(() => ({}))

        if (!response.ok || !data.report) {
          throw new Error(data.error ?? "No se pudo cargar el reporte")
        }

        if (!signal?.aborted) {
          setReport(data.report)
        }
      } catch (requestError) {
        if (signal?.aborted) {
          return
        }

        console.error("Error loading reports", requestError)
        setError(requestError instanceof Error ? requestError.message : "No se pudo cargar el reporte")
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false)
        }
      }
    },
    [granularity],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadReports(controller.signal)

    return () => controller.abort()
  }, [loadReports])

  const chartData = useMemo(() => {
    const series = report?.series ?? []
    const expectedBuckets = buildExpectedBuckets(granularity)

    const seriesByBucket = new Map<string, RevenueSeriesPoint>()
    for (const point of series) {
      const key = normalizeBucketIso(point.bucketStart, granularity)
      seriesByBucket.set(key, point)
    }

    return expectedBuckets.map((bucketStart) => {
      const point = seriesByBucket.get(bucketStart)

      return {
        bucketStart,
        revenue: point?.revenue ?? 0,
        paymentsCount: point?.paymentsCount ?? 0,
        appointmentsCount: point?.appointmentsCount ?? 0,
        dateLabel: formatAxisDate(bucketStart, granularity),
      }
    })
  }, [granularity, report?.series])

  const topService = report?.topServices[0] ?? null

  const topClientsWithShare = useMemo(() => {
    const totalRevenue = report?.totals.revenue ?? 0
    const clients = report?.clientsAndStaff.topClients ?? []

    return clients.map((client, index) => ({
      ...client,
      rank: index + 1,
      sharePct: totalRevenue > 0 ? Math.round((client.revenue / totalRevenue) * 100) : 0,
    }))
  }, [report?.clientsAndStaff.topClients, report?.totals.revenue])

  const paymentMethodsData = useMemo(
    () =>
      (report?.income.paymentMethods ?? []).map((item) => ({
        ...item,
        methodLabel: item.method.replaceAll("_", " "),
      })),
    [report?.income.paymentMethods],
  )

  const heatmapBySlot = useMemo(() => {
    const map = new Map<string, number>()
    for (const point of report?.efficiency.demandHeatmap ?? []) {
      map.set(`${point.dayOfWeek}-${point.hour}`, point.appointments)
    }
    return map
  }, [report?.efficiency.demandHeatmap])

  const heatmapMax = useMemo(() => {
    let max = 0
    for (const point of report?.efficiency.demandHeatmap ?? []) {
      if (point.appointments > max) {
        max = point.appointments
      }
    }
    return max
  }, [report?.efficiency.demandHeatmap])

  const valueFormatter = useCallback(
    (value: number) => {
      if (metric === "revenue") {
        return formatCurrency(value)
      }

      return `${formatNumber(value)} registros`
    },
    [metric],
  )

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>No pudimos cargar los reportes</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="outline" onClick={() => void loadReports()}>
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card className="py-0">
        <CardHeader className="flex flex-col items-stretch border-b p-0 sm:flex-row">
          <div className="flex flex-1 flex-col justify-center gap-1 px-6 pb-3 pt-4 sm:py-0">
            <CardTitle>Reportes de facturación</CardTitle>
            <CardDescription>
              Visualiza comportamiento {GRANULARITY_LABELS[granularity].toLowerCase()} de ingresos, pagos y citas pagadas.
            </CardDescription>
          </div>

          <div className="grid grid-cols-2 border-t sm:flex sm:border-l sm:border-t-0">
            <button
              className="border-r px-5 py-4 text-left data-[active=true]:bg-muted/50"
              data-active={metric === "revenue"}
              onClick={() => setMetric("revenue")}
            >
              <span className="text-xs text-muted-foreground">Facturación</span>
              <p className="text-2xl font-bold leading-none">{formatCurrency(report?.totals.revenue ?? 0)}</p>
            </button>
            <button
              className="px-5 py-4 text-left data-[active=true]:bg-muted/50"
              data-active={metric === "paymentsCount"}
              onClick={() => setMetric("paymentsCount")}
            >
              <span className="text-xs text-muted-foreground">Pagos aprobados</span>
              <p className="text-2xl font-bold leading-none">{formatNumber(report?.totals.paymentsCount ?? 0)}</p>
            </button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 px-2 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            {(["day", "month", "year"] as const).map((item) => (
              <Button
                key={item}
                variant={granularity === item ? "default" : "outline"}
                size="sm"
                onClick={() => setGranularity(item)}
              >
                {GRANULARITY_LABELS[item]}
              </Button>
            ))}
            <Badge variant="secondary" className="ml-auto">
              Serie: {METRIC_LABELS[metric]}
            </Badge>
          </div>

          {isLoading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : chartData.length > 0 ? (
            <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
              <BarChart
                accessibilityLayer
                data={chartData}
                margin={{ left: 12, right: 12 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="bucketStart"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={28}
                  tickFormatter={(value) => formatAxisDate(String(value), granularity)}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      className="w-[180px]"
                      labelFormatter={(value) => {
                        const raw = String(value)

                        if (granularity === "month") {
                          return formatDate(raw, { month: "short", year: "numeric" }, "Sin fecha")
                        }

                        if (granularity === "year") {
                          return formatDate(raw, { year: "numeric" }, "Sin fecha")
                        }

                        return formatDate(raw, { day: "2-digit", month: "short", year: "numeric" }, "Sin fecha")
                      }}
                      formatter={(value) => valueFormatter(Number(value))}
                    />
                  }
                />
                <Bar dataKey={metric} fill={`var(--color-${metric})`} radius={6} />
              </BarChart>
            </ChartContainer>
          ) : (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No hay datos de facturación para el periodo seleccionado.
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="ingresos" className="space-y-4">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="ingresos">Ingresos y Pagos</TabsTrigger>
          <TabsTrigger value="eficiencia">Agendamientos y Eficiencia</TabsTrigger>
          <TabsTrigger value="clientes-staff">Clientes y Staff</TabsTrigger>
        </TabsList>

        <TabsContent value="ingresos" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Facturación total</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-2xl font-bold">{formatCurrency(report?.totals.revenue ?? 0)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Ticket promedio por cliente</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-2xl font-bold">{formatCurrency(report?.income.averageTicketPerClient ?? 0)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Pagos aprobados</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-2xl font-bold">{formatNumber(report?.totals.paymentsCount ?? 0)}</CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Métodos de pago</CardTitle>
                <CardDescription>Desglose para conciliación de caja por periodo.</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[220px] w-full" />
                ) : paymentMethodsData.length > 0 ? (
                  <ChartContainer config={paymentMethodsChartConfig} className="aspect-auto h-[220px] w-full">
                    <BarChart data={paymentMethodsData} margin={{ left: 12, right: 12 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="methodLabel"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tickFormatter={(value) => String(value).slice(0, 12)}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            formatter={(value) => formatCurrency(Number(value))}
                            labelFormatter={(value) => `Método: ${String(value)}`}
                          />
                        }
                      />
                      <Bar dataKey="revenue" fill="var(--color-revenue)" radius={6} />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <p className="text-sm text-muted-foreground">Sin pagos para desglosar en este periodo.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Servicios más facturados</CardTitle>
                <CardDescription>Top servicios por ingresos del periodo seleccionado.</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : (report?.topServices.length ?? 0) > 0 ? (
                  <div className="space-y-2">
                    {report!.topServices.map((service, index) => (
                      <div key={`${service.serviceId ?? "na"}-${index}`} className="flex items-center justify-between rounded-md border px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">{service.serviceName}</p>
                          <p className="text-xs text-muted-foreground">{formatNumber(service.paidAppointments)} citas pagadas</p>
                        </div>
                        <p className="text-sm font-semibold">{formatCurrency(service.revenue)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Aún no hay servicios con facturación en este periodo.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="eficiencia" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Tasa no-show</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-2xl font-bold">{report?.efficiency.noShowRatePct ?? 0}%</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">No-show / canceladas</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-2xl font-bold">{formatNumber(report?.efficiency.noShowAppointments ?? 0)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Ocupación</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-2xl font-bold">
                {report?.efficiency.occupancyRatePct == null ? "Sin disponibilidad" : `${report.efficiency.occupancyRatePct}%`}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Tiempo productivo</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-2xl font-bold">{formatHoursFromMinutes(report?.efficiency.productiveMinutes ?? 0)}</CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Días y horas de mayor demanda</CardTitle>
              <CardDescription>Heatmap de citas activas/completadas por franja horaria.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-[56px_repeat(13,minmax(0,1fr))] gap-1 text-xs text-muted-foreground">
                <div />
                {Array.from({ length: 13 }).map((_, index) => (
                  <div key={`h-${index + 8}`} className="text-center">{index + 8}</div>
                ))}
              </div>
              {WEEKDAY_LABELS.map((dayLabel, rowIndex) => {
                const dayOfWeek = rowIndex + 1

                return (
                  <div key={dayLabel} className="grid grid-cols-[56px_repeat(13,minmax(0,1fr))] gap-1">
                    <div className="flex items-center text-xs text-muted-foreground">{dayLabel}</div>
                    {Array.from({ length: 13 }).map((_, hourOffset) => {
                      const hour = hourOffset + 8
                      const value = heatmapBySlot.get(`${dayOfWeek}-${hour}`) ?? 0
                      const intensity = heatmapMax > 0 ? value / heatmapMax : 0

                      return (
                        <div
                          key={`${dayOfWeek}-${hour}`}
                          className={cn(
                            "rounded-md border px-1 py-1 text-center text-[11px]",
                            value > 0 ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground",
                          )}
                          style={value > 0 ? { opacity: Math.max(0.25, intensity) } : undefined}
                          title={`${dayLabel} ${hour}:00 - ${formatNumber(value)} citas`}
                        >
                          {value > 0 ? formatNumber(value) : "-"}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clientes-staff" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Retención de clientes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 pt-0">
                <p className="text-2xl font-bold">{report?.clientsAndStaff.retention.retentionRatePct ?? 0}%</p>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(report?.clientsAndStaff.retention.retainedClients ?? 0)} de {formatNumber(report?.clientsAndStaff.retention.firstTimeClients ?? 0)} regresaron.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Servicio #1</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-xl font-semibold">{topService?.serviceName ?? "Sin datos"}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top clientes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 pt-0">
                {topClientsWithShare.length > 0 ? (
                  <>
                    <p className="text-xl font-semibold">#1 {topClientsWithShare[0].clientName}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(topClientsWithShare[0].revenue)} · {topClientsWithShare[0].sharePct}% del total
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No hay clientes con pagos en este periodo.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Performance por barbero</CardTitle>
                <CardDescription>Facturación, servicios realizados y calificación promedio.</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                ) : (report?.clientsAndStaff.barberPerformance.length ?? 0) > 0 ? (
                  <div className="space-y-2">
                    {report!.clientsAndStaff.barberPerformance.map((barber) => (
                      <div key={barber.employeeId} className="grid grid-cols-4 gap-2 rounded-md border px-3 py-2 text-sm">
                        <div className="col-span-2">
                          <p className="font-medium">{barber.employeeName}</p>
                          <p className="text-xs text-muted-foreground">{formatNumber(barber.servicesDone)} servicios</p>
                        </div>
                        <div className="text-right font-semibold">{formatCurrency(barber.revenue)}</div>
                        <div className="text-right text-muted-foreground">
                          {barber.ratingAverage == null ? "Sin rating" : `${barber.ratingAverage.toFixed(2)} (${formatNumber(barber.ratingCount)})`}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No hay desempeño de staff para el periodo seleccionado.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top clientes por facturación</CardTitle>
                <CardDescription>Clientes que más aportan a ingresos del periodo.</CardDescription>
              </CardHeader>
              <CardContent>
                {topClientsWithShare.length > 0 ? (
                  <div className="space-y-2">
                    {topClientsWithShare.map((client, index) => (
                      <div key={`${client.clientId ?? "c"}-${index}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                        <div className="flex items-center gap-3">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                            #{client.rank}
                          </div>
                          <div>
                          <p className="font-medium">{client.clientName}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatNumber(client.paidAppointments)} citas pagadas · {client.sharePct}% del total
                            </p>
                          </div>
                        </div>
                        <p className="font-semibold">{formatCurrency(client.revenue)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No hay clientes con pagos en el periodo seleccionado.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
