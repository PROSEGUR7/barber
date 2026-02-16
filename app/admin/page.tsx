"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Activity,
  CalendarCheck2,
  CalendarClock,
  DollarSign,
  Scissors,
  TrendingUp,
  UserCircle,
  Users,
} from "lucide-react"
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ClientSummary, EmployeeSummary } from "@/lib/admin"
import { formatCurrency, formatNumber } from "@/lib/formatters"

type EmployeesResponse = {
  employees?: EmployeeSummary[]
  error?: string
}

type ClientsResponse = {
  clients?: ClientSummary[]
  error?: string
}

type DashboardSection = "general" | "operaciones" | "clientes"

type ActivityWindow = "30" | "90" | "all"

type ActivitySegment = "nuevo" | "ocasional" | "frecuente" | "vip"

const revenueChartConfig = {
  revenue: {
    label: "Ingresos",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

const appointmentsChartConfig = {
  value: {
    label: "Citas",
  },
  completed: {
    label: "Completadas",
    color: "var(--chart-2)",
  },
  upcoming: {
    label: "Próximas",
    color: "var(--chart-3)",
  },
  other: {
    label: "Otras",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig

const clientsChartConfig = {
  count: {
    label: "Clientes",
    color: "var(--chart-5)",
  },
} satisfies ChartConfig

function sortEmployees(list: EmployeeSummary[]): EmployeeSummary[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
}

function sortClients(list: ClientSummary[]): ClientSummary[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
}

function getNormalizedValue(value: string | null | undefined, fallback: string): string {
  const sanitized = value?.trim()
  return sanitized && sanitized.length > 0 ? sanitized : fallback
}

function getClientSegment(client: ClientSummary): ActivitySegment {
  if (client.totalSpent >= 180000 || client.completedAppointments >= 14) {
    return "vip"
  }

  if (client.totalSpent >= 80000 || client.completedAppointments >= 8) {
    return "frecuente"
  }

  if (client.completedAppointments >= 3 || client.totalAppointments >= 4) {
    return "ocasional"
  }

  return "nuevo"
}

function getClientSegmentLabel(segment: ActivitySegment): string {
  switch (segment) {
    case "vip":
      return "VIP"
    case "frecuente":
      return "Frecuente"
    case "ocasional":
      return "Ocasional"
    default:
      return "Nuevo"
  }
}

function getCutoffDate(window: ActivityWindow): Date | null {
  if (window === "all") {
    return null
  }

  const days = Number(window)
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date
}

function isOnOrAfter(value: string | null, cutoffDate: Date | null): boolean {
  if (!cutoffDate) {
    return true
  }

  if (!value) {
    return false
  }

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return false
  }

  return parsedDate >= cutoffDate
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

  return Math.round((numerator / denominator) * 100)
}

export default function AdminDashboard() {
  const [employees, setEmployees] = useState<EmployeeSummary[]>([])
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [areEmployeesLoading, setAreEmployeesLoading] = useState(true)
  const [areClientsLoading, setAreClientsLoading] = useState(true)
  const [employeesError, setEmployeesError] = useState<string | null>(null)
  const [clientsError, setClientsError] = useState<string | null>(null)
  const [section, setSection] = useState<DashboardSection>("general")
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState("all")
  const [clientTypeFilter, setClientTypeFilter] = useState("all")
  const [clientSegmentFilter, setClientSegmentFilter] = useState("all")
  const [activityWindow, setActivityWindow] = useState<ActivityWindow>("90")

  const loadEmployees = useCallback(
    async (signal?: AbortSignal) => {
      setAreEmployeesLoading(true)
      setEmployeesError(null)

      try {
        const response = await fetch("/api/admin/employees", { signal, cache: "no-store" })
        const data: EmployeesResponse = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(data.error ?? "No se pudieron cargar los empleados")
        }

        if (!signal?.aborted) {
          const list = Array.isArray(data.employees) ? data.employees : []
          setEmployees(sortEmployees(list))
        }
      } catch (error) {
        if (signal?.aborted) {
          return
        }

        console.error("Error fetching employees", error)
        setEmployeesError("No se pudieron cargar los empleados.")
      } finally {
        if (!signal?.aborted) {
          setAreEmployeesLoading(false)
        }
      }
    },
    [],
  )

  const loadClients = useCallback(
    async (signal?: AbortSignal) => {
      setAreClientsLoading(true)
      setClientsError(null)

      try {
        const response = await fetch("/api/admin/clients", { signal, cache: "no-store" })
        const data: ClientsResponse = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(data.error ?? "No se pudieron cargar los clientes")
        }

        if (!signal?.aborted) {
          const list = Array.isArray(data.clients) ? data.clients : []
          setClients(sortClients(list))
        }
      } catch (error) {
        if (signal?.aborted) {
          return
        }

        console.error("Error fetching clients", error)
        setClientsError("No se pudieron cargar los clientes.")
      } finally {
        if (!signal?.aborted) {
          setAreClientsLoading(false)
        }
      }
    },
    [],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadEmployees(controller.signal)

    return () => controller.abort()
  }, [loadEmployees])

  useEffect(() => {
    const controller = new AbortController()
    void loadClients(controller.signal)

    return () => controller.abort()
  }, [loadClients])

  const handleReload = useCallback(() => {
    void loadEmployees()
    void loadClients()
  }, [loadClients, loadEmployees])

  const isLoading = areEmployeesLoading || areClientsLoading
  const hasErrors = Boolean(employeesError || clientsError)

  const employeeStatusOptions = useMemo(() => {
    const values = new Set<string>()

    for (const employee of employees) {
      values.add(getNormalizedValue(employee.status, "Sin estado"))
    }

    return [...values].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }))
  }, [employees])

  const clientTypeOptions = useMemo(() => {
    const values = new Set<string>()

    for (const client of clients) {
      values.add(getNormalizedValue(client.type, "Sin categoría"))
    }

    return [...values].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }))
  }, [clients])

  const filteredEmployees = useMemo(() => {
    if (employeeStatusFilter === "all") {
      return employees
    }

    return employees.filter((employee) => getNormalizedValue(employee.status, "Sin estado") === employeeStatusFilter)
  }, [employeeStatusFilter, employees])

  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      const typeValue = getNormalizedValue(client.type, "Sin categoría")
      const segmentValue = getClientSegment(client)

      const typeMatches = clientTypeFilter === "all" || typeValue === clientTypeFilter
      const segmentMatches = clientSegmentFilter === "all" || segmentValue === clientSegmentFilter

      return typeMatches && segmentMatches
    })
  }, [clientSegmentFilter, clientTypeFilter, clients])

  const metrics = useMemo(() => {
    const totals = {
      totalEmployees: filteredEmployees.length,
      totalClients: filteredClients.length,
      totalRevenue: 0,
      totalAppointments: 0,
      upcomingAppointments: 0,
      completedAppointments: 0,
      clientsWithUpcomingAppointments: 0,
      activeClientsByWindow: 0,
      newClientsByWindow: 0,
    }

    const cutoffDate = getCutoffDate(activityWindow)

    for (const employee of filteredEmployees) {
      totals.totalRevenue += employee.totalRevenue
      totals.totalAppointments += employee.totalAppointments
      totals.upcomingAppointments += employee.upcomingAppointments
      totals.completedAppointments += employee.completedAppointments
    }

    for (const client of filteredClients) {
      if (client.upcomingAppointments > 0) {
        totals.clientsWithUpcomingAppointments += 1
      }

      if (isOnOrAfter(client.lastAppointmentAt, cutoffDate)) {
        totals.activeClientsByWindow += 1
      }

      if (isOnOrAfter(client.registeredAt, cutoffDate)) {
        totals.newClientsByWindow += 1
      }
    }

    return totals
  }, [activityWindow, filteredClients, filteredEmployees])

  const derivedMetrics = useMemo(() => {
    const averageTicket =
      metrics.completedAppointments > 0 ? metrics.totalRevenue / metrics.completedAppointments : 0
    const revenuePerEmployee = metrics.totalEmployees > 0 ? metrics.totalRevenue / metrics.totalEmployees : 0
    const completionRate = getSafeRate(metrics.completedAppointments, metrics.totalAppointments)
    const occupancyRate = getSafeRate(metrics.upcomingAppointments, metrics.totalAppointments)

    return {
      averageTicket,
      revenuePerEmployee,
      completionRate,
      occupancyRate,
    }
  }, [metrics])

  const revenueByEmployee = useMemo(() => {
    return [...filteredEmployees]
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 8)
      .map((employee) => ({
        name: employee.name,
        revenue: employee.totalRevenue,
        appointments: employee.totalAppointments,
      }))
  }, [filteredEmployees])

  const appointmentDistribution = useMemo(() => {
    const otherAppointments = Math.max(metrics.totalAppointments - metrics.completedAppointments - metrics.upcomingAppointments, 0)

    return [
      {
        key: "completed",
        label: "Completadas",
        value: metrics.completedAppointments,
        fill: "var(--color-completed)",
      },
      {
        key: "upcoming",
        label: "Próximas",
        value: metrics.upcomingAppointments,
        fill: "var(--color-upcoming)",
      },
      {
        key: "other",
        label: "Otras",
        value: otherAppointments,
        fill: "var(--color-other)",
      },
    ].filter((item) => item.value > 0)
  }, [metrics.completedAppointments, metrics.totalAppointments, metrics.upcomingAppointments])

  const clientsByType = useMemo(() => {
    const grouped = new Map<string, number>()

    for (const client of filteredClients) {
      const key = getNormalizedValue(client.type, "Sin categoría")
      grouped.set(key, (grouped.get(key) ?? 0) + 1)
    }

    return [...grouped.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
  }, [filteredClients])

  const clientsBySegment = useMemo(() => {
    const grouped = new Map<ActivitySegment, number>([
      ["nuevo", 0],
      ["ocasional", 0],
      ["frecuente", 0],
      ["vip", 0],
    ])

    for (const client of filteredClients) {
      const segment = getClientSegment(client)
      grouped.set(segment, (grouped.get(segment) ?? 0) + 1)
    }

    return (["nuevo", "ocasional", "frecuente", "vip"] as const).map((segment) => ({
      segment,
      label: getClientSegmentLabel(segment),
      count: grouped.get(segment) ?? 0,
    }))
  }, [filteredClients])

  const businessInsights = useMemo(() => {
    const topEmployee = [...filteredEmployees].sort((a, b) => b.totalRevenue - a.totalRevenue)[0] ?? null
    const topClient = [...filteredClients].sort((a, b) => b.totalSpent - a.totalSpent)[0] ?? null

    const uniqueServices = new Set<string>()
    for (const employee of filteredEmployees) {
      for (const service of employee.services) {
        uniqueServices.add(service)
      }
    }

    const serviceCoverage = metrics.totalEmployees > 0 ? uniqueServices.size / metrics.totalEmployees : 0

    return {
      topEmployee,
      topClient,
      uniqueServiceCount: uniqueServices.size,
      serviceCoverage,
    }
  }, [filteredClients, filteredEmployees, metrics.totalEmployees])

  const hasData = filteredEmployees.length > 0 || filteredClients.length > 0

  return (
    <div className="space-y-6">
      <main className="space-y-6 pb-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">Panel de administración</h1>
          <p className="text-muted-foreground">
            Segmenta la información por operación y clientes para visualizar ingresos, productividad y estado del
            negocio en tiempo real.
          </p>
        </header>

        {hasErrors && (
          <Alert variant="destructive">
            <AlertTitle>Tuvimos problemas al cargar algunos datos</AlertTitle>
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1 text-sm">
                {employeesError && <p>Empleados: {employeesError}</p>}
                {clientsError && <p>Clientes: {clientsError}</p>}
              </div>
              <Button variant="outline" onClick={handleReload}>
                Reintentar
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader className="space-y-3">
            <CardTitle>Segmentación del tablero</CardTitle>
            <CardDescription>Filtra los datos que se muestran según el foco de análisis del negocio.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Estado de empleados</p>
              <Select value={employeeStatusFilter} onValueChange={setEmployeeStatusFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  {employeeStatusOptions.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Tipo de cliente</p>
              <Select value={clientTypeFilter} onValueChange={setClientTypeFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos los tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  {clientTypeOptions.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Segmento de clientes</p>
              <Select value={clientSegmentFilter} onValueChange={setClientSegmentFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos los segmentos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="nuevo">Nuevo</SelectItem>
                  <SelectItem value="ocasional">Ocasional</SelectItem>
                  <SelectItem value="frecuente">Frecuente</SelectItem>
                  <SelectItem value="vip">VIP</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Ventana de actividad</p>
              <Select value={activityWindow} onValueChange={(value) => setActivityWindow(value as ActivityWindow)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Últimos 90 días" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">Últimos 30 días</SelectItem>
                  <SelectItem value="90">Últimos 90 días</SelectItem>
                  <SelectItem value="all">Todo el histórico</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <DashboardSkeleton />
        ) : (
          <Tabs value={section} onValueChange={(value) => setSection(value as DashboardSection)}>
            <TabsList className="w-full justify-start">
              <TabsTrigger value="general">Vista general</TabsTrigger>
              <TabsTrigger value="operaciones">Operaciones</TabsTrigger>
              <TabsTrigger value="clientes">Clientes</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                <MetricCard
                  title="Ingresos"
                  value={formatCurrency(metrics.totalRevenue)}
                  description="Total acumulado con filtros aplicados"
                  icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
                />
                <MetricCard
                  title="Ticket promedio"
                  value={formatCurrency(derivedMetrics.averageTicket)}
                  description="Valor promedio por cita completada"
                  icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
                />
                <MetricCard
                  title="Citas totales"
                  value={formatNumber(metrics.totalAppointments)}
                  description={`Completadas: ${formatNumber(metrics.completedAppointments)}`}
                  icon={<CalendarCheck2 className="h-4 w-4 text-muted-foreground" />}
                />
                <MetricCard
                  title="Citas próximas"
                  value={formatNumber(metrics.upcomingAppointments)}
                  description="Reservas activas en agenda"
                  icon={<CalendarClock className="h-4 w-4 text-muted-foreground" />}
                />
                <MetricCard
                  title="Equipo"
                  value={formatNumber(metrics.totalEmployees)}
                  description="Empleados considerados en el análisis"
                  icon={<Users className="h-4 w-4 text-muted-foreground" />}
                />
                <MetricCard
                  title="Clientes"
                  value={formatNumber(metrics.totalClients)}
                  description="Clientes filtrados en esta vista"
                  icon={<UserCircle className="h-4 w-4 text-muted-foreground" />}
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Ingresos por empleado</CardTitle>
                    <CardDescription>Top de rendimiento por facturación acumulada</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {revenueByEmployee.length > 0 ? (
                      <ChartContainer config={revenueChartConfig} className="h-[290px] w-full">
                        <BarChart data={revenueByEmployee} margin={{ top: 12, right: 8, left: 8, bottom: 0 }}>
                          <CartesianGrid vertical={false} />
                          <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
                          <YAxis
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => formatCompactNumber(Number(value))}
                          />
                          <ChartTooltip
                            cursor={false}
                            content={<ChartTooltipContent formatter={(value) => formatCurrency(Number(value))} />}
                          />
                          <Bar dataKey="revenue" fill="var(--color-revenue)" radius={10} />
                        </BarChart>
                      </ChartContainer>
                    ) : (
                      <EmptyChartState message="No hay empleados para mostrar en esta selección." />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Distribución de citas</CardTitle>
                    <CardDescription>Estado operativo entre citas completadas y pendientes</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {appointmentDistribution.length > 0 ? (
                      <ChartContainer config={appointmentsChartConfig} className="h-[290px] w-full">
                        <PieChart>
                          <ChartTooltip
                            content={<ChartTooltipContent formatter={(value) => formatNumber(Number(value))} />}
                          />
                          <Pie
                            data={appointmentDistribution}
                            dataKey="value"
                            nameKey="label"
                            innerRadius={68}
                            outerRadius={104}
                            strokeWidth={3}
                          >
                            {appointmentDistribution.map((item) => (
                              <Cell key={item.key} fill={item.fill} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ChartContainer>
                    ) : (
                      <EmptyChartState message="No hay citas para graficar con los filtros actuales." />
                    )}
                  </CardContent>
                </Card>
              </div>

              <BusinessInsights
                completionRate={derivedMetrics.completionRate}
                occupancyRate={derivedMetrics.occupancyRate}
                revenuePerEmployee={derivedMetrics.revenuePerEmployee}
                activeClients={metrics.activeClientsByWindow}
                newClients={metrics.newClientsByWindow}
                clientsWithUpcomingAppointments={metrics.clientsWithUpcomingAppointments}
                insights={businessInsights}
                hasData={hasData}
              />
            </TabsContent>

            <TabsContent value="operaciones" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  title="Productividad"
                  value={`${derivedMetrics.completionRate}%`}
                  description="Citas completadas sobre total"
                  icon={<Activity className="h-4 w-4 text-muted-foreground" />}
                />
                <MetricCard
                  title="Carga de agenda"
                  value={`${derivedMetrics.occupancyRate}%`}
                  description="Proporción de citas próximas"
                  icon={<CalendarClock className="h-4 w-4 text-muted-foreground" />}
                />
                <MetricCard
                  title="Ingreso por empleado"
                  value={formatCurrency(derivedMetrics.revenuePerEmployee)}
                  description="Promedio de facturación por miembro del equipo"
                  icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
                />
                <MetricCard
                  title="Servicios distintos"
                  value={formatNumber(businessInsights.uniqueServiceCount)}
                  description="Cobertura de portafolio en la plantilla"
                  icon={<Scissors className="h-4 w-4 text-muted-foreground" />}
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Rendimiento por equipo</CardTitle>
                  <CardDescription>Comparativa de ingresos y volumen de citas por empleado</CardDescription>
                </CardHeader>
                <CardContent>
                  {revenueByEmployee.length > 0 ? (
                    <div className="space-y-4">
                      {revenueByEmployee.map((item) => (
                        <div key={item.name} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{item.name}</span>
                            <span className="text-muted-foreground">
                              {formatCurrency(item.revenue)} · {formatNumber(item.appointments)} citas
                            </span>
                          </div>
                          <Progress
                            value={metrics.totalRevenue > 0 ? Math.min((item.revenue / metrics.totalRevenue) * 100, 100) : 0}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyChartState message="Sin datos operativos para esta combinación de filtros." />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="clientes" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  title="Clientes activos"
                  value={formatNumber(metrics.activeClientsByWindow)}
                  description="Con actividad dentro de la ventana elegida"
                  icon={<Users className="h-4 w-4 text-muted-foreground" />}
                />
                <MetricCard
                  title="Clientes nuevos"
                  value={formatNumber(metrics.newClientsByWindow)}
                  description="Registros recientes en la ventana actual"
                  icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
                />
                <MetricCard
                  title="Con citas próximas"
                  value={formatNumber(metrics.clientsWithUpcomingAppointments)}
                  description="Clientes listos para ser atendidos"
                  icon={<CalendarCheck2 className="h-4 w-4 text-muted-foreground" />}
                />
                <MetricCard
                  title="Ticket por cliente"
                  value={formatCurrency(metrics.totalClients > 0 ? metrics.totalRevenue / metrics.totalClients : 0)}
                  description="Ingreso promedio por cliente filtrado"
                  icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Clientes por tipo</CardTitle>
                    <CardDescription>Segmentación de base de clientes según categoría</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {clientsByType.length > 0 ? (
                      <ChartContainer config={clientsChartConfig} className="h-[290px] w-full">
                        <BarChart data={clientsByType} margin={{ top: 12, right: 8, left: 8, bottom: 0 }}>
                          <CartesianGrid vertical={false} />
                          <XAxis dataKey="type" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
                          <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                          <ChartTooltip
                            cursor={false}
                            content={<ChartTooltipContent formatter={(value) => formatNumber(Number(value))} />}
                          />
                          <Bar dataKey="count" fill="var(--color-count)" radius={8} />
                        </BarChart>
                      </ChartContainer>
                    ) : (
                      <EmptyChartState message="No hay clientes para graficar por tipo." />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Segmento de actividad</CardTitle>
                    <CardDescription>Clasificación por frecuencia e inversión de clientes</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {clientsBySegment.map((segment) => {
                      const share = metrics.totalClients > 0 ? (segment.count / metrics.totalClients) * 100 : 0

                      return (
                        <div key={segment.segment} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{segment.label}</span>
                            <span className="text-muted-foreground">
                              {formatNumber(segment.count)} · {Math.round(share)}%
                            </span>
                          </div>
                          <Progress value={Math.min(share, 100)} />
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
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
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold leading-none tracking-tight">{value}</div>
        <p className="mt-2 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

function BusinessInsights({
  completionRate,
  occupancyRate,
  revenuePerEmployee,
  activeClients,
  newClients,
  clientsWithUpcomingAppointments,
  insights,
  hasData,
}: {
  completionRate: number
  occupancyRate: number
  revenuePerEmployee: number
  activeClients: number
  newClients: number
  clientsWithUpcomingAppointments: number
  insights: {
    topEmployee: EmployeeSummary | null
    topClient: ClientSummary | null
    uniqueServiceCount: number
    serviceCoverage: number
  }
  hasData: boolean
}) {
  if (!hasData) {
    return <EmptyChartState message="No hay información suficiente para generar insights del negocio." />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Insights del negocio</CardTitle>
        <CardDescription>Lectura rápida de salud operativa y desempeño comercial.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm font-medium">Rendimiento operativo</p>
          <div className="grid gap-2 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Tasa de finalización</span>
              <Badge variant="secondary">{completionRate}%</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Carga de agenda</span>
              <Badge variant="secondary">{occupancyRate}%</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Ingreso promedio por empleado</span>
              <Badge variant="secondary">{formatCurrency(revenuePerEmployee)}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Cobertura de servicios</span>
              <Badge variant="secondary">{Math.round(insights.serviceCoverage * 100)}%</Badge>
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm font-medium">Hallazgos comerciales</p>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Top empleado: <span className="font-medium text-foreground">{insights.topEmployee?.name ?? "Sin datos"}</span>
              {insights.topEmployee ? ` (${formatCurrency(insights.topEmployee.totalRevenue)})` : ""}
            </p>
            <p>
              Top cliente: <span className="font-medium text-foreground">{insights.topClient?.name ?? "Sin datos"}</span>
              {insights.topClient ? ` (${formatCurrency(insights.topClient.totalSpent)})` : ""}
            </p>
            <p>Servicios únicos cubiertos: {formatNumber(insights.uniqueServiceCount)}</p>
            <p>Clientes activos (ventana): {formatNumber(activeClients)}</p>
            <p>Nuevos clientes (ventana): {formatNumber(newClients)}</p>
            <p>Clientes con próximas citas: {formatNumber(clientsWithUpcomingAppointments)}</p>
          </div>
        </div>
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
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
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
            <Skeleton className="h-[240px] w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[240px] w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
