"use client"

import { useEffect, useMemo, useState } from "react"
import { addMinutes, differenceInMinutes, format, isSameDay, startOfDay } from "date-fns"
import { es } from "date-fns/locale"
import {
  CalendarIcon,
  CheckCircle,
  CheckCircle2,
  Clock3,
  CreditCard,
  DollarSign,
  Loader2,
  Timer,
  User,
  XCircle,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"

type AppointmentScope = "today" | "upcoming" | "history"

type AppointmentStatus = "pendiente" | "confirmada" | "completada" | "cancelada" | string

type Appointment = {
  id: number
  clientName: string
  serviceName: string
  start: string
  end: string | null
  price: number | null
  status: AppointmentStatus
  paymentStatus: string | null
  paymentMethod: string | null
  durationMin: number | null
}

const PAYMENT_SUCCESS_STATUSES = ["completo", "pagado", "aprobado", "paid", "success", "succeeded"]
const PAYMENT_FAILED_STATUSES = ["fallido", "declined", "error", "voided"]
const MUTABLE_STATUSES = new Set(["pendiente", "confirmada"])

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
})

const normalize = (value: string | null | undefined) => (value ?? "").trim().toLowerCase()

const formatCurrency = (value: number | null) => {
  if (value == null || Number.isNaN(value)) {
    return "Sin valor"
  }
  return currencyFormatter.format(value)
}

const isPaidStatus = (status: string | null) => PAYMENT_SUCCESS_STATUSES.includes(normalize(status))

const isFailedPaymentStatus = (status: string | null) => PAYMENT_FAILED_STATUSES.includes(normalize(status))

const getPaymentMethodText = (method: string | null) => {
  const normalized = normalize(method)
  if (!normalized) return "Método sin registrar"
  if (["efectivo", "cash"].includes(normalized)) return "Efectivo"
  if (["tarjeta", "card", "credit_card", "debit_card"].includes(normalized)) return "Tarjeta"
  if (["transferencia", "bank_transfer", "pse", "nequi", "daviplata"].includes(normalized)) {
    return "Transferencia"
  }
  return normalized
}

const getRelativeScheduleText = (startIso: string) => {
  const start = new Date(startIso)
  const deltaMin = differenceInMinutes(start, new Date())
  if (deltaMin > 0) {
    if (deltaMin < 60) return `Inicia en ${deltaMin} min`
    const hours = Math.floor(deltaMin / 60)
    const mins = deltaMin % 60
    return mins > 0 ? `Inicia en ${hours} h ${mins} min` : `Inicia en ${hours} h`
  }

  if (deltaMin >= -45) return "En curso"
  return `Inició hace ${Math.abs(deltaMin)} min`
}

const getScopeSubtitle = (scope: AppointmentScope) => {
  if (scope === "today") return "Operación del día"
  if (scope === "upcoming") return "Planeación de próximas jornadas"
  return "Control de cumplimiento histórico"
}

