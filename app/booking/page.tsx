"use client"

import { useEffect, useMemo, useState } from "react"
import { format, startOfToday } from "date-fns"
import { es } from "date-fns/locale"
import { CalendarX, Clock, DollarSign, Scissors, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
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

export default function BookingPage() {
  const { toast } = useToast()

  const [services, setServices] = useState<Service[]>([])
  const [servicesError, setServicesError] = useState<string | null>(null)
  const [isLoadingServices, setIsLoadingServices] = useState(true)

  const [barbers, setBarbers] = useState<Barber[]>([])
  const [isLoadingBarbers, setIsLoadingBarbers] = useState(false)
  const [barbersError, setBarbersError] = useState<string | null>(null)

  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [isLoadingSlots, setIsLoadingSlots] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)

  const [selectedService, setSelectedService] = useState<number | null>(null)
  const [selectedBarber, setSelectedBarber] = useState<number | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()
  const [today, setToday] = useState<Date | undefined>()
  const [userId, setUserId] = useState<number | null>(null)
  const [isBooking, setIsBooking] = useState(false)
  const [slotsRefreshKey, setSlotsRefreshKey] = useState(0)

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

    if (!selectedService) {
      setIsLoadingBarbers(false)
      return
    }

    let isActive = true
    setIsLoadingBarbers(true)

    const fetchBarbers = async () => {
      try {
        const response = await fetch(`/api/services/${selectedService}/barbers`, {
          method: "GET",
          cache: "no-store",
        })

        const data = await response.json().catch(() => ({}))

        if (!isActive) {
          return
        }

        if (!response.ok) {
          setBarbersError(data.error ?? "No se pudieron cargar los profesionales")
          setBarbers([])
          return
        }

        setBarbers(Array.isArray(data.barbers) ? data.barbers : [])
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
  }, [selectedService])

  useEffect(() => {
    setSelectedSlot(null)
    setSlots([])
    setSlotsError(null)

    if (!selectedService || !selectedBarber || !selectedDate) {
      setIsLoadingSlots(false)
      return
    }

    let isActive = true
    setIsLoadingSlots(true)

    const controller = new AbortController()

    const fetchSlots = async () => {
      try {
        const query = new URLSearchParams({
          serviceId: String(selectedService),
          barberId: String(selectedBarber),
          date: format(selectedDate, "yyyy-MM-dd"),
        })

        const response = await fetch(`/api/availability?${query.toString()}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        })

        const data = await response.json().catch(() => ({}))

        if (!isActive) {
          return
        }

        if (!response.ok) {
          setSlotsError(data.error ?? "No se pudo obtener la disponibilidad")
          setSlots([])
          return
        }

        setSlots(Array.isArray(data.slots) ? data.slots : [])
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
  }, [selectedService, selectedBarber, selectedDate, slotsRefreshKey])

  const formattedSummaryDate = useMemo(() => {
    if (!selectedDate) return null
    return format(selectedDate, "EEEE d 'de' MMMM", { locale: es })
  }, [selectedDate])

  const formattedSummaryTime = useMemo(() => {
    if (!selectedSlot) return null
    return format(new Date(selectedSlot.start), "HH:mm")
  }, [selectedSlot])

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        minimumFractionDigits: 0,
      }),
    [],
  )

  const handleBooking = async () => {
    if (!selectedService || !selectedBarber || !selectedSlot) {
      return
    }

    if (!userId) {
      toast({
        title: "Inicia sesión nuevamente",
        description: "No encontramos tu sesión activa. Vuelve a iniciar sesión para agendar.",
        variant: "destructive",
      })
      return
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
          serviceId: selectedService,
          barberId: selectedBarber,
          start: selectedSlot.start,
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        toast({
          title: "No se pudo agendar la cita",
          description: data.error ?? "Intenta con otro horario o vuelve a intentarlo más tarde.",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Cita reservada",
        description: "Tu cita quedó agendada. Te enviaremos la confirmación por correo.",
      })

      setSelectedSlot(null)
      setSlotsRefreshKey((value) => value + 1)
    } catch (error) {
      console.error("Error creating reservation", error)
      toast({
        title: "Error de conexión",
        description: "No pudimos comunicar con el servidor. Intenta nuevamente en unos segundos.",
        variant: "destructive",
      })
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
      const isSelected = selectedService === service.id

      const displayPrice = service.price != null ? currencyFormatter.format(service.price) : "Consultar"
      const durationLabel = service.durationMin ? `${service.durationMin} min` : "Sin duración"

      return (
        <button
          key={service.id}
          type="button"
          onClick={() => setSelectedService(service.id)}
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
    if (!selectedService) {
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
    if (!selectedService || !selectedBarber) {
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

    if (slots.length === 0) {
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

    return slots.map((slot) => {
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
    !selectedService || !selectedBarber || !selectedSlot || !selectedDate || isBooking

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
                    <Button
                      type="button"
                      disabled={isContinueDisabled}
                      onClick={handleBooking}
                      className="w-full md:ml-auto md:w-auto"
                      variant="outline"
                    >
                      {isBooking ? "Reservando..." : "Continuar"}
                    </Button>
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
