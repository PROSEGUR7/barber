"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CalendarDays } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { AdminAppointmentSummary } from "@/lib/admin"
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/formatters"

type AppointmentsResponse = {
  appointments?: AdminAppointmentSummary[]
  error?: string
}

function getStatusLabel(status: string | null): string {
  if (!status) {
    return "Sin estado"
  }

  return status
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (chunk) => chunk.toUpperCase())
}

function getStatusVariant(status: string | null): "default" | "secondary" | "outline" | "destructive" {
  const normalized = status?.trim().toLowerCase() ?? ""

  if (normalized.includes("cancel")) {
    return "destructive"
  }

  if (normalized.includes("complet") || normalized.includes("final")) {
    return "secondary"
  }

  if (normalized.includes("pend") || normalized.includes("confirm") || normalized.includes("agend") || normalized.includes("program")) {
    return "default"
  }

  return "outline"
}

function getPaymentStatusLabel(status: string | null): string {
  const normalized = status?.trim().toLowerCase() ?? ""

  if (!normalized) {
    return "Pendiente"
  }

  if (["completo", "pagado", "aprobado", "paid", "success", "succeeded"].includes(normalized)) {
    return "Pagado"
  }

  if (["fallido", "declined", "error", "voided"].includes(normalized)) {
    return "Fallido"
  }

  return getStatusLabel(status)
}

function getPaymentStatusVariant(status: string | null): "default" | "secondary" | "outline" | "destructive" {
  const normalized = status?.trim().toLowerCase() ?? ""

  if (["fallido", "declined", "error", "voided"].includes(normalized)) {
    return "destructive"
  }

  if (["completo", "pagado", "aprobado", "paid", "success", "succeeded"].includes(normalized)) {
    return "secondary"
  }

  return "outline"
}

function sortAppointments(list: AdminAppointmentSummary[]): AdminAppointmentSummary[] {
  return [...list].sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
}

function buildTenantHeaders(): HeadersInit {
  if (typeof window === "undefined") {
    return {}
  }

  const headers: Record<string, string> = {}
  const tenant = (localStorage.getItem("tenantSchema") ?? localStorage.getItem("userTenant") ?? "").trim()
  const userEmail = (localStorage.getItem("userEmail") ?? "").trim().toLowerCase()

  if (tenant) {
    headers["x-tenant"] = tenant
  }

  if (userEmail) {
    headers["x-user-email"] = userEmail
  }

  return headers
}

