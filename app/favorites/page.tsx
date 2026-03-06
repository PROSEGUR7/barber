"use client"

import Link from "next/link"
import { CalendarClock, Heart, Phone } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"

import { AppSidebar } from "@/components/app-sidebar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

type BarberCard = {
  id: number
  name: string
  phone: string | null
  specialty: string | null
  nextAvailabilityISO: string | null
  isFavorite: boolean
}

type Service = {
  id: number
  name: string
}

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

export default function FavoritesPage() {
  const [userId, setUserId] = useState<number | null>(null)
  const [barbers, setBarbers] = useState<BarberCard[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [segment, setSegment] = useState<"all" | "favorites">("favorites")
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
      const raw = localStorage.getItem("userId")
      const parsed = raw ? Number(raw) : NaN
      setUserId(Number.isFinite(parsed) ? parsed : null)
    } catch {
      setUserId(null)
    }
  }, [])

  useEffect(() => {
    let isActive = true
    const controller = new AbortController()

    const loadServices = async () => {
      try {
        const response = await fetch("/api/services", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
          headers: buildTenantHeaders(),
        })

        const data = await response.json().catch(() => ({}))
        if (!isActive) return

        const items = Array.isArray(data.services) ? (data.services as { id: number; name: string }[]) : []
        setServices(items)
      } catch (err) {
        if (!isActive || err instanceof DOMException) return
        console.error("Error loading services", err)
        setServices([])
      }
    }

    void loadServices()

    return () => {
      isActive = false
      controller.abort()
    }
  }, [])

  useEffect(() => {
    let isActive = true
    const controller = new AbortController()

    const load = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams()
        if (userId) params.set("userId", String(userId))
        if (selectedServiceId) params.set("serviceId", String(selectedServiceId))

        const response = await fetch(`/api/barbers?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
          headers: buildTenantHeaders(),
        })

        const data = await response.json().catch(() => ({}))
        if (!isActive) return

        if (!response.ok) {
          setError(data.error ?? "No se pudieron cargar los barberos")
          setBarbers([])
          return
        }

        setBarbers(Array.isArray(data.barbers) ? data.barbers : [])
      } catch (err) {
        if (!isActive || err instanceof DOMException) return
        console.error("Error loading barbers", err)
        setError("Error de conexión al cargar barberos")
        setBarbers([])
      } finally {
        if (isActive) setIsLoading(false)
      }
    }

    load()

    return () => {
      isActive = false
      controller.abort()
    }
    load()

    return () => {
      isActive = false
      controller.abort()
    }
  }, [userId, selectedServiceId])

  const barbersView = useMemo(() => {
    const filtered = segment === "favorites" ? barbers.filter((barber) => barber.isFavorite) : barbers

    return filtered.map((barber) => {
      const nextAvailabilityLabel = barber.nextAvailabilityISO
        ? format(new Date(barber.nextAvailabilityISO), "EEEE d 'de' MMMM · HH:mm", { locale: es })
        : "Sin disponibilidad"

      return {
        ...barber,
        nextAvailabilityLabel,
        initials: getInitials(barber.name),
        primaryName: barber.name.split(" ")[0] ?? barber.name,
      }
    })
  }, [barbers, segment])

  const toggleFavorite = async (barberId: number, nextValue: boolean) => {
    if (!userId) {
      return
    }

    setBarbers((prev) => prev.map((b) => (b.id === barberId ? { ...b, isFavorite: nextValue } : b)))

    try {
      const response = await fetch("/api/favorites", {
        method: nextValue ? "POST" : "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...buildTenantHeaders(),
        },
        body: JSON.stringify({ userId, barberId }),
      })

      if (!response.ok) {
        setBarbers((prev) => prev.map((b) => (b.id === barberId ? { ...b, isFavorite: !nextValue } : b)))
      }
    } catch (err) {
      console.error("Error toggling favorite", err)
      setBarbers((prev) => prev.map((b) => (b.id === barberId ? { ...b, isFavorite: !nextValue } : b)))
    }
  }

  const buildBookingHref = (barberId: number) => {
    const params = new URLSearchParams({ barberId: String(barberId) })
    if (selectedServiceId) {
      params.set("serviceId", String(selectedServiceId))
    }
    return `/booking?${params.toString()}`
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar:duration-200">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/dashboard">Inicio</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Mis barberos favoritos</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
          <section className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">Mis barberos favoritos</h1>
            <p className="text-muted-foreground text-sm">
              Guarda a tu equipo de confianza para reservar más rápido y revisar horarios disponibles.
            </p>
          </section>

          <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={segment} onValueChange={(value) => setSegment(value as "all" | "favorites")}
              className="w-full sm:w-auto"
            >
              <TabsList>
                <TabsTrigger value="favorites">Favoritos</TabsTrigger>
                <TabsTrigger value="all">Todos</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="w-full sm:w-[320px]">
              <Select
                value={selectedServiceId ? String(selectedServiceId) : "all"}
                onValueChange={(value) => setSelectedServiceId(value === "all" ? null : Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por servicio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los servicios</SelectItem>
                  {services.map((service) => (
                    <SelectItem key={service.id} value={String(service.id)}>
                      {service.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {isLoading
              ? Array.from({ length: 3 }).map((_, index) => (
                  <Card key={index} className="border border-border/70 shadow-sm">
                    <CardHeader className="flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-12 w-12 rounded-full" />
                        <div className="space-y-2">
                          <Skeleton className="h-5 w-40" />
                          <Skeleton className="h-4 w-56" />
                        </div>
                      </div>
                      <Skeleton className="h-4 w-36" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Skeleton className="h-14 w-full" />
                      <Skeleton className="h-14 w-full" />
                      <div className="flex gap-2">
                        <Skeleton className="h-8 w-24" />
                        <Skeleton className="h-8 w-40" />
                      </div>
                    </CardContent>
                  </Card>
                ))
              : null}

            {!isLoading && error ? (
              <p className="md:col-span-2 xl:col-span-3 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            {!isLoading && !error && barbersView.length === 0 ? (
              <p className="md:col-span-2 xl:col-span-3 rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                {segment === "favorites" ? "Aún no tienes barberos favoritos." : "No encontramos barberos para los filtros seleccionados."}
              </p>
            ) : null}

            {!isLoading && !error
              ? barbersView.map((barber) => (
              <Card key={barber.id} className="border border-border/70 shadow-sm">
                <CardHeader className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
                      {barber.initials}
                    </div>
                    <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="text-xl">
                          <Link
                            href={buildBookingHref(barber.id)}
                            className="hover:underline"
                          >
                            {barber.name}
                          </Link>
                        </CardTitle>
                        <CardDescription>{barber.specialty ?? ""}</CardDescription>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleFavorite(barber.id, !barber.isFavorite)}
                        className={cn(
                          "inline-flex items-center justify-center rounded-md p-2 transition",
                          "hover:bg-muted",
                        )}
                        aria-label={barber.isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"}
                      >
                        <Heart
                          className={cn(
                            "h-5 w-5",
                            barber.isFavorite ? "text-destructive" : "text-muted-foreground",
                          )}
                          fill={barber.isFavorite ? "currentColor" : "none"}
                        />
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                    <CalendarClock className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-foreground">Próxima disponibilidad</p>
                      <p className="text-muted-foreground">{barber.nextAvailabilityLabel}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                    <Phone className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-foreground">Contacto directo</p>
                      <p className="text-muted-foreground">{barber.phone ?? ""}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={buildBookingHref(barber.id)}>Ver horarios</Link>
                    </Button>
                    <Button asChild size="sm" variant="secondary">
                      <Link href={buildBookingHref(barber.id)}>
                        Reservar con {barber.primaryName}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
              : null}
          </section>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
