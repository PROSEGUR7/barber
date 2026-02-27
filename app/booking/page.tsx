"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { addMinutes, format, isSameDay, startOfToday } from "date-fns"
import { es } from "date-fns/locale"
import { CalendarX, Clock, DollarSign, Scissors, Users } from "lucide-react"
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar } from "@/components/ui/calendar"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"

type Service = {
  id: number
  name: string
  description: string | null
  price: number | null
  durationMin: number
}

type Barber = {
  id: number
  name: string
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
      customerData?: {
        email?: string
      }
      acceptanceToken?: string
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

  const [barbers, setBarbers] = useState<Barber[]>([])
  const [isLoadingBarbers, setIsLoadingBarbers] = useState(false)
  const [barbersError, setBarbersError] = useState<string | null>(null)

  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [isLoadingSlots, setIsLoadingSlots] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)

  const [selectedServices, setSelectedServices] = useState<number[]>([])
  const [selectedBarber, setSelectedBarber] = useState<number | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()
  const [today, setToday] = useState<Date | undefined>()
  const [userId, setUserId] = useState<number | null>(null)
  const [isBooking, setIsBooking] = useState(false)
  const [slotsRefreshKey, setSlotsRefreshKey] = useState(0)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash")
  const [wompiCheckout, setWompiCheckout] = useState<WompiCheckoutData | null>(null)
  const [isWompiDialogOpen, setIsWompiDialogOpen] = useState(false)
  const [isWompiSdkReady, setIsWompiSdkReady] = useState(false)
  const [isLoadingWompiSdk, setIsLoadingWompiSdk] = useState(false)
  const wompiSdkPromiseRef = useRef<Promise<void> | null>(null)

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

    const fetchServices = async () => {
      setIsLoadingServices(true)
      setServicesError(null)

      try {
        const response = await fetch("/api/services", {
          method: "GET",
          cache: "no-store",
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
  }, [])

  useEffect(() => {
    setSelectedBarber(null)
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
          selectedServices.map((serviceId) =>
            fetch(`/api/services/${serviceId}/barbers`, {
              method: "GET",
              cache: "no-store",
            }),
          ),
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
  }, [selectedServices])

  useEffect(() => {
    if (!searchParams) {
      return
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
      setSelectedBarber(parsed)
    }
  }, [searchParams, barbers, services, selectedServices.length])

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

        if (status === "APPROVED") {
          toast({
            title: "Pago aprobado",
            description: "Tu pago fue confirmado con Wompi.",
          })
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

    if (selectedServices.length === 0 || !selectedBarber || !selectedDate) {
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
              barberId: String(selectedBarber),
              date: dateParam,
            })

            return fetch(`/api/availability?${query.toString()}`, {
              method: "GET",
              cache: "no-store",
              signal: controller.signal,
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
  }, [selectedServices, selectedBarber, selectedDate, slotsRefreshKey, services])

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
    const startLabel = format(startInstant, "HH:mm")

    if (selectedServicesMeta.totalDuration > 0 && selectedServices.length > 1) {
      const endInstant = addMinutes(startInstant, selectedServicesMeta.totalDuration)
      return `${startLabel} - ${format(endInstant, "HH:mm")}`
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
    if (!selectedBarber) return null
    const barber = barbers.find((item) => item.id === selectedBarber)
    return barber?.name ?? null
  }, [barbers, selectedBarber])

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

  const openWompiWidget = async () => {
    if (!wompiCheckout) {
      return
    }

    try {
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
        redirectUrl: wompiCheckout.redirectUrl,
        customerData: {
          email: wompiCheckout.customerEmail,
        },
        acceptanceToken: wompiCheckout.acceptanceToken,
      })

      checkout.open((result) => {
        console.log("[WOMPI_WIDGET_RESULT]", result)
      })
    } catch (error) {
      console.error("Error opening Wompi widget", error)
      toast({
        title: "No se pudo abrir Wompi",
        description: "Recarga la página e inténtalo de nuevo.",
        variant: "destructive",
      })
    }
  }

  const handleBooking = async (): Promise<boolean> => {
    if (selectedServices.length === 0 || !selectedBarber || !selectedSlot) {
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
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          barberId: selectedBarber,
          serviceIds: selectedServices,
          paymentMethod,
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

        setWompiCheckout(wompiData)
        setIsWompiDialogOpen(true)
        setIsConfirmOpen(false)
        setSelectedSlot(null)
        setSlotsRefreshKey((value) => value + 1)
        return true
      }

      toast({
        title: "Cita reservada con éxito",
        description: endInstant
          ? `Tu cita quedó agendada para ${format(startInstant, "EEEE d 'de' MMMM", { locale: es })} de ${format(startInstant, "HH:mm")} a ${format(endInstant, "HH:mm")}. Pago: efectivo.`
          : `Tu cita quedó agendada para ${format(startInstant, "EEEE d 'de' MMMM", { locale: es })} a las ${format(startInstant, "HH:mm")}. Pago: efectivo.`,
      })

      setIsConfirmOpen(false)

      setSelectedSlot(null)
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

    return barbers.map((barber) => {
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
          onClick={() => setSelectedBarber(barber.id)}
          className={cn(
            "flex w-full items-center gap-4 rounded-2xl border bg-card/80 p-4 text-left transition-all",
            "hover:border-foreground/20 hover:shadow-sm",
            isSelected && "border-foreground bg-foreground text-background shadow-md",
          )}
        >
          <span className={cn("flex size-12 items-center justify-center rounded-full bg-muted text-base font-semibold", isSelected && "bg-background/20 text-background")}
          >
            {initials || "BB"}
          </span>
          <div className="flex flex-1 flex-col">
            <span className="font-semibold leading-tight">{barber.name}</span>
            <span className={cn("text-xs text-muted-foreground", isSelected && "text-background/80")}>Profesional disponible</span>
          </div>
        </button>
      )
    })
  }

  const renderSlotsContent = () => {
    if (selectedServices.length === 0 || !selectedBarber) {
      return <p className="text-sm text-muted-foreground">Selecciona un servicio y barbero para ver los horarios.</p>
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
        <Empty className="border border-dashed border-border/60 bg-muted/40">
          <EmptyMedia variant="icon">
            <CalendarX className="size-6" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Sin horarios disponibles</EmptyTitle>
            <EmptyDescription>
              No encontramos horarios para la fecha seleccionada. Prueba con otra fecha u horario cercano.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )
    }

    return visibleSlots.map((slot) => {
      const isSelected = selectedSlot?.start === slot.start
      const startLabel = format(new Date(slot.start), "HH:mm")

      return (
        <Button
          key={slot.start}
          variant={isSelected ? "default" : "outline"}
          onClick={() => setSelectedSlot(slot)}
          className="w-full shadow-none"
        >
          {startLabel}
        </Button>
      )
    })
  }

  const isContinueDisabled =
    selectedServices.length === 0 || !selectedBarber || !selectedSlot || !selectedDate || isBooking

  return (
    <div className="min-h-screen bg-muted/10">
      <main className="container pb-16 pt-6 sm:pt-10">
        <section className="mx-auto flex max-w-3xl flex-col gap-3 text-center">
          <span className="mx-auto inline-flex items-center rounded-full bg-foreground text-background px-4 py-1 text-xs font-medium uppercase tracking-wider">
            Agenda tu estilo
          </span>
        </section>

        <div className="mx-auto mt-10 grid max-w-6xl gap-8 lg:mt-12 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] xl:gap-12">
          <div className="space-y-8">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>1. Selecciona un Servicio</CardTitle>
                <CardDescription>Elige el servicio que deseas recibir</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-[270px] overflow-y-auto rounded-xl border border-border/60 bg-muted/5 p-2 pr-1 [scrollbar-gutter:stable] sm:max-h-[330px] lg:max-h-[300px]">
                  <div className="space-y-3">{renderServiceContent()}</div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>2. Elige tu Peluquero</CardTitle>
                <CardDescription>Selecciona a quien prefieras para tu sesión</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-[260px] overflow-y-auto rounded-xl border border-border/60 bg-muted/5 p-2 pr-1 [scrollbar-gutter:stable] sm:max-h-[340px] lg:max-h-[320px]">
                  <div className="space-y-3">{renderBarbersContent()}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>3. Fecha y Hora</CardTitle>
              <CardDescription>Selecciona cuándo quieres tu cita</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="overflow-hidden rounded-3xl border border-border/70 bg-background">
                <div className="overflow-hidden rounded-2xl">
                  <div className="grid gap-0 md:min-h-[420px] md:grid-cols-[minmax(0,420px)_minmax(0,200px)] md:gap-8">
                    <div className="p-4 sm:p-6">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(date) => {
                          setSelectedDate(date ?? undefined)
                        }}
                        disabled={(date) => !!today && !!date && date < today}
                        showOutsideDays={false}
                        className="bg-transparent p-0 [--cell-size:--spacing(8)] sm:[--cell-size:--spacing(9)] md:[--cell-size:--spacing(10)]"
                        formatters={{
                          formatWeekdayName: (date) =>
                            date.toLocaleString("es-ES", { weekday: "short" }),
                        }}
                      />
                    </div>
                    <div className="border-t md:border-l md:border-t-0">
                      <div className="max-h-[320px] overflow-y-auto p-4 [scrollbar-gutter:stable] sm:max-h-[420px] sm:p-6">
                        <div className="grid gap-2">{renderSlotsContent()}</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-4 border-t px-4 py-4 sm:px-6 sm:py-5 md:flex-row">
                    <div className="text-sm text-muted-foreground">
                      {selectedDate && formattedSummaryTime ? (
                        <>
                          Tu cita está reservada para {" "}
                          <span className="font-medium">{formattedSummaryDate}</span>{" "}
                          a las <span className="font-medium">{formattedSummaryTime}</span>.
                        </>
                      ) : (
                        <>Selecciona una fecha y hora para tu cita.</>
                      )}
                    </div>
                    <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          disabled={isContinueDisabled}
                          className="w-full md:ml-auto md:w-auto"
                          variant="outline"
                        >
                          {isBooking ? "Reservando..." : "Continuar"}
                        </Button>
                      </AlertDialogTrigger>

                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Confirmar reserva</AlertDialogTitle>
                          <AlertDialogDescription>
                            Verifica los datos antes de confirmar tu cita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>

                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Servicios:</span>{" "}
                            <span className="font-medium">
                              {selectedServicesMeta.selected.map((svc) => svc.name).join(", ")}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Total:</span>{" "}
                            <span className="font-medium">
                              {selectedServicesTotal == null
                                ? "Consultar"
                                : currencyFormatter.format(selectedServicesTotal)}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Peluquero:</span>{" "}
                            <span className="font-medium">{selectedBarberName ?? "-"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Fecha:</span>{" "}
                            <span className="font-medium">{formattedSummaryDate ?? "-"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Hora:</span>{" "}
                            <span className="font-medium">{formattedSummaryTime ?? "-"}</span>
                          </div>
                          <div className="pt-2">
                            <span className="text-muted-foreground">Método de pago:</span>
                            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <button
                                type="button"
                                onClick={() => setPaymentMethod("cash")}
                                className={cn(
                                  "rounded-md border px-3 py-2 text-left text-sm transition-colors",
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
                                  "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                                  paymentMethod === "wompi"
                                    ? "border-foreground bg-foreground text-background"
                                    : "border-border bg-background",
                                )}
                              >
                                Wompi (tarjeta, PSE, Nequi y más)
                              </button>
                            </div>
                          </div>
                        </div>

                        <AlertDialogFooter>
                          <AlertDialogCancel disabled={isBooking}>Cancelar</AlertDialogCancel>
                          <AlertDialogAction asChild>
                            <Button
                              type="button"
                              disabled={isContinueDisabled}
                              onClick={async (event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                await handleBooking()
                              }}
                            >
                              Confirmar
                            </Button>
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

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
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
