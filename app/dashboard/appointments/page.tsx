"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format, startOfDay, startOfToday } from "date-fns"
import { es } from "date-fns/locale"
import {
  Clock,
  DollarSign,
  RefreshCcw,
  Scissors,
  User as UserIcon,
  XCircle,
} from "lucide-react"

import { AppSidebar } from "@/components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import type { Appointment, AppointmentStatus, AvailabilitySlot } from "@/lib/bookings"
import { cn } from "@/lib/utils"

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 0,
})

type Scope = "upcoming" | "history"

type StatusFilterValue = "default" | "all" | AppointmentStatus

const statusOptions: Record<Scope, { value: StatusFilterValue; label: string }[]> = {
  upcoming: [
    { value: "default", label: "Pendiente y confirmada" },
    { value: "all", label: "Todos los estados" },
    { value: "pendiente", label: "Solo pendientes" },
    { value: "confirmada", label: "Solo confirmadas" },
  ],
  history: [
    { value: "default", label: "Completada y cancelada" },
    { value: "all", label: "Todos los estados" },
    { value: "completada", label: "Solo completadas" },
    { value: "cancelada", label: "Solo canceladas" },
  ],
}

const statusLabels: Record<string, string> = {
  pendiente: "Pendiente",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
  completada: "Completada",
}

const statusClassNameMap: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-900 border-transparent",
  confirmada: "bg-emerald-100 text-emerald-900 border-transparent",
  cancelada: "bg-rose-100 text-rose-900 border-transparent",
  completada: "bg-blue-100 text-blue-900 border-transparent",
}

const MANAGEABLE_STATUSES: AppointmentStatus[] = ["pendiente", "confirmada"]

