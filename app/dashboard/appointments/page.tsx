"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { format, isSameDay, startOfDay, startOfToday } from "date-fns"
import { es } from "date-fns/locale"
import {
  CalendarPlus,
  CheckCircle2,
  CalendarX,
  Clock,
  FileText,
  MapPin,
  Navigation,
  RefreshCcw,
  Route,
  Star,
  Store,
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

function toGoogleCalendarDate(value: Date): string {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}

function buildGoogleCalendarLink(appointment: Appointment): string {
  const startInstant = new Date(appointment.start)
  const endInstant = appointment.end
    ? new Date(appointment.end)
    : new Date(startInstant.getTime() + 60 * 60 * 1000)

  const title = `Cita: ${appointment.service.name}`
  const location = [
    appointment.sede?.name,
    appointment.sede?.address,
    appointment.sede?.city,
  ]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join(", ")

  const details = [
    `Profesional: ${appointment.barber.name}`,
    `Estado: ${statusLabels[appointment.status] ?? appointment.status}`,
    appointment.sede?.phone ? `Teléfono sede: ${appointment.sede.phone}` : null,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${toGoogleCalendarDate(startInstant)}/${toGoogleCalendarDate(endInstant)}`,
  })

  if (details.length > 0) {
    params.set("details", details)
  }

  if (location.length > 0) {
    params.set("location", location)
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function buildGoogleMapsLink(appointment: Appointment): string | null {
  const latitude = appointment.sede?.latitude
  const longitude = appointment.sede?.longitude

  if (
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    typeof longitude === "number" &&
    Number.isFinite(longitude)
  ) {
    return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
  }

  const addressQuery = [
    appointment.sede?.name,
    appointment.sede?.address,
    appointment.sede?.city,
  ]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join(", ")

  if (!addressQuery) {
    return null
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressQuery)}`
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
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<Record<Scope, number | null>>({
    upcoming: null,
    history: null,
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

  useEffect(() => {
    setSelectedAppointmentId((current) => {
      let changed = false
      const next = { ...current }

      ;(["upcoming", "history"] as const).forEach((scope) => {
        const items = appointments[scope]

        if (items.length === 0) {
          if (next[scope] !== null) {
            next[scope] = null
            changed = true
          }
          return
        }

        const hasCurrentSelection =
          typeof next[scope] === "number" && items.some((item) => item.id === next[scope])

        if (!hasCurrentSelection) {
          next[scope] = items[0]?.id ?? null
          changed = true
        }
      })

      return changed ? next : current
    })
  }, [appointments])

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
        <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-[480px] w-full rounded-2xl" />
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

    const items = appointments[scope]
    const selected =
      items.find((item) => item.id === selectedAppointmentId[scope]) ??
      items[0] ??
      null

    if (!selected) {
      return null
    }

    const selectedStartDate = new Date(selected.start)
    const selectedEndDate = selected.end ? new Date(selected.end) : null
    const selectedDateLabel = format(selectedStartDate, "EEEE d 'de' MMMM", { locale: es })
    const selectedTimeLabel = format(selectedStartDate, "HH:mm")
    const selectedDurationMinutes = selectedEndDate
      ? Math.max(5, Math.round((selectedEndDate.getTime() - selectedStartDate.getTime()) / 60000))
      : null
    const selectedDurationLabel = selectedDurationMinutes
      ? `${selectedDurationMinutes} min`
      : "Duración no disponible"
    const selectedStatusLabel = statusLabels[selected.status] ?? selected.status
    const selectedStatusClass = statusClassNameMap[selected.status] ?? "bg-muted text-foreground"
    const selectedPriceLabel =
      selected.service.price != null
        ? currencyFormatter.format(Number(selected.service.price))
        : "A convenir"
    const selectedPaidAmountLabel =
      selected.payment?.amount != null && Number.isFinite(selected.payment.amount)
        ? currencyFormatter.format(Number(selected.payment.amount))
        : null
    const selectedAmountLabel = selectedPaidAmountLabel ?? selectedPriceLabel
    const selectedPaymentStatusLabel = getPaymentStatusLabel(selected.payment?.status, Boolean(selected.payment?.isPaid))
    const selectedPaymentStatusClass = getPaymentStatusClass(selected.payment?.status, Boolean(selected.payment?.isPaid))

    const canManageSelected = MANAGEABLE_STATUSES.includes(
      selected.status as AppointmentStatus,
    )
    const canFinalizeSelected = canFinalizeAppointment(selected)
    const selectedAddressLabel = [selected.sede?.address, selected.sede?.city]
      .filter((value) => typeof value === "string" && value.trim().length > 0)
      .join(", ")
    const googleCalendarUrl = buildGoogleCalendarLink(selected)
    const googleMapsUrl = buildGoogleMapsLink(selected)
    const establishmentInfoUrl =
      typeof selected.sede?.id === "number"
        ? `/dashboard/appointments/sede/${selected.sede.id}`
        : null

    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            {scope === "upcoming" ? "Próximas" : "Historial"} ({items.length})
          </p>
          {items.map((appointment) => {
            const startDate = new Date(appointment.start)
            const dateLabel = format(startDate, "EEE d 'de' MMM", { locale: es })
            const timeLabel = format(startDate, "HH:mm")
            const isSelected = appointment.id === selected.id
            const statusLabel = statusLabels[appointment.status] ?? appointment.status
            const statusClass = statusClassNameMap[appointment.status] ?? "bg-muted text-foreground"
            const compactAmount =
              appointment.payment?.amount != null && Number.isFinite(appointment.payment.amount)
                ? currencyFormatter.format(Number(appointment.payment.amount))
                : appointment.service.price != null
                  ? currencyFormatter.format(Number(appointment.service.price))
                  : "A convenir"

            return (
              <button
                key={appointment.id}
                type="button"
                onClick={() => {
                  setSelectedAppointmentId((current) => ({ ...current, [scope]: appointment.id }))
                }}
                className={cn(
                  "w-full rounded-2xl border px-4 py-3 text-left transition-all",
                  "hover:border-foreground/30 hover:bg-muted/20",
                  isSelected && "border-foreground bg-muted/20 shadow-sm",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="line-clamp-1 text-sm font-semibold sm:text-base">{appointment.service.name}</p>
                  <Badge className={cn("uppercase", statusClass)}>{statusLabel}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{dateLabel} · {timeLabel}</p>
                <p className="mt-2 text-xs text-muted-foreground">{compactAmount} · {appointment.barber.name}</p>
              </button>
            )
          })}
        </div>

        <Card className="overflow-hidden border border-border/60 shadow-sm">
          <CardContent className="p-0">
            <div className="relative overflow-hidden border-b border-border/60 bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 px-5 py-6 text-zinc-50">
              <div className="pointer-events-none absolute -right-12 -top-10 h-40 w-40 rounded-full bg-amber-300/20 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-16 -left-16 h-44 w-44 rounded-full bg-emerald-300/10 blur-3xl" />
              <div className="relative space-y-2">
                <Badge className={cn("w-fit uppercase", selectedStatusClass)}>{selectedStatusLabel}</Badge>
                <h3 className="text-2xl font-semibold">{selected.service.name}</h3>
                <p className="text-sm text-zinc-200">
                  {selectedDateLabel} · {selectedTimeLabel}
                  {selectedEndDate ? ` - ${format(selectedEndDate, "HH:mm")}` : ""}
                </p>
              </div>
            </div>

            <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="space-y-6 p-5">
                <section className="space-y-3">
                  <h4 className="text-base font-semibold">Resumen</h4>
                  <div className="space-y-2 rounded-xl border border-border/60 bg-muted/15 p-4 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Profesional</span>
                      <span className="font-medium">{selected.barber.name}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Duración</span>
                      <span className="font-medium">{selectedDurationLabel}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Pago</span>
                      <Badge className={cn(selectedPaymentStatusClass)}>Pago: {selectedPaymentStatusLabel}</Badge>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-2">
                      <span className="font-semibold">Total</span>
                      <span className="text-base font-semibold">{selectedAmountLabel}</span>
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <h4 className="flex items-center gap-2 text-base font-semibold">
                    <FileText className="size-4" />
                    Información importante
                  </h4>
                  <div className="space-y-2 rounded-xl border border-border/60 bg-background p-4 text-sm text-muted-foreground">
                    <p>Te recomendamos llegar 10 minutos antes para iniciar tu atención puntualmente.</p>
                    <p>Si necesitas cambios de último minuto puedes reprogramar o cancelar desde esta misma vista.</p>
                    <p>Referencia de reserva: <span className="font-medium text-foreground">B0{String(selected.id).padStart(6, "0")}</span></p>
                  </div>
                </section>
              </div>

              <aside className="space-y-5 border-t border-border/60 bg-muted/10 p-5 lg:border-l lg:border-t-0">
                <section className="space-y-2 rounded-xl border border-border/60 bg-background p-3">
                  <a
                    href={googleCalendarUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium transition hover:bg-muted/40"
                  >
                    <span className="flex size-9 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                      <CalendarPlus className="size-4" />
                    </span>
                    <span>Añadir al calendario</span>
                  </a>

                  {googleMapsUrl ? (
                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium transition hover:bg-muted/40"
                    >
                      <span className="flex size-9 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                        <Navigation className="size-4" />
                      </span>
                      <span>Cómo llegar</span>
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm font-medium text-muted-foreground"
                    >
                      <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Navigation className="size-4" />
                      </span>
                      <span>Cómo llegar</span>
                    </button>
                  )}

                  {establishmentInfoUrl ? (
                    <Link
                      href={establishmentInfoUrl}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium transition hover:bg-muted/40"
                    >
                      <span className="flex size-9 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                        <Store className="size-4" />
                      </span>
                      <span>Información del establecimiento</span>
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm font-medium text-muted-foreground"
                    >
                      <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Store className="size-4" />
                      </span>
                      <span>Información del establecimiento</span>
                    </button>
                  )}
                </section>

                <section className="space-y-2">
                  {canManageSelected ? (
                    <div className="space-y-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => openRescheduleDialog(selected)}
                      >
                        <RefreshCcw className="mr-2 size-4" /> Reprogramar cita
                      </Button>
                      {canFinalizeSelected && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="w-full justify-start"
                          onClick={() => {
                            void handleCompleteAppointment(selected)
                          }}
                          disabled={completeLoadingId === selected.id}
                        >
                          {completeLoadingId === selected.id ? (
                            "Finalizando..."
                          ) : (
                            <>
                              <CheckCircle2 className="mr-2 size-4" /> Finalizar cita
                            </>
                          )}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full justify-start text-destructive hover:text-destructive"
                        onClick={() => openCancelDialog(selected)}
                        disabled={cancelLoadingId === selected.id}
                      >
                        {cancelLoadingId === selected.id ? (
                          "Cancelando..."
                        ) : (
                          <>
                            <XCircle className="mr-2 size-4" /> Cancelar cita
                          </>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <p className="rounded-xl border border-border/60 bg-background px-3 py-2 text-sm text-muted-foreground">
                      Esta cita ya no admite cambios.
                    </p>
                  )}
                </section>

                <section className="rounded-xl border border-border/60 bg-background p-4 text-xs text-muted-foreground">
                  <p className="flex items-center gap-2 font-medium text-foreground">
                    <MapPin className="size-4" />
                    Sede de tu reserva
                  </p>
                  <p className="mt-2 text-sm text-foreground">{selected.sede?.name ?? "Sede no disponible"}</p>
                  <p className="mt-1">{selectedAddressLabel || "Sin dirección registrada"}</p>
                  {selected.sede?.phone && <p className="mt-1">Tel: {selected.sede.phone}</p>}
                </section>

                <section className="rounded-xl border border-border/60 bg-background p-4 text-xs text-muted-foreground">
                  <p className="flex items-center gap-2 font-medium text-foreground">
                    <Route className="size-4" />
                    Estado del servicio
                  </p>
                  <p className="mt-2">
                    {scope === "upcoming"
                      ? "Tu cita está activa. Puedes gestionarla desde este panel."
                      : "Esta cita pertenece a tu historial de servicios."}
                  </p>
                </section>
              </aside>
            </div>
          </CardContent>
        </Card>
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
