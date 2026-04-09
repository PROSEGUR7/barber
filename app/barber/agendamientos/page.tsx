"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  addDays,
  addMonths,
  addWeeks,
  format,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { es } from "date-fns/locale"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { AdminAppointmentSummary, ClientSummary, EmployeeSummary, ServiceSummary } from "@/lib/admin"
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/formatters"
import { cn } from "@/lib/utils"

type AppointmentsResponse = {
  appointments?: AdminAppointmentSummary[]
  error?: string
}

type CalendarViewMode = "day" | "week" | "month" | "list"

type NormalizedAppointment = AdminAppointmentSummary & {
  normalizedStart: Date
  normalizedEnd: Date
  normalizedDurationMin: number
  employeeKey: string
}

type EmployeeBucket = {
  key: string
  name: string
  appointments: NormalizedAppointment[]
}

type ViewRange = {
  start: Date
  endExclusive: Date
}

type QuickActionSlot = {
  employeeId: number | null
  employeeName: string
  start: Date
  timeLabel: string
}

type QuickActionMode = "create" | "group" | "block"

type EmployeesResponse = {
  employee?: EmployeeSummary
  error?: string
}

type ClientsResponse = {
  clients?: ClientSummary[]
  error?: string
}

type ServicesResponse = {
  services?: ServiceSummary[]
  error?: string
}

const DAY_START_HOUR = 6
const DAY_END_HOUR = 23
const DAY_PIXELS_PER_MINUTE = 1.15

function getStatusLabel(status: string | null): string {
  if (!status) {
    return "Sin estado"
  }

  return status
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (chunk) => chunk.toUpperCase())
}

function getStatusVariant(status: string | null): "default" | "secondary" | "outline" | "destructive" {
  const normalized = status?.trim().toLowerCase() ?? ""

  if (normalized.includes("cancel")) {
    return "destructive"
  }

  if (normalized.includes("complet") || normalized.includes("final")) {
    return "secondary"
  }

  if (normalized.includes("pend") || normalized.includes("confirm") || normalized.includes("agend") || normalized.includes("program")) {
    return "default"
  }

  return "outline"
}

function getPaymentStatusLabel(status: string | null): string {
  const normalized = status?.trim().toLowerCase() ?? ""

  if (!normalized) {
    return "Pendiente"
  }

  if (["completo", "pagado", "aprobado", "paid", "success", "succeeded"].includes(normalized)) {
    return "Pagado"
  }

  if (["fallido", "declined", "error", "voided"].includes(normalized)) {
    return "Fallido"
  }

  return getStatusLabel(status)
}

function getPaymentStatusVariant(status: string | null): "default" | "secondary" | "outline" | "destructive" {
  const normalized = status?.trim().toLowerCase() ?? ""

  if (["fallido", "declined", "error", "voided"].includes(normalized)) {
    return "destructive"
  }

  if (["completo", "pagado", "aprobado", "paid", "success", "succeeded"].includes(normalized)) {
    return "secondary"
  }

  return "outline"
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

function normalizeAppointment(appointment: AdminAppointmentSummary): NormalizedAppointment | null {
  const start = new Date(appointment.startAt)
  if (Number.isNaN(start.getTime())) {
    return null
  }

  const serviceDuration = Number(appointment.service.durationMin)
  const safeDuration = Number.isFinite(serviceDuration) && serviceDuration > 0 ? Math.trunc(serviceDuration) : 30

  const rawEnd = appointment.endAt ? new Date(appointment.endAt) : null
  const end =
    rawEnd && !Number.isNaN(rawEnd.getTime()) && rawEnd.getTime() > start.getTime()
      ? rawEnd
      : new Date(start.getTime() + safeDuration * 60_000)

  const durationMin = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000))
  const employeeKey = `${appointment.employee.id ?? "none"}:${appointment.employee.name}`

  return {
    ...appointment,
    normalizedStart: start,
    normalizedEnd: end,
    normalizedDurationMin: durationMin,
    employeeKey,
  }
}

function getViewRange(mode: CalendarViewMode, focusDate: Date): ViewRange | null {
  if (mode === "list") {
    return null
  }

  if (mode === "day") {
    const start = startOfDay(focusDate)
    return { start, endExclusive: addDays(start, 1) }
  }

  if (mode === "week") {
    const start = startOfWeek(focusDate, { weekStartsOn: 1 })
    return { start, endExclusive: addDays(start, 7) }
  }

  const start = startOfMonth(focusDate)
  return { start, endExclusive: addMonths(start, 1) }
}

function intersectsRange(appointment: NormalizedAppointment, range: ViewRange): boolean {
  return appointment.normalizedStart < range.endExclusive && appointment.normalizedEnd > range.start
}

