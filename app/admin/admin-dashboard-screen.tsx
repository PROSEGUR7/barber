"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CalendarCheck2,
  CalendarClock,
  DollarSign,
  LineChart as LineChartIcon,
  Scissors,
  TrendingUp,
} from "lucide-react"
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency, formatNumber } from "@/lib/formatters"

type Granularity = "day" | "month" | "year"
type SedeInsightsScope = "month" | "quarter" | "year"
type RankingMetric = "revenue" | "totalAppointments" | "paidAppointments"

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
  }
  clientsAndStaff: {
    retention: {
      firstTimeClients: number
      retainedClients: number
      retentionRatePct: number
    }
  }
}

type SedeTopServiceInsight = {
  serviceId: number | null
  serviceName: string
  appointments: number
  revenue: number
}

type SedeBusinessInsight = {
  sedeId: number
  sedeName: string
  revenue: number
  previousRevenue: number
  growthPct: number | null
  paidAppointments: number
  totalAppointments: number
  upcomingAppointments: number
  topService: SedeTopServiceInsight | null
}

type SedeInsightsReport = {
  scope: SedeInsightsScope
  scopeLabel: string
  currentMonthRevenue: number
  previousMonthRevenue: number
  monthlyGrowthPct: number | null
  bestSedeByRevenue: SedeBusinessInsight | null
  bestSedeByAppointments: SedeBusinessInsight | null
  sedes: SedeBusinessInsight[]
}

type ReportsResponse = {
  ok?: boolean
  report?: RevenueReport
  error?: string
}

type SedeInsightsResponse = {
  ok?: boolean
  sedeInsights?: SedeInsightsReport | null
  focusedSeries?: RevenueSeriesPoint[]
  warning?: string
  error?: string
}

