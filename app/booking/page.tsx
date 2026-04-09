"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { addMinutes, format, isSameDay, startOfToday } from "date-fns"
import { es } from "date-fns/locale"
import { CalendarX, CheckCircle2, ChevronLeft, ChevronRight, Clock, DollarSign, MapPin, Scissors, Ticket, Users } from "lucide-react"
import { useSearchParams } from "next/navigation"

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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar } from "@/components/ui/calendar"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"

type Service = {
  id: number
  name: string
  description: string | null
  price: number | null
  durationMin: number
}

type Sede = {
  id: number
  name: string
  address: string | null
  city: string | null
  phone: string | null
  latitude: number | null
  longitude: number | null
}

type Barber = {
  id: number
  name: string
  avatarUrl: string | null
}

type AvailabilitySlot = {
  start: string
  end: string
}

type PaymentMethod = "cash" | "wompi"

type WompiCheckoutData = {
  publicKey: string
  currency: "COP"
  amountInCents: number
  reference: string
  signatureIntegrity: string
  redirectUrl: string
  customerEmail: string
  acceptanceToken: string
  personalDataAuthToken: string | null
}

type PromoPricingPreview = {
  originalTotal: number
  discountTotal: number
  finalTotal: number
  promo: {
    code: string
    description: string
    discountPercent: number
    appliesToServiceIds: number[] | null
    appliedServiceIds: number[]
  } | null
}

type PendingReservationCheckoutDetails = {
  start: string
  end: string | null
}

type BookingStep = "sede" | "services" | "professional" | "schedule" | "confirm"

type CompletedReservationSummary = {
  services: string[]
  sedeName: string | null
  barberName: string | null
  scheduleLabel: string
  paymentMethod: PaymentMethod
  totalLabel: string
  status: "confirmed" | "pending-payment"
}

const PENDING_RESERVATION_CHECKOUT_REFERENCE_KEY = "wompiPendingReservationCheckoutReference"
const PENDING_RESERVATION_CHECKOUT_DETAILS_PREFIX = "wompiPendingReservationCheckoutDetails:"
const WOMPI_SUCCESS_POPUP_SEEN_PREFIX = "wompiReservationSuccessSeen:"

const time12hFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
})

function formatTime12h(value: Date): string {
  return time12hFormatter.format(value).toUpperCase()
}

declare global {
  interface Window {
    WidgetCheckout?: new (options: {
      currency: string
      amountInCents: number
      reference: string
      publicKey: string
      signature: {
        integrity: string
      }
      redirectUrl?: string
      acceptanceToken?: string
      personalDataAuthToken?: string
      customerData?: {
        email?: string
      }
    }) => {
      open: (callback?: (result: unknown) => void) => void
    }
  }
}

