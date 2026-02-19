"use client"

import Link from "next/link"
import {
  ArrowRight,
  CalendarDays,
  Sparkles,
  Star,
  Trophy,
  User as UserIcon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { differenceInMinutes, format } from "date-fns"
import { es } from "date-fns/locale"

import { AppSidebar } from "@/components/app-sidebar"
import { Badge } from "@/components/ui/badge"
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
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import { Calendar } from "@/components/ui/calendar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { useToast } from "@/components/ui/use-toast"

import type { Appointment, AvailabilitySlot } from "@/lib/bookings"

type WalletSummary = {
  balance: number
  subscriptionPlan: string | null
  nextChargeLabel: string | null
}

type WalletCoupon = {
  code: string
  description: string
  expires: string
  status: string
}

type WalletResponse = {
  summary: WalletSummary
  coupons: WalletCoupon[]
}

type FavoriteBarber = {
  id: number
  name: string
  phone?: string | null
  specialty?: string | null
  nextAvailabilityISO?: string | null
}

export default function Page() {
  const { toast } = useToast()

  const [userId, setUserId] = useState<number | null>(null)
  const [displayName, setDisplayName] = useState<string>("")

  const [nextAppointment, setNextAppointment] = useState<Appointment | null>(null)
  const [walletSummary, setWalletSummary] = useState<WalletSummary>({
    balance: 0,
    subscriptionPlan: null,
    nextChargeLabel: null,
  })
  const [walletCoupons, setWalletCoupons] = useState<WalletCoupon[]>([])
  const [favorites, setFavorites] = useState<FavoriteBarber[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [isCanceling, setIsCanceling] = useState(false)

  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>()
  const [rescheduleSlots, setRescheduleSlots] = useState<AvailabilitySlot[]>([])
  const [selectedRescheduleSlot, setSelectedRescheduleSlot] = useState<AvailabilitySlot | null>(null)
  const [isLoadingSlots, setIsLoadingSlots] = useState(false)
  const [rescheduleSlotsError, setRescheduleSlotsError] = useState<string | null>(null)
  const [isRescheduling, setIsRescheduling] = useState(false)

  const quickLinks = useMemo(
    () => [
      {
        title: "Reservar ahora",
        description: "Agenda en minutos tu próxima visita.",
        href: "/booking",
      },
      {
        title: "Mis citas",
        description: "Consulta o actualiza tus reservas.",
        href: "/dashboard/appointments",
      },
      {
        title: "Pagos y wallet",
        description: "Gestiona métodos, recibos y cupones.",
        href: "/wallet",
      },
      {
        title: "Mis barberos",
        description: "Repite con tu equipo favorito.",
        href: "/favorites",
      },
    ],
    [],
  )

  const recommendations = useMemo(() => {
    const items: { name: string; detail: string; cta: string }[] = []

    for (const favorite of favorites.slice(0, 2)) {
      const favoriteName = typeof favorite?.name === "string" && favorite.name.trim().length > 0 ? favorite.name.trim() : "tu barbero"
      const favoriteId = typeof favorite?.id === "number" ? favorite.id : null

      items.push({
        name: `Reserva con ${favoriteName}`,
        detail: "Vuelve a agendar con tu barbero favorito.",
        cta: favoriteId ? `/booking?barberId=${favoriteId}` : "/booking",
      })
    }

    const activeCoupon = walletCoupons.find((coupon) => coupon.status?.toLowerCase() === "disponible")
    if (activeCoupon) {
      items.push({
        name: `Cupón ${activeCoupon.code}`,
        detail: activeCoupon.description,
        cta: "/wallet",
      })
    }

    if (items.length === 0) {
      items.push({
        name: "Explora nuevos servicios",
        detail: "Descubre opciones disponibles y agenda tu próxima visita.",
        cta: "/booking",
      })
    }

    return items.slice(0, 3)
  }, [favorites, walletCoupons])

  const membershipLabel = walletSummary.subscriptionPlan ? walletSummary.subscriptionPlan : "Free"

  const nextAppointmentLabel = useMemo(() => {
    if (!nextAppointment) return null
    const start = new Date(nextAppointment.start)
    return format(start, "EEEE d 'de' MMMM 'a las' HH:mm", { locale: es })
  }, [nextAppointment])

  const nextAppointmentDuration = useMemo(() => {
    if (!nextAppointment?.end) return null
    const start = new Date(nextAppointment.start)
    const end = new Date(nextAppointment.end)
    const minutes = differenceInMinutes(end, start)
    return Number.isFinite(minutes) && minutes > 0 ? minutes : null
  }, [nextAppointment])

  useEffect(() => {
    try {
      const raw = localStorage.getItem("userId")
      const parsed = raw ? Number(raw) : NaN
      setUserId(Number.isFinite(parsed) ? parsed : null)
    } catch {
      setUserId(null)
    }

    try {
      const name = (localStorage.getItem("userDisplayName") ?? "").trim()
      setDisplayName(name)
    } catch {
      setDisplayName("")
    }
  }, [])

  const loadDashboard = useCallback(async () => {
    if (!userId) {
      setIsLoading(false)
      setLoadError("Inicia sesión para ver tu panel.")
      return
    }

    setIsLoading(true)
    setLoadError(null)

    try {
      const [appointmentsRes, walletRes, favoritesRes] = await Promise.all([
        fetch(`/api/appointments?userId=${userId}&scope=upcoming&status=pendiente&limit=1`, {
          method: "GET",
          cache: "no-store",
        }),
        fetch(`/api/wallet?userId=${userId}`, { method: "GET", cache: "no-store" }),
        fetch(`/api/favorites?userId=${userId}`, { method: "GET", cache: "no-store" }),
      ])

      const appointmentsData = await appointmentsRes.json().catch(() => ({}))
      const walletData = await walletRes.json().catch(() => ({}))
      const favoritesData = await favoritesRes.json().catch(() => ({}))

      if (!appointmentsRes.ok) {
        throw new Error(appointmentsData.error ?? "No se pudieron cargar las citas")
      }

      if (!walletRes.ok) {
        throw new Error(walletData.error ?? "No se pudo cargar el wallet")
      }

      if (!favoritesRes.ok) {
        throw new Error(favoritesData.error ?? "No se pudieron cargar los favoritos")
      }

      const items: Appointment[] = Array.isArray(appointmentsData.appointments) ? appointmentsData.appointments : []
      setNextAppointment(items[0] ?? null)

      const summary = (walletData.summary ?? {}) as WalletSummary
      setWalletSummary({
        balance: typeof summary.balance === "number" ? summary.balance : 0,
        subscriptionPlan: summary.subscriptionPlan ?? null,
        nextChargeLabel: summary.nextChargeLabel ?? null,
      })
      setWalletCoupons(Array.isArray(walletData.coupons) ? (walletData.coupons as WalletCoupon[]) : [])

      setFavorites(Array.isArray(favoritesData.favorites) ? (favoritesData.favorites as FavoriteBarber[]) : [])
    } catch (error) {
      console.error("Error loading dashboard", error)
      setLoadError("No se pudo cargar el panel. Intenta nuevamente.")
      setNextAppointment(null)
      setFavorites([])
      setWalletCoupons([])
      setWalletSummary({ balance: 0, subscriptionPlan: null, nextChargeLabel: null })
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  const balanceLabel = useMemo(() => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0,
    }).format(walletSummary.balance ?? 0)
  }, [walletSummary.balance])

  const openReschedule = () => {
    if (!nextAppointment) return
    setRescheduleDialogOpen(true)
    setRescheduleDate(new Date(nextAppointment.start))
    setSelectedRescheduleSlot(null)
    setRescheduleSlots([])
    setRescheduleSlotsError(null)
  }

  const closeReschedule = () => {
    setRescheduleDialogOpen(false)
    setRescheduleSlots([])
    setSelectedRescheduleSlot(null)
    setRescheduleSlotsError(null)
    setIsLoadingSlots(false)
    setIsRescheduling(false)
  }

  useEffect(() => {
    if (!rescheduleDialogOpen || !nextAppointment || !rescheduleDate) return

    const controller = new AbortController()
    let isActive = true
    setIsLoadingSlots(true)
    setRescheduleSlotsError(null)
    setSelectedRescheduleSlot(null)

    const run = async () => {
      try {
        const params = new URLSearchParams({
          serviceId: String(nextAppointment.service.id),
          barberId: String(nextAppointment.barber.id),
          date: format(rescheduleDate, "yyyy-MM-dd"),
        })

        const response = await fetch(`/api/availability?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        })

        const data = await response.json().catch(() => ({}))
        if (!isActive) return

        if (!response.ok) {
          setRescheduleSlotsError(data.error ?? "No se pudo cargar la disponibilidad.")
          setRescheduleSlots([])
          return
        }

        setRescheduleSlots(Array.isArray(data.slots) ? (data.slots as AvailabilitySlot[]) : [])
      } catch (error) {
        if (!isActive) return
        console.error("Error fetching reschedule slots", error)
        setRescheduleSlotsError("Error de conexión al cargar disponibilidad")
        setRescheduleSlots([])
      } finally {
        if (!isActive) return
        setIsLoadingSlots(false)
      }
    }

    void run()

    return () => {
      isActive = false
      controller.abort()
    }
  }, [rescheduleDialogOpen, nextAppointment, rescheduleDate])

  const submitReschedule = async () => {
    if (!userId || !nextAppointment || !selectedRescheduleSlot) {
      toast({
        title: "Selecciona un horario",
        description: "Debes escoger un slot disponible para reprogramar.",
        variant: "destructive",
      })
      return
    }

    setIsRescheduling(true)
    try {
      const response = await fetch(`/api/appointments/${nextAppointment.id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, start: selectedRescheduleSlot.start }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        toast({
          title: "No se pudo reprogramar",
          description: data.error ?? "Intenta nuevamente.",
          variant: "destructive",
        })
        return
      }

      toast({ title: "Cita reprogramada", description: "Actualizamos tu próxima cita." })
      closeReschedule()
      await loadDashboard()
    } catch (error) {
      console.error("Error rescheduling appointment", error)
      toast({
        title: "Error de conexión",
        description: "No pudimos comunicar con el servidor.",
        variant: "destructive",
      })
    } finally {
      setIsRescheduling(false)
    }
  }

  const submitCancel = async () => {
    if (!userId || !nextAppointment) return

    setIsCanceling(true)
    try {
      const response = await fetch(`/api/appointments/${nextAppointment.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        toast({
          title: "No se pudo cancelar",
          description: data.error ?? "Intenta nuevamente.",
          variant: "destructive",
        })
        return
      }

      toast({ title: "Cita cancelada", description: "Registramos la cancelación correctamente." })
      setCancelDialogOpen(false)
      await loadDashboard()
    } catch (error) {
      console.error("Error canceling appointment", error)
      toast({
        title: "Error de conexión",
        description: "No pudimos comunicar con el servidor.",
        variant: "destructive",
      })
    } finally {
      setIsCanceling(false)
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar:duration-200">
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
                  <BreadcrumbPage>Panel cliente</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ml-auto flex items-center gap-3 text-sm">
              <Badge variant="secondary" className="flex items-center gap-1">
                <Trophy className="h-3 w-3" />
                {membershipLabel}
              </Badge>
              <span className="hidden md:block text-muted-foreground">
                {nextAppointmentLabel
                  ? `👋 Hola ${displayName || ""}, tu próxima cita es el ${nextAppointmentLabel}.`
                  : `👋 Hola ${displayName || ""}, agenda tu próxima cita cuando quieras.`}
              </span>
            </div>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
          {loadError ? (
            <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{loadError}</p>
          ) : null}

          <p className="text-sm text-muted-foreground md:hidden">
            {nextAppointmentLabel
              ? `👋 Hola ${displayName || ""}, tu próxima cita es el ${nextAppointmentLabel}.`
              : `👋 Hola ${displayName || ""}, agenda tu próxima cita cuando quieras.`}
          </p>
          <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <Card className="border border-border/70 shadow-sm">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Badge variant="secondary" className="mb-2 w-fit uppercase">
                    Próxima cita
                  </Badge>
                  {isLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-7 w-64" />
                      <Skeleton className="h-4 w-52" />
                    </div>
                  ) : nextAppointment ? (
                    <>
                      <CardTitle className="text-2xl">{nextAppointment.service.name}</CardTitle>
                      <CardDescription>
                        {nextAppointmentLabel}
                        {nextAppointmentDuration ? ` · ${nextAppointmentDuration} min` : ""}
                      </CardDescription>
                    </>
                  ) : (
                    <>
                      <CardTitle className="text-2xl">No tienes citas próximas</CardTitle>
                      <CardDescription>Reserva cuando estés listo.</CardDescription>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={openReschedule} disabled={!nextAppointment || isLoading}>
                    Reprogramar
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setCancelDialogOpen(true)}
                    disabled={!nextAppointment || isLoading}
                  >
                    Cancelar
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <div className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2">
                  <CalendarDays className="text-primary h-5 w-5" />
                  <div className="text-sm">
                    {isLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    ) : nextAppointment ? (
                      <>
                        <p className="font-medium">
                          {format(new Date(nextAppointment.start), "EEEE d 'de' MMMM", { locale: es })}
                        </p>
                        <p className="text-muted-foreground">
                          {format(new Date(nextAppointment.start), "HH:mm", { locale: es })}
                          {nextAppointmentDuration ? ` · ${nextAppointmentDuration} minutos` : ""}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium">Sin fecha</p>
                        <p className="text-muted-foreground">Agenda una cita</p>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2">
                  <Sparkles className="text-primary h-5 w-5" />
                  <div className="text-sm">
                    <p className="font-medium">Saldo wallet</p>
                    {isLoading ? <Skeleton className="mt-2 h-3 w-24" /> : <p className="text-muted-foreground">{balanceLabel}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2">
                  <UserIcon className="text-primary h-5 w-5" />
                  <div className="text-sm">
                    {isLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-28" />
                      </div>
                    ) : nextAppointment ? (
                      <>
                        <p className="font-medium">Con {nextAppointment.barber.name}</p>
                        <p className="text-muted-foreground">Estado: {String(nextAppointment.status)}</p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium">Elige un barbero</p>
                        <p className="text-muted-foreground">Tus favoritos aparecen aquí</p>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>

              {!isLoading && !nextAppointment ? (
                <div className="px-6 pb-6">
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>Sin citas próximas</EmptyTitle>
                      <EmptyDescription>Reserva un servicio para ver tu próxima cita aquí.</EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <EmptyMedia>
                        <CalendarDays className="h-5 w-5" />
                      </EmptyMedia>
                      <Button asChild>
                        <Link href="/booking">Reservar ahora</Link>
                      </Button>
                    </EmptyContent>
                  </Empty>
                </div>
              ) : null}
            </Card>
            <Card className="border border-border/70 shadow-sm">
              <CardHeader>
                <Badge variant="outline" className="w-fit uppercase">
                  Membresía
                </Badge>
                <CardTitle className="text-xl">Plan {membershipLabel}</CardTitle>
                <CardDescription>{walletSummary.nextChargeLabel ?? "Sin cargos programados"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Progress value={Math.min(100, Math.max(0, walletCoupons.length * 20))} />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Cupones disponibles</span>
                  <span className="font-medium">{isLoading ? "—" : walletCoupons.length}</span>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button asChild variant="secondary" size="sm" className="sm:flex-1">
                    <Link href="/wallet">Ver beneficios</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="sm:flex-1">
                    <Link href="/profile">Configurar perfil</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="border border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Acciones rápidas</CardTitle>
                <CardDescription>
                  Basado en tus últimas reservas y pagos.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Button asChild>
                  <Link href="/dashboard/appointments">Gestionar mis citas</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/wallet#wallet-history">Ver recibo reciente</Link>
                </Button>
                <Button asChild variant="ghost" className="justify-start text-left">
                  <Link href="/favorites">Ver mis favoritos</Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="border border-border/70 bg-primary/5 shadow-sm">
              <CardHeader>
                <Badge variant="secondary" className="flex w-fit items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  Promo destacada
                </Badge>
                <CardTitle>Paquete Detox + Estilo</CardTitle>
                <CardDescription>
                  Corte premium, limpieza facial y masaje capilar con 15% OFF de lunes a jueves.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  Disponible solo en sucursal Centro. Reserva antes del 30 de octubre.
                </p>
                <Button asChild variant="secondary">
                  <Link href="/booking?promo=detox">Aprovechar promoción</Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="border border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Accesos rápidos</CardTitle>
                <CardDescription>Accede a tus secciones favoritas.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {quickLinks.map((item) => (
                  <Link
                    key={item.title}
                    href={item.href}
                    className="border-border/50 hover:border-primary/40 hover:bg-muted/60 group flex items-start justify-between rounded-lg border px-3 py-2 text-sm transition"
                  >
                    <div>
                      <p className="font-medium group-hover:text-primary">{item.title}</p>
                      <p className="text-muted-foreground">{item.description}</p>
                    </div>
                    <ArrowRight className="text-muted-foreground group-hover:text-primary h-4 w-4" />
                  </Link>
                ))}
              </CardContent>
            </Card>
          </section>

          <section>
            <Card className="border border-border/70 shadow-sm">
              <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Te puede gustar</CardTitle>
                  <CardDescription>
                    Basado en tus reservas frecuentes y tendencias de la semana.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="flex items-center gap-1">
                  <Star className="h-3 w-3 text-yellow-500" />
                  Top picks
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent flex gap-4 overflow-x-auto pb-2">
                  {isLoading
                    ? Array.from({ length: 3 }).map((_, index) => (
                        <div
                          key={index}
                          className="w-[240px] flex-shrink-0 rounded-xl border border-border/60 bg-card p-4"
                        >
                          <Skeleton className="h-4 w-36" />
                          <Skeleton className="mt-2 h-3 w-52" />
                          <Skeleton className="mt-4 h-8 w-24" />
                        </div>
                      ))
                    : recommendations.map((item) => (
                    <div
                      key={item.name}
                      className="w-[240px] flex-shrink-0 rounded-xl border border-border/60 bg-card p-4"
                    >
                      <p className="text-sm font-semibold">{item.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="mt-4 justify-start px-0 text-primary"
                      >
                        <Link href={item.cta}>Reservar</Link>
                      </Button>
                    </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </section>

          <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cancelar cita</DialogTitle>
                <DialogDescription>
                  {nextAppointmentLabel
                    ? `¿Deseas cancelar tu cita del ${nextAppointmentLabel}?`
                    : "¿Deseas cancelar esta cita?"}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCancelDialogOpen(false)} disabled={isCanceling}>
                  Volver
                </Button>
                <Button
                  variant="destructive"
                  onClick={submitCancel}
                  disabled={isCanceling}
                >
                  {isCanceling ? "Cancelando..." : "Cancelar cita"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={rescheduleDialogOpen} onOpenChange={(open) => (open ? setRescheduleDialogOpen(true) : closeReschedule())}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reprogramar cita</DialogTitle>
                <DialogDescription>Selecciona una fecha y un horario disponible.</DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-border/60 p-2">
                  <Calendar
                    mode="single"
                    selected={rescheduleDate}
                    onSelect={setRescheduleDate}
                    disabled={(date) => date < new Date()}
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Horarios</p>
                  {isLoadingSlots ? (
                    <Skeleton className="h-9 w-full" />
                  ) : rescheduleSlotsError ? (
                    <p className="text-sm text-destructive">{rescheduleSlotsError}</p>
                  ) : rescheduleSlots.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay slots disponibles para esta fecha.</p>
                  ) : (
                    <Select
                      value={selectedRescheduleSlot?.start ?? ""}
                      onValueChange={(value) => {
                        const slot = rescheduleSlots.find((item) => item.start === value) ?? null
                        setSelectedRescheduleSlot(slot)
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un horario" />
                      </SelectTrigger>
                      <SelectContent>
                        {rescheduleSlots.map((slot) => (
                          <SelectItem key={slot.start} value={slot.start}>
                            {format(new Date(slot.start), "HH:mm", { locale: es })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={closeReschedule} disabled={isRescheduling}>
                  Cancelar
                </Button>
                <Button onClick={submitReschedule} disabled={isRescheduling || !selectedRescheduleSlot}>
                  {isRescheduling ? "Guardando..." : "Reprogramar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
