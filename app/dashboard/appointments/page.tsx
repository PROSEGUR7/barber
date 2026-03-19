"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format, isSameDay, startOfDay, startOfToday } from "date-fns"
import { es } from "date-fns/locale"
import {
  CheckCircle2,
  CalendarX,
  Clock,
  DollarSign,
  RefreshCcw,
  Scissors,
  Star,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
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
    { value: "default", label: "Pendiente, provisional y confirmada" },
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
  provisional: "Provisional",
  pendiente: "Pendiente",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
  completada: "Completada",
}

const statusClassNameMap: Record<string, string> = {
  provisional: "bg-slate-100 text-slate-900 border-transparent",
  pendiente: "bg-amber-100 text-amber-900 border-transparent",
  confirmada: "bg-emerald-100 text-emerald-900 border-transparent",
  cancelada: "bg-rose-100 text-rose-900 border-transparent",
  completada: "bg-blue-100 text-blue-900 border-transparent",
}

const MANAGEABLE_STATUSES: AppointmentStatus[] = ["pendiente", "confirmada"]
const FINALIZABLE_STATUSES: AppointmentStatus[] = ["pendiente", "confirmada", "provisional"]
const AUTO_REVIEW_PROMPT_SEEN_PREFIX = "appointmentAutoReviewPromptSeen:"

type ReviewDraft = {
  appointmentId: number
  barberId: number
  barberName: string
  serviceName: string
  rating: number
  comment: string
  needsCompletion: boolean
}

function getPaymentStatusLabel(status: string | null | undefined, isPaid: boolean): string {
  if (isPaid) return "Pagado"

  const normalized = (status ?? "").trim().toLowerCase()
  if (normalized.length === 0) return "Pendiente"
  if (normalized === "fallido" || normalized === "declined" || normalized === "error" || normalized === "voided") {
    return "Fallido"
  }

  return normalized.replace(/[_-]+/g, " ").replace(/\b\w/g, (chunk) => chunk.toUpperCase())
}

function getPaymentStatusClass(status: string | null | undefined, isPaid: boolean): string {
  if (isPaid) return "bg-emerald-100 text-emerald-900 border-transparent"

  const normalized = (status ?? "").trim().toLowerCase()
  if (normalized === "fallido" || normalized === "declined" || normalized === "error" || normalized === "voided") {
    return "bg-rose-100 text-rose-900 border-transparent"
  }

  return "bg-amber-100 text-amber-900 border-transparent"
}

