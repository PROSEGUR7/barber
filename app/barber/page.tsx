"use client"
import { useEffect, useMemo, useState } from "react"
import { format, isSameDay, startOfDay } from "date-fns"
import { es } from "date-fns/locale"
import { CalendarIcon, CheckCircle, Clock, DollarSign, User, XCircle } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"

type AppointmentStatus = "pendiente" | "completada" | "cancelada" | string

type Appointment = {
  id: number
  clientName: string
  serviceName: string
  start: string
  end: string | null
  price: number | null
  status: AppointmentStatus
}

export default function BarberDashboard() {
  const { toast } = useToast()
  const [userId, setUserId] = useState<number | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [activeTab, setActiveTab] = useState<"today" | "upcoming" | "history">("today")

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

      toast({
        title: "Actualizado",
        description: "La cita se actualizó correctamente.",
      })
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

  const pendingCount = selectedDayAppointments.filter((apt) => apt.status === "pendiente").length
  const completedCount = selectedDayAppointments.filter((apt) => apt.status === "completada").length

  const totalEarnings = selectedDayAppointments
    .filter((apt) => apt.status === "completada")
    .reduce((sum, apt) => sum + (apt.price ?? 0), 0)

  const daySummary = useMemo(() => {
    const nonCancelled = selectedDayAppointments.filter((apt) => apt.status !== "cancelada")
    const starts = nonCancelled.map((apt) => new Date(apt.start).getTime()).filter(Number.isFinite)
    const ends = nonCancelled
      .map((apt) => (apt.end ? new Date(apt.end).getTime() : null))
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))

    const first = starts.length ? new Date(Math.min(...starts)) : null
    const last = ends.length ? new Date(Math.max(...ends)) : null
    const totalMinutes = nonCancelled.reduce((acc, apt) => {
      const startMs = new Date(apt.start).getTime()
      const endMs = apt.end ? new Date(apt.end).getTime() : NaN
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return acc
      return acc + Math.max(0, Math.round((endMs - startMs) / 60000))
    }, 0)

    const estimated = nonCancelled.reduce((acc, apt) => acc + (apt.price ?? 0), 0)

    return { first, last, totalMinutes, estimated }
  }, [selectedDayAppointments])

  const getStatusColor = (status: AppointmentStatus) => {
    switch (status) {
      case "pendiente":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
      case "completada":
        return "bg-green-500/10 text-green-500 border-green-500/20"
      case "cancelada":
        return "bg-red-500/10 text-red-500 border-red-500/20"
      default:
        return "bg-muted text-foreground border-border"
    }
  }

  const getStatusText = (status: AppointmentStatus) => {
    switch (status) {
      case "pendiente":
        return "Pendiente"
      case "completada":
        return "Completada"
      case "cancelada":
        return "Cancelada"
      default:
        return status
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Panel de Peluquero</h1>
            <p className="text-muted-foreground">Gestiona tus citas y horarios del día</p>
          </div>

          {/* Stats */}
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Citas Hoy</CardDescription>
                <CardTitle className="text-3xl">{selectedDayAppointments.length}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Total de citas programadas</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Pendientes</CardDescription>
                <CardTitle className="text-3xl text-yellow-500">{pendingCount}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Por atender</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Completadas</CardDescription>
                <CardTitle className="text-3xl text-green-500">{completedCount}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Ingresos: ${totalEarnings}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid lg:grid-cols-3 gap-6" id="mis-citas">
            {/* Appointments List */}
            <div className="lg:col-span-2">
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="today">Hoy</TabsTrigger>
                  <TabsTrigger value="upcoming">Próximas</TabsTrigger>
                  <TabsTrigger value="history">Historial</TabsTrigger>
                </TabsList>

                <TabsContent value="today" className="space-y-4 mt-4">
                  {isLoading ? (
                    <Card>
                      <CardContent className="py-6">
                        <div className="space-y-3">
                          {Array.from({ length: 3 }).map((_, idx) => (
                            <Skeleton key={idx} className="h-20 w-full" />
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ) : error ? (
                    <Card>
                      <CardContent className="py-6">
                        <p className="text-sm text-destructive">{error}</p>
                      </CardContent>
                    </Card>
                  ) : selectedDayAppointments.length === 0 ? (
                    <Card>
                      <CardContent className="py-12">
                        <Empty className="border-0 bg-transparent p-0">
                          <EmptyMedia variant="icon">
                            <CalendarIcon className="size-6" />
                          </EmptyMedia>
                          <EmptyHeader>
                            <EmptyTitle>Sin citas para hoy</EmptyTitle>
                            <EmptyDescription>
                              Cuando tus clientes agenden una visita, la verás en esta sección.
                            </EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      </CardContent>
                    </Card>
                  ) : (
                    selectedDayAppointments.map((appointment) => (
                      <Card key={appointment.id}>
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-start gap-4">
                              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                                <User className="h-6 w-6 text-primary" />
                              </div>
                              <div>
                                <h3 className="font-semibold text-lg mb-1">{appointment.clientName}</h3>
                                <p className="text-sm text-muted-foreground mb-2">{appointment.serviceName}</p>
                                <div className="flex items-center gap-4 text-sm">
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                    {format(new Date(appointment.start), "HH:mm", { locale: es })}
                                    {appointment.end
                                      ? ` (${format(new Date(appointment.end), "HH:mm", { locale: es })})`
                                      : ""}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                                    {appointment.price != null ? `$${appointment.price}` : "-"}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <Badge variant="outline" className={getStatusColor(appointment.status)}>
                              {getStatusText(appointment.status)}
                            </Badge>
                          </div>

                          <div className="flex gap-2">
                            {appointment.status === "pendiente" && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => updateStatus(appointment.id, "completada")}
                                  className="flex-1"
                                  disabled={updatingId === appointment.id}
                                >
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Marcar como Completada
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateStatus(appointment.id, "cancelada")}
                                  className="flex-1"
                                  disabled={updatingId === appointment.id}
                                >
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Cancelar
                                </Button>
                              </>
                            )}
                            {appointment.status === "completada" && (
                              <div className="w-full text-center py-2 text-sm text-green-500 font-medium">
                                Cita completada exitosamente
                              </div>
                            )}
                            {appointment.status === "cancelada" && (
                              <div className="w-full text-center py-2 text-sm text-red-500 font-medium">
                                Cita cancelada
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="upcoming" className="mt-4">
                  {isLoading ? (
                    <Card>
                      <CardContent className="py-6">
                        <div className="space-y-3">
                          {Array.from({ length: 3 }).map((_, idx) => (
                            <Skeleton key={idx} className="h-20 w-full" />
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ) : error ? (
                    <Card>
                      <CardContent className="py-6">
                        <p className="text-sm text-destructive">{error}</p>
                      </CardContent>
                    </Card>
                  ) : appointments.length === 0 ? (
                    <Card>
                      <CardContent className="py-12">
                        <Empty className="border-0 bg-transparent p-0">
                          <EmptyMedia variant="icon">
                            <CalendarIcon className="size-6" />
                          </EmptyMedia>
                          <EmptyHeader>
                            <EmptyTitle>Sin citas próximas</EmptyTitle>
                            <EmptyDescription>
                              Cuando existan nuevas reservas, aparecerán aquí.
                            </EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      {appointments.map((appointment) => (
                        <Card key={appointment.id}>
                          <CardContent className="p-6">
                            <div className="flex items-start justify-between mb-4">
                              <div className="flex items-start gap-4">
                                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                                  <User className="h-6 w-6 text-primary" />
                                </div>
                                <div>
                                  <h3 className="font-semibold text-lg mb-1">{appointment.clientName}</h3>
                                  <p className="text-sm text-muted-foreground mb-2">{appointment.serviceName}</p>
                                  <div className="flex items-center gap-4 text-sm">
                                    <span className="flex items-center gap-1">
                                      <Clock className="h-4 w-4 text-muted-foreground" />
                                      {format(new Date(appointment.start), "EEEE d 'de' MMMM · HH:mm", { locale: es })}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <Badge variant="outline" className={getStatusColor(appointment.status)}>
                                {getStatusText(appointment.status)}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="history" className="mt-4">
                  {isLoading ? (
                    <Card>
                      <CardContent className="py-6">
                        <div className="space-y-3">
                          {Array.from({ length: 3 }).map((_, idx) => (
                            <Skeleton key={idx} className="h-20 w-full" />
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ) : error ? (
                    <Card>
                      <CardContent className="py-6">
                        <p className="text-sm text-destructive">{error}</p>
                      </CardContent>
                    </Card>
                  ) : appointments.length === 0 ? (
                    <Card>
                      <CardContent className="py-12">
                        <Empty className="border-0 bg-transparent p-0">
                          <EmptyMedia variant="icon">
                            <CalendarIcon className="size-6" />
                          </EmptyMedia>
                          <EmptyHeader>
                            <EmptyTitle>Sin historial registrado</EmptyTitle>
                            <EmptyDescription>
                              Aquí aparecerán las citas completadas o canceladas.
                            </EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      {appointments.map((appointment) => (
                        <Card key={appointment.id}>
                          <CardContent className="p-6">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <h3 className="font-semibold">{appointment.clientName}</h3>
                                <p className="text-sm text-muted-foreground">{appointment.serviceName}</p>
                                <p className="text-sm text-muted-foreground">
                                  {format(new Date(appointment.start), "EEEE d 'de' MMMM · HH:mm", { locale: es })}
                                </p>
                              </div>
                              <Badge variant="outline" className={getStatusColor(appointment.status)}>
                                {getStatusText(appointment.status)}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>

            {/* Calendar & Quick Stats */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Calendario</CardTitle>
                  <CardDescription>Selecciona una fecha para ver citas</CardDescription>
                </CardHeader>
                <CardContent>
                  <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} className="rounded-md" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Resumen del Día</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Primera cita</span>
                    <span className="font-semibold">
                      {daySummary.first ? format(daySummary.first, "HH:mm", { locale: es }) : "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Última cita</span>
                    <span className="font-semibold">
                      {daySummary.last ? format(daySummary.last, "HH:mm", { locale: es }) : "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Tiempo total</span>
                    <span className="font-semibold">
                      {daySummary.totalMinutes > 0
                        ? `${Math.floor(daySummary.totalMinutes / 60)}h ${daySummary.totalMinutes % 60}min`
                        : "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-4 border-t">
                    <span className="text-sm font-medium">Ingresos estimados</span>
                    <span className="font-bold text-lg text-primary">
                      ${daySummary.estimated}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
      </main>
    </div>
  )
}