const trendChartConfig = {
  revenue: {
    label: "Ingresos",
    color: "var(--chart-1)",
  },
  appointmentsCount: {
    label: "Citas pagadas",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

const sedeRankingChartConfig = {
  revenue: {
    label: "Ingresos",
    color: "var(--chart-1)",
  },
  totalAppointments: {
    label: "Citas",
    color: "var(--chart-2)",
  },
  paidAppointments: {
    label: "Citas pagadas",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig

const operationsMixChartConfig = {
  paidAppointments: {
    label: "Pagadas",
    color: "var(--chart-1)",
  },
  upcomingAppointments: {
    label: "Proximas",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig

const periodComparisonChartConfig = {
  revenue: {
    label: "Periodo actual",
    color: "var(--chart-1)",
  },
  previousRevenue: {
    label: "Periodo anterior",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

const paymentMethodsChartConfig = {
  revenue: {
    label: "Ingresos",
    color: "var(--chart-5)",
  },
} satisfies ChartConfig

const RANKING_LABELS: Record<RankingMetric, string> = {
  revenue: "Ingresos",
  totalAppointments: "Citas totales",
  paidAppointments: "Citas pagadas",
}

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

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}

function getSafeRate(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0
  }

  return Number(((numerator / denominator) * 100).toFixed(1))
}

export default function AdminDashboard() {
  const [granularity, setGranularity] = useState<Granularity>("month")
  const [scope, setScope] = useState<SedeInsightsScope>("month")
  const [selectedSede, setSelectedSede] = useState("all")
  const [rankingMetric, setRankingMetric] = useState<RankingMetric>("revenue")

  const [report, setReport] = useState<RevenueReport | null>(null)
  const [sedeInsights, setSedeInsights] = useState<SedeInsightsReport | null>(null)
  const [focusedSeries, setFocusedSeries] = useState<RevenueSeriesPoint[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [reportError, setReportError] = useState<string | null>(null)
  const [sedeInsightsError, setSedeInsightsError] = useState<string | null>(null)
  const [sedeInsightsWarning, setSedeInsightsWarning] = useState<string | null>(null)

  const loadDashboard = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true)
      setReportError(null)
      setSedeInsightsError(null)
      setSedeInsightsWarning(null)

      const tenantHeaders = buildTenantHeaders()
      const reportsUrl = `/api/admin/reports?granularity=${granularity}`

      const insightsParams = new URLSearchParams({
        granularity,
        scope,
      })

      if (selectedSede !== "all") {
        insightsParams.set("sedeId", selectedSede)
      }

      const insightsUrl = `/api/admin/dashboard/sede-insights?${insightsParams.toString()}`

      try {
        try {
          const response = await fetch(reportsUrl, {
            signal,
            cache: "no-store",
            headers: tenantHeaders,
          })

          const payload: ReportsResponse = await response.json().catch(() => ({}))
          if (!response.ok || !payload.report) {
            throw new Error(payload.error ?? "No se pudo cargar el reporte ejecutivo")
          }

          if (!signal?.aborted) {
            setReport(payload.report)
          }
        } catch (error) {
          if (!signal?.aborted) {
            console.error("Error loading admin reports", error)
            setReportError(error instanceof Error ? error.message : "No se pudo cargar el reporte ejecutivo")
          }
        }

        try {
          const response = await fetch(insightsUrl, {
            signal,
            cache: "no-store",
            headers: tenantHeaders,
          })

          const payload: SedeInsightsResponse = await response.json().catch(() => ({}))
          if (!response.ok) {
            throw new Error(payload.error ?? "No se pudieron cargar los insights por sede")
          }

          if (!signal?.aborted) {
            setSedeInsights(payload.sedeInsights ?? null)
            setFocusedSeries(Array.isArray(payload.focusedSeries) ? payload.focusedSeries : [])
            setSedeInsightsWarning(payload.warning ?? null)
          }
        } catch (error) {
          if (!signal?.aborted) {
            console.error("Error loading sede insights", error)
            setSedeInsightsError(error instanceof Error ? error.message : "No se pudieron cargar los insights por sede")
          }
        }
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false)
        }
      }
    },
    [granularity, scope, selectedSede],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadDashboard(controller.signal)

    return () => controller.abort()
  }, [loadDashboard])

  useEffect(() => {
    if (selectedSede === "all") {
      return
    }

    const exists = (sedeInsights?.sedes ?? []).some((sede) => String(sede.sedeId) === selectedSede)
    if (!exists) {
      setSelectedSede("all")
    }
  }, [selectedSede, sedeInsights?.sedes])

  const handleReload = useCallback(() => {
    void loadDashboard()
  }, [loadDashboard])

  const hasErrors = Boolean(reportError || sedeInsightsError)

  const selectedSedeInsight = useMemo(() => {
    if (selectedSede === "all") {
      return null
    }

    return (sedeInsights?.sedes ?? []).find((sede) => String(sede.sedeId) === selectedSede) ?? null
  }, [selectedSede, sedeInsights?.sedes])

  const effectiveSeries = useMemo(() => {
    if (selectedSede !== "all") {
      return focusedSeries
    }

    return report?.series ?? []
  }, [focusedSeries, report?.series, selectedSede])

  const trendChartData = useMemo(
    () =>
      effectiveSeries.map((point) => ({
        ...point,
        dateLabel: formatAxisDate(point.bucketStart, granularity),
      })),
    [effectiveSeries, granularity],
  )

  const sedesRanking = useMemo(() => {
    const sedes = [...(sedeInsights?.sedes ?? [])]

    return sedes.sort((a, b) => {
      if (rankingMetric === "revenue") {
        if (b.revenue !== a.revenue) {
          return b.revenue - a.revenue
        }
      }

      if (rankingMetric === "paidAppointments") {
        if (b.paidAppointments !== a.paidAppointments) {
          return b.paidAppointments - a.paidAppointments
        }
      }

      if (b.totalAppointments !== a.totalAppointments) {
        return b.totalAppointments - a.totalAppointments
      }

      return b.revenue - a.revenue
    })
  }, [rankingMetric, sedeInsights?.sedes])

  const sedesForCharts = useMemo(() => sedesRanking.slice(0, 8), [sedesRanking])

  const periodComparisonData = useMemo(
    () =>
      sedesForCharts.map((sede) => ({
        ...sede,
        growthLabel:
          sede.growthPct == null ? "Sin base" : `${sede.growthPct > 0 ? "+" : ""}${sede.growthPct.toFixed(2)}%`,
      })),
    [sedesForCharts],
  )

  const paymentMethodsData = useMemo(
    () =>
      (report?.income.paymentMethods ?? [])
        .slice()
        .sort((a, b) => b.revenue - a.revenue)
        .map((item) => ({
          ...item,
          methodLabel: item.method.replaceAll("_", " "),
        })),
    [report?.income.paymentMethods],
  )

  const scopeRevenue = useMemo(() => {
    if (selectedSedeInsight) {
      return selectedSedeInsight.revenue
    }

    if (sedeInsights) {
      return sedeInsights.sedes.reduce((sum, sede) => sum + sede.revenue, 0)
    }

    return report?.totals.revenue ?? 0
  }, [report?.totals.revenue, selectedSedeInsight, sedeInsights])

  const topService = useMemo(() => {
    if (selectedSedeInsight?.topService) {
      return {
        serviceName: selectedSedeInsight.topService.serviceName,
        revenue: selectedSedeInsight.topService.revenue,
        paidAppointments: selectedSedeInsight.topService.appointments,
      }
    }

    return report?.topServices[0] ?? null
  }, [report?.topServices, selectedSedeInsight?.topService])

  const conversionRate = useMemo(() => {
    const paid = selectedSedeInsight?.paidAppointments ?? report?.totals.paymentsCount ?? 0
    const appointments = selectedSedeInsight?.totalAppointments ?? report?.totals.appointmentsCount ?? 0

    return getSafeRate(paid, appointments)
  }, [report?.totals.appointmentsCount, report?.totals.paymentsCount, selectedSedeInsight])

  const occupancyRate = useMemo(() => {
    if (selectedSedeInsight) {
      return getSafeRate(selectedSedeInsight.upcomingAppointments, selectedSedeInsight.totalAppointments)
    }

    return Number(report?.efficiency.occupancyRatePct ?? 0)
  }, [report?.efficiency.occupancyRatePct, selectedSedeInsight])

  const hasData = Boolean(report || sedeInsights)

  return (
    <div className="space-y-4">
      <main className="space-y-4 pb-4 sm:space-y-5 sm:pb-6">
        {hasErrors && (
          <Alert variant="destructive">
            <AlertTitle>Tuvimos problemas al cargar algunos datos del dashboard</AlertTitle>
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1 text-sm">
                {reportError && <p>Reporte general: {reportError}</p>}
                {sedeInsightsError && <p>Insights por sede: {sedeInsightsError}</p>}
              </div>
              <Button variant="outline" onClick={handleReload}>
                Reintentar
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {sedeInsightsWarning && (
          <Alert>
            <AlertTitle>Insights por sede</AlertTitle>
            <AlertDescription>{sedeInsightsWarning}</AlertDescription>
          </Alert>
        )}

        <Card className="border-border/70 bg-gradient-to-br from-background to-muted/40">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg">Panel ejecutivo multi-sede</CardTitle>
                <CardDescription>
                  Control de ingresos, conversion, ocupacion y desempeno comercial por sede.
                </CardDescription>
              </div>
              <Badge variant="secondary">Business Intelligence</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Granularidad de tendencia</p>
              <Select value={granularity} onValueChange={(value) => setGranularity(value as Granularity)}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="Mensual" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Diaria</SelectItem>
                  <SelectItem value="month">Mensual</SelectItem>
                  <SelectItem value="year">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Horizonte de comparacion</p>
              <Select value={scope} onValueChange={(value) => setScope(value as SedeInsightsScope)}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="Mes actual" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Mes actual</SelectItem>
                  <SelectItem value="quarter">Ultimos 3 meses</SelectItem>
                  <SelectItem value="year">Ano actual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Sede foco</p>
              <Select value={selectedSede} onValueChange={setSelectedSede}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="Todas las sedes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las sedes</SelectItem>
                  {(sedeInsights?.sedes ?? []).map((sede) => (
                    <SelectItem key={sede.sedeId} value={String(sede.sedeId)}>
                      {sede.sedeName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Metrica de ranking</p>
              <Select value={rankingMetric} onValueChange={(value) => setRankingMetric(value as RankingMetric)}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="Ingresos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="revenue">Ingresos</SelectItem>
                  <SelectItem value="totalAppointments">Citas totales</SelectItem>
                  <SelectItem value="paidAppointments">Citas pagadas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <DashboardSkeleton />
        ) : !hasData ? (
          <EmptyChartState message="No hay informacion disponible para construir el dashboard." />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              <MetricCard
                title={selectedSedeInsight ? "Ingresos sede" : "Ingresos por horizonte"}
                value={formatCurrency(scopeRevenue)}
                description={
                  selectedSedeInsight
                    ? `${selectedSedeInsight.sedeName} en ${sedeInsights?.scopeLabel.toLowerCase() ?? "periodo"}`
                    : `Total consolidado en ${sedeInsights?.scopeLabel.toLowerCase() ?? "periodo"}`
                }
                icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
              />

              <MetricCard
                title="Crecimiento mensual"
                value={
                  sedeInsights?.monthlyGrowthPct == null
                    ? "Sin base"
                    : `${sedeInsights.monthlyGrowthPct > 0 ? "+" : ""}${sedeInsights.monthlyGrowthPct}%`
                }
                description={`Mes actual: ${formatCurrency(sedeInsights?.currentMonthRevenue ?? 0)}`}
                icon={
                  (sedeInsights?.monthlyGrowthPct ?? 0) >= 0 ? (
                    <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4 text-rose-600" />
                  )
                }
              />

              <MetricCard
                title="Conversion de pago"
                value={`${conversionRate}%`}
                description="Citas pagadas sobre citas registradas"
                icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
              />

              <MetricCard
                title="Carga de agenda"
                value={`${occupancyRate}%`}
                description="Relacion entre agenda futura y volumen operativo"
                icon={<CalendarClock className="h-4 w-4 text-muted-foreground" />}
              />

              <MetricCard
                title="Sede lider"
                value={selectedSedeInsight?.sedeName ?? sedeInsights?.bestSedeByRevenue?.sedeName ?? "Sin datos"}
                description={formatCurrency(selectedSedeInsight?.revenue ?? sedeInsights?.bestSedeByRevenue?.revenue ?? 0)}
                icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
              />

              <MetricCard
                title="Servicio estrella"
                value={topService?.serviceName ?? "Sin datos"}
                description={
                  topService
                    ? `${formatCurrency(topService.revenue)} · ${formatNumber(topService.paidAppointments)} citas`
                    : "No hay consumo de servicios registrado"
                }
                icon={<Scissors className="h-4 w-4 text-muted-foreground" />}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LineChartIcon className="h-4 w-4" />
                    Tendencia de ingresos
                  </CardTitle>
                  <CardDescription>
                    {selectedSedeInsight
                      ? `Serie de ${selectedSedeInsight.sedeName} con granularidad ${granularity}.`
                      : `Serie consolidada de negocio con granularidad ${granularity}.`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="min-w-0 overflow-hidden">
                  {trendChartData.length > 0 ? (
                    <ChartContainer config={trendChartConfig} className="h-[280px] w-full min-w-0 max-w-full overflow-hidden">
                      <ComposedChart data={trendChartData} margin={{ top: 10, right: 12, left: 2, bottom: 0 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="dateLabel" tickLine={false} axisLine={false} minTickGap={22} />
                        <YAxis
                          yAxisId="left"
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value) => formatCompactNumber(Number(value))}
                          width={40}
                        />
                        <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} width={36} />
                        <ChartTooltip
                          cursor={false}
                          content={
                            <ChartTooltipContent
                              formatter={(value, key) =>
                                key === "revenue" ? formatCurrency(Number(value)) : formatNumber(Number(value))
                              }
                            />
                          }
                        />
                        <Bar yAxisId="left" dataKey="revenue" fill="var(--color-revenue)" radius={[8, 8, 0, 0]} />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="appointmentsCount"
                          stroke="var(--color-appointmentsCount)"
                          strokeWidth={2}
                          dot={false}
                        />
                      </ComposedChart>
                    </ChartContainer>
                  ) : (
                    <EmptyChartState message="No hay puntos suficientes para trazar esta tendencia." />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Ranking corporativo por sede</CardTitle>
                  <CardDescription>{RANKING_LABELS[rankingMetric]} en el horizonte seleccionado.</CardDescription>
                </CardHeader>
                <CardContent className="min-w-0 overflow-hidden">
                  {sedesForCharts.length > 0 ? (
                    <ChartContainer config={sedeRankingChartConfig} className="h-[280px] w-full min-w-0 max-w-full overflow-hidden">
                      <BarChart layout="vertical" data={sedesForCharts} margin={{ top: 6, right: 10, left: 30, bottom: 0 }}>
                        <CartesianGrid horizontal={false} />
                        <XAxis
                          type="number"
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value) =>
                            rankingMetric === "revenue" ? formatCompactNumber(Number(value)) : formatNumber(Number(value))
                          }
                        />
                        <YAxis
                          type="category"
                          dataKey="sedeName"
                          tickLine={false}
                          axisLine={false}
                          width={120}
                        />
                        <ChartTooltip
                          cursor={false}
                          content={
                            <ChartTooltipContent
                              formatter={(value) =>
                                rankingMetric === "revenue"
                                  ? formatCurrency(Number(value))
                                  : `${formatNumber(Number(value))} citas`
                              }
                            />
                          }
                        />
                        <Bar dataKey={rankingMetric} fill="var(--color-revenue)" radius={8} />
                      </BarChart>
                    </ChartContainer>
                  ) : (
                    <EmptyChartState message="No hay sedes con actividad para generar ranking." />
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Mix operativo por sede</CardTitle>
                  <CardDescription>Comparativo de citas pagadas vs agenda proxima.</CardDescription>
                </CardHeader>
                <CardContent className="min-w-0 overflow-hidden">
                  {sedesForCharts.length > 0 ? (
                    <ChartContainer config={operationsMixChartConfig} className="h-[280px] w-full min-w-0 max-w-full overflow-hidden">
                      <BarChart data={sedesForCharts} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="sedeName" tickLine={false} axisLine={false} minTickGap={20} />
                        <YAxis tickLine={false} axisLine={false} />
                        <ChartTooltip
                          cursor={false}
                          content={<ChartTooltipContent formatter={(value) => `${formatNumber(Number(value))} citas`} />}
                        />
                        <Bar dataKey="paidAppointments" stackId="ops" fill="var(--color-paidAppointments)" radius={[8, 8, 0, 0]} />
                        <Bar dataKey="upcomingAppointments" stackId="ops" fill="var(--color-upcomingAppointments)" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ChartContainer>
                  ) : (
                    <EmptyChartState message="No hay datos operativos por sede para esta vista." />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Participacion por metodo de pago</CardTitle>
                  <CardDescription>Facturacion distribuida por canal de cobro.</CardDescription>
                </CardHeader>
                <CardContent className="min-w-0 overflow-hidden">
                  {paymentMethodsData.length > 0 ? (
                    <ChartContainer config={paymentMethodsChartConfig} className="h-[280px] w-full min-w-0 max-w-full overflow-hidden">
                      <BarChart data={paymentMethodsData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="methodLabel" tickLine={false} axisLine={false} minTickGap={20} />
                        <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => formatCompactNumber(Number(value))} />
                        <ChartTooltip
                          cursor={false}
                          content={
                            <ChartTooltipContent
                              formatter={(value, key, item) => {
                                const payload = item?.payload as { paymentsCount?: number } | undefined
                                const paymentsCount = payload?.paymentsCount ?? 0
                                return `${formatCurrency(Number(value))} · ${formatNumber(paymentsCount)} pagos`
                              }}
                            />
                          }
                        />
                        <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ChartContainer>
                  ) : (
                    <EmptyChartState message="No se registran metodos de pago para el periodo cargado." />
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Comparativo periodo vs periodo por sede</CardTitle>
                  <CardDescription>Comparacion de ingresos del horizonte actual frente al anterior en cada sede.</CardDescription>
                </CardHeader>
                <CardContent className="min-w-0 overflow-hidden">
                  {periodComparisonData.length > 0 ? (
                    <ChartContainer config={periodComparisonChartConfig} className="h-[280px] w-full min-w-0 max-w-full overflow-hidden">
                      <BarChart data={periodComparisonData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="sedeName" tickLine={false} axisLine={false} minTickGap={20} />
                        <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => formatCompactNumber(Number(value))} />
                        <ChartTooltip
                          cursor={false}
                          content={
                            <ChartTooltipContent
                              formatter={(value, key, item) => {
                                const payload = item?.payload as { growthLabel?: string } | undefined
                                if (key === "revenue") {
                                  return `${formatCurrency(Number(value))} · ${payload?.growthLabel ?? "Sin base"}`
                                }

                                return formatCurrency(Number(value))
                              }}
                            />
                          }
                        />
                        <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[8, 8, 0, 0]} />
                        <Bar dataKey="previousRevenue" fill="var(--color-previousRevenue)" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ChartContainer>
                  ) : (
                    <EmptyChartState message="No hay datos suficientes para comparar periodos entre sedes." />
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Servicio top por sede</CardTitle>
                  <CardDescription>Mejor desempeño comercial individual en cada sede.</CardDescription>
                </CardHeader>
                <CardContent>
                  {sedesRanking.length > 0 ? (
                    <div className="space-y-4">
                      {sedesRanking.map((sede) => {
                        const progressValue = scopeRevenue > 0 ? Math.min((sede.revenue / scopeRevenue) * 100, 100) : 0

                        return (
                          <div key={sede.sedeId} className="space-y-2 rounded-lg border p-3">
                            <div className="flex items-center justify-between gap-2 text-sm">
                              <p className="font-medium">{sede.sedeName}</p>
                              <span className="text-muted-foreground">{formatCurrency(sede.revenue)}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {sede.topService
                                ? `${sede.topService.serviceName} · ${formatNumber(sede.topService.appointments)} citas`
                                : "Sin servicio destacado en este horizonte"}
                            </p>
                            <Progress value={progressValue} />
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <EmptyChartState message="No hay ranking de servicios por sede en este momento." />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Insights de direccion</CardTitle>
                  <CardDescription>Lectura rapida para decisiones ejecutivas del negocio.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <div className="rounded-lg border p-3">
                    <p>
                      Sede lider por ingresos: <span className="font-medium text-foreground">{sedeInsights?.bestSedeByRevenue?.sedeName ?? "Sin datos"}</span>
                    </p>
                    <p>
                      Valor capturado: {formatCurrency(sedeInsights?.bestSedeByRevenue?.revenue ?? 0)} en {formatNumber(sedeInsights?.bestSedeByRevenue?.paidAppointments ?? 0)} citas pagadas.
                    </p>
                  </div>

                  <div className="rounded-lg border p-3">
                    <p>
                      Sede lider por volumen: <span className="font-medium text-foreground">{sedeInsights?.bestSedeByAppointments?.sedeName ?? "Sin datos"}</span>
                    </p>
                    <p>
                      {formatNumber(sedeInsights?.bestSedeByAppointments?.totalAppointments ?? 0)} citas registradas con {formatNumber(sedeInsights?.bestSedeByAppointments?.upcomingAppointments ?? 0)} proximas.
                    </p>
                  </div>

                  <div className="rounded-lg border p-3">
                    <p>
                      No-show global: <span className="font-medium text-foreground">{formatNumber(report?.efficiency.noShowRatePct ?? 0)}%</span>
                    </p>
                    <p>
                      Retencion clientes: <span className="font-medium text-foreground">{formatNumber(report?.clientsAndStaff.retention.retentionRatePct ?? 0)}%</span>
                    </p>
                    <p>
                      Ticket promedio por cliente: <span className="font-medium text-foreground">{formatCurrency(report?.income.averageTicketPerClient ?? 0)}</span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function MetricCard({
  title,
  value,
  description,
  icon,
}: {
  title: string
  value: string
  description: string
  icon: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 px-3 pb-0 pt-2 sm:px-6 sm:pb-2 sm:pt-4">
        <CardTitle className="line-clamp-1 text-[13px] font-medium leading-tight sm:text-sm">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent className="px-3 pb-2 pt-0 sm:px-6 sm:pb-4 sm:pt-2">
        <div className="line-clamp-1 text-[1.15rem] font-bold leading-none tracking-tight sm:text-2xl">{value}</div>
        <p className="mt-1 hidden line-clamp-2 text-[11px] text-muted-foreground sm:mt-2 sm:block sm:text-xs">
          {description}
        </p>
      </CardContent>
    </Card>
  )
}

function EmptyChartState({ message }: { message: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{message}</p>
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={`metric-${index}`}>
            <CardHeader className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[280px] w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[280px] w-full" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[280px] w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[280px] w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
