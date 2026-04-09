"use client"

import Link from "next/link"
import { type ComponentType, useEffect, useMemo, useState } from "react"
import { addDays, format, isBefore, startOfDay } from "date-fns"
import { es } from "date-fns/locale"
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  DollarSign,
  Scissors,
  TrendingUp,
  UserRound,
  Wallet,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type AppointmentStatus = "pendiente" | "confirmada" | "completada" | "cancelada" | string

type Appointment = {
  id: number
  clientName: string
  serviceName: string
  start: string
  end: string | null
  price: number | null
  status: AppointmentStatus
}

type EarningsSummary = {
  today: { count: number; amount: number }
  week: { count: number; amount: number }
  month: { count: number; amount: number }
}

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
})

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase()
}

function formatCurrency(value: number) {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0)
}

function getStatusBadgeClass(status: string) {
  switch (normalize(status)) {
    case "pendiente":
      return "bg-amber-500/10 text-amber-700 border-amber-500/30"
    case "confirmada":
      return "bg-sky-500/10 text-sky-700 border-sky-500/30"
    case "completada":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
    case "cancelada":
      return "bg-rose-500/10 text-rose-700 border-rose-500/30"
    default:
      return "bg-muted text-foreground border-border"
  }
}

function getStatusText(status: string) {
  switch (normalize(status)) {
    case "pendiente":
      return "Pendiente"
    case "confirmada":
      return "Confirmada"
    case "completada":
      return "Completada"
    case "cancelada":
      return "Cancelada"
    default:
      return status
  }
}

