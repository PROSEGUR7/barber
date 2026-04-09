"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  ArrowLeft,
  MapPin,
  Navigation,
  Phone,
  Scissors,
  Store,
  Users,
} from "lucide-react"

import { AppSidebar } from "@/components/app-sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"

type SedeSummary = {
  id: number
  name: string
  address: string | null
  city: string | null
  phone: string | null
  isActive: boolean
  latitude: number | null
  longitude: number | null
}

type SedeService = {
  id: number
  name: string
  description: string | null
  price: number | null
  durationMin: number
}

type SedeBarber = {
  id: number
  name: string
}

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 0,
})

export default function SedeInfoPage() {
  const params = useParams<{ sedeId: string }>()
  const rawSedeId = typeof params?.sedeId === "string" ? params.sedeId : ""
  const parsedSedeId = Number.parseInt(rawSedeId, 10)

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sede, setSede] = useState<SedeSummary | null>(null)
  const [services, setServices] = useState<SedeService[]>([])
  const [barbers, setBarbers] = useState<SedeBarber[]>([])

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
    if (!Number.isInteger(parsedSedeId) || parsedSedeId <= 0) {
      setError("Sede inválida")
      setIsLoading(false)
      return
    }

    let isActive = true

    const load = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/sedes/${parsedSedeId}`, {
          method: "GET",
          cache: "no-store",
          headers: buildTenantHeaders(),
        })

        const data = await response.json().catch(() => ({}))

        if (!isActive) {
          return
        }

        if (!response.ok) {
          setError(typeof data.error === "string" ? data.error : "No se pudo cargar la sede")
          setSede(null)
          setServices([])
          setBarbers([])
          return
        }

        setSede((data.sede as SedeSummary) ?? null)
        setServices(Array.isArray(data.services) ? (data.services as SedeService[]) : [])
        setBarbers(Array.isArray(data.barbers) ? (data.barbers as SedeBarber[]) : [])
      } catch (fetchError) {
        if (!isActive) {
          return
        }
        console.error("Error loading sede info", fetchError)
        setError("Error de conexión al cargar la sede")
        setSede(null)
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      isActive = false
    }
  }, [parsedSedeId])

  const addressLabel = useMemo(() => {
    if (!sede) return ""
    return [sede.address, sede.city].filter((value) => typeof value === "string" && value.trim().length > 0).join(", ")
  }, [sede])

  const mapsUrl = useMemo(() => {
    if (!sede) {
      return null
    }

    if (
      typeof sede.latitude === "number" &&
      Number.isFinite(sede.latitude) &&
      typeof sede.longitude === "number" &&
      Number.isFinite(sede.longitude)
    ) {
      return `https://www.google.com/maps/search/?api=1&query=${sede.latitude},${sede.longitude}`
    }

    const fallback = [sede.name, sede.address, sede.city].filter((value) => typeof value === "string" && value.trim().length > 0).join(", ")
    return fallback.length > 0
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fallback)}`
      : null
  }, [sede])

  const embedMapUrl = useMemo(() => {
    if (!sede) {
      return null
    }

    if (
      typeof sede.latitude === "number" &&
      Number.isFinite(sede.latitude) &&
      typeof sede.longitude === "number" &&
      Number.isFinite(sede.longitude)
    ) {
      return `https://www.google.com/maps?q=${sede.latitude},${sede.longitude}&z=15&output=embed`
    }

    if (addressLabel.length > 0) {
      return `https://www.google.com/maps?q=${encodeURIComponent(addressLabel)}&z=15&output=embed`
    }

    return null
  }, [addressLabel, sede])

  return (
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
                  <BreadcrumbLink href="/dashboard/appointments">Mis citas</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Sede</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-5 p-4 pt-0">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/appointments">
                <ArrowLeft className="mr-2 size-4" /> Volver a mis citas
              </Link>
            </Button>
            {sede && (
              <Button asChild size="sm">
                <Link href={`/booking?sedeId=${sede.id}`}>Reservar en esta sede</Link>
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-36 w-full rounded-2xl" />
              <Skeleton className="h-64 w-full rounded-2xl" />
            </div>
          ) : error ? (
            <Card className="border-destructive/40 bg-destructive/10">
              <CardContent className="py-6 text-sm text-destructive">{error}</CardContent>
            </Card>
          ) : sede ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-2xl">
                      <Store className="size-5" />
                      {sede.name}
                    </CardTitle>
                    <CardDescription>Información pública del establecimiento configurada por administración.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Dirección</p>
                        <p className="mt-1 font-medium">{addressLabel || "Sin dirección configurada"}</p>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Teléfono</p>
                        <p className="mt-1 font-medium">{sede.phone ?? "Sin teléfono configurado"}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-base font-semibold">Servicios de la sede</h3>
                      {services.length === 0 ? (
                        <p className="text-muted-foreground">No hay servicios activos para esta sede.</p>
                      ) : (
                        <div className="space-y-2">
                          {services.slice(0, 8).map((service) => (
                            <div key={service.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                              <div>
                                <p className="font-medium">{service.name}</p>
                                <p className="text-xs text-muted-foreground">{service.durationMin} min</p>
                              </div>
                              <p className="text-sm font-semibold">
                                {service.price == null ? "Consultar" : currencyFormatter.format(service.price)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Acciones rápidas</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {mapsUrl ? (
                      <Button asChild variant="outline" className="w-full justify-start">
                        <a href={mapsUrl} target="_blank" rel="noreferrer">
                          <Navigation className="mr-2 size-4" />
                          Cómo llegar en Google Maps
                        </a>
                      </Button>
                    ) : (
                      <Button variant="outline" className="w-full justify-start" disabled>
                        <Navigation className="mr-2 size-4" />
                        Cómo llegar no disponible
                      </Button>
                    )}

                    {sede.phone ? (
                      <Button asChild variant="outline" className="w-full justify-start">
                        <a href={`tel:${sede.phone}`}>
                          <Phone className="mr-2 size-4" />
                          Llamar al establecimiento
                        </a>
                      </Button>
                    ) : (
                      <Button variant="outline" className="w-full justify-start" disabled>
                        <Phone className="mr-2 size-4" />
                        Teléfono no disponible
                      </Button>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Users className="size-4" />
                      Equipo disponible
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {barbers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No hay profesionales activos en esta sede.</p>
                    ) : (
                      barbers.slice(0, 12).map((barber) => (
                        <Badge key={barber.id} variant="secondary" className="mr-2 mb-2">
                          <Scissors className="mr-1 size-3" /> {barber.name}
                        </Badge>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <MapPin className="size-4" /> Ubicación
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {embedMapUrl ? (
                      <iframe
                        title={`Mapa de ${sede.name}`}
                        src={embedMapUrl}
                        className="h-56 w-full rounded-lg border border-border/60"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">No hay ubicación geográfica disponible para esta sede.</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
