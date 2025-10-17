"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CalendarCheck2, CalendarClock, DollarSign, UserCircle, Users } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { ClientSummary, EmployeeSummary } from "@/lib/admin"
import { formatCurrency, formatNumber } from "@/lib/formatters"

type EmployeesResponse = {
  employees?: EmployeeSummary[]
  error?: string
}

type ClientsResponse = {
  clients?: ClientSummary[]
  error?: string
}

function sortEmployees(list: EmployeeSummary[]): EmployeeSummary[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
}

function sortClients(list: ClientSummary[]): ClientSummary[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
}

export default function AdminDashboard() {
  const [employees, setEmployees] = useState<EmployeeSummary[]>([])
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [areEmployeesLoading, setAreEmployeesLoading] = useState(true)
  const [areClientsLoading, setAreClientsLoading] = useState(true)
  const [employeesError, setEmployeesError] = useState<string | null>(null)
  const [clientsError, setClientsError] = useState<string | null>(null)

  const loadEmployees = useCallback(
    async (signal?: AbortSignal) => {
      setAreEmployeesLoading(true)
      setEmployeesError(null)

      try {
        const response = await fetch("/api/admin/employees", { signal, cache: "no-store" })
        const data: EmployeesResponse = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(data.error ?? "No se pudieron cargar los empleados")
        }

        if (!signal?.aborted) {
          const list = Array.isArray(data.employees) ? data.employees : []
          setEmployees(sortEmployees(list))
        }
      } catch (error) {
        if (signal?.aborted) {
          return
        }

        console.error("Error fetching employees", error)
        setEmployeesError("No se pudieron cargar los empleados.")
      } finally {
        if (!signal?.aborted) {
          setAreEmployeesLoading(false)
        }
      }
    },
    [],
  )

  const loadClients = useCallback(
    async (signal?: AbortSignal) => {
      setAreClientsLoading(true)
      setClientsError(null)

      try {
        const response = await fetch("/api/admin/clients", { signal, cache: "no-store" })
        const data: ClientsResponse = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(data.error ?? "No se pudieron cargar los clientes")
        }

        if (!signal?.aborted) {
          const list = Array.isArray(data.clients) ? data.clients : []
          setClients(sortClients(list))
        }
      } catch (error) {
        if (signal?.aborted) {
          return
        }

        console.error("Error fetching clients", error)
        setClientsError("No se pudieron cargar los clientes.")
      } finally {
        if (!signal?.aborted) {
          setAreClientsLoading(false)
        }
      }
    },
    [],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadEmployees(controller.signal)

    return () => controller.abort()
  }, [loadEmployees])

  useEffect(() => {
    const controller = new AbortController()
    void loadClients(controller.signal)

    return () => controller.abort()
  }, [loadClients])

  const handleReload = useCallback(() => {
    void loadEmployees()
    void loadClients()
  }, [loadClients, loadEmployees])

  const isLoading = areEmployeesLoading || areClientsLoading
  const hasErrors = Boolean(employeesError || clientsError)

  const metrics = useMemo(() => {
    const totals = {
      totalEmployees: employees.length,
      totalClients: clients.length,
      totalRevenue: 0,
      totalAppointments: 0,
      upcomingAppointments: 0,
      completedAppointments: 0,
    }

    for (const employee of employees) {
      totals.totalRevenue += employee.totalRevenue
      totals.totalAppointments += employee.totalAppointments
      totals.upcomingAppointments += employee.upcomingAppointments
      totals.completedAppointments += employee.completedAppointments
    }

    return totals
  }, [clients, employees])

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto space-y-8 px-4 py-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">Panel de administración</h1>
          <p className="text-muted-foreground">
            Consulta los indicadores generales de la barberia y navega a las secciones detalladas desde la barra
            lateral.
          </p>
        </header>

        {hasErrors && (
          <Alert variant="destructive">
            <AlertTitle>Tuvimos problemas al cargar algunos datos</AlertTitle>
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1 text-sm">
                {employeesError && <p>Empleados: {employeesError}</p>}
                {clientsError && <p>Clientes: {clientsError}</p>}
              </div>
              <Button variant="outline" onClick={handleReload}>
                Reintentar
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <StatsSkeleton />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5 2xl:grid-cols-5">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de empleados</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{formatNumber(metrics.totalEmployees)}</div>
                <p className="text-xs text-muted-foreground">Equipo activo en el sistema</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de clientes</CardTitle>
                <UserCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{formatNumber(metrics.totalClients)}</div>
                <p className="text-xs text-muted-foreground">Clientes registrados en la plataforma</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Citas totales</CardTitle>
                <CalendarCheck2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{formatNumber(metrics.totalAppointments)}</div>
                <p className="text-xs text-muted-foreground">
                  Completadas: {formatNumber(metrics.completedAppointments)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Citas próximas</CardTitle>
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{formatNumber(metrics.upcomingAppointments)}</div>
                <p className="text-xs text-muted-foreground">Reservas agendadas con el equipo</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Ingresos generados</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{formatCurrency(metrics.totalRevenue)}</div>
                <p className="text-xs text-muted-foreground">Ingresos asociados a citas completadas</p>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}

function StatsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5 2xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, index) => (
        <Card key={index}>
          <CardHeader className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
