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

function sortAppointments(list: AdminAppointmentSummary[]): AdminAppointmentSummary[] {
  return [...list].sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
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
        const response = await fetch("/api/admin/appointments", { signal, cache: "no-store" })
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
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">Agendamientos</h1>
          <p className="text-muted-foreground">
            Visualiza la agenda completa de la barbería con información de clientes, empleados y servicios.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">Agendamientos</CardTitle>
              <CardDescription className="text-3xl font-bold text-foreground">{formatNumber(metrics.total)}</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">Activos</CardTitle>
              <CardDescription className="text-3xl font-bold text-foreground">{formatNumber(metrics.active)}</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">Completados</CardTitle>
              <CardDescription className="text-3xl font-bold text-foreground">{formatNumber(metrics.completed)}</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">Cancelados</CardTitle>
              <CardDescription className="text-3xl font-bold text-foreground">{formatNumber(metrics.cancelled)}</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">Monto pagado</CardTitle>
              <CardDescription className="text-3xl font-bold text-foreground">{formatCurrency(metrics.paidAmount)}</CardDescription>
            </CardHeader>
          </Card>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold">Agenda completa</h2>
              <p className="text-muted-foreground">Filtra por estado o busca por cliente, empleado o servicio.</p>
            </div>
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

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Fecha y hora</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Empleado</TableHead>
                      <TableHead>Servicio</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Monto pagado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAppointments.map((appointment) => (
                      <TableRow key={appointment.id}>
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
                        <TableCell className="text-right">{formatCurrency(appointment.paidAmount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