export default function AdminAgendamientosPage() {
  const [appointments, setAppointments] = useState<AdminAppointmentSummary[]>([])
  const [areAppointmentsLoading, setAreAppointmentsLoading] = useState(true)
  const [appointmentsError, setAppointmentsError] = useState<string | null>(null)

  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  const loadAppointments = useCallback(
    async (signal?: AbortSignal) => {
      setAreAppointmentsLoading(true)
      setAppointmentsError(null)

      try {
        const response = await fetch("/api/admin/appointments", {
          signal,
          cache: "no-store",
          headers: buildTenantHeaders(),
        })
        const data: AppointmentsResponse = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(data.error ?? "No se pudieron cargar los agendamientos")
        }

        if (!signal?.aborted) {
          const list = Array.isArray(data.appointments) ? data.appointments : []
          setAppointments(sortAppointments(list))
        }
      } catch (error) {
        if (signal?.aborted) {
          return
        }

        console.error("Error fetching admin appointments", error)
        setAppointmentsError("No se pudieron cargar los agendamientos.")
      } finally {
        if (!signal?.aborted) {
          setAreAppointmentsLoading(false)
        }
      }
    },
    [],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadAppointments(controller.signal)

    return () => controller.abort()
  }, [loadAppointments])

  const statusOptions = useMemo(() => {
    const values = new Set<string>()

    for (const appointment of appointments) {
      const normalized = appointment.status?.trim().toLowerCase()
      if (normalized) {
        values.add(normalized)
      }
    }

    return [...values].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }))
  }, [appointments])

  const filteredAppointments = useMemo(() => {
    const search = searchTerm.trim().toLowerCase()

    return appointments.filter((appointment) => {
      const statusMatches =
        statusFilter === "all" || (appointment.status?.trim().toLowerCase() ?? "") === statusFilter

      if (!statusMatches) {
        return false
      }

      if (search.length === 0) {
        return true
      }

      const searchableText = [
        appointment.client.name,
        appointment.employee.name,
        appointment.service.name,
        appointment.status ?? "",
        appointment.paymentStatus ?? "",
      ]
        .join(" ")
        .toLowerCase()

      return searchableText.includes(search)
    })
  }, [appointments, searchTerm, statusFilter])

  const metrics = useMemo(() => {
    const totals = {
      total: filteredAppointments.length,
      active: 0,
      completed: 0,
      cancelled: 0,
      paidAmount: 0,
    }

    for (const appointment of filteredAppointments) {
      const normalized = appointment.status?.trim().toLowerCase() ?? ""

      if (
        normalized.includes("pend") ||
        normalized.includes("confirm") ||
        normalized.includes("agend") ||
        normalized.includes("program")
      ) {
        totals.active += 1
      }

      if (normalized.includes("complet") || normalized.includes("final")) {
        totals.completed += 1
      }

      if (normalized.includes("cancel")) {
        totals.cancelled += 1
      }

      totals.paidAmount += appointment.paidAmount
    }

    return totals
  }, [filteredAppointments])

  const shouldShowErrorCard = Boolean(appointmentsError) && !areAppointmentsLoading && appointments.length === 0

  const handleReload = useCallback(() => {
    void loadAppointments()
  }, [loadAppointments])

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto space-y-8 px-4 py-8">
        <section className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-5">
          <CompactMetricCard title="Agendamientos" value={formatNumber(metrics.total)} />
          <CompactMetricCard title="Activos" value={formatNumber(metrics.active)} />
          <CompactMetricCard title="Completados" value={formatNumber(metrics.completed)} />
          <CompactMetricCard title="Cancelados" value={formatNumber(metrics.cancelled)} />
          <CompactMetricCard title="Monto pagado" value={formatCurrency(metrics.paidAmount)} className="col-span-2 xl:col-span-1" />
        </section>

        {shouldShowErrorCard ? (
          <Card>
            <CardHeader>
              <CardTitle>No pudimos cargar los agendamientos</CardTitle>
              <CardDescription>Intenta nuevamente para obtener la información más reciente de la agenda.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleReload}>Reintentar</Button>
            </CardContent>
          </Card>
        ) : areAppointmentsLoading ? (
          <AppointmentsTableSkeleton />
        ) : filteredAppointments.length === 0 ? (
          <Card>
            <CardContent>
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CalendarDays className="h-6 w-6" />
                  </EmptyMedia>
                  <EmptyTitle>Sin agendamientos</EmptyTitle>
                  <EmptyDescription>
                    No se encontraron resultados para los filtros actuales en la agenda.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent className="text-sm text-muted-foreground">
                  Ajusta los filtros o crea nuevas reservas desde la vista de clientes.
                </EmptyContent>
              </Empty>
            </CardContent>
          </Card>
        ) : (
          <>
            {appointmentsError && (
              <Alert variant="destructive">
                <AlertTitle>Error al actualizar la agenda</AlertTitle>
                <AlertDescription>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span>{appointmentsError}</span>
                    <Button variant="outline" onClick={handleReload}>
                      Reintentar
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <Card className="border-border/60 bg-gradient-to-b from-background/80 via-background to-background/95">
              <CardHeader className="space-y-2">
                <CardTitle className="text-xl">Agendamientos registrados</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-muted-foreground">Busca por cliente, empleado o servicio y filtra por estado.</p>
                  <Button variant="outline" onClick={handleReload}>
                    Recargar
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Buscar por cliente, empleado o servicio"
                  />

                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filtrar por estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los estados</SelectItem>
                      {statusOptions.map((status) => (
                        <SelectItem key={status} value={status}>
                          {getStatusLabel(status)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="overflow-x-auto rounded-xl border border-border/60 bg-background/60 shadow-sm">
                  <div className="overflow-x-auto">
                    <Table className="min-w-[1080px] text-base">
                      <TableHeader className="bg-muted/40">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">#</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fecha y hora</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cliente</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Empleado</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Servicio</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado pago</TableHead>
                          <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Monto pagado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAppointments.map((appointment) => (
                          <TableRow key={appointment.id} className="h-[76px] border-border/50 transition-colors">
                            <TableCell className="font-medium">{appointment.id}</TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span>{formatDateTime(appointment.startAt)}</span>
                                <span className="text-xs text-muted-foreground">
                                  Fin: {appointment.endAt ? formatDateTime(appointment.endAt) : "Sin definir"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>{appointment.client.name}</TableCell>
                            <TableCell>{appointment.employee.name}</TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span>{appointment.service.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {formatCurrency(appointment.service.price)} · {formatNumber(appointment.service.durationMin)} min
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={getStatusVariant(appointment.status)}>{getStatusLabel(appointment.status)}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={getPaymentStatusVariant(appointment.paymentStatus)}>
                                {getPaymentStatusLabel(appointment.paymentStatus)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">{formatCurrency(appointment.paidAmount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{formatNumber(filteredAppointments.length)} agendamientos filtrados en la tabla.</p>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  )
}

function AppointmentsTableSkeleton() {
  return (
    <Card>
      <CardHeader className="space-y-2">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-4 w-72" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  )
}

function CompactMetricCard({
  title,
  value,
  className,
}: {
  title: string
  value: string
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader className="space-y-1 px-3 pb-0 pt-2 sm:px-6 sm:pb-2 sm:pt-4">
        <CardTitle className="line-clamp-1 text-[13px] font-medium text-muted-foreground sm:text-sm">
          {title}
        </CardTitle>
        <CardDescription className="text-[2rem] font-bold leading-none text-foreground sm:text-3xl">
          {value}
        </CardDescription>
      </CardHeader>
    </Card>
  )
}
