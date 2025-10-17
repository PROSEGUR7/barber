"use client"

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { CalendarCheck2, CalendarClock, DollarSign, Plus, Users } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import type { EmployeeSummary } from "@/lib/admin"

type EmployeesResponse = {
  employees?: EmployeeSummary[]
  error?: string
}

type CreateEmployeeResponse = EmployeesResponse & {
  employee?: EmployeeSummary
}

const SERVICE_BADGE_LIMIT = 3
const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
})
const numberFormatter = new Intl.NumberFormat("es-AR")

function sortEmployees(list: EmployeeSummary[]): EmployeeSummary[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
}

function formatCurrency(value: number): string {
  return currencyFormatter.format(value)
}

function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

function formatJoinedAt(value: string | null): string {
  if (!value) {
    return "Sin fecha"
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "Sin fecha"
  }

  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export default function AdminDashboard() {
  const { toast } = useToast()
  const [employees, setEmployees] = useState<EmployeeSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [formName, setFormName] = useState("")
  const [formEmail, setFormEmail] = useState("")
  const [formPhone, setFormPhone] = useState("")
  const [formPassword, setFormPassword] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const resetForm = useCallback(() => {
    setFormName("")
    setFormEmail("")
    setFormPhone("")
    setFormPassword("")
    setFormError(null)
  }, [])

  // Fetch employees from the API and avoid state updates when unmounted.
  const loadEmployees = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true)
      setError(null)

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
        setError("No se pudieron cargar los empleados.")
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false)
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
    if (!isDialogOpen) {
      resetForm()
      setIsSubmitting(false)
    }
  }, [isDialogOpen, resetForm])

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

  const shouldShowErrorCard = Boolean(error) && !isLoading && employees.length === 0

  const handleReload = useCallback(() => {
    void loadEmployees()
  }, [loadEmployees])

  const handleEmployeeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    const sanitizedName = formName.trim()
    const sanitizedEmail = formEmail.trim().toLowerCase()
    const sanitizedPhone = formPhone.trim()

    if (sanitizedName.length < 2) {
      setFormError("Ingresa un nombre válido.")
      return
    }

    if (!sanitizedEmail || !sanitizedEmail.includes("@")) {
      setFormError("Ingresa un correo válido.")
      return
    }

    if (sanitizedPhone && sanitizedPhone.length < 7) {
      setFormError("Ingresa un teléfono válido.")
      return
    }

    if (formPassword.length < 8) {
      setFormError("La contraseña debe tener al menos 8 caracteres.")
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch("/api/admin/employees", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: sanitizedName,
          email: sanitizedEmail,
          password: formPassword,
          phone: sanitizedPhone || undefined,
        }),
      })

      const data: CreateEmployeeResponse = await response.json().catch(() => ({} as CreateEmployeeResponse))

      if (!response.ok || !data.employee) {
        setFormError(data.error ?? "No se pudo crear el empleado.")
        return
      }

      setEmployees((previous) => {
        const next = previous.filter((item) => item.id !== data.employee!.id)
        next.push(data.employee!)
        return sortEmployees(next)
      })

      setError(null)
      resetForm()
      setIsDialogOpen(false)

      toast({
        title: "Empleado registrado",
        description: "El nuevo empleado ya puede gestionar citas y servicios.",
      })
    } catch (err) {
      console.error("Error creating employee", err)
      setFormError("Error de conexión con el servidor.")
    } finally {
      setIsSubmitting(false)
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

        {isLoading ? (
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
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Registrar empleado
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Registrar nuevo empleado</DialogTitle>
                  <DialogDescription>
                    Crea un usuario para un miembro del equipo. Podrá actualizar sus datos después.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleEmployeeSubmit} className="space-y-6">
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="employee-name">Nombre completo</FieldLabel>
                      <Input
                        id="employee-name"
                        value={formName}
                        onChange={(event) => {
                          setFormName(event.target.value)
                          setFormError(null)
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
                        value={formEmail}
                        onChange={(event) => {
                          setFormEmail(event.target.value)
                          setFormError(null)
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
                        value={formPhone}
                        onChange={(event) => {
                          setFormPhone(event.target.value)
                          setFormError(null)
                        }}
                        placeholder="Opcional"
                      />
                      <FieldDescription>Útil para recordatorios y contacto directo.</FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="employee-password">Contraseña temporal</FieldLabel>
                      <Input
                        id="employee-password"
                        type="password"
                        value={formPassword}
                        onChange={(event) => {
                          setFormPassword(event.target.value)
                          setFormError(null)
                        }}
                        placeholder="Mínimo 8 caracteres"
                        minLength={8}
                        required
                      />
                      <FieldDescription>Se recomienda cambiarla tras el primer inicio de sesión.</FieldDescription>
                    </Field>
                  </FieldGroup>
                  {formError && <p className="text-sm text-destructive">{formError}</p>}
                  <DialogFooter>
                    <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
                      {isSubmitting ? "Registrando..." : "Registrar empleado"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {shouldShowErrorCard ? (
            <Card>
              <CardHeader>
                <CardTitle>No pudimos cargar a los empleados</CardTitle>
                <CardDescription>Intenta nuevamente para ver la información más reciente del equipo.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <Button onClick={handleReload}>Reintentar</Button>
              </CardContent>
            </Card>
          ) : isLoading ? (
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
                <Button onClick={() => setIsDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Registrar empleado
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <>
              {error && (
                <Alert variant="destructive">
                  <AlertTitle>Error al actualizar la lista</AlertTitle>
                  <AlertDescription>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <span>{error}</span>
                      <Button variant="outline" onClick={handleReload}>
                        Reintentar
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
              <EmployeesTable employees={employees} />
            </>
          )}
        </section>
      </main>
    </div>
  )
}

function EmployeesTable({ employees }: { employees: EmployeeSummary[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Empleados registrados</CardTitle>
        <CardDescription>Actividad reciente del equipo y servicios asignados.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empleado</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Citas</TableHead>
              <TableHead className="text-right">Ingresos</TableHead>
              <TableHead>Servicios</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((employee) => {
              const servicesToShow = employee.services.slice(0, SERVICE_BADGE_LIMIT)
              const remainingServices = employee.services.length - servicesToShow.length

              return (
                <TableRow key={employee.id}>
                  <TableCell>
                    <div className="font-medium">{employee.name}</div>
                    <div className="text-xs text-muted-foreground">ID usuario: {employee.userId}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{employee.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {employee.phone ? employee.phone : "Sin teléfono"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-2">
                      <Badge variant="outline" className="w-fit capitalize">
                        {employee.status ?? "Sin estado"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Ingreso: {formatJoinedAt(employee.joinedAt)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-semibold">{formatNumber(employee.totalAppointments)}</div>
                    <div className="text-xs text-muted-foreground">
                      Próximas: {formatNumber(employee.upcomingAppointments)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Completadas: {formatNumber(employee.completedAppointments)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(employee.totalRevenue)}</TableCell>
                  <TableCell>
                    {servicesToShow.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {servicesToShow.map((service) => (
                          <Badge key={service} variant="secondary" className="capitalize">
                            {service}
                          </Badge>
                        ))}
                        {remainingServices > 0 && <Badge variant="outline">+{remainingServices}</Badge>}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Sin servicios</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
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
    <Card>
      <CardHeader className="space-y-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </CardContent>
    </Card>
  )
}