export default function AppointmentsPage() {
  const { toast } = useToast()
  const [now, setNow] = useState(() => Date.now())

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
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelAppointment, setCancelAppointment] = useState<Appointment | null>(null)

  const [rescheduleLimitDialogOpen, setRescheduleLimitDialogOpen] = useState(false)
  const [rescheduleLimitMessage, setRescheduleLimitMessage] = useState<string>(
    "Solo puedes reprogramar máximo 2 veces al día.",
  )

  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false)
  const [rescheduleAppointment, setRescheduleAppointment] = useState<Appointment | null>(null)
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>()
  const [rescheduleSlots, setRescheduleSlots] = useState<AvailabilitySlot[]>([])
  const [rescheduleSlotsError, setRescheduleSlotsError] = useState<string | null>(null)
  const [isLoadingSlots, setIsLoadingSlots] = useState(false)
  const [selectedRescheduleSlot, setSelectedRescheduleSlot] = useState<AvailabilitySlot | null>(null)
  const [isSubmittingReschedule, setIsSubmittingReschedule] = useState(false)
  const [completeLoadingId, setCompleteLoadingId] = useState<number | null>(null)
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false)
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft | null>(null)
  const [isSubmittingReview, setIsSubmittingReview] = useState(false)

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
    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 30_000)

    return () => {
      window.clearInterval(timer)
    }
  }, [])

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
          headers: buildTenantHeaders(),
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

  const openCancelDialog = (appointment: Appointment) => {
    setCancelAppointment(appointment)
    setCancelDialogOpen(true)
  }

  const closeCancelDialog = () => {
    setCancelDialogOpen(false)
    setCancelAppointment(null)
  }

  const confirmCancel = async () => {
    if (!userId || !cancelAppointment) {
      toast({
        title: "Inicia sesión nuevamente",
        description: "No encontramos tu sesión activa. Vuelve a iniciar sesión.",
        variant: "destructive",
      })
      return
    }

    setCancelLoadingId(cancelAppointment.id)

    try {
      const response = await fetch(`/api/appointments/${cancelAppointment.id}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildTenantHeaders(),
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
      closeCancelDialog()
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

  const getAppointmentEndMs = (appointment: Appointment): number => {
    const endCandidate = appointment.end ?? appointment.start
    const endMs = new Date(endCandidate).getTime()
    return Number.isFinite(endMs) ? endMs : Number.NaN
  }

  const canFinalizeAppointment = useCallback(
    (appointment: Appointment): boolean => {
      if (!FINALIZABLE_STATUSES.includes(appointment.status as AppointmentStatus)) {
        return false
      }

      const endMs = getAppointmentEndMs(appointment)
      if (!Number.isFinite(endMs)) {
        return false
      }

      return endMs <= now
    },
    [now],
  )

  const hasQueuedServicesPending = useCallback(
    (appointment: Appointment): boolean => {
      const appointmentStart = new Date(appointment.start)
      if (Number.isNaN(appointmentStart.getTime())) {
        return false
      }

      return appointments.upcoming.some((other) => {
        if (other.id === appointment.id) {
          return false
        }

        if (!FINALIZABLE_STATUSES.includes(other.status as AppointmentStatus)) {
          return false
        }

        if (other.barber.id !== appointment.barber.id) {
          return false
        }

        const otherStart = new Date(other.start)
        if (Number.isNaN(otherStart.getTime())) {
          return false
        }

        return isSameDay(otherStart, appointmentStart)
      })
    },
    [appointments.upcoming],
  )

  const openReviewDialogForAppointment = (appointment: Appointment, needsCompletion: boolean) => {
    setReviewDraft({
      appointmentId: appointment.id,
      barberId: appointment.barber.id,
      barberName: appointment.barber.name,
      serviceName: appointment.service.name,
      rating: 5,
      comment: "",
      needsCompletion,
    })
    setReviewDialogOpen(true)
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
          excludeAppointmentId: String(rescheduleAppointment.id),
        })

        const response = await fetch(`/api/availability?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
          headers: buildTenantHeaders(),
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
          ...buildTenantHeaders(),
        },
        body: JSON.stringify({
          userId,
          start: selectedRescheduleSlot.start,
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        const errorMessage =
          typeof data.error === "string" && data.error.trim().length > 0
            ? (data.error as string)
            : "Selecciona otro horario o inténtalo más tarde."

        const isRescheduleLimit = errorMessage.toLowerCase().includes("reprogram") && errorMessage.includes("2")

        if (isRescheduleLimit) {
          closeRescheduleDialog()

          setRescheduleLimitMessage(errorMessage)
          setRescheduleLimitDialogOpen(true)
          return
        }

        toast({
          title: isRescheduleLimit
            ? "Límite de reprogramaciones"
            : "No se pudo reprogramar",
          description: errorMessage,
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

  const handleCompleteAppointment = async (appointment: Appointment) => {
    if (!userId) {
      toast({
        title: "Inicia sesión nuevamente",
        description: "No encontramos tu sesión activa. Vuelve a iniciar sesión.",
        variant: "destructive",
      })
      return
    }

    setCompleteLoadingId(appointment.id)

    try {
      const completeResponse = await fetch(`/api/appointments/${appointment.id}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildTenantHeaders(),
        },
        body: JSON.stringify({ userId }),
      })

      const completeData = await completeResponse.json().catch(() => ({}))

      if (!completeResponse.ok) {
        toast({
          title: "No se pudo finalizar la cita",
          description: completeData.error ?? "Inténtalo nuevamente en unos segundos.",
          variant: "destructive",
        })
        return
      }

      if (typeof window !== "undefined") {
        sessionStorage.setItem(`${AUTO_REVIEW_PROMPT_SEEN_PREFIX}${appointment.id}`, "1")
      }

      toast({
        title: "Cita finalizada",
        description: "Gracias. Ahora cuéntanos cómo te fue con el servicio.",
      })

      if (hasQueuedServicesPending(appointment)) {
        toast({
          title: "Servicio finalizado",
          description: "Cuando termines los servicios en cola te pediremos una sola calificación del resultado.",
        })
      } else {
        openReviewDialogForAppointment(appointment, false)
      }
      refreshAll()
    } catch (error) {
      console.error("Error completing appointment", error)
      toast({
        title: "Error de conexión",
        description: "No pudimos comunicar con el servidor. Intenta nuevamente.",
        variant: "destructive",
      })
    } finally {
      setCompleteLoadingId(null)
    }
  }

  const submitReview = async () => {
    if (!reviewDraft || !userId) {
      return
    }

    setIsSubmittingReview(true)

    try {
      if (reviewDraft.needsCompletion) {
        const completeResponse = await fetch(`/api/appointments/${reviewDraft.appointmentId}/complete`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...buildTenantHeaders(),
          },
          body: JSON.stringify({ userId }),
        })

        const completeData = await completeResponse.json().catch(() => ({}))
        if (!completeResponse.ok) {
          toast({
            title: "No se pudo finalizar la cita",
            description: completeData.error ?? "Inténtalo nuevamente en unos segundos.",
            variant: "destructive",
          })
          return
        }
      }

      const response = await fetch(`/api/barbers/${reviewDraft.barberId}/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildTenantHeaders(),
        },
        body: JSON.stringify({
          userId,
          rating: reviewDraft.rating,
          comment: reviewDraft.comment.trim() || undefined,
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        const isReviewTooEarly =
          response.status === 409 &&
          typeof data.error === "string" &&
          /calificar|completada|despu[eé]s/i.test(data.error)

        toast({
          title: "No se pudo guardar la reseña",
          description: isReviewTooEarly
            ? "Completa primero todos los servicios en cola para habilitar la calificación final."
            : data.error ?? "Intenta nuevamente en unos segundos.",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Gracias por tu reseña",
        description: `Tu calificación para ${reviewDraft.barberName} fue guardada correctamente.`,
      })

      setReviewDialogOpen(false)
      setReviewDraft(null)
      refreshAll()
    } catch (error) {
      console.error("Error saving review", error)
      toast({
        title: "Error de conexión",
        description: "No pudimos guardar tu reseña. Intenta nuevamente.",
        variant: "destructive",
      })
    } finally {
      setIsSubmittingReview(false)
    }
  }

  useEffect(() => {
    if (appointments.upcoming.length === 0 || reviewDialogOpen || completeLoadingId != null) {
      return
    }

    const dueAppointment = appointments.upcoming.find((appointment) => {
      if (!canFinalizeAppointment(appointment)) {
        return false
      }

      if (hasQueuedServicesPending(appointment)) {
        return false
      }

      if (typeof window === "undefined") {
        return true
      }

      const seenKey = `${AUTO_REVIEW_PROMPT_SEEN_PREFIX}${appointment.id}`
      return sessionStorage.getItem(seenKey) !== "1"
    })

    if (!dueAppointment) {
      return
    }

    if (typeof window !== "undefined") {
      sessionStorage.setItem(`${AUTO_REVIEW_PROMPT_SEEN_PREFIX}${dueAppointment.id}`, "1")
    }

    openReviewDialogForAppointment(dueAppointment, true)
  }, [appointments.upcoming, canFinalizeAppointment, completeLoadingId, hasQueuedServicesPending, reviewDialogOpen])

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
      const onRetry = () => {
        fetchAppointments(scope, statusFilter[scope])
      }

      return (
        <Empty className="border border-destructive/40 bg-destructive/10 text-destructive">
          <EmptyMedia variant="icon">
            <XCircle className="size-6" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No se pudieron cargar las citas</EmptyTitle>
            <EmptyDescription>{loadError[scope]}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/40 text-destructive hover:border-destructive hover:bg-destructive/10"
              onClick={onRetry}
            >
              <RefreshCcw className="mr-2 size-4" /> Intentar de nuevo
            </Button>
          </EmptyContent>
        </Empty>
      )
    }

    if (appointments[scope].length === 0) {
      const emptyCopy =
        scope === "upcoming"
          ? {
              title: "No tienes citas próximas",
              description: "Agenda tu siguiente visita en minutos para asegurar tu lugar.",
            }
          : {
              title: "Sin historial disponible",
              description: "Aquí verás las citas completadas o canceladas cuando existan registros.",
            }

      return (
        <Empty className="border border-dashed border-border/60 bg-muted/40">
          <EmptyMedia variant="icon">
            <CalendarX className="size-6" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{emptyCopy.title}</EmptyTitle>
            <EmptyDescription>{emptyCopy.description}</EmptyDescription>
          </EmptyHeader>
        </Empty>
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
          const paidAmountLabel =
            appointment.payment?.amount != null && Number.isFinite(appointment.payment.amount)
              ? currencyFormatter.format(Number(appointment.payment.amount))
              : null
          const amountLabel = paidAmountLabel ?? priceLabel
          const paymentStatusLabel = getPaymentStatusLabel(appointment.payment?.status, Boolean(appointment.payment?.isPaid))
          const paymentStatusClass = getPaymentStatusClass(appointment.payment?.status, Boolean(appointment.payment?.isPaid))

          const canManage = MANAGEABLE_STATUSES.includes(
            appointment.status as AppointmentStatus,
          )
          const canFinalize = canFinalizeAppointment(appointment)

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
                    <DollarSign className="size-4" /> {amountLabel}
                  </Badge>
                  <Badge className={cn("flex items-center gap-1", paymentStatusClass)}>
                    Pago: {paymentStatusLabel}
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
                    {canFinalize && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          void handleCompleteAppointment(appointment)
                        }}
                        disabled={completeLoadingId === appointment.id}
                      >
                        {completeLoadingId === appointment.id ? (
                          "Finalizando..."
                        ) : (
                          <>
                            <CheckCircle2 className="mr-1 size-4" /> Finalizar cita
                          </>
                        )}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => openCancelDialog(appointment)}
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
                    const currentStartMs = rescheduleAppointment
                      ? new Date(rescheduleAppointment.start).getTime()
                      : null
                    const slotStartMs = new Date(slot.start).getTime()
                    const isCurrent =
                      currentStartMs != null &&
                      Number.isFinite(slotStartMs) &&
                      slotStartMs === currentStartMs

                    return (
                      <button
                        key={slot.start}
                        type="button"
                        onClick={() => {
                          if (isCurrent) return
                          setSelectedRescheduleSlot(slot)
                        }}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-sm transition",
                          "hover:border-primary hover:bg-primary/5",
                          isSelected && "border-primary bg-primary text-primary-foreground",
                          isCurrent &&
                            "cursor-not-allowed border-border/60 bg-muted/50 text-muted-foreground hover:border-border/60 hover:bg-muted/50",
                        )}
                        aria-disabled={isCurrent}
                      >
                        {startLabel} - {endLabel}{isCurrent ? " (Actual)" : ""}
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

      <AlertDialog
        open={cancelDialogOpen}
        onOpenChange={(open) => (open ? setCancelDialogOpen(true) : closeCancelDialog())}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar cita</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelAppointment
                ? `¿Deseas cancelar la cita del ${format(
                    new Date(cancelAppointment.start),
                    "EEEE d 'de' MMMM 'a las' HH:mm",
                    { locale: es },
                  )}?`
                : "¿Deseas cancelar esta cita?"}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelLoadingId != null}>Volver</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelLoadingId != null || cancelAppointment == null}
              onClick={async (event) => {
                event.preventDefault()
                await confirmCancel()
              }}
            >
              {cancelLoadingId != null ? "Cancelando..." : "Aceptar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={rescheduleLimitDialogOpen} onOpenChange={setRescheduleLimitDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Límite de reprogramaciones</AlertDialogTitle>
            <AlertDialogDescription>{rescheduleLimitMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Aceptar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={reviewDialogOpen}
        onOpenChange={(open) => {
          setReviewDialogOpen(open)
          if (!open && !isSubmittingReview) {
            setReviewDraft(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Cómo te fue en la cita?</DialogTitle>
            <DialogDescription>
              {reviewDraft
                ? `Cuéntanos cómo fue tu experiencia con ${reviewDraft.barberName} en ${reviewDraft.serviceName}.`
                : "Cuéntanos cómo fue tu experiencia en la cita."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Calificación</p>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((value) => {
                  const isActive = (reviewDraft?.rating ?? 0) >= value

                  return (
                    <button
                      key={value}
                      type="button"
                      className={cn(
                        "inline-flex items-center rounded-md border px-2.5 py-1.5 text-sm transition",
                        isActive
                          ? "border-amber-300 bg-amber-50 text-amber-700"
                          : "border-border bg-background text-muted-foreground hover:border-amber-200 hover:text-amber-700",
                      )}
                      onClick={() => {
                        setReviewDraft((current) => {
                          if (!current) return current
                          return { ...current, rating: value }
                        })
                      }}
                    >
                      <Star className={cn("mr-1 size-4", isActive && "fill-amber-400 text-amber-500")} />
                      {value}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="review-comment" className="text-sm font-medium">
                Comentario (opcional)
              </label>
              <textarea
                id="review-comment"
                value={reviewDraft?.comment ?? ""}
                onChange={(event) => {
                  const nextValue = event.target.value
                  setReviewDraft((current) => {
                    if (!current) return current
                    return { ...current, comment: nextValue.slice(0, 500) }
                  })
                }}
                rows={4}
                maxLength={500}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Ejemplo: Excelente atención, puntual y muy buen resultado."
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReviewDialogOpen(false)
                setReviewDraft(null)
              }}
              disabled={isSubmittingReview}
            >
              Omitir por ahora
            </Button>
            <Button
              onClick={() => {
                void submitReview()
              }}
              disabled={isSubmittingReview || !reviewDraft || reviewDraft.rating < 1}
            >
              {isSubmittingReview ? "Guardando..." : "Enviar calificación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
