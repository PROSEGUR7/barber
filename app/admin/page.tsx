"use client"

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { CalendarCheck2, CalendarClock, DollarSign, Plus, Users } from "lucide-react"

import { AdminClientsTable, AdminEmployeesTable } from "@/components/admin"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useToast } from "@/hooks/use-toast"
import type { ClientSummary, EmployeeSummary } from "@/lib/admin"
import { formatCurrency, formatNumber } from "@/lib/formatters"

type EmployeesResponse = {
  employees?: EmployeeSummary[]
  error?: string
}

type CreateEmployeeResponse = EmployeesResponse & {
  employee?: EmployeeSummary
}

type ClientsResponse = {
  clients?: ClientSummary[]
  error?: string
}

type CreateClientResponse = ClientsResponse & {
  client?: ClientSummary
}

function sortEmployees(list: EmployeeSummary[]): EmployeeSummary[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
}

function sortClients(list: ClientSummary[]): ClientSummary[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
}

export default function AdminDashboard() {
  const { toast } = useToast()
  const [employees, setEmployees] = useState<EmployeeSummary[]>([])
  const [areEmployeesLoading, setAreEmployeesLoading] = useState(true)
  const [employeesError, setEmployeesError] = useState<string | null>(null)
  const [isEmployeeRegisterOpen, setIsEmployeeRegisterOpen] = useState(false)
  const [employeeFormName, setEmployeeFormName] = useState("")
  const [employeeFormEmail, setEmployeeFormEmail] = useState("")
  const [employeeFormPhone, setEmployeeFormPhone] = useState("")
  const [employeeFormPassword, setEmployeeFormPassword] = useState("")
  const [employeeFormError, setEmployeeFormError] = useState<string | null>(null)
  const [isEmployeeSubmitting, setIsEmployeeSubmitting] = useState(false)

  const [clients, setClients] = useState<ClientSummary[]>([])
  const [areClientsLoading, setAreClientsLoading] = useState(true)
  const [clientsError, setClientsError] = useState<string | null>(null)
  const [isClientRegisterOpen, setIsClientRegisterOpen] = useState(false)
  const [clientFormName, setClientFormName] = useState("")
  const [clientFormEmail, setClientFormEmail] = useState("")
  const [clientFormPhone, setClientFormPhone] = useState("")
  const [clientFormPassword, setClientFormPassword] = useState("")
  const [clientFormError, setClientFormError] = useState<string | null>(null)
  const [isClientSubmitting, setIsClientSubmitting] = useState(false)

  const resetEmployeeForm = useCallback(() => {
    setEmployeeFormName("")
    setEmployeeFormEmail("")
    setEmployeeFormPhone("")
    setEmployeeFormPassword("")
    setEmployeeFormError(null)
  }, [])

  const resetClientForm = useCallback(() => {
    setClientFormName("")
    setClientFormEmail("")
    setClientFormPhone("")
    setClientFormPassword("")
    setClientFormError(null)
  }, [])

  // Fetch employees from the API and avoid state updates when unmounted.
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
      } catch (err) {
        if (signal?.aborted) {
          return
        }

        console.error("Error fetching employees", err)
        setEmployeesError("No se pudieron cargar los empleados.")
      } finally {
        if (!signal?.aborted) {
          setAreEmployeesLoading(false)
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
    if (!isEmployeeRegisterOpen) {
      resetEmployeeForm()
      setIsEmployeeSubmitting(false)
    }
  }, [isEmployeeRegisterOpen, resetEmployeeForm])

  const metrics = useMemo(() => {
    const totals = {
      totalEmployees: employees.length,
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
  }, [employees])

  const shouldShowEmployeesErrorCard = Boolean(employeesError) && !areEmployeesLoading && employees.length === 0

  const handleEmployeesReload = useCallback(() => {
    void loadEmployees()
  }, [loadEmployees])

  const handleEmployeeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setEmployeeFormError(null)

    const sanitizedName = employeeFormName.trim()
    const sanitizedEmail = employeeFormEmail.trim().toLowerCase()
    const sanitizedPhone = employeeFormPhone.trim()

    if (sanitizedName.length < 2) {
      setEmployeeFormError("Ingresa un nombre válido.")
      return
    }

    if (!sanitizedEmail || !sanitizedEmail.includes("@")) {
      setEmployeeFormError("Ingresa un correo válido.")
      return
    }

    if (!sanitizedPhone) {
      setEmployeeFormError("Ingresa un teléfono válido.")
      return
    }

    if (sanitizedPhone.length < 7 || sanitizedPhone.length > 20) {
      setEmployeeFormError("El teléfono debe tener entre 7 y 20 caracteres.")
      return
    }

    if (!/^[0-9+\-\s]+$/.test(sanitizedPhone)) {
      setEmployeeFormError("El teléfono solo puede tener números y símbolos + -.")
      return
    }

    if (employeeFormPassword.length < 8) {
      setEmployeeFormError("La contraseña debe tener al menos 8 caracteres.")
      return
    }

    setIsEmployeeSubmitting(true)

    try {
      const response = await fetch("/api/admin/employees", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: sanitizedName,
          email: sanitizedEmail,
          password: employeeFormPassword,
          phone: sanitizedPhone,
        }),
      })

      const data: CreateEmployeeResponse = await response.json().catch(() => ({} as CreateEmployeeResponse))

      if (!response.ok || !data.employee) {
        setEmployeeFormError(data.error ?? "No se pudo crear el empleado.")
        return
      }

      setEmployees((previous) => {
        const next = previous.filter((item) => item.id !== data.employee!.id)
        next.push(data.employee!)
        return sortEmployees(next)
      })

      setEmployeesError(null)
      resetEmployeeForm()
      setIsEmployeeRegisterOpen(false)

      toast({
        title: "Empleado registrado",
        description: "El nuevo empleado ya puede gestionar citas y servicios.",
      })
    } catch (err) {
      console.error("Error creating employee", err)
      setEmployeeFormError("Error de conexión con el servidor.")
    } finally {
      setIsEmployeeSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto space-y-8 px-4 py-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">Panel de administración</h1>
          <p className="text-muted-foreground">
            Monitorea el rendimiento del equipo y registra nuevos empleados.
          </p>
        </header>

        {areEmployeesLoading ? (
          <StatsSkeleton />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

        <section className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold">Gestión de empleados</h2>
              <p className="text-muted-foreground">Consulta actividad, servicios y registra nuevos perfiles.</p>
            </div>
            <Sheet open={isEmployeeRegisterOpen} onOpenChange={setIsEmployeeRegisterOpen}>
              <SheetTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Registrar empleado
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="p-0 sm:max-w-md lg:max-w-lg">
                <form onSubmit={handleEmployeeSubmit} className="flex h-full flex-col">
                  <SheetHeader className="border-b px-6 py-4 text-left">
                    <SheetTitle>Registrar nuevo empleado</SheetTitle>
                    <SheetDescription>
                      Crea un usuario para un miembro del equipo. Podrá actualizar sus datos después.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="flex-1 overflow-y-auto px-6 py-4">
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="employee-name">Nombre completo</FieldLabel>
                        <Input
                          id="employee-name"
                          value={employeeFormName}
                          onChange={(event) => {
                            setEmployeeFormName(event.target.value)
                            setEmployeeFormError(null)
                          }}
                          placeholder="Ej. Juan Pérez"
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="employee-email">Correo electrónico</FieldLabel>
                        <Input
                          id="employee-email"
                          type="email"
                          value={employeeFormEmail}
                          onChange={(event) => {
                            setEmployeeFormEmail(event.target.value)
                            setEmployeeFormError(null)
                          }}
                          placeholder="empleado@barberia.com"
                          required
                        />
                        <FieldDescription>El empleado usará este correo para iniciar sesión.</FieldDescription>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="employee-phone">Teléfono</FieldLabel>
                        <Input
                          id="employee-phone"
                          type="tel"
                          value={employeeFormPhone}
                          onChange={(event) => {
                            setEmployeeFormPhone(event.target.value)
                            setEmployeeFormError(null)
                          }}
                          placeholder="Ej. 3001234567"
                          required
                        />
                        <FieldDescription>Solo números, espacios o símbolos + - (mínimo 7 caracteres).</FieldDescription>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="employee-password">Contraseña temporal</FieldLabel>
                        <Input
                          id="employee-password"
                          type="password"
                          value={employeeFormPassword}
                          onChange={(event) => {
                            setEmployeeFormPassword(event.target.value)
                            setEmployeeFormError(null)
                          }}
                          placeholder="Mínimo 8 caracteres"
                          minLength={8}
                          required
                        />
                        <FieldDescription>Se recomienda cambiarla tras el primer inicio de sesión.</FieldDescription>
                      </Field>
                    </FieldGroup>
                  </div>
                  <SheetFooter className="border-t px-6 py-4">
                    {employeeFormError && <p className="text-sm text-destructive">{employeeFormError}</p>}
                    <Button type="submit" className="w-full" disabled={isEmployeeSubmitting}>
                      {isEmployeeSubmitting ? "Registrando..." : "Registrar empleado"}
                    </Button>
                  </SheetFooter>
                </form>
              </SheetContent>
            </Sheet>
          </div>

          {shouldShowEmployeesErrorCard ? (
            <Card>
              <CardHeader>
                <CardTitle>No pudimos cargar a los empleados</CardTitle>
                <CardDescription>Intenta nuevamente para ver la información más reciente del equipo.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <Button onClick={handleEmployeesReload}>Reintentar</Button>
              </CardContent>
            </Card>
          ) : areEmployeesLoading ? (
            <EmployeesTableSkeleton />
          ) : employees.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Users className="h-5 w-5" />
                </EmptyMedia>
                <EmptyTitle>Sin empleados registrados</EmptyTitle>
                <EmptyDescription>
                  Crea el primer perfil para comenzar a asignar citas y servicios.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => setIsEmployeeRegisterOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Registrar empleado
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <>
              {employeesError && (
                <Alert variant="destructive">
                  <AlertTitle>Error al actualizar la lista</AlertTitle>
                  <AlertDescription>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <span>{employeesError}</span>
                      <Button variant="outline" onClick={handleEmployeesReload}>
                        Reintentar
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
              <AdminEmployeesTable employees={employees} />
            </>
          )}
        </section>
      </main>
    </div>
  )
}

function StatsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
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

function EmployeesTableSkeleton() {
  return (
    <Card className="border-border/60 bg-gradient-to-b from-background/80 via-background to-background/95">
      <CardHeader className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-72" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-9 w-full sm:w-64" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-border/60">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="border-border/60 bg-muted/20 px-4 py-5"
            >
              <Skeleton className="h-6 w-full" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