export default function BookingPage() {
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [now, setNow] = useState(() => new Date())

  const [services, setServices] = useState<Service[]>([])
  const [servicesError, setServicesError] = useState<string | null>(null)
  const [isLoadingServices, setIsLoadingServices] = useState(true)

  const [sedes, setSedes] = useState<Sede[]>([])
  const [selectedSede, setSelectedSede] = useState<number | null>(null)
  const [isLoadingSedes, setIsLoadingSedes] = useState(true)
  const [sedesError, setSedesError] = useState<string | null>(null)

  const [barbers, setBarbers] = useState<Barber[]>([])
  const [isLoadingBarbers, setIsLoadingBarbers] = useState(false)
  const [barbersError, setBarbersError] = useState<string | null>(null)

  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [isLoadingSlots, setIsLoadingSlots] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)

  const [selectedServices, setSelectedServices] = useState<number[]>([])
  const [selectedBarber, setSelectedBarber] = useState<number | null>(null)
  const [isBarberPreferenceFlexible, setIsBarberPreferenceFlexible] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()
  const [today, setToday] = useState<Date | undefined>()
  const [userId, setUserId] = useState<number | null>(null)
  const [isBooking, setIsBooking] = useState(false)
  const [slotsRefreshKey, setSlotsRefreshKey] = useState(0)
  const [activeStep, setActiveStep] = useState<BookingStep>("sede")
  const [customerComment, setCustomerComment] = useState("")
  const [completedReservation, setCompletedReservation] = useState<CompletedReservationSummary | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash")
  const [wompiCheckout, setWompiCheckout] = useState<WompiCheckoutData | null>(null)
  const [isWompiDialogOpen, setIsWompiDialogOpen] = useState(false)
  const [isWompiSdkReady, setIsWompiSdkReady] = useState(false)
  const [isLoadingWompiSdk, setIsLoadingWompiSdk] = useState(false)
  const [promoCodeInput, setPromoCodeInput] = useState("")
  const [promoError, setPromoError] = useState<string | null>(null)
  const [promoPreview, setPromoPreview] = useState<PromoPricingPreview | null>(null)
  const [isApplyingPromo, setIsApplyingPromo] = useState(false)
  const [pendingCheckoutReference, setPendingCheckoutReference] = useState<string | null>(null)
  const [lastAutoReconcileReference, setLastAutoReconcileReference] = useState<string | null>(null)
  const [isReconcilingPayment, setIsReconcilingPayment] = useState(false)
  const [isPaymentSuccessDialogOpen, setIsPaymentSuccessDialogOpen] = useState(false)
  const [paymentSuccessScheduleLabel, setPaymentSuccessScheduleLabel] = useState<string | null>(null)
  const wompiSdkPromiseRef = useRef<Promise<void> | null>(null)

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

  const persistPendingReservationReference = (reference: string) => {
    const normalizedReference = reference.trim()
    if (!normalizedReference) {
      return
    }

    setPendingCheckoutReference(normalizedReference)
    if (typeof window !== "undefined") {
      localStorage.setItem(PENDING_RESERVATION_CHECKOUT_REFERENCE_KEY, normalizedReference)
    }
  }

  const getPendingReservationDetailsStorageKey = (reference: string): string =>
    `${PENDING_RESERVATION_CHECKOUT_DETAILS_PREFIX}${reference.trim()}`

  const persistPendingReservationDetails = (reference: string, details: PendingReservationCheckoutDetails) => {
    const normalizedReference = reference.trim()
    if (!normalizedReference || typeof window === "undefined") {
      return
    }

    localStorage.setItem(getPendingReservationDetailsStorageKey(normalizedReference), JSON.stringify(details))
  }

  const readPendingReservationDetails = (reference: string | null | undefined): PendingReservationCheckoutDetails | null => {
    const normalizedReference = (reference ?? "").trim()
    if (!normalizedReference || typeof window === "undefined") {
      return null
    }

    try {
      const raw = localStorage.getItem(getPendingReservationDetailsStorageKey(normalizedReference))
      if (!raw) {
        return null
      }

      const parsed = JSON.parse(raw) as PendingReservationCheckoutDetails
      if (!parsed || typeof parsed.start !== "string") {
        return null
      }

      return {
        start: parsed.start,
        end: typeof parsed.end === "string" ? parsed.end : null,
      }
    } catch {
      return null
    }
  }

  const clearPendingReservationDetails = (reference: string | null | undefined) => {
    const normalizedReference = (reference ?? "").trim()
    if (!normalizedReference || typeof window === "undefined") {
      return
    }

    localStorage.removeItem(getPendingReservationDetailsStorageKey(normalizedReference))
  }

  const formatReservationScheduleLabel = (details: PendingReservationCheckoutDetails): string | null => {
    const startInstant = new Date(details.start)
    if (Number.isNaN(startInstant.getTime())) {
      return null
    }

    const dateLabel = format(startInstant, "EEEE d 'de' MMMM", { locale: es })
    const startLabel = formatTime12h(startInstant)

    if (details.end) {
      const endInstant = new Date(details.end)
      if (!Number.isNaN(endInstant.getTime()) && endInstant.getTime() > startInstant.getTime()) {
        return `${dateLabel} de ${startLabel} a ${formatTime12h(endInstant)}`
      }
    }

    return `${dateLabel} a las ${startLabel}`
  }

  const resolveReservationScheduleLabel = (
    referenceCandidates: Array<string | null | undefined>,
  ): string | null => {
    for (const candidate of referenceCandidates) {
      const details = readPendingReservationDetails(candidate)
      if (!details) {
        continue
      }

      const label = formatReservationScheduleLabel(details)
      if (label) {
        return label
      }
    }

    return null
  }

  const clearPendingReservationReference = (referenceToClear?: string | null) => {
    const normalizedReferenceToClear = (referenceToClear ?? pendingCheckoutReference ?? "").trim()

    setPendingCheckoutReference(null)
    if (typeof window !== "undefined") {
      localStorage.removeItem(PENDING_RESERVATION_CHECKOUT_REFERENCE_KEY)
      clearPendingReservationDetails(normalizedReferenceToClear)
    }
  }

  const openPaymentSuccessDialogOnce = (
    transactionId: string | null | undefined,
    scheduleLabel: string | null = null,
  ) => {
    const normalizedTransactionId = (transactionId ?? "").trim()

    if (typeof window !== "undefined" && normalizedTransactionId) {
      const storageKey = `${WOMPI_SUCCESS_POPUP_SEEN_PREFIX}${normalizedTransactionId}`
      const alreadyShown = sessionStorage.getItem(storageKey)
      if (alreadyShown === "1") {
        return
      }

      sessionStorage.setItem(storageKey, "1")
    }

    setPaymentSuccessScheduleLabel(scheduleLabel)
    setCompletedReservation((current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        status: "confirmed",
        scheduleLabel: scheduleLabel ?? current.scheduleLabel,
      }
    })
    setIsPaymentSuccessDialogOpen(true)
  }

  const loadWompiSdk = async () => {
    if (typeof window === "undefined") {
      return
    }

    if (window.WidgetCheckout) {
      return
    }

    if (!wompiSdkPromiseRef.current) {
      wompiSdkPromiseRef.current = new Promise<void>((resolve, reject) => {
        const scriptId = "wompi-widget-sdk"
        const existing = document.getElementById(scriptId) as HTMLScriptElement | null

        if (existing) {
          existing.addEventListener("load", () => resolve(), { once: true })
          existing.addEventListener("error", () => reject(new Error("WOMPI_SDK_LOAD_FAILED")), { once: true })
          return
        }

        const script = document.createElement("script")
        script.id = scriptId
        script.src = "https://checkout.wompi.co/widget.js"
        script.async = true
        script.onload = () => resolve()
        script.onerror = () => reject(new Error("WOMPI_SDK_LOAD_FAILED"))
        document.body.appendChild(script)
      })
    }

    await wompiSdkPromiseRef.current
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date())
    }, 30_000)

    return () => {
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const start = startOfToday()
    setToday(start)
    setSelectedDate(start)

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

  useEffect(() => {
    let isActive = true

    const fetchSedes = async () => {
      setIsLoadingSedes(true)
      setSedesError(null)

      try {
        const response = await fetch("/api/sedes", {
          method: "GET",
          cache: "no-store",
          headers: buildTenantHeaders(),
        })

        const data = await response.json().catch(() => ({}))
        if (!isActive) {
          return
        }

        if (!response.ok) {
          setSedes([])
          setSelectedSede(null)
          setSedesError(data.error ?? "No se pudieron cargar las sedes")
          return
        }

        const nextSedes = Array.isArray(data.sedes) ? (data.sedes as Sede[]) : []
        setSedes(nextSedes)

        if (nextSedes.length === 0) {
          setSelectedSede(null)
          return
        }

        setSelectedSede((current) => {
          if (current != null && nextSedes.some((sede) => sede.id === current)) {
            return current
          }

          return nextSedes[0]?.id ?? null
        })
      } catch (error) {
        if (!isActive) {
          return
        }

        console.error("Error loading sedes", error)
        setSedes([])
        setSelectedSede(null)
        setSedesError("Error de conexión al cargar las sedes")
      } finally {
        if (isActive) {
          setIsLoadingSedes(false)
        }
      }
    }

    fetchSedes()

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    if (sedes.length === 0) {
      return
    }

    if (selectedSede == null) {
      return
    }

    if (!sedes.some((sede) => sede.id === selectedSede)) {
      setSelectedSede(sedes[0]?.id ?? null)
    }
  }, [sedes, selectedSede])

  useEffect(() => {
    setSelectedServices([])
    setSelectedBarber(null)
    setIsBarberPreferenceFlexible(false)
    setSelectedSlot(null)
    setBarbers([])
    setSlots([])
    setCustomerComment("")
    setCompletedReservation(null)
    setPromoCodeInput("")
    setPromoPreview(null)
    setPromoError(null)
  }, [selectedSede])

  useEffect(() => {
    if (sedes.length === 0 && activeStep === "sede") {
      setActiveStep("services")
    }
  }, [sedes.length, activeStep])

  useEffect(() => {
    let isActive = true

    const fetchServices = async () => {
      if (sedes.length > 0 && selectedSede == null) {
        setServices([])
        setIsLoadingServices(false)
        return
      }

      setIsLoadingServices(true)
      setServicesError(null)

      try {
        const query = new URLSearchParams()
        if (selectedSede != null) {
          query.set("sedeId", String(selectedSede))
        }

        const response = await fetch(`/api/services${query.toString() ? `?${query.toString()}` : ""}`, {
          method: "GET",
          cache: "no-store",
          headers: buildTenantHeaders(),
        })

        const data = await response.json().catch(() => ({}))

        if (!isActive) {
          return
        }

        if (!response.ok) {
          setServicesError(data.error ?? "No se pudieron cargar los servicios")
          setServices([])
          return
        }

        setServices(Array.isArray(data.services) ? data.services : [])
      } catch (error) {
        if (!isActive) {
          return
        }
        console.error("Error loading services", error)
        setServicesError("Error de conexión al cargar los servicios")
        setServices([])
      } finally {
        if (isActive) {
          setIsLoadingServices(false)
        }
      }
    }

    fetchServices()

    return () => {
      isActive = false
    }
  }, [selectedSede, sedes.length])

  useEffect(() => {
    setSelectedBarber(null)
    setIsBarberPreferenceFlexible(false)
    setBarbers([])
    setSelectedSlot(null)
    setSlots([])
    setBarbersError(null)
    setSlotsError(null)

    if (selectedServices.length === 0) {
      setIsLoadingBarbers(false)
      return
    }

    let isActive = true
    setIsLoadingBarbers(true)

    const fetchBarbers = async () => {
      try {
        const responses = await Promise.all(
          selectedServices.map((serviceId) => {
            const query = new URLSearchParams()
            if (selectedSede != null) {
              query.set("sedeId", String(selectedSede))
            }

            return fetch(`/api/services/${serviceId}/barbers${query.toString() ? `?${query.toString()}` : ""}`, {
              method: "GET",
              cache: "no-store",
              headers: buildTenantHeaders(),
            })
          }),
        )

        const payloads = await Promise.all(responses.map((response) => response.json().catch(() => ({}))))

        if (!isActive) return

        const firstErrorIndex = responses.findIndex((response) => !response.ok)
        if (firstErrorIndex !== -1) {
          const data = payloads[firstErrorIndex]
          setBarbersError(data.error ?? "No se pudieron cargar los profesionales")
          setBarbers([])
          return
        }

        const lists = payloads.map((data) => (Array.isArray(data.barbers) ? (data.barbers as Barber[]) : []))

        if (lists.length === 0) {
          setBarbers([])
          return
        }

        const idsInAll = new Set<number>(lists[0].map((barber) => barber.id))
        for (const list of lists.slice(1)) {
          const ids = new Set<number>(list.map((barber) => barber.id))
          for (const id of Array.from(idsInAll)) {
            if (!ids.has(id)) {
              idsInAll.delete(id)
            }
          }
        }

        setBarbers(lists[0].filter((barber) => idsInAll.has(barber.id)))
      } catch (error) {
        if (!isActive) {
          return
        }
        console.error("Error loading barbers", error)
        setBarbersError("Error de conexión al cargar los profesionales")
        setBarbers([])
      } finally {
        if (isActive) {
          setIsLoadingBarbers(false)
        }
      }
    }

    fetchBarbers()

    return () => {
      isActive = false
    }
  }, [selectedServices, selectedSede])

  useEffect(() => {
    if (!searchParams) {
      return
    }

    const rawSedeId = searchParams.get("sedeId")
    if (rawSedeId && sedes.length > 0) {
      const parsedSedeId = Number(rawSedeId)
      if (Number.isFinite(parsedSedeId) && parsedSedeId > 0 && sedes.some((sede) => sede.id === parsedSedeId)) {
        setSelectedSede(parsedSedeId)
      }
    }

    const rawServiceId = searchParams.get("serviceId")
    if (rawServiceId) {
      const parsedServiceId = Number(rawServiceId)
      if (
        Number.isFinite(parsedServiceId) &&
        parsedServiceId > 0 &&
        selectedServices.length === 0 &&
        services.some((service) => service.id === parsedServiceId)
      ) {
        setSelectedServices([parsedServiceId])
      }
    }

    const rawBarberId = searchParams.get("barberId")
    if (!rawBarberId) {
      return
    }

    const parsed = Number(rawBarberId)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return
    }

    // Only set if it's in the current list.
    if (barbers.some((barber) => barber.id === parsed)) {
      setIsBarberPreferenceFlexible(false)
      setSelectedBarber(parsed)
    }
  }, [searchParams, barbers, services, sedes, selectedServices.length])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const pendingReference = localStorage.getItem(PENDING_RESERVATION_CHECKOUT_REFERENCE_KEY)?.trim() ?? ""
    if (!pendingReference) {
      return
    }

    setPendingCheckoutReference(pendingReference)
  }, [])

  useEffect(() => {
    if (!searchParams) {
      return
    }

    const provider = searchParams.get("paymentProvider")
    const transactionId = searchParams.get("id")

    if (provider !== "wompi" || !transactionId) {
      return
    }

    let isActive = true

    const loadStatus = async () => {
      try {
        const response = await fetch(`/api/payments/wompi/transaction/${encodeURIComponent(transactionId)}`, {
          method: "GET",
          cache: "no-store",
          headers: buildTenantHeaders(),
        })

        const data = await response.json().catch(() => ({}))
        if (!isActive) {
          return
        }

        if (!response.ok) {
          toast({
            title: "No pudimos validar tu pago",
            description: "Revisa el estado en Wompi o inténtalo nuevamente.",
            variant: "destructive",
          })
          return
        }

        const status = String(data.status ?? "").toUpperCase()
        const billingRejected = Boolean(data.billingRejected)
        const billingRejectMessage = getBillingRejectMessage(data)
        const reconciliationReference =
          typeof data.reference === "string" && data.reference.trim()
            ? data.reference.trim()
            : null
        const scheduleLabel = resolveReservationScheduleLabel([reconciliationReference, pendingCheckoutReference])

        if (status === "APPROVED") {
          if (billingRejected) {
            toast({
              title: "Pago validado con observación",
              description: billingRejectMessage,
              variant: "destructive",
            })
            return
          }

          clearPendingReservationReference(reconciliationReference)

          toast({
            title: "Pago aprobado",
            description: "Tu pago fue confirmado con Wompi.",
          })
          openPaymentSuccessDialogOnce(transactionId, scheduleLabel)
          return
        }

        if (status === "DECLINED" || status === "ERROR" || status === "VOIDED") {
          toast({
            title: "Pago no aprobado",
            description: "Tu reserva quedó creada, pero el pago no fue aprobado. Puedes intentarlo de nuevo.",
            variant: "destructive",
          })
          return
        }

        toast({
          title: "Pago en proceso",
          description: "Wompi reporta la transacción en estado pendiente."
        })
      } catch (error) {
        if (!isActive) {
          return
        }
        console.error("Error validating Wompi payment", error)
      }
    }

    void loadStatus()

    return () => {
      isActive = false
    }
  }, [searchParams, toast])

  useEffect(() => {
    setSelectedSlot(null)
    setSlots([])
    setSlotsError(null)

    if (selectedServices.length === 0 || (!selectedBarber && !isBarberPreferenceFlexible) || !selectedDate) {
      setIsLoadingSlots(false)
      return
    }

    let isActive = true
    setIsLoadingSlots(true)

    const controller = new AbortController()

    const fetchSlots = async () => {
      try {
        const dateParam = format(selectedDate, "yyyy-MM-dd")

        const responses = await Promise.all(
          selectedServices.map((serviceId) => {
            const query = new URLSearchParams({
              serviceId: String(serviceId),
              date: dateParam,
            })

            if (!isBarberPreferenceFlexible && selectedBarber) {
              query.set("barberId", String(selectedBarber))
            }

            if (selectedSede != null) {
              query.set("sedeId", String(selectedSede))
            }

            return fetch(`/api/availability?${query.toString()}`, {
              method: "GET",
              cache: "no-store",
              signal: controller.signal,
              headers: buildTenantHeaders(),
            })
          }),
        )

        const payloads = await Promise.all(responses.map((response) => response.json().catch(() => ({}))))

        if (!isActive) return

        const firstErrorIndex = responses.findIndex((response) => !response.ok)
        if (firstErrorIndex !== -1) {
          const data = payloads[firstErrorIndex]
          setSlotsError(data.error ?? "No se pudo obtener la disponibilidad")
          setSlots([])
          return
        }

        const slotLists = payloads.map((data) => (Array.isArray(data.slots) ? (data.slots as AvailabilitySlot[]) : []))

        if (selectedServices.length === 1) {
          setSlots(slotLists[0])
          return
        }

        const durations = selectedServices.map((id) => services.find((svc) => svc.id === id)?.durationMin ?? 0)
        const totalDuration = durations.reduce((acc, value) => acc + value, 0)

        if (!totalDuration || !Number.isFinite(totalDuration)) {
          setSlotsError("No pudimos calcular la duración total del servicio")
          setSlots([])
          return
        }

        // Conservative check: ensure the full window is available by verifying the start exists and
        // (when durations are 30-min multiples) intermediate starts exist as well.
        const allStarts = slotLists.map((list) => new Set(list.map((slot) => slot.start)))
        const chainable = slotLists[0].filter((slot) => {
          let cursor = new Date(slot.start)
          for (let index = 0; index < durations.length; index += 1) {
            const cursorIso = cursor.toISOString()
            if (!allStarts[index]?.has(cursorIso)) {
              return false
            }
            cursor = addMinutes(cursor, durations[index] ?? 0)
          }
          return true
        })

        setSlots(chainable)
      } catch (error) {
        if (!isActive || error instanceof DOMException) {
          return
        }
        console.error("Error loading availability", error)
        setSlotsError("Error de conexión al consultar la disponibilidad")
        setSlots([])
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
  }, [selectedServices, selectedBarber, isBarberPreferenceFlexible, selectedDate, slotsRefreshKey, selectedSede, services])

  const selectedServicesMeta = useMemo(() => {
    const selected = services.filter((service) => selectedServices.includes(service.id))
    const totalDuration = selected.reduce((acc, service) => acc + (service.durationMin ?? 0), 0)
    return {
      selected,
      totalDuration,
    }
  }, [services, selectedServices])

  const visibleSlots = useMemo(() => {
    if (!selectedDate) return []
    if (slots.length === 0) return []

    if (!isSameDay(selectedDate, now)) {
      return slots
    }

    const nowTime = now.getTime()
    return slots.filter((slot) => {
      const slotStart = new Date(slot.start)
      return Number.isFinite(slotStart.getTime()) && slotStart.getTime() > nowTime
    })
  }, [slots, selectedDate, now])

  useEffect(() => {
    if (!selectedSlot) return

    const stillVisible = visibleSlots.some((slot) => slot.start === selectedSlot.start)
    if (!stillVisible) {
      setSelectedSlot(null)
    }
  }, [visibleSlots, selectedSlot])

  const formattedSummaryDate = useMemo(() => {
    if (!selectedDate) return null
    return format(selectedDate, "EEEE d 'de' MMMM", { locale: es })
  }, [selectedDate])

  const formattedSummaryTime = useMemo(() => {
    if (!selectedSlot) return null
    const startInstant = new Date(selectedSlot.start)
    const startLabel = formatTime12h(startInstant)

    if (selectedServicesMeta.totalDuration > 0 && selectedServices.length > 1) {
      const endInstant = addMinutes(startInstant, selectedServicesMeta.totalDuration)
      return `${startLabel} - ${formatTime12h(endInstant)}`
    }

    return startLabel
  }, [selectedSlot, selectedServicesMeta.totalDuration, selectedServices.length])

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        minimumFractionDigits: 0,
      }),
    [],
  )

  const selectedServicesTotal = useMemo(() => {
    const normalizedPrices = selectedServicesMeta.selected.map((service) => {
      const value = service.price as unknown
      if (typeof value === "number" && Number.isFinite(value)) return value
      if (typeof value === "string") {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : null
      }
      return null
    })

    if (normalizedPrices.some((value) => value == null)) {
      return null
    }

    return (normalizedPrices as number[]).reduce((acc, value) => acc + value, 0)
  }, [selectedServicesMeta.selected])

  const selectedBarberName = useMemo(() => {
    if (isBarberPreferenceFlexible) return "Sin preferencia (asignación automática)"
    if (!selectedBarber) return null
    const barber = barbers.find((item) => item.id === selectedBarber)
    return barber?.name ?? null
  }, [barbers, selectedBarber, isBarberPreferenceFlexible])

  const selectedSedeName = useMemo(() => {
    if (!selectedSede) return null
    const sede = sedes.find((item) => item.id === selectedSede)
    return sede?.name ?? null
  }, [sedes, selectedSede])

  const selectedSedeDetails = useMemo(() => {
    if (!selectedSede) {
      return null
    }

    return sedes.find((item) => item.id === selectedSede) ?? null
  }, [sedes, selectedSede])

  const selectedSedeAddress = useMemo(() => {
    if (!selectedSedeDetails) {
      return ""
    }

    return [selectedSedeDetails.address, selectedSedeDetails.city]
      .filter((value) => typeof value === "string" && value.trim().length > 0)
      .join(", ")
  }, [selectedSedeDetails])

  const selectedSedeMapsUrl = useMemo(() => {
    if (!selectedSedeDetails) {
      return null
    }

    if (
      typeof selectedSedeDetails.latitude === "number" &&
      Number.isFinite(selectedSedeDetails.latitude) &&
      typeof selectedSedeDetails.longitude === "number" &&
      Number.isFinite(selectedSedeDetails.longitude)
    ) {
      return `https://www.google.com/maps/search/?api=1&query=${selectedSedeDetails.latitude},${selectedSedeDetails.longitude}`
    }

    const fallbackQuery = [selectedSedeDetails.name, selectedSedeDetails.address, selectedSedeDetails.city]
      .filter((value) => typeof value === "string" && value.trim().length > 0)
      .join(", ")

    if (!fallbackQuery) {
      return null
    }

    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fallbackQuery)}`
  }, [selectedSedeDetails])

  const selectedSedeMapEmbedUrl = useMemo(() => {
    if (!selectedSedeDetails) {
      return null
    }

    if (
      typeof selectedSedeDetails.latitude === "number" &&
      Number.isFinite(selectedSedeDetails.latitude) &&
      typeof selectedSedeDetails.longitude === "number" &&
      Number.isFinite(selectedSedeDetails.longitude)
    ) {
      return `https://www.google.com/maps?q=${selectedSedeDetails.latitude},${selectedSedeDetails.longitude}&z=15&output=embed`
    }

    if (selectedSedeAddress.length > 0) {
      return `https://www.google.com/maps?q=${encodeURIComponent(selectedSedeAddress)}&z=15&output=embed`
    }

    return null
  }, [selectedSedeAddress, selectedSedeDetails])

  useEffect(() => {
    // Invalidate promo preview when services change.
    setPromoPreview(null)
    setPromoError(null)
  }, [selectedServices])

  const handleApplyPromo = async () => {
    if (selectedServices.length === 0 || selectedServicesTotal == null) {
      setPromoError("Selecciona servicios válidos antes de aplicar un código.")
      return
    }

    const code = promoCodeInput.trim().toUpperCase()
    if (!code) {
      setPromoError("Ingresa un código promocional.")
      return
    }

    setIsApplyingPromo(true)
    setPromoError(null)

    try {
      const response = await fetch("/api/reservations/promo-preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildTenantHeaders(),
        },
        body: JSON.stringify({
          serviceIds: selectedServices,
          promoCode: code,
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok || !data?.pricing) {
        setPromoPreview(null)
        setPromoError(typeof data?.error === "string" ? data.error : "No se pudo validar el código.")
        return
      }

      setPromoPreview(data.pricing as PromoPricingPreview)
      setPromoCodeInput(code)
      setPromoError(null)
      toast({
        title: "Código aplicado",
        description: "El descuento quedó listo para pagos con Wompi.",
      })
    } catch (error) {
      console.error("Error applying promo preview", error)
      setPromoPreview(null)
      setPromoError("Error de conexión al validar el código.")
    } finally {
      setIsApplyingPromo(false)
    }
  }

  const originalTotalForSummary = promoPreview?.originalTotal ?? selectedServicesTotal
  const wompiDiscountForSummary = paymentMethod === "wompi" ? (promoPreview?.discountTotal ?? 0) : 0
  const wompiFinalTotalForSummary =
    originalTotalForSummary == null
      ? null
      : paymentMethod === "wompi"
        ? Math.max(0, originalTotalForSummary - wompiDiscountForSummary)
        : originalTotalForSummary

  useEffect(() => {
    if (!isWompiDialogOpen || !wompiCheckout) {
      return
    }

    let isActive = true

    const ensureSdk = async () => {
      setIsLoadingWompiSdk(true)
      try {
        await loadWompiSdk()
        if (isActive) {
          setIsWompiSdkReady(true)
        }
      } catch (error) {
        console.error("Error loading Wompi SDK", error)
        if (isActive) {
          setIsWompiSdkReady(false)
          toast({
            title: "No se pudo cargar Wompi",
            description: "Intenta nuevamente en unos segundos.",
            variant: "destructive",
          })
        }
      } finally {
        if (isActive) {
          setIsLoadingWompiSdk(false)
        }
      }
    }

    void ensureSdk()

    return () => {
      isActive = false
    }
  }, [isWompiDialogOpen, wompiCheckout, toast])

  const extractTransactionIdFromWidgetResult = (payload: unknown): string | null => {
    if (!payload || typeof payload !== "object") {
      return null
    }

    const result = payload as {
      transaction?: { id?: unknown }
      data?: { transaction?: { id?: unknown } }
    }

    const candidateIds = [result.transaction?.id, result.data?.transaction?.id]
    for (const candidate of candidateIds) {
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate.trim()
      }
    }

    return null
  }

  const getBillingRejectMessage = (payload: unknown): string => {
    if (!payload || typeof payload !== "object") {
      return "El pago fue aprobado en Wompi, pero no coincide con las reglas de facturación del plan."
    }

    const data = payload as {
      billingRejectMessage?: unknown
      billingRejectReason?: unknown
    }

    if (typeof data.billingRejectMessage === "string" && data.billingRejectMessage.trim()) {
      return data.billingRejectMessage.trim()
    }

    const reason = typeof data.billingRejectReason === "string" ? data.billingRejectReason.trim().toLowerCase() : ""

    if (reason === "amount_mismatch") {
      return "Monto no coincide con el plan."
    }

    if (reason === "invalid_currency") {
      return "Moneda inválida para la suscripción."
    }

    if (reason === "invalid_cycle") {
      return "Ciclo de facturación inválido para la suscripción."
    }

    return "El pago fue aprobado en Wompi, pero no coincide con las reglas de facturación del plan."
  }

  const reconcileWompiTransactionById = async (transactionId: string) => {
    try {
      const response = await fetch(`/api/payments/wompi/transaction/${encodeURIComponent(transactionId)}`, {
        method: "GET",
        cache: "no-store",
        headers: buildTenantHeaders(),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        toast({
          title: "Pago recibido",
          description: "No pudimos sincronizar el estado al instante. Se reflejará al confirmar en webhook.",
        })
        return
      }

      const status = String(data.status ?? "").toUpperCase()
      const billingRejected = Boolean(data.billingRejected)
      const billingRejectMessage = getBillingRejectMessage(data)
      const reconciliationReference =
        typeof data.reference === "string" && data.reference.trim()
          ? data.reference.trim()
          : null
      const scheduleLabel = resolveReservationScheduleLabel([reconciliationReference, pendingCheckoutReference])

      if (status === "APPROVED") {
        if (billingRejected) {
          toast({
            title: "Pago validado con observación",
            description: billingRejectMessage,
            variant: "destructive",
          })
          return
        }

        clearPendingReservationReference(reconciliationReference)

        toast({
          title: "Pago aprobado",
          description: "Tu pago fue confirmado y quedó registrado.",
        })
        openPaymentSuccessDialogOnce(transactionId, scheduleLabel)
        return
      }

      if (status === "DECLINED" || status === "ERROR" || status === "VOIDED") {
        toast({
          title: "Pago no aprobado",
          description: "La reserva quedó creada, pero el pago no fue aprobado.",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Pago en proceso",
        description: "Wompi reporta la transacción en estado pendiente.",
      })
    } catch (error) {
      console.error("Error reconciling Wompi transaction", error)
    }
  }

  const reconcileWompiPaymentByReference = async (reference: string) => {
    const normalizedReference = reference.trim()
    if (!normalizedReference) {
      return
    }

    setIsReconcilingPayment(true)
    try {
      const byReferenceResponse = await fetch(`/api/payments/wompi/reference/${encodeURIComponent(normalizedReference)}`, {
        method: "GET",
        cache: "no-store",
        headers: buildTenantHeaders(),
      })

      const byReferencePayload = (await byReferenceResponse.json().catch(() => null)) as {
        transactionId?: string | null
        error?: string
      } | null

      if (byReferenceResponse.status === 404) {
        return
      }

      if (!byReferenceResponse.ok || !byReferencePayload?.transactionId) {
        throw new Error(byReferencePayload?.error?.trim() || "No se pudo resolver la transacción de Wompi por referencia.")
      }

      await reconcileWompiTransactionById(byReferencePayload.transactionId)
    } catch (error) {
      console.error("Error reconciling Wompi payment by reference", error)
    } finally {
      setIsReconcilingPayment(false)
    }
  }

  useEffect(() => {
    if (!searchParams) {
      return
    }

    const provider = (searchParams.get("paymentProvider") ?? "").trim().toLowerCase()
    const reference = (searchParams.get("reference") ?? "").trim()
    const transactionId = (searchParams.get("id") ?? "").trim()

    if (provider !== "wompi" || !reference || transactionId) {
      return
    }

    persistPendingReservationReference(reference)
    void reconcileWompiPaymentByReference(reference)
  }, [searchParams])

  useEffect(() => {
    if (!pendingCheckoutReference || isReconcilingPayment) {
      return
    }

    if (lastAutoReconcileReference === pendingCheckoutReference) {
      return
    }

    setLastAutoReconcileReference(pendingCheckoutReference)
    void reconcileWompiPaymentByReference(pendingCheckoutReference)
  }, [isReconcilingPayment, lastAutoReconcileReference, pendingCheckoutReference])

  const openWompiWidget = async () => {
    if (!wompiCheckout) {
      return
    }

    setIsWompiDialogOpen(false)

    const normalizedRedirectUrl = wompiCheckout.redirectUrl?.trim() ?? ""
    const canUseRedirectUrl =
      normalizedRedirectUrl.length > 0 && !/localhost|127\.0\.0\.1/i.test(normalizedRedirectUrl)

    const openWebCheckoutFallback = () => {
      const form = document.createElement("form")
      form.action = "https://checkout.wompi.co/p/"
      form.method = "GET"
      form.target = "_blank"

      const fields: Array<{ name: string; value: string }> = [
        { name: "public-key", value: wompiCheckout.publicKey },
        { name: "currency", value: wompiCheckout.currency },
        { name: "amount-in-cents", value: String(wompiCheckout.amountInCents) },
        { name: "reference", value: wompiCheckout.reference },
        { name: "signature:integrity", value: wompiCheckout.signatureIntegrity },
        { name: "acceptance-token", value: wompiCheckout.acceptanceToken },
      ]

      if (wompiCheckout.personalDataAuthToken?.trim()) {
        fields.push({ name: "personal-data-auth-token", value: wompiCheckout.personalDataAuthToken })
      }

      if (canUseRedirectUrl) {
        fields.push({ name: "redirect-url", value: normalizedRedirectUrl })
      }

      for (const field of fields) {
        const input = document.createElement("input")
        input.type = "hidden"
        input.name = field.name
        input.value = field.value
        form.appendChild(input)
      }

      document.body.appendChild(form)
      form.submit()
      form.remove()
    }

    try {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve())
      })

      await loadWompiSdk()

      if (!window.WidgetCheckout) {
        throw new Error("WOMPI_WIDGET_UNAVAILABLE")
      }

      const checkout = new window.WidgetCheckout({
        currency: wompiCheckout.currency,
        amountInCents: wompiCheckout.amountInCents,
        reference: wompiCheckout.reference,
        publicKey: wompiCheckout.publicKey,
        signature: {
          integrity: wompiCheckout.signatureIntegrity,
        },
        redirectUrl: canUseRedirectUrl ? normalizedRedirectUrl : undefined,
        acceptanceToken: wompiCheckout.acceptanceToken,
        personalDataAuthToken: wompiCheckout.personalDataAuthToken ?? undefined,
      })

      checkout.open((result) => {
        console.log("[WOMPI_WIDGET_RESULT]", result)

        const transactionId = extractTransactionIdFromWidgetResult(result)
        if (transactionId) {
          void reconcileWompiTransactionById(transactionId)
        }
      })
    } catch (error) {
      console.error("Error opening Wompi widget", error)
      openWebCheckoutFallback()
    }
  }

  const handleBooking = async (): Promise<boolean> => {
    if (selectedServices.length === 0 || (!selectedBarber && !isBarberPreferenceFlexible) || !selectedSlot) {
      return false
    }

    if (sedes.length > 0 && !selectedSede) {
      toast({
        title: "Selecciona una sede",
        description: "Debes elegir una sede para continuar con la reserva.",
        variant: "destructive",
      })
      return false
    }

    if (!userId) {
      toast({
        title: "Inicia sesión nuevamente",
        description: "No encontramos tu sesión activa. Vuelve a iniciar sesión para agendar.",
        variant: "destructive",
      })
      return false
    }

    setIsBooking(true)

    try {
      const trimmedCustomerComment = customerComment.trim()

      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildTenantHeaders(),
        },
        body: JSON.stringify({
          userId,
          sedeId: selectedSede ?? undefined,
          barberId: isBarberPreferenceFlexible ? undefined : selectedBarber,
          serviceIds: selectedServices,
          paymentMethod,
          promoCode: paymentMethod === "wompi" ? promoCodeInput.trim().toUpperCase() || undefined : undefined,
          customerComment: trimmedCustomerComment || undefined,
          start: selectedSlot.start,
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        const errorMessage =
          typeof data.error === "string" && data.error.trim().length > 0
            ? (data.error as string)
            : "Intenta con otro horario o vuelve a intentarlo más tarde."

        if (response.status === 409) {
          const shouldRefreshSlot =
            /horario|disponible|ya pas[oó]|seleccionado/i.test(errorMessage)

          if (shouldRefreshSlot) {
            setSelectedSlot(null)
            setSlotsRefreshKey((value) => value + 1)
          }
        }

        toast({
          title: errorMessage.includes("máximo de 2")
            ? "Límite diario alcanzado"
            : "No se pudo agendar la cita",
          description: errorMessage,
          variant: "destructive",
        })
        return false
      }

      const startInstant = new Date(selectedSlot.start)
      const endInstant =
        selectedServicesMeta.totalDuration > 0
          ? addMinutes(startInstant, selectedServicesMeta.totalDuration)
          : null
      const scheduleLabel = endInstant
        ? `${format(startInstant, "EEEE d 'de' MMMM", { locale: es })} de ${formatTime12h(startInstant)} a ${formatTime12h(endInstant)}`
        : `${format(startInstant, "EEEE d 'de' MMMM", { locale: es })} a las ${formatTime12h(startInstant)}`
      const currentSedeName = selectedSede
        ? sedes.find((item) => item.id === selectedSede)?.name ?? null
        : null
      const currentBarberName = isBarberPreferenceFlexible
        ? "Sin preferencia (asignación automática)"
        : barbers.find((item) => item.id === selectedBarber)?.name ?? null
      const summaryTotalLabel =
        wompiFinalTotalForSummary == null
          ? "Consultar"
          : currencyFormatter.format(wompiFinalTotalForSummary)

      const wompiData =
        typeof data === "object" &&
        data !== null &&
        "payment" in data &&
        typeof (data as { payment?: unknown }).payment === "object" &&
        (data as { payment?: { wompiCheckout?: WompiCheckoutData } }).payment?.wompiCheckout
          ? ((data as { payment?: { wompiCheckout?: WompiCheckoutData } }).payment?.wompiCheckout ?? null)
          : null

      if (paymentMethod === "wompi") {
        if (!wompiData) {
          toast({
            title: "No se pudo abrir Wompi",
            description: "La reserva se creó pero no pudimos cargar el checkout. Intenta nuevamente desde tus citas.",
            variant: "destructive",
          })
          return false
        }

        toast({
          title: "Reserva creada",
          description: "Ahora completa el pago en Wompi para confirmar tu cita.",
        })

        persistPendingReservationReference(wompiData.reference)
        persistPendingReservationDetails(wompiData.reference, {
          start: selectedSlot.start,
          end: endInstant ? endInstant.toISOString() : selectedSlot.end ?? null,
        })
        setWompiCheckout(wompiData)
        setIsWompiDialogOpen(true)
        setCompletedReservation({
          services: selectedServicesMeta.selected.map((service) => service.name),
          sedeName: currentSedeName,
          barberName: currentBarberName,
          scheduleLabel,
          paymentMethod,
          totalLabel: summaryTotalLabel,
          status: "pending-payment",
        })
        setActiveStep("confirm")
        setSelectedSlot(null)
        setCustomerComment("")
        setSlotsRefreshKey((value) => value + 1)
        return true
      }

      toast({
        title: "Cita reservada con éxito",
        description: endInstant
          ? `Tu cita quedó agendada para ${format(startInstant, "EEEE d 'de' MMMM", { locale: es })} de ${formatTime12h(startInstant)} a ${formatTime12h(endInstant)}. Pago: efectivo.`
          : `Tu cita quedó agendada para ${format(startInstant, "EEEE d 'de' MMMM", { locale: es })} a las ${formatTime12h(startInstant)}. Pago: efectivo.`,
      })

      setCompletedReservation({
        services: selectedServicesMeta.selected.map((service) => service.name),
        sedeName: currentSedeName,
        barberName: currentBarberName,
        scheduleLabel,
        paymentMethod,
        totalLabel: summaryTotalLabel,
        status: "confirmed",
      })
      setActiveStep("confirm")
      setSelectedSlot(null)
      setCustomerComment("")
      setPromoCodeInput("")
      setPromoPreview(null)
      setPromoError(null)
      setSlotsRefreshKey((value) => value + 1)
      return true
    } catch (error) {
      console.error("Error creating reservation", error)
      toast({
        title: "Error de conexión",
        description: "No pudimos comunicar con el servidor. Intenta nuevamente en unos segundos.",
        variant: "destructive",
      })
      return false
    } finally {
      setIsBooking(false)
    }
  }

  const renderServiceContent = () => {
    if (sedes.length > 0 && selectedSede == null) {
      return <p className="text-sm text-muted-foreground">Selecciona primero una sede para ver los servicios.</p>
    }

    if (isLoadingServices) {
      return Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="h-20 w-full rounded-2xl" />
      ))
    }

    if (servicesError) {
      return (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {servicesError}
        </p>
      )
    }

    if (services.length === 0) {
      return (
        <Empty className="border border-dashed border-border/60 bg-muted/40">
          <EmptyMedia variant="icon">
            <Scissors className="size-6" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Sin servicios disponibles</EmptyTitle>
            <EmptyDescription>
              Aún no publicamos servicios para reservar. Vuelve más tarde o contáctanos para más información.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )
    }

    return services.map((service) => {
      const isSelected = selectedServices.includes(service.id)

      const displayPrice = service.price != null ? currencyFormatter.format(service.price) : "Consultar"
      const durationLabel = service.durationMin ? `${service.durationMin} min` : "Sin duración"

      return (
        <button
          key={service.id}
          type="button"
          onClick={() => {
            setSelectedServices((current) => {
              if (current.includes(service.id)) {
                return current.filter((id) => id !== service.id)
              }

              if (current.length >= 2) {
                toast({
                  title: "Máximo 2 servicios",
                  description: "Por ahora solo puedes seleccionar hasta 2 servicios por reserva.",
                  variant: "destructive",
                })
                return current
              }

              return [...current, service.id]
            })
          }}
          className={cn(
            "group flex w-full items-start gap-3 rounded-2xl border bg-card/80 p-4 text-left transition-all",
            "hover:border-foreground/20 hover:shadow-sm",
            isSelected && "border-foreground bg-foreground text-background shadow-md",
          )}
        >
          <span
            className={cn(
              "flex size-10 items-center justify-center rounded-full border",
              isSelected ? "border-background/40 bg-background/20" : "border-border bg-background",
            )}
          >
            <Scissors className={cn("h-5 w-5", isSelected ? "text-background" : "text-primary")} />
          </span>
          <div className="flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className={cn("font-semibold", isSelected && "text-background")}>{service.name}</h3>
              <span className="flex items-center gap-1 text-sm font-medium">
                <DollarSign className="h-4 w-4" />
                {displayPrice}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className={cn(isSelected && "text-background/80")}>{service.description ?? ""}</span>
              <span className={cn("inline-flex items-center gap-1", isSelected && "text-background/80")}
              >
                <Clock className="h-3.5 w-3.5" /> {durationLabel}
              </span>
            </div>
          </div>
        </button>
      )
    })
  }

  const renderBarbersContent = () => {
    if (sedes.length > 0 && selectedSede == null) {
      return <p className="text-sm text-muted-foreground">Selecciona primero una sede para ver los profesionales.</p>
    }

    if (selectedServices.length === 0) {
      return <p className="text-sm text-muted-foreground">Selecciona primero un servicio para ver los barberos disponibles.</p>
    }

    if (isLoadingBarbers) {
      return Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="h-20 w-full rounded-2xl" />
      ))
    }

    if (barbersError) {
      return (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {barbersError}
        </p>
      )
    }

    if (barbers.length === 0) {
      return (
        <Empty className="border border-dashed border-border/60 bg-muted/40">
          <EmptyMedia variant="icon">
            <Users className="size-6" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Sin profesionales asignados</EmptyTitle>
            <EmptyDescription>
              Todavía no tenemos barberos disponibles para este servicio. Elige otro o vuelve más tarde.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )
    }

    const preferenceCard = (
      <button
        key="no-preference"
        type="button"
        onClick={() => {
          setSelectedBarber(null)
          setIsBarberPreferenceFlexible(true)
        }}
        className={cn(
          "flex w-full items-center gap-4 rounded-2xl border bg-card/80 p-4 text-left transition-all",
          "hover:border-foreground/20 hover:shadow-sm",
          isBarberPreferenceFlexible && "border-foreground bg-foreground text-background shadow-md",
        )}
      >
        <span className={cn("flex size-12 items-center justify-center rounded-full bg-muted text-base font-semibold", isBarberPreferenceFlexible && "bg-background/20 text-background")}>
          *
        </span>
        <div className="flex flex-1 flex-col">
          <span className="font-semibold leading-tight">Sin preferencia</span>
          <span className={cn("text-xs text-muted-foreground", isBarberPreferenceFlexible && "text-background/80")}>
            Te asignamos automáticamente el primer profesional disponible
          </span>
        </div>
      </button>
    )

    return [
      preferenceCard,
      ...barbers.map((barber) => {
        const isSelected = selectedBarber === barber.id
        const initials = barber.name
          .split(" ")
          .map((part) => part.charAt(0))
          .join("")
          .slice(0, 2)
          .toUpperCase()

        return (
          <button
            key={barber.id}
            type="button"
            onClick={() => {
              setSelectedBarber(barber.id)
              setIsBarberPreferenceFlexible(false)
            }}
            className={cn(
              "flex w-full items-center gap-4 rounded-2xl border bg-card/80 p-4 text-left transition-all",
              "hover:border-foreground/20 hover:shadow-sm",
              isSelected && "border-foreground bg-foreground text-background shadow-md",
            )}
          >
            <Avatar className="size-12 border border-border/60">
              <AvatarImage src={barber.avatarUrl ?? undefined} alt={barber.name} />
              <AvatarFallback className={cn("bg-muted text-base font-semibold", isSelected && "bg-background/20 text-background")}>
                {initials || "BB"}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-1 flex-col">
              <span className="font-semibold leading-tight">{barber.name}</span>
              <span className={cn("text-xs text-muted-foreground", isSelected && "text-background/80")}>Profesional disponible</span>
            </div>
          </button>
        )
      }),
    ]
  }

  const renderSlotsContent = () => {
    if (sedes.length > 0 && selectedSede == null) {
      return <p className="text-sm text-muted-foreground">Selecciona primero una sede para consultar horarios.</p>
    }

    if (selectedServices.length === 0 || (!selectedBarber && !isBarberPreferenceFlexible)) {
      return <p className="text-sm text-muted-foreground">Selecciona un servicio y define un profesional o elige sin preferencia para ver horarios.</p>
    }

    if (!selectedDate) {
      return <p className="text-sm text-muted-foreground">Elige la fecha en el calendario.</p>
    }

    if (isLoadingSlots) {
      return Array.from({ length: 8 }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))
    }

    if (slotsError) {
      return (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {slotsError}
        </p>
      )
    }

    if (visibleSlots.length === 0) {
      return (
        <div className="mx-auto w-full max-w-[150px] rounded-xl border border-dashed border-border/60 bg-muted/35 px-3 py-5 text-center">
          <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-background/70">
            <CalendarX className="size-4 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold leading-tight">Sin horarios</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Prueba con otra fecha.</p>
        </div>
      )
    }

    return visibleSlots.map((slot) => {
      const isSelected = selectedSlot?.start === slot.start
      const startLabel = formatTime12h(new Date(slot.start))

      return (
        <Button
          key={slot.start}
          variant={isSelected ? "default" : "outline"}
          onClick={() => setSelectedSlot(slot)}
          className="h-8 w-fit min-w-[120px] px-3 text-sm shadow-none"
        >
          {startLabel}
        </Button>
      )
    })
  }

  const renderSedesContent = () => {
    if (isLoadingSedes) {
      return Array.from({ length: 2 }, (_, index) => (
        <Skeleton key={index} className="h-20 w-full rounded-2xl" />
      ))
    }

    if (sedesError) {
      return (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {sedesError}
        </p>
      )
    }

    if (sedes.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">
          Tu barbería no tiene sedes configuradas aún. Usaremos disponibilidad general.
        </p>
      )
    }

    return sedes.map((sede) => {
      const isSelected = selectedSede === sede.id
      const subtitle = [sede.address, sede.city].filter((value) => typeof value === "string" && value.trim().length > 0).join(" · ")

      return (
        <button
          key={sede.id}
          type="button"
          onClick={() => setSelectedSede(sede.id)}
          className={cn(
            "flex w-full items-center gap-4 rounded-2xl border bg-card/80 p-4 text-left transition-all",
            "hover:border-foreground/20 hover:shadow-sm",
            isSelected && "border-foreground bg-foreground text-background shadow-md",
          )}
        >
          <span className={cn("flex size-11 items-center justify-center rounded-full border", isSelected ? "border-background/40 bg-background/20" : "border-border bg-background")}>
            <MapPin className={cn("h-5 w-5", isSelected ? "text-background" : "text-primary")} />
          </span>
          <div className="flex-1">
            <p className="font-semibold leading-tight">{sede.name}</p>
            <p className={cn("text-xs text-muted-foreground", isSelected && "text-background/80")}>
              {subtitle || "Sede activa"}
            </p>
          </div>
        </button>
      )
    })
  }

  const hasSedeSelection = sedes.length === 0 || selectedSede != null
  const hasServiceSelection = selectedServices.length > 0
  const hasProfessionalSelection = Boolean(selectedBarber) || isBarberPreferenceFlexible
  const hasScheduleSelection = Boolean(selectedSlot) && Boolean(selectedDate)

  const stepDefinitions = useMemo(
    () => {
      const items: Array<{
        id: BookingStep
        label: string
        description: string
        completed: boolean
        enabled: boolean
      }> = [
        {
          id: "sede",
          label: "Sede",
          description: "Escoge el centro donde te atenderemos.",
          completed: hasSedeSelection,
          enabled: true,
        },
        {
          id: "services",
          label: "Servicios",
          description: "Selecciona uno o dos servicios para tu cita.",
          completed: hasServiceSelection,
          enabled: hasSedeSelection,
        },
        {
          id: "professional",
          label: "Profesional",
          description: "Elige un profesional o deja asignación automática.",
          completed: hasProfessionalSelection,
          enabled: hasSedeSelection && hasServiceSelection,
        },
        {
          id: "schedule",
          label: "Fecha y hora",
          description: "Define día y bloque horario de tu reserva.",
          completed: hasScheduleSelection,
          enabled: hasSedeSelection && hasServiceSelection && hasProfessionalSelection,
        },
        {
          id: "confirm",
          label: "Confirmar",
          description: "Revisa datos, agrega notas y completa tu reserva.",
          completed: completedReservation?.status === "confirmed",
          enabled: hasSedeSelection && hasServiceSelection && hasProfessionalSelection && hasScheduleSelection,
        },
      ]

      if (sedes.length === 0) {
        return items.filter((item) => item.id !== "sede")
      }

      return items
    },
    [
      completedReservation?.status,
      hasProfessionalSelection,
      hasScheduleSelection,
      hasSedeSelection,
      hasServiceSelection,
      sedes.length,
    ],
  )

  useEffect(() => {
    if (stepDefinitions.length === 0) {
      return
    }

    const current = stepDefinitions.find((step) => step.id === activeStep)
    if (!current) {
      setActiveStep(stepDefinitions[0].id)
      return
    }

    if (current.enabled) {
      return
    }

    const fallbackStep =
      [...stepDefinitions].reverse().find((step) => step.enabled)?.id ?? stepDefinitions[0].id

    if (fallbackStep !== activeStep) {
      setActiveStep(fallbackStep)
    }
  }, [activeStep, stepDefinitions])

  const activeStepIndex = stepDefinitions.findIndex((step) => step.id === activeStep)
  const activeStepMeta = activeStepIndex >= 0 ? stepDefinitions[activeStepIndex] : stepDefinitions[0]
  const previousStep = activeStepIndex > 0 ? stepDefinitions[activeStepIndex - 1] : null
  const nextStep = activeStepIndex >= 0 ? stepDefinitions[activeStepIndex + 1] : null

  const canMoveToNextStep = Boolean(nextStep && activeStepMeta?.completed)
  const isConfirmDisabled = !hasScheduleSelection || !hasServiceSelection || !hasProfessionalSelection || isBooking

  const resetBookingWizard = () => {
    setCompletedReservation(null)
    setSelectedServices([])
    setSelectedBarber(null)
    setIsBarberPreferenceFlexible(false)
    setSelectedSlot(null)
    setCustomerComment("")
    setPaymentMethod("cash")
    setPromoCodeInput("")
    setPromoPreview(null)
    setPromoError(null)
    setWompiCheckout(null)
    setIsWompiDialogOpen(false)
    setSlotsRefreshKey((value) => value + 1)
    setActiveStep(sedes.length > 0 ? "sede" : "services")
  }

  return (
    <div className="min-h-screen bg-muted/10">
      <main className="container pb-16 pt-6 sm:pt-10">
        <section className="mx-auto flex max-w-3xl flex-col gap-3 text-center">
          <span className="mx-auto inline-flex items-center rounded-full bg-foreground px-4 py-1 text-xs font-medium uppercase tracking-wider text-background">
            Agenda tu estilo
          </span>
          <h1 className="text-2xl font-semibold sm:text-3xl">Reserva en 5 pasos</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Centro, servicios, profesional, horario y confirmación final.
          </p>
        </section>

        {completedReservation ? (
          <section className="mx-auto mt-10 max-w-3xl">
            <Card className="border-foreground/20 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  {completedReservation.status === "confirmed"
                    ? "Reserva confirmada"
                    : "Reserva creada, pendiente de pago"}
                </CardTitle>
                <CardDescription>
                  {completedReservation.status === "confirmed"
                    ? "Tu cita quedó registrada correctamente."
                    : "Tu cita está creada. Completa el pago para finalizar la confirmación."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/60 bg-muted/15 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Horario</p>
                    <p className="mt-1 text-sm font-medium">{completedReservation.scheduleLabel}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/15 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
                    <p className="mt-1 text-sm font-medium">{completedReservation.totalLabel}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/15 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Sede</p>
                    <p className="mt-1 text-sm font-medium">{completedReservation.sedeName ?? "General"}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/15 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Profesional</p>
                    <p className="mt-1 text-sm font-medium">{completedReservation.barberName ?? "Sin asignar"}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-background p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Servicios reservados</p>
                  <p className="mt-2 text-sm font-medium">{completedReservation.services.join(", ") || "-"}</p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  {completedReservation.status === "pending-payment" && wompiCheckout && (
                    <Button
                      type="button"
                      onClick={() => {
                        void openWompiWidget()
                      }}
                      disabled={isLoadingWompiSdk}
                    >
                      {isLoadingWompiSdk ? "Cargando checkout..." : "Completar pago con Wompi"}
                    </Button>
                  )}
                  <Button type="button" variant="outline" asChild>
                    <a href="/dashboard/appointments">Ver mis citas</a>
                  </Button>
                  <Button type="button" variant="secondary" onClick={resetBookingWizard}>
                    Agendar otra cita
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>
        ) : (
          <div className="mx-auto mt-10 grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:gap-10">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Asistente de reserva</CardTitle>
                <CardDescription>{activeStepMeta?.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Tabs value={activeStep} onValueChange={(value) => setActiveStep(value as BookingStep)}>
                  <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-xl bg-muted/40 p-2">
                    {stepDefinitions.map((step, index) => (
                      <TabsTrigger
                        key={step.id}
                        value={step.id}
                        disabled={!step.enabled && step.id !== activeStep}
                        className="h-auto min-w-[120px] flex-none gap-2 rounded-lg px-3 py-2 data-[state=active]:shadow"
                      >
                        <span
                          className={cn(
                            "flex size-5 items-center justify-center rounded-full text-[11px]",
                            step.completed
                              ? "bg-emerald-500 text-white"
                              : "bg-background text-muted-foreground",
                          )}
                        >
                          {step.completed ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                        </span>
                        <span>{step.label}</span>
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {sedes.length > 0 && (
                    <TabsContent value="sede" className="mt-4">
                      <div className="max-h-[340px] overflow-y-auto rounded-xl border border-border/60 bg-muted/5 p-2 pr-1 [scrollbar-gutter:stable]">
                        <div className="space-y-3">{renderSedesContent()}</div>
                      </div>

                      {selectedSedeDetails && (
                        <div className="mt-4 space-y-3 rounded-xl border border-border/60 bg-background p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">Ubicación de la sede</p>
                              <p className="text-xs text-muted-foreground">
                                {selectedSedeAddress || "Sin dirección configurada"}
                              </p>
                            </div>
                            {selectedSedeMapsUrl && (
                              <a
                                href={selectedSedeMapsUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-medium text-primary hover:underline"
                              >
                                Abrir en Google Maps
                              </a>
                            )}
                          </div>

                          {selectedSedeMapEmbedUrl ? (
                            <iframe
                              title={`Mapa de ${selectedSedeDetails.name}`}
                              src={selectedSedeMapEmbedUrl}
                              className="h-56 w-full rounded-lg border border-border/60"
                              loading="lazy"
                              referrerPolicy="no-referrer-when-downgrade"
                            />
                          ) : (
                            <p className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                              Esta sede no tiene coordenadas o dirección suficiente para mostrar mapa.
                            </p>
                          )}
                        </div>
                      )}
                    </TabsContent>
                  )}

                  <TabsContent value="services" className="mt-4">
                    <div className="max-h-[380px] overflow-y-auto rounded-xl border border-border/60 bg-muted/5 p-2 pr-1 [scrollbar-gutter:stable]">
                      <div className="space-y-3">{renderServiceContent()}</div>
                    </div>
                  </TabsContent>

                  <TabsContent value="professional" className="mt-4">
                    <div className="max-h-[380px] overflow-y-auto rounded-xl border border-border/60 bg-muted/5 p-2 pr-1 [scrollbar-gutter:stable]">
                      <div className="space-y-3">{renderBarbersContent()}</div>
                    </div>
                  </TabsContent>

                  <TabsContent value="schedule" className="mt-4">
                    <div className="overflow-hidden rounded-2xl border border-border/70 bg-background">
                      <div className="grid gap-0 lg:min-h-[420px] lg:grid-cols-[minmax(0,1fr)_minmax(0,170px)] lg:gap-6">
                        <div className="p-3 sm:p-6">
                          <div className="mx-auto w-full max-w-[390px]">
                            <Calendar
                              mode="single"
                              selected={selectedDate}
                              onSelect={(date) => {
                                setSelectedDate(date ?? undefined)
                              }}
                              disabled={(date) => !!today && !!date && date < today}
                              showOutsideDays={false}
                              className="mx-auto w-full bg-transparent p-0 [--cell-size:1.9rem] sm:[--cell-size:2.1rem] md:[--cell-size:2.25rem] lg:[--cell-size:2.4rem]"
                              formatters={{
                                formatWeekdayName: (date) =>
                                  date.toLocaleString("es-ES", { weekday: "short" }),
                              }}
                            />
                          </div>
                        </div>
                        <div className="border-t lg:border-l lg:border-t-0">
                          <div className="max-h-[320px] overflow-y-auto p-4 [scrollbar-gutter:stable] sm:max-h-[380px] sm:p-6 lg:max-h-[420px] lg:pr-3">
                            <div className="grid justify-items-end gap-1.5">{renderSlotsContent()}</div>
                          </div>
                        </div>
                      </div>
                      <div className="border-t px-4 py-4 text-sm text-muted-foreground sm:px-6 sm:py-5">
                        {selectedDate && formattedSummaryTime ? (
                          <>
                            Tu cita quedó seleccionada para <span className="font-medium">{formattedSummaryDate}</span> a las <span className="font-medium">{formattedSummaryTime}</span>.
                          </>
                        ) : (
                          <>Selecciona una fecha y hora para tu cita.</>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="confirm" className="mt-4 space-y-6">
                    <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/15 p-4 text-sm sm:grid-cols-2">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Servicios</p>
                        <p className="mt-1 font-medium">{selectedServicesMeta.selected.map((svc) => svc.name).join(", ") || "-"}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Sede</p>
                        <p className="mt-1 font-medium">{selectedSedeName ?? "General"}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Profesional</p>
                        <p className="mt-1 font-medium">{selectedBarberName ?? "-"}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Horario</p>
                        <p className="mt-1 font-medium">
                          {formattedSummaryDate && formattedSummaryTime
                            ? `${formattedSummaryDate} · ${formattedSummaryTime}`
                            : "-"}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3 rounded-xl border border-border/60 bg-background p-4">
                      <p className="text-sm font-medium">Metodo de pago</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setPaymentMethod("cash")}
                          className={cn(
                            "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                            paymentMethod === "cash"
                              ? "border-foreground bg-foreground text-background"
                              : "border-border bg-background",
                          )}
                        >
                          Efectivo
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentMethod("wompi")}
                          className={cn(
                            "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                            paymentMethod === "wompi"
                              ? "border-foreground bg-foreground text-background"
                              : "border-border bg-background",
                          )}
                        >
                          Wompi
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Wompi habilita tarjeta, PSE, Nequi y otros medios disponibles.
                      </p>
                    </div>

                    <div className="space-y-3 rounded-xl border border-border/60 bg-background p-4">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <Ticket className="h-4 w-4" />
                        Cupon o codigo promocional
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          value={promoCodeInput}
                          onChange={(event) => {
                            setPromoCodeInput(event.target.value)
                            setPromoError(null)
                          }}
                          placeholder="Ej. CORTE10"
                          autoCapitalize="characters"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            void handleApplyPromo()
                          }}
                          disabled={isApplyingPromo || selectedServices.length === 0}
                        >
                          {isApplyingPromo ? "Validando..." : "Aplicar"}
                        </Button>
                      </div>
                      {promoError && <p className="text-xs text-destructive">{promoError}</p>}
                      {promoPreview?.promo && (
                        <p className="text-xs text-emerald-500">
                          Codigo {promoPreview.promo.code} aplicado ({promoPreview.promo.discountPercent}%).
                          {paymentMethod === "cash"
                            ? " El descuento solo se aplica al pagar con Wompi."
                            : ""}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2 rounded-xl border border-border/60 bg-background p-4">
                      <p className="text-sm font-medium">Comentarios</p>
                      <Textarea
                        value={customerComment}
                        onChange={(event) => setCustomerComment(event.target.value)}
                        placeholder="Ej. Llego 10 minutos antes"
                        maxLength={240}
                      />
                    </div>

                    <div className="space-y-3 rounded-xl border border-border/60 bg-muted/15 p-4 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-medium">
                          {originalTotalForSummary == null
                            ? "Consultar"
                            : currencyFormatter.format(originalTotalForSummary)}
                        </span>
                      </div>
                      {paymentMethod === "wompi" && promoPreview?.promo && wompiDiscountForSummary > 0 && (
                        <div className="flex items-center justify-between gap-3 text-emerald-500">
                          <span>Descuento ({promoPreview.promo.discountPercent}%)</span>
                          <span className="font-medium">- {currencyFormatter.format(wompiDiscountForSummary)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-3 border-t pt-3">
                        <span className="font-semibold">Total</span>
                        <span className="text-base font-semibold">
                          {wompiFinalTotalForSummary == null
                            ? "Consultar"
                            : currencyFormatter.format(wompiFinalTotalForSummary)}
                        </span>
                      </div>
                    </div>

                    <Button
                      type="button"
                      className="w-full"
                      disabled={isConfirmDisabled}
                      onClick={() => {
                        void handleBooking()
                      }}
                    >
                      {isBooking
                        ? "Reservando..."
                        : paymentMethod === "wompi"
                          ? "Reservar y continuar a Wompi"
                          : "Confirmar reserva"}
                    </Button>
                  </TabsContent>
                </Tabs>

                <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!previousStep}
                    onClick={() => {
                      if (previousStep) {
                        setActiveStep(previousStep.id)
                      }
                    }}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Anterior
                  </Button>

                  <p className="text-center text-xs text-muted-foreground sm:text-sm">
                    Paso {Math.max(activeStepIndex + 1, 1)} de {stepDefinitions.length}
                  </p>

                  <Button
                    type="button"
                    variant="outline"
                    disabled={!canMoveToNextStep}
                    onClick={() => {
                      if (nextStep) {
                        setActiveStep(nextStep.id)
                      }
                    }}
                  >
                    Siguiente
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="h-fit shadow-sm lg:sticky lg:top-6">
              <CardHeader>
                <CardTitle>Resumen</CardTitle>
                <CardDescription>Revisa tu selección actual.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Sede</p>
                  <p className="font-medium">{selectedSedeName ?? (sedes.length === 0 ? "General" : "Sin elegir")}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Servicios</p>
                  <p className="font-medium">{selectedServicesMeta.selected.map((svc) => svc.name).join(", ") || "Sin elegir"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Profesional</p>
                  <p className="font-medium">{selectedBarberName ?? "Sin elegir"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Fecha y hora</p>
                  <p className="font-medium">
                    {formattedSummaryDate && formattedSummaryTime
                      ? `${formattedSummaryDate} · ${formattedSummaryTime}`
                      : "Sin elegir"}
                  </p>
                </div>
                <div className="space-y-1 border-t pt-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Total estimado</p>
                  <p className="text-base font-semibold">
                    {wompiFinalTotalForSummary == null
                      ? "Consultar"
                      : currencyFormatter.format(wompiFinalTotalForSummary)}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <AlertDialog open={isWompiDialogOpen} onOpenChange={setIsWompiDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Pagar con Wompi</AlertDialogTitle>
              <AlertDialogDescription>
                Completa el pago para confirmar tu reserva. Wompi te mostrará los medios disponibles como tarjeta, PSE y billeteras.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-3 text-sm">
              <p>
                Total a pagar:{" "}
                <span className="font-semibold">
                  {wompiCheckout
                    ? currencyFormatter.format(wompiCheckout.amountInCents / 100)
                    : "-"}
                </span>
              </p>

              <Button
                type="button"
                onClick={() => {
                  void openWompiWidget()
                }}
                disabled={!wompiCheckout || isLoadingWompiSdk}
                className="w-full"
              >
                {isLoadingWompiSdk
                  ? "Cargando checkout..."
                  : isWompiSdkReady
                    ? "Pagar con Wompi"
                    : "Reintentar carga de Wompi"}
              </Button>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel>Cerrar</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={isPaymentSuccessDialogOpen} onOpenChange={setIsPaymentSuccessDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reserva y pago confirmados</AlertDialogTitle>
              <AlertDialogDescription>
                Tu cita fue reservada y pagada exitosamente.
                {paymentSuccessScheduleLabel
                  ? ` Te esperamos el ${paymentSuccessScheduleLabel}.`
                  : " Te esperamos en la fecha y hora seleccionadas."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction asChild>
                <Button type="button" onClick={() => setIsPaymentSuccessDialogOpen(false)}>
                  Entendido
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  )
}