function buildEmployeeBuckets(appointments: NormalizedAppointment[]): EmployeeBucket[] {
  const map = new Map<string, EmployeeBucket>()

  for (const appointment of appointments) {
    const key = appointment.employeeKey
    const existing = map.get(key)

    if (existing) {
      existing.appointments.push(appointment)
      continue
    }

    map.set(key, {
      key,
      name: appointment.employee.name,
      appointments: [appointment],
    })
  }

  return [...map.values()]
    .map((bucket) => ({
      ...bucket,
      appointments: [...bucket.appointments].sort((a, b) => a.normalizedStart.getTime() - b.normalizedStart.getTime()),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
}

function getViewTitle(mode: CalendarViewMode, focusDate: Date): string {
  if (mode === "day") {
    return format(focusDate, "EEEE d 'de' MMMM yyyy", { locale: es })
  }

  if (mode === "week") {
    const start = startOfWeek(focusDate, { weekStartsOn: 1 })
    const end = addDays(start, 6)
    return `${format(start, "d MMM", { locale: es })} - ${format(end, "d MMM yyyy", { locale: es })}`
  }

  if (mode === "month") {
    return format(focusDate, "MMMM yyyy", { locale: es })
  }

  return "Agendamientos registrados"
}

function moveFocusDate(current: Date, mode: CalendarViewMode, direction: -1 | 1): Date {
  if (mode === "day") {
    return addDays(current, direction)
  }

  if (mode === "week") {
    return addWeeks(current, direction)
  }

  if (mode === "month") {
    return addMonths(current, direction)
  }

  return current
}

function dayMinuteToPx(totalMinutesFromStart: number): number {
  return totalMinutesFromStart * DAY_PIXELS_PER_MINUTE
}

function dateToMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

export default function BarberAgendamientosPage() {
  const [userId, setUserId] = useState<number | null>(null)
  const [appointments, setAppointments] = useState<AdminAppointmentSummary[]>([])
  const [employeesCatalog, setEmployeesCatalog] = useState<EmployeeSummary[]>([])
  const [clientsCatalog, setClientsCatalog] = useState<ClientSummary[]>([])
  const [servicesCatalog, setServicesCatalog] = useState<ServiceSummary[]>([])
  const [areAppointmentsLoading, setAreAppointmentsLoading] = useState(true)
  const [appointmentsError, setAppointmentsError] = useState<string | null>(null)

  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [viewMode, setViewMode] = useState<CalendarViewMode>("week")
  const [focusDate, setFocusDate] = useState<Date>(() => new Date())
  const [selectedAppointment, setSelectedAppointment] = useState<NormalizedAppointment | null>(null)
  const [quickActionSlot, setQuickActionSlot] = useState<QuickActionSlot | null>(null)
  const [quickActionMode, setQuickActionMode] = useState<QuickActionMode>("create")
  const [quickActionClientUserId, setQuickActionClientUserId] = useState<number | null>(null)
  const [quickActionGroupClientUserIds, setQuickActionGroupClientUserIds] = useState<number[]>([])
  const [quickActionServiceId, setQuickActionServiceId] = useState<number | null>(null)
  const [quickActionBlockStart, setQuickActionBlockStart] = useState("09:00")
  const [quickActionBlockEnd, setQuickActionBlockEnd] = useState("09:30")
  const [quickActionNote, setQuickActionNote] = useState("")
  const [quickActionError, setQuickActionError] = useState<string | null>(null)
  const [isQuickActionSubmitting, setIsQuickActionSubmitting] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem("userId")
      const parsed = stored ? Number.parseInt(stored, 10) : NaN
      setUserId(Number.isFinite(parsed) ? parsed : null)
    } catch {
      setUserId(null)
    }
  }, [])

  const loadAppointments = useCallback(
    async (signal?: AbortSignal) => {
      if (!userId) {
        setAppointments([])
        setAppointmentsError("No encontramos tu sesión activa. Vuelve a iniciar sesión.")
        setAreAppointmentsLoading(false)
        return
      }

      setAreAppointmentsLoading(true)
      setAppointmentsError(null)

      try {
        const response = await fetch(`/api/barber/agendamientos?userId=${userId}&limit=1000`, {
          signal,
          cache: "no-store",
          headers: buildTenantHeaders(),
        })
        const data: AppointmentsResponse = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(data.error ?? "No se pudieron cargar los agendamientos")
        }

        if (!signal?.aborted) {
          const list = Array.isArray(data.appointments) ? data.appointments : []
          setAppointments(list)
        }
      } catch (error) {
        if (signal?.aborted) {
          return
        }

        console.error("Error fetching barber appointments", error)
        setAppointmentsError("No se pudieron cargar los agendamientos.")
      } finally {
        if (!signal?.aborted) {
          setAreAppointmentsLoading(false)
        }
      }
    },
    [userId],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadAppointments(controller.signal)

    return () => controller.abort()
  }, [loadAppointments])

  const loadCatalogs = useCallback(async () => {
    if (!userId) {
      setEmployeesCatalog([])
      setClientsCatalog([])
      setServicesCatalog([])
      return
    }

    try {
      const headers = buildTenantHeaders()
      const response = await fetch(`/api/barber/agendamientos/catalogs?userId=${userId}`, {
        cache: "no-store",
        headers,
      })

      const data = (await response.json().catch(() => ({}))) as EmployeesResponse & ClientsResponse & ServicesResponse

      if (!response.ok) {
        throw new Error(data.error ?? "No se pudieron cargar los catálogos")
      }

      const employee = data.employee
      const clients = Array.isArray(data.clients) ? data.clients : []
      const services = Array.isArray(data.services) ? data.services : []

      setEmployeesCatalog(employee ? [employee] : [])
      setClientsCatalog([...clients].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" })))
      setServicesCatalog(
        [...services]
          .filter((service) => service.status?.trim().toLowerCase() !== "inactivo")
          .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" })),
      )
    } catch (error) {
      console.error("Error loading quick action catalogs", error)
    }
  }, [userId])

  useEffect(() => {
    void loadCatalogs()
  }, [loadCatalogs])

  const normalizedAppointments = useMemo(
    () => appointments.map(normalizeAppointment).filter((appointment): appointment is NormalizedAppointment => appointment !== null),
    [appointments],
  )

  const statusOptions = useMemo(() => {
    const values = new Set<string>()

    for (const appointment of normalizedAppointments) {
      const normalized = appointment.status?.trim().toLowerCase()
      if (normalized) {
        values.add(normalized)
      }
    }

    return [...values].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }))
  }, [normalizedAppointments])

  const baseFilteredAppointments = useMemo(() => {
    const search = searchTerm.trim().toLowerCase()

    return normalizedAppointments.filter((appointment) => {
      const statusMatches = statusFilter === "all" || (appointment.status?.trim().toLowerCase() ?? "") === statusFilter

      if (!statusMatches) {
        return false
      }

      if (search.length === 0) {
        return true
      }

      const searchableText = [
        appointment.client.name,
        appointment.employee.name,
        appointment.service.name,
        appointment.status ?? "",
        appointment.paymentStatus ?? "",
      ]
        .join(" ")
        .toLowerCase()

      return searchableText.includes(search)
    })
  }, [normalizedAppointments, searchTerm, statusFilter])

  const viewRange = useMemo(() => getViewRange(viewMode, focusDate), [viewMode, focusDate])

  const visibleAppointments = useMemo(() => {
    if (!viewRange) {
      return baseFilteredAppointments
    }

    return baseFilteredAppointments.filter((appointment) => intersectsRange(appointment, viewRange))
  }, [baseFilteredAppointments, viewRange])

  const metrics = useMemo(() => {
    const totals = {
      total: visibleAppointments.length,
      active: 0,
      completed: 0,
      cancelled: 0,
      paidAmount: 0,
    }

    for (const appointment of visibleAppointments) {
      const normalized = appointment.status?.trim().toLowerCase() ?? ""

      if (
        normalized.includes("pend") ||
        normalized.includes("confirm") ||
        normalized.includes("agend") ||
        normalized.includes("program")
      ) {
        totals.active += 1
      }

      if (normalized.includes("complet") || normalized.includes("final")) {
        totals.completed += 1
      }

      if (normalized.includes("cancel")) {
        totals.cancelled += 1
      }

      totals.paidAmount += appointment.paidAmount
    }

    return totals
  }, [visibleAppointments])

  const employees = useMemo(() => buildEmployeeBuckets(visibleAppointments), [visibleAppointments])

  const appointmentsByEmployeeName = useMemo(() => {
    const byName = new Map<string, NormalizedAppointment[]>()

    for (const appointment of visibleAppointments) {
      const key = appointment.employee.name
      const existing = byName.get(key) ?? []
      existing.push(appointment)
      byName.set(key, existing)
    }

    return byName
  }, [visibleAppointments])

  const dayEmployeeColumns = useMemo(() => {
    if (employeesCatalog.length > 0) {
      return employeesCatalog.map((employee) => ({
        key: String(employee.id),
        id: employee.id,
        name: employee.name,
        appointments: appointmentsByEmployeeName.get(employee.name) ?? [],
      }))
    }

    return employees.length > 0
      ? employees.map((employee) => ({
          key: employee.key,
          id: Number(employee.key.split(":")[0]) || null,
          name: employee.name,
          appointments: employee.appointments,
        }))
      : [{ key: "unassigned", id: null, name: "Sin empleado", appointments: [] }]
  }, [appointmentsByEmployeeName, employees, employeesCatalog])

  useEffect(() => {
    if (!quickActionSlot) {
      return
    }

    const hh = String(quickActionSlot.start.getHours()).padStart(2, "0")
    const mm = String(quickActionSlot.start.getMinutes()).padStart(2, "0")

    const endDate = new Date(quickActionSlot.start.getTime() + 30 * 60_000)
    const endHh = String(endDate.getHours()).padStart(2, "0")
    const endMm = String(endDate.getMinutes()).padStart(2, "0")

    setQuickActionMode("create")
    setQuickActionClientUserId(null)
    setQuickActionGroupClientUserIds([])
    setQuickActionServiceId(null)
    setQuickActionBlockStart(`${hh}:${mm}`)
    setQuickActionBlockEnd(`${endHh}:${endMm}`)
    setQuickActionNote("")
    setQuickActionError(null)
  }, [quickActionSlot])

  const weekDays = useMemo(() => {
    if (viewMode !== "week") {
      return [] as Date[]
    }

    const start = startOfWeek(focusDate, { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, index) => addDays(start, index))
  }, [focusDate, viewMode])

  const monthCells = useMemo(() => {
    if (viewMode !== "month") {
      return [] as Date[]
    }

    const monthStart = startOfMonth(focusDate)
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
  }, [focusDate, viewMode])

  const listAppointments = useMemo(
    () => [...visibleAppointments].sort((a, b) => b.normalizedStart.getTime() - a.normalizedStart.getTime()),
    [visibleAppointments],
  )

  const shouldShowErrorCard = Boolean(appointmentsError) && !areAppointmentsLoading && appointments.length === 0

  const handleReload = useCallback(() => {
    void loadAppointments()
  }, [loadAppointments])

  const handleViewModeChange = (value: string) => {
    const nextMode: CalendarViewMode = ["day", "week", "month", "list"].includes(value)
      ? (value as CalendarViewMode)
      : "week"
    setViewMode(nextMode)
  }

  const handleQuickActionSubmit = useCallback(async () => {
    if (!userId) {
      setQuickActionError("No encontramos tu sesión activa. Vuelve a iniciar sesión.")
      return
    }

    if (!quickActionSlot || typeof quickActionSlot.employeeId !== "number") {
      setQuickActionError("Selecciona un empleado válido en el calendario.")
      return
    }

    if (!quickActionServiceId && quickActionMode !== "block") {
      setQuickActionError("Selecciona un servicio.")
      return
    }

    setIsQuickActionSubmitting(true)
    setQuickActionError(null)

    try {
      const headers = {
        "Content-Type": "application/json",
        ...buildTenantHeaders(),
      }

      let payload: Record<string, unknown>

      if (quickActionMode === "create") {
        if (!quickActionClientUserId) {
          setQuickActionError("Selecciona un cliente para la cita.")
          return
        }

        payload = {
          action: "create",
          clientUserId: quickActionClientUserId,
          serviceIds: [quickActionServiceId],
          start: quickActionSlot.start.toISOString(),
        }
      } else if (quickActionMode === "group") {
        if (quickActionGroupClientUserIds.length < 2) {
          setQuickActionError("Selecciona al menos dos clientes para la cita grupal.")
          return
        }

        payload = {
          action: "group",
          clientUserIds: quickActionGroupClientUserIds,
          serviceIds: [quickActionServiceId],
          start: quickActionSlot.start.toISOString(),
        }
      } else {
        const yyyy = quickActionSlot.start.getFullYear()
        const mm = String(quickActionSlot.start.getMonth() + 1).padStart(2, "0")
        const dd = String(quickActionSlot.start.getDate()).padStart(2, "0")

        payload = {
          action: "block",
          date: `${yyyy}-${mm}-${dd}`,
          startTime: quickActionBlockStart,
          endTime: quickActionBlockEnd,
          note: quickActionNote.trim() || null,
        }
      }

      const response = await fetch(`/api/barber/agendamientos?userId=${userId}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      })

      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        throw new Error(data.error ?? "No se pudo completar la acción.")
      }

      setQuickActionSlot(null)
      await loadAppointments()
    } catch (error) {
      setQuickActionError(error instanceof Error ? error.message : "No se pudo completar la acción.")
    } finally {
      setIsQuickActionSubmitting(false)
    }
  }, [
    loadAppointments,
    quickActionBlockEnd,
    quickActionBlockStart,
    quickActionClientUserId,
    quickActionGroupClientUserIds,
    quickActionMode,
    quickActionNote,
    quickActionServiceId,
    quickActionSlot,
    userId,
  ])

  const showTimeNavigation = viewMode !== "list"
  const dayTotalMinutes = (DAY_END_HOUR - DAY_START_HOUR) * 60
  const dayGridHeight = dayMinuteToPx(dayTotalMinutes)
  const bookableServices = servicesCatalog.filter((service) => service.serviceType !== "paquete")

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto space-y-8 px-4 py-8">
        <section className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-5">
          <CompactMetricCard title="Agendamientos" value={formatNumber(metrics.total)} />
          <CompactMetricCard title="Activos" value={formatNumber(metrics.active)} />
          <CompactMetricCard title="Completados" value={formatNumber(metrics.completed)} />
          <CompactMetricCard title="Cancelados" value={formatNumber(metrics.cancelled)} />
          <CompactMetricCard title="Monto pagado" value={formatCurrency(metrics.paidAmount)} className="col-span-2 xl:col-span-1" />
        </section>

        {shouldShowErrorCard ? (
          <Card>
            <CardHeader>
              <CardTitle>No pudimos cargar los agendamientos</CardTitle>
              <CardDescription>Intenta nuevamente para obtener la información más reciente de la agenda.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleReload}>Reintentar</Button>
            </CardContent>
          </Card>
        ) : areAppointmentsLoading ? (
          <AppointmentsTableSkeleton />
        ) : (
          <>
            {appointmentsError && (
              <Alert variant="destructive">
                <AlertTitle>Error al actualizar la agenda</AlertTitle>
                <AlertDescription>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span>{appointmentsError}</span>
                    <Button variant="outline" onClick={handleReload}>
                      Reintentar
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <Card className="border-border/60 bg-gradient-to-b from-background/80 via-background to-background/95">
              <CardHeader className="space-y-2">
                <CardTitle className="text-xl">Agendamientos y calendario</CardTitle>
                <CardDescription>
                  Gestiona tu agenda en vista de día, semana, mes o lista con acciones rápidas sobre tus horarios.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-muted-foreground">Busca por cliente, empleado o servicio y filtra por estado.</p>
                  <Button variant="outline" onClick={handleReload}>
                    Recargar
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Buscar por cliente, empleado o servicio"
                  />

                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filtrar por estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los estados</SelectItem>
                      {statusOptions.map((status) => (
                        <SelectItem key={status} value={status}>
                          {getStatusLabel(status)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Tabs value={viewMode} onValueChange={handleViewModeChange} className="space-y-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <TabsList className="h-10 w-full lg:w-auto">
                      <TabsTrigger value="day">Día</TabsTrigger>
                      <TabsTrigger value="week">Semana</TabsTrigger>
                      <TabsTrigger value="month">Mes</TabsTrigger>
                      <TabsTrigger value="list">Lista</TabsTrigger>
                    </TabsList>

                    <div className="flex items-center gap-2">
                      {showTimeNavigation && (
                        <>
                          <Button variant="outline" size="icon" onClick={() => setFocusDate((current) => moveFocusDate(current, viewMode, -1))}>
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" onClick={() => setFocusDate(new Date())}>
                            Hoy
                          </Button>
                          <Button variant="outline" size="icon" onClick={() => setFocusDate((current) => moveFocusDate(current, viewMode, 1))}>
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      <Badge variant="outline" className="px-3 py-1 text-xs capitalize">
                        {getViewTitle(viewMode, focusDate)}
                      </Badge>
                    </div>
                  </div>

                  <TabsContent value="day">
                    <div className="overflow-x-auto rounded-xl border border-border/60 bg-background/60 shadow-sm">
                      <div className="min-w-[920px]">
                        <div
                          className="grid border-b border-border/60 bg-muted/30"
                          style={{
                            gridTemplateColumns: `80px repeat(${dayEmployeeColumns.length}, minmax(220px, 1fr))`,
                          }}
                        >
                          <div className="border-r border-border/60 p-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Hora
                          </div>
                          {dayEmployeeColumns.map((employee) => (
                            <div key={employee.key} className="border-r border-border/60 p-2 text-sm font-semibold">
                              {employee.name}
                            </div>
                          ))}
                        </div>

                        <div
                          className="grid"
                          style={{
                            gridTemplateColumns: `80px repeat(${dayEmployeeColumns.length}, minmax(220px, 1fr))`,
                          }}
                        >
                          <div className="relative border-r border-border/60 bg-muted/20" style={{ height: `${dayGridHeight}px` }}>
                            {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, index) => {
                              const hour = DAY_START_HOUR + index
                              const topPx = dayMinuteToPx(index * 60)

                              return (
                                <div
                                  key={hour}
                                  className="absolute left-0 right-0 border-t border-border/40 px-2 text-[11px] text-muted-foreground"
                                  style={{ top: `${topPx}px` }}
                                >
                                  {String(hour).padStart(2, "0")}:00
                                </div>
                              )
                            })}
                          </div>

                          {dayEmployeeColumns.map((employee) => (
                            <div
                              key={employee.key}
                              className="relative border-r border-border/60"
                              style={{ height: `${dayGridHeight}px` }}
                              onClick={(event) => {
                                const rect = event.currentTarget.getBoundingClientRect()
                                const offsetY = Math.max(0, Math.min(event.clientY - rect.top, dayGridHeight))
                                const roundedMinute = Math.round((offsetY / DAY_PIXELS_PER_MINUTE) / 5) * 5
                                const minuteFromStart = Math.max(0, Math.min(dayTotalMinutes, roundedMinute))
                                const slotHour = DAY_START_HOUR + Math.floor(minuteFromStart / 60)
                                const slotMinute = minuteFromStart % 60

                                const slotStart = new Date(focusDate)
                                slotStart.setHours(slotHour, slotMinute, 0, 0)

                                const slotLabel = `${String(slotHour).padStart(2, "0")}:${String(slotMinute).padStart(2, "0")}`
                                setQuickActionSlot({
                                  employeeId: typeof employee.id === "number" ? employee.id : null,
                                  employeeName: employee.name,
                                  start: slotStart,
                                  timeLabel: slotLabel,
                                })
                              }}
                            >
                              {Array.from({ length: dayTotalMinutes / 30 + 1 }, (_, index) => (
                                <div
                                  key={index}
                                  className="absolute left-0 right-0 border-t border-border/30"
                                  style={{ top: `${dayMinuteToPx(index * 30)}px` }}
                                />
                              ))}

                              {employee.appointments.map((appointment) => {
                                const startMinutes = dateToMinutes(appointment.normalizedStart)
                                const endMinutes = dateToMinutes(appointment.normalizedEnd)
                                const displayStart = Math.max(startMinutes, DAY_START_HOUR * 60)
                                const displayEnd = Math.min(endMinutes, DAY_END_HOUR * 60)
                                const top = dayMinuteToPx(displayStart - DAY_START_HOUR * 60)
                                const height = Math.max(dayMinuteToPx(displayEnd - displayStart), 34)
                                const isCompactCard = height < 56
                                const canShowThirdLine = height >= 70

                                return (
                                  <button
                                    key={appointment.id}
                                    type="button"
                                    className="absolute left-1.5 right-1.5 overflow-hidden rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-left shadow-sm transition hover:bg-primary/15"
                                    style={{
                                      top: `${top}px`,
                                      height: `${height}px`,
                                    }}
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      setSelectedAppointment(appointment)
                                    }}
                                  >
                                    <p className="truncate text-[11px] font-semibold leading-tight">
                                      {format(appointment.normalizedStart, "HH:mm")} - {format(appointment.normalizedEnd, "HH:mm")}
                                    </p>
                                    <p className="truncate text-[11px] leading-tight">{appointment.client.name}</p>
                                    {!isCompactCard && canShowThirdLine ? (
                                      <p className="truncate text-[11px] leading-tight text-muted-foreground">{appointment.service.name}</p>
                                    ) : null}
                                  </button>
                                )
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="week">
                    <div className="overflow-x-auto rounded-xl border border-border/60 bg-background/60 shadow-sm">
                      <div className="min-w-[1200px]">
                        <div
                          className="grid border-b border-border/60 bg-muted/30"
                          style={{ gridTemplateColumns: `80px repeat(${weekDays.length}, minmax(160px, 1fr))` }}
                        >
                          <div className="border-r border-border/60 p-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Hora
                          </div>
                          {weekDays.map((day) => (
                            <div key={day.toISOString()} className="border-r border-border/60 p-2 text-sm font-semibold capitalize">
                              {format(day, "EEEE d", { locale: es })}
                            </div>
                          ))}
                        </div>

                        <div
                          className="grid"
                          style={{ gridTemplateColumns: `80px repeat(${weekDays.length}, minmax(160px, 1fr))` }}
                        >
                          <div className="relative border-r border-border/60 bg-muted/20" style={{ height: `${dayGridHeight}px` }}>
                            {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, index) => {
                              const hour = DAY_START_HOUR + index
                              const topPx = dayMinuteToPx(index * 60)

                              return (
                                <div
                                  key={hour}
                                  className="absolute left-0 right-0 border-t border-border/40 px-2 text-[11px] text-muted-foreground"
                                  style={{ top: `${topPx}px` }}
                                >
                                  {String(hour).padStart(2, "0")}:00
                                </div>
                              )
                            })}
                          </div>

                          {weekDays.map((day) => {
                            const dayAppointments = visibleAppointments.filter((item) => isSameDay(item.normalizedStart, day))

                            return (
                              <div key={day.toISOString()} className="relative border-r border-border/60" style={{ height: `${dayGridHeight}px` }}>
                                {Array.from({ length: dayTotalMinutes / 30 + 1 }, (_, index) => (
                                  <div
                                    key={index}
                                    className="absolute left-0 right-0 border-t border-border/30"
                                    style={{ top: `${dayMinuteToPx(index * 30)}px` }}
                                  />
                                ))}

                                {dayAppointments.map((appointment) => {
                                  const startMinutes = dateToMinutes(appointment.normalizedStart)
                                  const endMinutes = dateToMinutes(appointment.normalizedEnd)
                                  const displayStart = Math.max(startMinutes, DAY_START_HOUR * 60)
                                  const displayEnd = Math.min(endMinutes, DAY_END_HOUR * 60)
                                  const top = dayMinuteToPx(displayStart - DAY_START_HOUR * 60)
                                  const height = Math.max(dayMinuteToPx(displayEnd - displayStart), 34)
                                  const isCompactCard = height < 56
                                  const canShowThirdLine = height >= 70

                                  return (
                                    <button
                                      key={appointment.id}
                                      type="button"
                                      className="absolute left-1.5 right-1.5 overflow-hidden rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-left shadow-sm transition hover:bg-primary/15"
                                      style={{ top: `${top}px`, height: `${height}px` }}
                                      onClick={() => setSelectedAppointment(appointment)}
                                    >
                                      <p className="truncate text-[11px] font-semibold leading-tight">
                                        {format(appointment.normalizedStart, "HH:mm")} - {format(appointment.normalizedEnd, "HH:mm")}
                                      </p>
                                      <p className="truncate text-[11px] leading-tight">{appointment.client.name}</p>
                                      {!isCompactCard && canShowThirdLine ? (
                                        <p className="truncate text-[11px] leading-tight text-muted-foreground">{appointment.employee.name}</p>
                                      ) : null}
                                    </button>
                                  )
                                })}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    {visibleAppointments.length === 0 && (
                      <p className="mt-3 text-sm text-muted-foreground">
                        Sin agendamientos para esta semana con los filtros actuales.
                      </p>
                    )}
                  </TabsContent>

                  <TabsContent value="month">
                    <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-border/60 bg-background/60">
                      {monthCells.map((day) => {
                        const dayAppointments = visibleAppointments.filter((appointment) => isSameDay(appointment.normalizedStart, day))
                        const isCurrentMonth = day.getMonth() === focusDate.getMonth()

                        return (
                          <div
                            key={day.toISOString()}
                            className={cn(
                              "min-h-48 border-b border-r border-border/60 p-2",
                              !isCurrentMonth && "bg-muted/20 text-muted-foreground",
                            )}
                          >
                            <p className="mb-2 text-sm font-semibold">{format(day, "d")}</p>
                            <div className="space-y-1">
                              {dayAppointments.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground">Sin citas</p>
                              ) : (
                                dayAppointments.slice(0, 4).map((appointment) => (
                                  <button
                                    key={appointment.id}
                                    type="button"
                                    className="w-full rounded border border-border/60 bg-muted/30 px-2 py-1 text-left"
                                    onClick={() => setSelectedAppointment(appointment)}
                                  >
                                    <p className="text-[11px] font-semibold">
                                      {format(appointment.normalizedStart, "HH:mm")} {appointment.employee.name}
                                    </p>
                                    <p className="line-clamp-1 text-[11px] text-muted-foreground">{appointment.service.name}</p>
                                  </button>
                                ))
                              )}
                              {dayAppointments.length > 4 && (
                                <p className="text-[11px] text-muted-foreground">+{dayAppointments.length - 4} más</p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {visibleAppointments.length === 0 && (
                      <p className="mt-3 text-sm text-muted-foreground">
                        Sin agendamientos para este mes con los filtros actuales.
                      </p>
                    )}
                  </TabsContent>

                  <TabsContent value="list">
                    {listAppointments.length === 0 ? (
                      <Card>
                        <CardContent>
                          <Empty className="border border-dashed">
                            <EmptyHeader>
                              <EmptyMedia variant="icon">
                                <CalendarDays className="h-6 w-6" />
                              </EmptyMedia>
                              <EmptyTitle>Sin agendamientos</EmptyTitle>
                              <EmptyDescription>
                                No se encontraron resultados para los filtros actuales en la agenda.
                              </EmptyDescription>
                            </EmptyHeader>
                            <EmptyContent className="text-sm text-muted-foreground">
                              Ajusta los filtros o crea nuevas reservas usando acciones rápidas sobre tu calendario.
                            </EmptyContent>
                          </Empty>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-border/60 bg-background/60 shadow-sm">
                        <div className="overflow-x-auto">
                          <Table className="min-w-[1080px] text-base">
                            <TableHeader className="bg-muted/40">
                              <TableRow className="hover:bg-transparent">
                                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">#</TableHead>
                                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fecha y hora</TableHead>
                                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cliente</TableHead>
                                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Empleado</TableHead>
                                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Servicio</TableHead>
                                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado</TableHead>
                                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado pago</TableHead>
                                <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Monto pagado</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {listAppointments.map((appointment) => (
                                <TableRow key={appointment.id} className="h-[76px] border-border/50 transition-colors">
                                  <TableCell className="font-medium">{appointment.id}</TableCell>
                                  <TableCell>
                                    <div className="flex flex-col">
                                      <span>{formatDateTime(appointment.normalizedStart.toISOString())}</span>
                                      <span className="text-xs text-muted-foreground">
                                        Fin: {formatDateTime(appointment.normalizedEnd.toISOString())}
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell>{appointment.client.name}</TableCell>
                                  <TableCell>{appointment.employee.name}</TableCell>
                                  <TableCell>
                                    <div className="flex flex-col">
                                      <span>{appointment.service.name}</span>
                                      <span className="text-xs text-muted-foreground">
                                        {formatCurrency(appointment.service.price)} · {formatNumber(appointment.normalizedDurationMin)} min
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={getStatusVariant(appointment.status)}>{getStatusLabel(appointment.status)}</Badge>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={getPaymentStatusVariant(appointment.paymentStatus)}>
                                      {getPaymentStatusLabel(appointment.paymentStatus)}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right">{formatCurrency(appointment.paidAmount)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>

                <p className="text-sm text-muted-foreground">
                  {formatNumber(visibleAppointments.length)} agendamientos visibles en la vista actual.
                </p>
              </CardContent>
            </Card>

            {!userId && (
              <Card>
                <CardContent className="py-6">
                  <p className="text-sm text-muted-foreground">No encontramos tu sesión activa para gestionar la agenda.</p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>

      <Dialog open={Boolean(selectedAppointment)} onOpenChange={(open) => !open && setSelectedAppointment(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedAppointment
                ? `${format(selectedAppointment.normalizedStart, "HH:mm")} - ${format(selectedAppointment.normalizedEnd, "HH:mm")}`
                : "Detalle de cita"}
            </DialogTitle>
            <DialogDescription>
              {selectedAppointment
                ? `Empleado: ${selectedAppointment.employee.name} · Cliente: ${selectedAppointment.client.name}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {selectedAppointment && (
            <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3 text-sm">
              <p>
                <span className="font-medium">Servicio:</span> {selectedAppointment.service.name}
              </p>
              <p>
                <span className="font-medium">Duración:</span> {formatNumber(selectedAppointment.normalizedDurationMin)} min
              </p>
              <p>
                <span className="font-medium">Precio:</span> {formatCurrency(selectedAppointment.service.price)}
              </p>
              <div className="flex items-center gap-2">
                <Badge variant={getStatusVariant(selectedAppointment.status)}>{getStatusLabel(selectedAppointment.status)}</Badge>
                <Badge variant={getPaymentStatusVariant(selectedAppointment.paymentStatus)}>
                  {getPaymentStatusLabel(selectedAppointment.paymentStatus)}
                </Badge>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedAppointment(null)}>
              Cerrar
            </Button>
            <Button disabled>Editar cita</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(quickActionSlot)} onOpenChange={(open) => !open && setQuickActionSlot(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{quickActionSlot?.timeLabel ?? "Acciones rápidas"}</DialogTitle>
            <DialogDescription>
              {quickActionSlot ? `Empleado: ${quickActionSlot.employeeName}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Select value={quickActionMode} onValueChange={(value: QuickActionMode) => setQuickActionMode(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona acción" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="create">Añadir cita</SelectItem>
                <SelectItem value="group">Añadir cita de grupo</SelectItem>
                <SelectItem value="block">Bloquear horario</SelectItem>
              </SelectContent>
            </Select>

            {quickActionMode !== "block" && (
              <Select
                value={quickActionServiceId ? String(quickActionServiceId) : ""}
                onValueChange={(value) => setQuickActionServiceId(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona servicio" />
                </SelectTrigger>
                <SelectContent>
                  {bookableServices.map((service) => (
                    <SelectItem key={service.id} value={String(service.id)}>
                      {service.name} · {formatNumber(service.durationMin)} min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {quickActionMode === "create" && (
              <Select
                value={quickActionClientUserId ? String(quickActionClientUserId) : ""}
                onValueChange={(value) => setQuickActionClientUserId(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clientsCatalog.map((client) => (
                    <SelectItem key={client.userId} value={String(client.userId)}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {quickActionMode === "group" && (
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-border/60 p-3">
                {clientsCatalog.map((client) => {
                  const checked = quickActionGroupClientUserIds.includes(client.userId)
                  return (
                    <label key={client.userId} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => {
                          const isChecked = value === true
                          setQuickActionGroupClientUserIds((current) => {
                            if (isChecked) {
                              return [...new Set([...current, client.userId])]
                            }
                            return current.filter((item) => item !== client.userId)
                          })
                        }}
                      />
                      <span>{client.name}</span>
                    </label>
                  )
                })}
              </div>
            )}

            {quickActionMode === "block" && (
              <div className="grid grid-cols-2 gap-2">
                <Input type="time" value={quickActionBlockStart} onChange={(event) => setQuickActionBlockStart(event.target.value)} />
                <Input type="time" value={quickActionBlockEnd} onChange={(event) => setQuickActionBlockEnd(event.target.value)} />
                <Input
                  className="col-span-2"
                  placeholder="Motivo (opcional)"
                  value={quickActionNote}
                  onChange={(event) => setQuickActionNote(event.target.value)}
                />
              </div>
            )}

            {quickActionError && <p className="text-sm text-destructive">{quickActionError}</p>}

            <DialogFooter>
              <Button variant="outline" onClick={() => setQuickActionSlot(null)}>
                Cancelar
              </Button>
              <Button onClick={() => void handleQuickActionSubmit()} disabled={isQuickActionSubmitting}>
                {isQuickActionSubmitting ? "Guardando..." : "Guardar acción"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AppointmentsTableSkeleton() {
  return (
    <Card>
      <CardHeader className="space-y-2">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-4 w-72" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  )
}

function CompactMetricCard({
  title,
  value,
  className,
}: {
  title: string
  value: string
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader className="space-y-1 px-3 pb-0 pt-2 sm:px-6 sm:pb-2 sm:pt-4">
        <CardTitle className="line-clamp-1 text-[13px] font-medium text-muted-foreground sm:text-sm">
          {title}
        </CardTitle>
        <CardDescription className="text-[2rem] font-bold leading-none text-foreground sm:text-3xl">
          {value}
        </CardDescription>
      </CardHeader>
    </Card>
  )
}