export default function AppointmentsPage() {
  const { toast } = useToast()

  const [userId, setUserId] = useState<number | null>(null)
  const [activeScope, setActiveScope] = useState<Scope>("upcoming")
  const [statusFilter, setStatusFilter] = useState<Record<Scope, StatusFilterValue>>({
    upcoming: "default",
    history: "default",
  })

  const [appointments, setAppointments] = useState<Record<Scope, Appointment[]>>({
    upcoming: [],
    history: [],
  })
  const [isLoading, setIsLoading] = useState<Record<Scope, boolean>>({
    upcoming: true,
    history: true,
  })
  const [loadError, setLoadError] = useState<Record<Scope, string | null>>({
    upcoming: null,
    history: null,
  })
  const [cancelLoadingId, setCancelLoadingId] = useState<number | null>(null)

  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false)
  const [rescheduleAppointment, setRescheduleAppointment] = useState<Appointment | null>(null)
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>()
  const [rescheduleSlots, setRescheduleSlots] = useState<AvailabilitySlot[]>([])
  const [rescheduleSlotsError, setRescheduleSlotsError] = useState<string | null>(null)
  const [isLoadingSlots, setIsLoadingSlots] = useState(false)
  const [selectedRescheduleSlot, setSelectedRescheduleSlot] = useState<AvailabilitySlot | null>(null)
  const [isSubmittingReschedule, setIsSubmittingReschedule] = useState(false)

  useEffect(() => {
    try {
      const storedUserId = localStorage.getItem("userId")
      if (storedUserId) {
        const parsed = Number.parseInt(storedUserId, 10)
        if (!Number.isNaN(parsed)) {
          setUserId(parsed)
        }
      }
    } catch (error) {
      console.warn("No fue posible cargar el usuario en sesión", error)
    }
  }, [])

  const fetchAppointments = useCallback(
    async (scope: Scope, filterValue: StatusFilterValue) => {
      if (!userId) {
        return
      }

      setIsLoading((prev) => ({ ...prev, [scope]: true }))
      setLoadError((prev) => ({ ...prev, [scope]: null }))

      try {
        const params = new URLSearchParams({
          userId: String(userId),
          scope,
        })

        if (filterValue !== "default") {
          params.append("status", filterValue)
        }

        const response = await fetch(`/api/appointments?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        })

        const data = await response.json().catch(() => ({}))

        if (!response.ok) {
          setLoadError((prev) => ({
            ...prev,
            [scope]: data.error ?? "No se pudieron cargar las citas",
          }))
          setAppointments((prev) => ({ ...prev, [scope]: [] }))
          return
        }

        const items: Appointment[] = Array.isArray(data.appointments) ? data.appointments : []
        setAppointments((prev) => ({ ...prev, [scope]: items }))
      } catch (error) {
        console.error("Error loading appointments", error)
        setLoadError((prev) => ({
          ...prev,
          [scope]: "Error de conexión al cargar las citas",
        }))
        setAppointments((prev) => ({ ...prev, [scope]: [] }))
      } finally {
        setIsLoading((prev) => ({ ...prev, [scope]: false }))
      }
    },
    [userId],
  )

  useEffect(() => {
    if (!userId) {
      return
    }
    fetchAppointments("upcoming", statusFilter.upcoming)
  }, [userId, statusFilter.upcoming, fetchAppointments])

  useEffect(() => {
    if (!userId) {
      return
    }
    fetchAppointments("history", statusFilter.history)
  }, [userId, statusFilter.history, fetchAppointments])

  const refreshAll = useCallback(() => {
    if (!userId) {
      return
    }
    fetchAppointments("upcoming", statusFilter.upcoming)
    fetchAppointments("history", statusFilter.history)
  }, [userId, statusFilter, fetchAppointments])

  const handleCancel = async (appointment: Appointment) => {
    if (!userId) {
      toast({
        title: "Inicia sesión nuevamente",
        description: "No encontramos tu sesión activa. Vuelve a iniciar sesión.",
        variant: "destructive",
      })
      return
    }

    const confirmMessage = `¿Deseas cancelar la cita del ${format(
      new Date(appointment.start),
      "EEEE d 'de' MMMM 'a las' HH:mm",
      { locale: es },
    )}?`

    const confirmed = window.confirm(confirmMessage)
    if (!confirmed) {
      return
    }

    setCancelLoadingId(appointment.id)

    try {
      const response = await fetch(`/api/appointments/${appointment.id}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        toast({
          title: "No se pudo cancelar la cita",
          description: data.error ?? "Inténtalo nuevamente en unos segundos.",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Cita cancelada",
        description: "Registramos la cancelación correctamente.",
      })
      refreshAll()
    } catch (error) {
      console.error("Error canceling appointment", error)
      toast({
        title: "Error de conexión",
        description: "No pudimos comunicar con el servidor. Intenta otra vez.",
        variant: "destructive",
      })
    } finally {
      setCancelLoadingId(null)
    }
  }

  const openRescheduleDialog = (appointment: Appointment) => {
    setRescheduleAppointment(appointment)
    setRescheduleDialogOpen(true)
    const initialDate = startOfDay(new Date(appointment.start))
    setRescheduleDate(initialDate)
    setSelectedRescheduleSlot(null)
    setRescheduleSlots([])
    setRescheduleSlotsError(null)
  }

  const closeRescheduleDialog = () => {
    setRescheduleDialogOpen(false)
    setRescheduleAppointment(null)
    setSelectedRescheduleSlot(null)
    setRescheduleSlots([])
    setRescheduleSlotsError(null)
    setIsLoadingSlots(false)
    setIsSubmittingReschedule(false)
  }

  useEffect(() => {
    if (!rescheduleDialogOpen || !rescheduleAppointment || !rescheduleDate) {
      return
    }

    let isActive = true
    setIsLoadingSlots(true)
    setRescheduleSlotsError(null)
    setSelectedRescheduleSlot(null)

    const controller = new AbortController()

    const fetchSlots = async () => {
      try {
        const params = new URLSearchParams({
          serviceId: String(rescheduleAppointment.service.id),
          barberId: String(rescheduleAppointment.barber.id),
          date: format(rescheduleDate, "yyyy-MM-dd"),
        })

        const response = await fetch(`/api/availability?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        })

        const data = await response.json().catch(() => ({}))

        if (!isActive) {
          return
        }

        if (!response.ok) {
          setRescheduleSlotsError(
            data.error ?? "No se pudo cargar la disponibilidad para esta fecha.",
          )
          setRescheduleSlots([])
          return
        }

        const slots: AvailabilitySlot[] = Array.isArray(data.slots) ? data.slots : []
        setRescheduleSlots(slots)
      } catch (error) {
        if (!isActive || error instanceof DOMException) {
          return
        }
        console.error("Error fetching reschedule slots", error)
        setRescheduleSlotsError("Error de conexión al consultar la disponibilidad.")
        setRescheduleSlots([])
      } finally {
        if (isActive) {
          setIsLoadingSlots(false)
        }
      }
    }

    fetchSlots()

    return () => {
      isActive = false
      controller.abort()
    }
  }, [rescheduleDialogOpen, rescheduleAppointment, rescheduleDate])

  const handleRescheduleSubmit = async () => {
    if (!userId || !rescheduleAppointment || !selectedRescheduleSlot) {
      toast({
        title: "Selecciona un horario",
        description: "Elige un horario disponible para reprogramar tu cita.",
        variant: "destructive",
      })
      return
    }

    setIsSubmittingReschedule(true)

    try {
      const response = await fetch(`/api/appointments/${rescheduleAppointment.id}/reschedule`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          start: selectedRescheduleSlot.start,
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        toast({
          title: "No se pudo reprogramar",
          description: data.error ?? "Selecciona otro horario o inténtalo más tarde.",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Cita reprogramada",
        description: "Actualizamos tu cita con el nuevo horario.",
      })
      closeRescheduleDialog()
      refreshAll()
    } catch (error) {
      console.error("Error rescheduling appointment", error)
      toast({
        title: "Error de conexión",
        description: "No pudimos comunicar con el servidor. Intenta nuevamente.",
        variant: "destructive",
      })
    } finally {
      setIsSubmittingReschedule(false)
    }
  }

  const renderAppointments = (scope: Scope) => {
    if (isLoading[scope]) {
      return (
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      )
    }

    if (loadError[scope]) {
      return (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardContent className="py-6 text-sm text-destructive">
            {loadError[scope]}
          </CardContent>
        </Card>
      )
    }

    if (appointments[scope].length === 0) {
      return (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {scope === "upcoming"
              ? "No tienes citas próximas. Agenda tu siguiente visita en minutos."
              : "Aún no registramos historial de citas en tu cuenta."}
          </CardContent>
        </Card>
      )
    }

    return (
      <div className="space-y-3">
        {appointments[scope].map((appointment) => {
          const startDate = new Date(appointment.start)
          const endDate = appointment.end ? new Date(appointment.end) : null
          const dateLabel = format(startDate, "EEEE d 'de' MMMM", { locale: es })
          const timeLabel = format(startDate, "HH:mm")
          const durationMinutes = endDate
            ? Math.max(5, Math.round((endDate.getTime() - startDate.getTime()) / 60000))
            : null
          const durationLabel = durationMinutes ? `${durationMinutes} min` : "Duración no disponible"
          const statusLabel = statusLabels[appointment.status] ?? appointment.status
          const statusClass = statusClassNameMap[appointment.status] ?? "bg-muted text-foreground"
          const priceLabel =
            appointment.service.price != null
              ? currencyFormatter.format(Number(appointment.service.price))
              : "A convenir"

          const canManage = MANAGEABLE_STATUSES.includes(
            appointment.status as AppointmentStatus,
          )

          return (
            <Card key={appointment.id} className="border border-border/60 shadow-sm">
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <Badge className={cn("w-fit uppercase", statusClass)}>{statusLabel}</Badge>
                  <CardTitle className="text-xl">{appointment.service.name}</CardTitle>
                  <CardDescription>
                    {dateLabel} · {timeLabel}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Scissors className="size-4" /> {appointment.barber.name}
                  </Badge>
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Clock className="size-4" /> {durationLabel}
                  </Badge>
                  <Badge variant="outline" className="flex items-center gap-1">
                    <DollarSign className="size-4" /> {priceLabel}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <UserIcon className="size-4" />
                    <span>{appointment.barber.name}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Scissors className="size-4" />
                    <span>{appointment.service.name}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Clock className="size-4" />
                    <span>
                      {format(startDate, "HH:mm", { locale: es })}
                      {endDate ? ` - ${format(endDate, "HH:mm", { locale: es })}` : ""}
                    </span>
                  </span>
                </div>
                {canManage && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openRescheduleDialog(appointment)}
                    >
                      <RefreshCcw className="mr-1 size-4" /> Reprogramar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleCancel(appointment)}
                      disabled={cancelLoadingId === appointment.id}
                    >
                      {cancelLoadingId === appointment.id ? (
                        "Cancelando..."
                      ) : (
                        <>
                          <XCircle className="mr-1 size-4" /> Cancelar
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    )
  }

  const appointmentCounts = useMemo(() => ({
    upcoming: appointments.upcoming.length,
    history: appointments.history.length,
  }), [appointments])

  return (
    <>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2">
          <div className="flex w-full items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/dashboard">Inicio</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Mis citas</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
              <span>
                Próximas: {appointmentCounts.upcoming} · Historial: {appointmentCounts.history}
              </span>
            </div>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
          <Card className="border border-border/60 shadow-sm">
            <CardHeader className="flex flex-col gap-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-2xl">Tus citas</CardTitle>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  Gestiona tus reservas: cancela o reprograma en segundos.
                </div>
              </div>
              <Tabs
                value={activeScope}
                onValueChange={(value) => setActiveScope(value as Scope)}
                className="w-full"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <TabsList>
                    <TabsTrigger value="upcoming">
                      Próximas ({appointmentCounts.upcoming})
                    </TabsTrigger>
                    <TabsTrigger value="history">
                      Historial ({appointmentCounts.history})
                    </TabsTrigger>
                  </TabsList>
                  <Select
                    value={statusFilter[activeScope]}
                    onValueChange={(value) =>
                      setStatusFilter((prev) => ({ ...prev, [activeScope]: value as StatusFilterValue }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Filtrar por estado" />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions[activeScope].map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <TabsContent value="upcoming" className="mt-4 space-y-4">
                  {renderAppointments("upcoming")}
                </TabsContent>
                <TabsContent value="history" className="mt-4 space-y-4">
                  {renderAppointments("history")}
                </TabsContent>
              </Tabs>
            </CardHeader>
          </Card>
        </div>
        </SidebarInset>
      </SidebarProvider>

      <Dialog open={rescheduleDialogOpen} onOpenChange={(open) => (open ? null : closeRescheduleDialog())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reprogramar cita</DialogTitle>
          <DialogDescription>
            Selecciona una nueva fecha y horario para tu servicio.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-[260px_1fr]">
            <Calendar
              mode="single"
              selected={rescheduleDate}
              onSelect={(date) => {
                if (!date) return
                setRescheduleDate(startOfDay(date))
              }}
              fromDate={startOfToday()}
              locale={es}
            />
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Horarios disponibles</h4>
              {isLoadingSlots ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-10 w-full rounded-lg" />
                  ))}
                </div>
              ) : rescheduleSlotsError ? (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {rescheduleSlotsError}
                </p>
              ) : rescheduleSlots.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No encontramos horarios disponibles para esta fecha. Intenta con otro día.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {rescheduleSlots.map((slot) => {
                    const startLabel = format(new Date(slot.start), "HH:mm")
                    const endLabel = format(new Date(slot.end), "HH:mm")
                    const isSelected = selectedRescheduleSlot?.start === slot.start

                    return (
                      <button
                        key={slot.start}
                        type="button"
                        onClick={() => setSelectedRescheduleSlot(slot)}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-sm transition",
                          "hover:border-primary hover:bg-primary/5",
                          isSelected && "border-primary bg-primary text-primary-foreground",
                        )}
                      >
                        {startLabel} - {endLabel}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={closeRescheduleDialog} disabled={isSubmittingReschedule}>
            Cancelar
          </Button>
          <Button onClick={handleRescheduleSubmit} disabled={isSubmittingReschedule || !selectedRescheduleSlot}>
            {isSubmittingReschedule ? "Guardando..." : "Confirmar reprogramación"}
          </Button>
        </DialogFooter>
      </DialogContent>
      </Dialog>
    </>
  )
}
