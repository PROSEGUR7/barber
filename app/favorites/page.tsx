"use client"

import Link from "next/link"
import { CalendarClock, Phone } from "lucide-react"
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
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

type FavoriteBarber = {
  id: number
  name: string
  phone: string | null
  specialty: string | null
  nextAvailabilityISO: string | null
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
  const [favorites, setFavorites] = useState<FavoriteBarber[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

    const load = async () => {
      if (!userId) {
        setIsLoading(false)
        setFavorites([])
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/favorites?userId=${userId}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        })

        const data = await response.json().catch(() => ({}))
        if (!isActive) return

        if (!response.ok) {
          setError(data.error ?? "No se pudieron cargar los favoritos")
          setFavorites([])
          return
        }

        setFavorites(Array.isArray(data.favorites) ? data.favorites : [])
      } catch (err) {
        if (!isActive || err instanceof DOMException) return
        console.error("Error loading favorites", err)
        setError("Error de conexión al cargar favoritos")
        setFavorites([])
      } finally {
        if (isActive) setIsLoading(false)
      }
    }

    load()

    return () => {
      isActive = false
      controller.abort()
    }
  }, [userId])

  const favoritesView = useMemo(() => {
    return favorites.map((barber) => {
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
  }, [favorites])

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

            {!isLoading && !error && favoritesView.length === 0 ? (
              <p className="md:col-span-2 xl:col-span-3 rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                Aún no tienes barberos favoritos.
              </p>
            ) : null}

            {!isLoading && !error
              ? favoritesView.map((barber) => (
              <Card key={barber.id} className="border border-border/70 shadow-sm">
                <CardHeader className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
                      {barber.initials}
                    </div>
                    <div>
                      <CardTitle className="text-xl">{barber.name}</CardTitle>
                      <CardDescription>{barber.specialty ?? ""}</CardDescription>
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
                    <Button variant="outline" size="sm">
                      Ver horarios
                    </Button>
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/booking?barberId=${barber.id}`}>
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