export default function BarberAppointmentsPage() {
  const { toast } = useToast()
  const [userId, setUserId] = useState<number | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [activeTab, setActiveTab] = useState<AppointmentScope>("today")

  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<number | null>(null)

  const buildTenantHeaders = (): HeadersInit => {
    if (typeof window === "undefined") {
      return {}
    }

    const tenant = (localStorage.getItem("tenantSchema") ?? localStorage.getItem("userTenant") ?? "").trim()
    const userEmail = (localStorage.getItem("userEmail") ?? "").trim().toLowerCase()
    const headers: Record<string, string> = {}

    if (tenant) {
      headers["x-tenant"] = tenant
    }

    if (userEmail) {
      headers["x-user-email"] = userEmail
    }

    return headers
  }

  useEffect(() => {
    try {
      const stored = localStorage.getItem("userId")
      const parsed = stored ? Number.parseInt(stored, 10) : NaN
      setUserId(Number.isFinite(parsed) ? parsed : null)
    } catch {
      setUserId(null)
    }
  }, [])

  const loadAppointments = async () => {
    if (!userId) {
      setAppointments([])
      setError("No encontramos tu sesión activa. Vuelve a iniciar sesión.")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        userId: String(userId),
        scope: activeTab,
      })

      if (activeTab === "today") {
        params.set("date", format(startOfDay(selectedDate), "yyyy-MM-dd"))
      }

      const response = await fetch(`/api/barber/appointments?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
        headers: buildTenantHeaders(),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setAppointments([])
        setError(data.error ?? "No se pudieron cargar las citas")
        return
      }

      const items = Array.isArray(data.appointments) ? (data.appointments as any[]) : []
      setAppointments(
        items.map((item) => ({
          id: Number(item.id),
          clientName: String(item.clientName ?? "Cliente"),
          serviceName: String(item.serviceName ?? "Servicio"),
          start: String(item.start),
          end: item.end ? String(item.end) : null,
          price: item.price != null && Number.isFinite(Number(item.price)) ? Number(item.price) : null,
          status: String(item.status ?? "pendiente"),
          paymentStatus: item.paymentStatus ? String(item.paymentStatus) : null,
          paymentMethod: item.paymentMethod ? String(item.paymentMethod) : null,
          durationMin: item.durationMin != null && Number.isFinite(Number(item.durationMin)) ? Number(item.durationMin) : null,
        })),
      )
    } catch (err) {
      console.error("Error loading barber appointments", err)
      setAppointments([])
      setError("Error de conexión al cargar las citas")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadAppointments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, activeTab, selectedDate])

  const updateStatus = async (appointmentId: number, status: "cancelada" | "completada") => {
    if (!userId) return
    setUpdatingId(appointmentId)
    try {
      const response = await fetch(`/api/barber/appointments/${appointmentId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildTenantHeaders() },
        body: JSON.stringify({ userId, status }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        toast({
          title: "No se pudo actualizar",
          description: data.error ?? "Intenta nuevamente.",
          variant: "destructive",
        })
        return
      }

      toast({ title: "Actualizado", description: "La cita se actualizó correctamente." })
      await loadAppointments()
    } catch (err) {
      console.error("Error updating appointment status", err)
      toast({
        title: "Error de conexión",
        description: "No pudimos comunicar con el servidor.",
        variant: "destructive",
      })
    } finally {
      setUpdatingId(null)
    }
  }

  const selectedDayAppointments = useMemo(() => {
    const target = startOfDay(selectedDate)
    return appointments.filter((apt) => isSameDay(new Date(apt.start), target))
  }, [appointments, selectedDate])

  const historyAppointments = useMemo(() => {
    return [...appointments].sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
  }, [appointments])

  const activeAppointments = useMemo(() => {
    if (activeTab === "today") return selectedDayAppointments
    if (activeTab === "history") return historyAppointments
    return appointments
  }, [activeTab, appointments, historyAppointments, selectedDayAppointments])

  const appointmentsForSelectedDate = useMemo(() => {
    const target = startOfDay(selectedDate)
    return appointments
      .filter((apt) => isSameDay(new Date(apt.start), target))
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  }, [appointments, selectedDate])

  const summary = useMemo(() => {
    const total = activeAppointments.length
    const pending = activeAppointments.filter((apt) => MUTABLE_STATUSES.has(normalize(apt.status))).length
    const completed = activeAppointments.filter((apt) => normalize(apt.status) === "completada").length
    const canceled = activeAppointments.filter((apt) => normalize(apt.status) === "cancelada").length
    const paid = activeAppointments.filter((apt) => isPaidStatus(apt.paymentStatus)).length

    const projectedIncome = activeAppointments.reduce((acc, apt) => {
      if (apt.price == null) return acc
      if (normalize(apt.status) === "cancelada") return acc
      return acc + apt.price
    }, 0)

    const collectedIncome = activeAppointments.reduce((acc, apt) => {
      if (apt.price == null || !isPaidStatus(apt.paymentStatus)) return acc
      return acc + apt.price
    }, 0)

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0
    const paymentRate = total > 0 ? Math.round((paid / total) * 100) : 0

    return {
      total,
      pending,
      completed,
      canceled,
      paid,
      projectedIncome,
      collectedIncome,
      completionRate,
      paymentRate,
    }
  }, [activeAppointments])

  const nextActionableAppointment = useMemo(() => {
    const now = new Date().getTime()
    return appointments
      .filter((apt) => MUTABLE_STATUSES.has(normalize(apt.status)) && new Date(apt.start).getTime() >= now)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())[0]
  }, [appointments])

  const getStatusColor = (status: AppointmentStatus) => {
    switch (normalize(status)) {
      case "pendiente":
        return "bg-amber-500/10 text-amber-700 border-amber-500/30"
      case "confirmada":
        return "bg-sky-500/10 text-sky-700 border-sky-500/30"
      case "completada":
        return "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
      case "cancelada":
        return "bg-rose-500/10 text-rose-700 border-rose-500/30"
      default:
        return "bg-muted text-foreground border-border"
    }
  }

  const getStatusText = (status: AppointmentStatus) => {
    switch (normalize(status)) {
      case "pendiente":
        return "Pendiente"
      case "confirmada":
        return "Confirmada"
      case "completada":
        return "Completada"
      case "cancelada":
        return "Cancelada"
      default:
        return status
    }
  }

  const getPaymentStatusText = (status: string | null) => {
    const normalized = normalize(status)
    if (!normalized) return "Pago pendiente"
    if (isPaidStatus(normalized)) return "Pagada"
    if (isFailedPaymentStatus(normalized)) return "Pago fallido"
    return `Pago: ${normalized}`
  }

  const getPaymentStatusClass = (status: string | null) => {
    const normalized = normalize(status)
    if (isPaidStatus(normalized)) {
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
    }
    if (isFailedPaymentStatus(normalized)) {
      return "bg-rose-500/10 text-rose-700 border-rose-500/30"
    }
    return "bg-amber-500/10 text-amber-700 border-amber-500/30"
  }

  const renderList = (items: Appointment[]) => {
    if (isLoading) {
      return (
        <Card>
          <CardContent className="py-6">
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, idx) => (
                <Skeleton key={idx} className="h-36 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      )
    }

    if (error) {
      return (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )
    }

    if (items.length === 0) {
      const copy =
        activeTab === "history"
          ? {
              title: "Sin historial operativo",
              description: "Cuando cierres citas, aquí verás el desempeño y trazabilidad.",
            }
          : activeTab === "upcoming"
            ? {
                title: "Sin agenda programada",
                description: "Las próximas reservas aparecerán con prioridad de ejecución.",
              }
            : {
                title: "Sin citas para la fecha seleccionada",
                description: "Puedes cambiar de fecha en el calendario o revisar próximas citas.",
              }

      return (
        <Card>
          <CardContent className="py-12">
            <Empty className="border-0 bg-transparent p-0">
              <EmptyMedia variant="icon">
                <CalendarIcon className="size-6" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>{copy.title}</EmptyTitle>
                <EmptyDescription>{copy.description}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      )
    }

    return (
      <div className="space-y-3">
        {items.map((appointment) => (
          <Card
            key={appointment.id}
            className={cn(
              "border-l-4",
              normalize(appointment.status) === "completada" && "border-l-emerald-500",
              normalize(appointment.status) === "cancelada" && "border-l-rose-500",
              normalize(appointment.status) === "pendiente" && "border-l-amber-500",
              normalize(appointment.status) === "confirmada" && "border-l-sky-500",
            )}
          >
            <CardContent className="p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold">{appointment.clientName}</h3>
                    <p className="truncate text-sm text-muted-foreground">{appointment.serviceName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Orden #{appointment.id} · {getRelativeScheduleText(appointment.start)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={getStatusColor(appointment.status)}>
                    {getStatusText(appointment.status)}
                  </Badge>
                  <Badge variant="outline" className={getPaymentStatusClass(appointment.paymentStatus)}>
                    {getPaymentStatusText(appointment.paymentStatus)}
                  </Badge>
                </div>
              </div>

              <div className="grid gap-2 rounded-md border bg-muted/20 p-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">Fecha</p>
                  <p className="font-medium">{format(new Date(appointment.start), "EEEE d 'de' MMMM", { locale: es })}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">Horario</p>
                  <p className="font-medium">
                    {format(new Date(appointment.start), "HH:mm")}
                    {appointment.end
                      ? ` - ${format(new Date(appointment.end), "HH:mm")}`
                      : appointment.durationMin
                        ? ` - ${format(addMinutes(new Date(appointment.start), appointment.durationMin), "HH:mm")}`
                        : ""}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">Duración</p>
                  <p className="font-medium">
                    {appointment.durationMin != null
                      ? `${appointment.durationMin} min`
                      : appointment.end
                        ? `${Math.max(0, differenceInMinutes(new Date(appointment.end), new Date(appointment.start)))} min`
                        : "Sin definir"}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">Valor</p>
                  <p className="font-medium">{formatCurrency(appointment.price)}</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1">
                  <CreditCard className="h-3.5 w-3.5" />
                  {getPaymentMethodText(appointment.paymentMethod)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1">
                  <Clock3 className="h-3.5 w-3.5" />
                  {format(new Date(appointment.start), "dd/MM/yyyy HH:mm")}
                </span>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                {MUTABLE_STATUSES.has(normalize(appointment.status)) && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => updateStatus(appointment.id, "completada")}
                      className="sm:flex-1"
                      disabled={updatingId === appointment.id}
                    >
                      {updatingId === appointment.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle className="mr-2 h-4 w-4" />
                      )}
                      Marcar como completada
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateStatus(appointment.id, "cancelada")}
                      className="sm:flex-1"
                      disabled={updatingId === appointment.id}
                    >
                      {updatingId === appointment.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <XCircle className="mr-2 h-4 w-4" />
                      )}
                      Cancelar cita
                    </Button>
                  </>
                )}
                {normalize(appointment.status) === "completada" && (
                  <div className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 py-2 text-sm font-medium text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    Cita completada correctamente
                  </div>
                )}
                {normalize(appointment.status) === "cancelada" && (
                  <div className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/5 py-2 text-sm font-medium text-rose-700">
                    <XCircle className="h-4 w-4" />
                    Cita cancelada
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Mis citas</h1>
            <p className="text-muted-foreground">Vista operativa con trazabilidad de agenda, pagos y cumplimiento.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{getScopeSubtitle(activeTab)}</Badge>
            <Badge variant="outline">{format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}</Badge>
          </div>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="flex items-start justify-between p-4">
              <div>
                <p className="text-xs text-muted-foreground">Citas en vista</p>
                <p className="mt-1 text-2xl font-semibold">{summary.total}</p>
                <p className="text-xs text-muted-foreground">{summary.pending} por gestionar</p>
              </div>
              <CalendarIcon className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-start justify-between p-4">
              <div>
                <p className="text-xs text-muted-foreground">Ingreso proyectado</p>
                <p className="mt-1 text-2xl font-semibold">{formatCurrency(summary.projectedIncome)}</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(summary.collectedIncome)} recaudado</p>
              </div>
              <DollarSign className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-start justify-between p-4">
              <div>
                <p className="text-xs text-muted-foreground">Cumplimiento</p>
                <p className="mt-1 text-2xl font-semibold">{summary.completionRate}%</p>
                <p className="text-xs text-muted-foreground">
                  {summary.completed} completadas · {summary.canceled} canceladas
                </p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-start justify-between p-4">
              <div>
                <p className="text-xs text-muted-foreground">Pagos al día</p>
                <p className="mt-1 text-2xl font-semibold">{summary.paymentRate}%</p>
                <p className="text-xs text-muted-foreground">{summary.paid} con pago registrado</p>
              </div>
              <CreditCard className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_360px]">
          <div>
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as AppointmentScope)} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="today">Hoy</TabsTrigger>
                <TabsTrigger value="upcoming">Próximas</TabsTrigger>
                <TabsTrigger value="history">Historial</TabsTrigger>
              </TabsList>

              <TabsContent value="today" className="mt-4 space-y-4">
                {renderList(selectedDayAppointments)}
              </TabsContent>

              <TabsContent value="upcoming" className="mt-4">
                {renderList(appointments)}
              </TabsContent>

              <TabsContent value="history" className="mt-4">
                {renderList(historyAppointments)}
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-4 lg:sticky lg:top-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Calendario</CardTitle>
                <CardDescription>Selecciona una fecha para consultar su operación.</CardDescription>
              </CardHeader>
              <CardContent>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => d && setSelectedDate(d)}
                  className="rounded-md"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Agenda del día</CardTitle>
                <CardDescription>{appointmentsForSelectedDate.length} citas para la fecha seleccionada</CardDescription>
              </CardHeader>
              <CardContent>
                {appointmentsForSelectedDate.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay citas registradas para esta fecha en la vista actual.</p>
                ) : (
                  <div className="space-y-2">
                    {appointmentsForSelectedDate.slice(0, 6).map((appointment) => (
                      <div key={appointment.id} className="rounded-md border p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium">{appointment.clientName}</p>
                          <Badge variant="outline" className={getStatusColor(appointment.status)}>
                            {getStatusText(appointment.status)}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {format(new Date(appointment.start), "HH:mm")} · {appointment.serviceName}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Control de ejecución</CardTitle>
                <CardDescription>Indicadores de desempeño en la pestaña activa.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Cumplimiento</span>
                    <span className="font-medium">{summary.completionRate}%</span>
                  </div>
                  <Progress value={summary.completionRate} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Pagos al día</span>
                    <span className="font-medium">{summary.paymentRate}%</span>
                  </div>
                  <Progress value={summary.paymentRate} />
                </div>

                {nextActionableAppointment ? (
                  <div className="rounded-md border bg-muted/20 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Siguiente cita</p>
                    <p className="mt-1 text-sm font-semibold">{nextActionableAppointment.clientName}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(nextActionableAppointment.start), "dd/MM HH:mm")} · {nextActionableAppointment.serviceName}
                    </p>
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Timer className="h-3.5 w-3.5" />
                      {getRelativeScheduleText(nextActionableAppointment.start)}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                    No hay próximas citas pendientes por gestionar.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