export default function BarberDashboardPage() {
  const [userId, setUserId] = useState<number | null>(null)
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([])
  const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>([])
  const [historyAppointments, setHistoryAppointments] = useState<Appointment[]>([])
  const [earningsSummary, setEarningsSummary] = useState<EarningsSummary | null>(null)
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
      const stored = localStorage.getItem("userId")
      const parsed = stored ? Number.parseInt(stored, 10) : NaN
      setUserId(Number.isFinite(parsed) ? parsed : null)
    } catch {
      setUserId(null)
    }
  }, [])

  useEffect(() => {
    if (!userId) {
      setIsLoading(false)
      setError("No encontramos tu sesión activa. Vuelve a iniciar sesión.")
      return
    }

    const load = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const headers = buildTenantHeaders()
        const today = format(startOfDay(new Date()), "yyyy-MM-dd")

        const [todayRes, upcomingRes, historyRes, earningsRes] = await Promise.all([
          fetch(`/api/barber/appointments?userId=${userId}&scope=today&date=${today}`, { cache: "no-store", headers }),
          fetch(`/api/barber/appointments?userId=${userId}&scope=upcoming`, { cache: "no-store", headers }),
          fetch(`/api/barber/appointments?userId=${userId}&scope=history`, { cache: "no-store", headers }),
          fetch(`/api/barber/earnings?userId=${userId}`, { cache: "no-store", headers }),
        ])

        const [todayData, upcomingData, historyData, earningsData] = await Promise.all([
          todayRes.json().catch(() => ({})),
          upcomingRes.json().catch(() => ({})),
          historyRes.json().catch(() => ({})),
          earningsRes.json().catch(() => ({})),
        ])

        if (!todayRes.ok || !upcomingRes.ok || !historyRes.ok || !earningsRes.ok) {
          const firstError =
            todayData.error ?? upcomingData.error ?? historyData.error ?? earningsData.error ?? "No se pudo cargar el panel"
          throw new Error(firstError)
        }

        const mapAppointments = (items: any[]): Appointment[] =>
          items.map((item) => ({
            id: Number(item.id),
            clientName: String(item.clientName ?? "Cliente"),
            serviceName: String(item.serviceName ?? "Servicio"),
            start: String(item.start),
            end: item.end ? String(item.end) : null,
            price: item.price != null && Number.isFinite(Number(item.price)) ? Number(item.price) : null,
            status: String(item.status ?? "pendiente"),
          }))

        setTodayAppointments(mapAppointments(Array.isArray(todayData.appointments) ? todayData.appointments : []))
        setUpcomingAppointments(mapAppointments(Array.isArray(upcomingData.appointments) ? upcomingData.appointments : []))
        setHistoryAppointments(mapAppointments(Array.isArray(historyData.appointments) ? historyData.appointments : []))

        const summary = earningsData.summary ?? earningsData
        setEarningsSummary({
          today: {
            count: Number(summary?.today?.count ?? 0),
            amount: Number(summary?.today?.amount ?? 0),
          },
          week: {
            count: Number(summary?.week?.count ?? 0),
            amount: Number(summary?.week?.amount ?? 0),
          },
          month: {
            count: Number(summary?.month?.count ?? 0),
            amount: Number(summary?.month?.amount ?? 0),
          },
        })
      } catch (loadError) {
        console.error("Error loading barber dashboard", loadError)
        setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el panel")
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [userId])

  const now = new Date()

  const summary = useMemo(() => {
    const totalToday = todayAppointments.length
    const pendingToday = todayAppointments.filter((apt) => ["pendiente", "confirmada"].includes(normalize(apt.status))).length
    const completedToday = todayAppointments.filter((apt) => normalize(apt.status) === "completada").length
    const canceledToday = todayAppointments.filter((apt) => normalize(apt.status) === "cancelada").length

    const upcoming7Days = upcomingAppointments.filter((apt) => {
      const start = new Date(apt.start)
      return start >= startOfDay(now) && start <= addDays(startOfDay(now), 7)
    }).length

    const overduePending = todayAppointments.filter((apt) => {
      const start = new Date(apt.start)
      return isBefore(start, now) && ["pendiente", "confirmada"].includes(normalize(apt.status))
    }).length

    const completionRate = totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 0

    return {
      totalToday,
      pendingToday,
      completedToday,
      canceledToday,
      upcoming7Days,
      overduePending,
      completionRate,
    }
  }, [todayAppointments, upcomingAppointments, now])

  const nextAppointments = useMemo(() => {
    return [...upcomingAppointments]
      .filter((apt) => ["pendiente", "confirmada"].includes(normalize(apt.status)))
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .slice(0, 5)
  }, [upcomingAppointments])

  const topClients = useMemo(() => {
    const bucket = new Map<string, { name: string; count: number; lastVisit: string }>()

    for (const apt of historyAppointments) {
      const key = apt.clientName.trim().toLowerCase()
      const current = bucket.get(key)
      if (!current) {
        bucket.set(key, { name: apt.clientName, count: 1, lastVisit: apt.start })
      } else {
        current.count += 1
        if (new Date(apt.start).getTime() > new Date(current.lastVisit).getTime()) {
          current.lastVisit = apt.start
        }
      }
    }

    return [...bucket.values()]
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count
        return new Date(b.lastVisit).getTime() - new Date(a.lastVisit).getTime()
      })
      .slice(0, 6)
  }, [historyAppointments])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto space-y-6 px-4 py-8">
        <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Centro operativo del peluquero</h1>
            <p className="text-muted-foreground">Controla agenda, ejecución, ingresos y seguimiento de clientes en una sola vista.</p>
          </div>
          <Badge variant="outline" className="w-fit capitalize">
            {format(new Date(), "EEEE d 'de' MMMM yyyy", { locale: es })}
          </Badge>
        </section>

        {error && (
          <Card>
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard title="Agenda de hoy" value={String(summary.totalToday)} subtitle={`${summary.pendingToday} por gestionar`} icon={CalendarDays} />
          <MetricCard title="Cumplimiento" value={`${summary.completionRate}%`} subtitle={`${summary.completedToday} completadas`} icon={CheckCircle2} />
          <MetricCard title="Incidencias" value={String(summary.canceledToday)} subtitle="Cancelaciones del día" icon={AlertTriangle} />
          <MetricCard title="Próximos 7 días" value={String(summary.upcoming7Days)} subtitle="Carga futura" icon={Clock3} />
          <MetricCard
            title="Ingreso de hoy"
            value={formatCurrency(earningsSummary?.today.amount ?? 0)}
            subtitle={`${earningsSummary?.today.count ?? 0} servicios pagados`}
            icon={DollarSign}
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Agenda inmediata</CardTitle>
              <CardDescription>Próximas citas que requieren ejecución o seguimiento.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {nextAppointments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tienes citas próximas pendientes.</p>
              ) : (
                nextAppointments.map((apt) => (
                  <div key={apt.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{apt.clientName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {apt.serviceName} · {format(new Date(apt.start), "dd/MM HH:mm")}
                      </p>
                    </div>
                    <Badge variant="outline" className={getStatusBadgeClass(apt.status)}>
                      {getStatusText(apt.status)}
                    </Badge>
                  </div>
                ))
              )}
              <div className="pt-2">
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <Link href="/barber/agendamientos">
                    Abrir calendario operativo
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Control de KPI</CardTitle>
                <CardDescription>Indicadores críticos de la operación diaria.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Cumplimiento de citas</span>
                    <span className="font-medium">{summary.completionRate}%</span>
                  </div>
                  <Progress value={summary.completionRate} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Pagos de la semana</span>
                    <span className="font-medium">{formatCurrency(earningsSummary?.week.amount ?? 0)}</span>
                  </div>
                  <Progress value={Math.min(100, Math.round(((earningsSummary?.week.amount ?? 0) / 1000000) * 100))} />
                </div>
                <div className="rounded-md border bg-muted/20 p-3 text-sm">
                  <p className="font-medium">Alertas activas</p>
                  <p className="mt-1 text-muted-foreground">{summary.overduePending} citas con posible retraso operativo.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Clientes recurrentes</CardTitle>
                <CardDescription>Base de fidelización a priorizar esta semana.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {topClients.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aún no hay historial suficiente para ranking.</p>
                ) : (
                  topClients.map((client) => (
                    <div key={client.name} className="flex items-center justify-between rounded-md border p-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{client.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Última visita: {format(new Date(client.lastVisit), "dd/MM/yyyy", { locale: es })}
                        </p>
                      </div>
                      <Badge variant="secondary">{client.count} citas</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        <section>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Acciones rápidas por sección</CardTitle>
              <CardDescription>Módulos empresariales del perfil de empleado.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <ActionLink href="/barber/agendamientos" title="Agendamientos" description="Calendario día/semana/mes" icon={CalendarDays} />
              <ActionLink href="/barber/appointments" title="Mis citas" description="Ejecución y estados" icon={Clock3} />
              <ActionLink href="/barber/availability" title="Disponibilidad" description="Plantillas y excepciones" icon={Scissors} />
              <ActionLink href="/barber/services" title="Servicios" description="Catálogo y activación" icon={UserRound} />
              <ActionLink href="/barber/earnings" title="Ganancias" description="Ingresos y objetivos" icon={Wallet} />
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  )
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string
  value: string
  subtitle: string
  icon: ComponentType<{ className?: string }>
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-4">
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </CardContent>
    </Card>
  )
}

function ActionLink({
  href,
  title,
  description,
  icon: Icon,
}: {
  href: string
  title: string
  description: string
  icon: ComponentType<{ className?: string }>
}) {
  return (
    <Link href={href} className={cn("rounded-md border p-3 transition-colors hover:bg-muted/40") }>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
    </Link>
  )
}
