"use client"

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { Plus, Users } from "lucide-react"

import { AdminEmployeesTable } from "@/components/admin"
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
import type { EmployeeSummary } from "@/lib/admin"
import { formatCurrency, formatNumber } from "@/lib/formatters"

type EmployeesResponse = {
  employees?: EmployeeSummary[]
  error?: string
}

type CreateEmployeeResponse = EmployeesResponse & {
  employee?: EmployeeSummary
}

type EmployeeResponse = {
  employee?: EmployeeSummary
  error?: string
}

function sortEmployees(list: EmployeeSummary[]): EmployeeSummary[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
}

export default function AdminEmployeesPage() {
  const { toast } = useToast()

  const [employees, setEmployees] = useState<EmployeeSummary[]>([])
  const [areEmployeesLoading, setAreEmployeesLoading] = useState(true)
  const [employeesError, setEmployeesError] = useState<string | null>(null)

  const [isRegisterOpen, setIsRegisterOpen] = useState(false)
  const [formName, setFormName] = useState("")
  const [formEmail, setFormEmail] = useState("")
  const [formPhone, setFormPhone] = useState("")
  const [formPassword, setFormPassword] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [profileEmployee, setProfileEmployee] = useState<EmployeeSummary | null>(null)
  const [isProfileOpen, setIsProfileOpen] = useState(false)

  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<EmployeeSummary | null>(null)
  const [editName, setEditName] = useState("")
  const [editEmail, setEditEmail] = useState("")
  const [editPhone, setEditPhone] = useState("")
  const [editError, setEditError] = useState<string | null>(null)
  const [isEditSubmitting, setIsEditSubmitting] = useState(false)

  const [isDeletingEmployeeId, setIsDeletingEmployeeId] = useState<number | null>(null)

  const resetForm = useCallback(() => {
    setFormName("")
    setFormEmail("")
    setFormPhone("")
    setFormPassword("")
    setFormError(null)
  }, [])

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

  useEffect(() => {
    const controller = new AbortController()
    void loadEmployees(controller.signal)

    return () => controller.abort()
  }, [loadEmployees])

  useEffect(() => {
    if (!isRegisterOpen) {
      resetForm()
      setIsSubmitting(false)
    }
  }, [isRegisterOpen, resetForm])

  useEffect(() => {
    if (!isEditOpen) {
      setEditingEmployee(null)
      setEditName("")
      setEditEmail("")
      setEditPhone("")
      setEditError(null)
      setIsEditSubmitting(false)
    }
  }, [isEditOpen])

  const metrics = useMemo(() => {
    const totals = {
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

  const shouldShowErrorCard = Boolean(employeesError) && !areEmployeesLoading && employees.length === 0

  const handleReload = useCallback(() => {
    void loadEmployees()
  }, [loadEmployees])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
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

    if (!sanitizedPhone) {
      setFormError("Ingresa un teléfono válido.")
      return
    }

    if (sanitizedPhone.length < 7 || sanitizedPhone.length > 20) {
      setFormError("El teléfono debe tener entre 7 y 20 caracteres.")
      return
    }

    if (!/^[0-9+\-\s]+$/.test(sanitizedPhone)) {
      setFormError("El teléfono solo puede tener números y símbolos + -.")
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
          phone: sanitizedPhone,
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

      setEmployeesError(null)
      resetForm()
      setIsRegisterOpen(false)

      toast({
        title: "Empleado registrado",
        description: "El nuevo empleado ya puede gestionar citas y servicios.",
      })
    } catch (error) {
      console.error("Error creating employee", error)
      setFormError("Error de conexión con el servidor.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleViewProfile = useCallback((employee: EmployeeSummary) => {
    setProfileEmployee(employee)
    setIsProfileOpen(true)
  }, [])

  const handleOpenEdit = useCallback((employee: EmployeeSummary) => {
    setEditingEmployee(employee)
    setEditName(employee.name)
    setEditEmail(employee.email)
    setEditPhone(employee.phone ?? "")
    setEditError(null)
    setIsEditOpen(true)
  }, [])

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setEditError(null)

    if (!editingEmployee) {
      setEditError("No hay empleado seleccionado para editar.")
      return
    }

    const sanitizedName = editName.trim()
    const sanitizedEmail = editEmail.trim().toLowerCase()
    const sanitizedPhone = editPhone.trim()

    if (sanitizedName.length < 2) {
      setEditError("Ingresa un nombre válido.")
      return
    }

    if (!sanitizedEmail || !sanitizedEmail.includes("@")) {
      setEditError("Ingresa un correo válido.")
      return
    }

    if (!sanitizedPhone) {
      setEditError("Ingresa un teléfono válido.")
      return
    }

    if (sanitizedPhone.length < 7 || sanitizedPhone.length > 20) {
      setEditError("El teléfono debe tener entre 7 y 20 caracteres.")
      return
    }

    if (!/^[0-9+\-\s]+$/.test(sanitizedPhone)) {
      setEditError("El teléfono solo puede tener números y símbolos + -.")
      return
    }

    setIsEditSubmitting(true)

    try {
      const response = await fetch(`/api/admin/employees/${editingEmployee.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: sanitizedName,
          email: sanitizedEmail,
          phone: sanitizedPhone,
        }),
      })

      const data: EmployeeResponse = await response.json().catch(() => ({} as EmployeeResponse))

      if (!response.ok || !data.employee) {
        setEditError(data.error ?? "No se pudo actualizar el empleado.")
        return
      }

      setEmployees((previous) => {
        const next = previous.filter((item) => item.id !== data.employee!.id)
        next.push(data.employee!)
        return sortEmployees(next)
      })

      setEmployeesError(null)
      setIsEditOpen(false)

      if (profileEmployee?.id === data.employee.id) {
        setProfileEmployee(data.employee)
      }

      toast({
        title: "Empleado actualizado",
        description: `${data.employee.name} fue actualizado correctamente.`,
      })
    } catch (error) {
      console.error("Error updating employee", error)
      setEditError("Error de conexión con el servidor.")
    } finally {
      setIsEditSubmitting(false)
    }
  }

  const handleDeleteEmployee = useCallback(
    async (employee: EmployeeSummary) => {
      const confirmed = window.confirm(`¿Seguro que deseas eliminar a ${employee.name}?`)
      if (!confirmed) {
        return
      }

      setIsDeletingEmployeeId(employee.id)

      try {
        const response = await fetch(`/api/admin/employees/${employee.id}`, {
          method: "DELETE",
        })

        const data = (await response.json().catch(() => ({}))) as { error?: string }

        if (!response.ok) {
          toast({
            title: "No se pudo eliminar",
            description: data.error ?? "El empleado no pudo eliminarse.",
            variant: "destructive",
          })
          return
        }

        setEmployees((previous) => previous.filter((item) => item.id !== employee.id))

        if (profileEmployee?.id === employee.id) {
          setIsProfileOpen(false)
          setProfileEmployee(null)
        }

        toast({
          title: "Empleado eliminado",
          description: `${employee.name} fue eliminado del sistema.`,
        })
      } catch (error) {
        console.error("Error deleting employee", error)
        toast({
          title: "Error de conexión",
          description: "No fue posible eliminar el empleado.",
          variant: "destructive",
        })
      } finally {
        setIsDeletingEmployeeId(null)
      }
    },
    [profileEmployee?.id, toast],
  )

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto space-y-8 px-4 py-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">Gestión de empleados</h1>
          <p className="text-muted-foreground">Consulta la actividad y registra nuevos miembros del equipo.</p>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">Empleados activos</CardTitle>
              <CardDescription className="text-3xl font-bold text-foreground">
                {formatNumber(employees.length)}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">Citas totales</CardTitle>
              <CardDescription className="text-3xl font-bold text-foreground">
                {formatNumber(metrics.totalAppointments)}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">Citas próximas</CardTitle>
              <CardDescription className="text-3xl font-bold text-foreground">
                {formatNumber(metrics.upcomingAppointments)}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">Ingresos generados</CardTitle>
              <CardDescription className="text-3xl font-bold text-foreground">
                {formatCurrency(metrics.totalRevenue)}
              </CardDescription>
            </CardHeader>
          </Card>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold">Equipo registrado</h2>
              <p className="text-muted-foreground">Filtra, exporta o crea empleados desde esta sección.</p>
            </div>
            <Sheet open={isRegisterOpen} onOpenChange={setIsRegisterOpen}>
              <SheetTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Registrar empleado
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="p-0 sm:max-w-md lg:max-w-lg">
                <form onSubmit={handleSubmit} className="flex h-full flex-col">
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
                  </div>
                  <SheetFooter className="border-t px-6 py-4">
                    {formError && <p className="text-sm text-destructive">{formError}</p>}
                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                      {isSubmitting ? "Registrando..." : "Registrar empleado"}
                    </Button>
                  </SheetFooter>
                </form>
              </SheetContent>
            </Sheet>

            <Sheet open={isEditOpen} onOpenChange={setIsEditOpen}>
              <SheetContent side="right" className="p-0 sm:max-w-md lg:max-w-lg">
                <form onSubmit={handleEditSubmit} className="flex h-full flex-col">
                  <SheetHeader className="border-b px-6 py-4 text-left">
                    <SheetTitle>Editar empleado</SheetTitle>
                    <SheetDescription>Actualiza la información principal del empleado seleccionado.</SheetDescription>
                  </SheetHeader>
                  <div className="flex-1 overflow-y-auto px-6 py-4">
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="edit-employee-name">Nombre completo</FieldLabel>
                        <Input
                          id="edit-employee-name"
                          value={editName}
                          onChange={(event) => {
                            setEditName(event.target.value)
                            setEditError(null)
                          }}
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="edit-employee-email">Correo electrónico</FieldLabel>
                        <Input
                          id="edit-employee-email"
                          type="email"
                          value={editEmail}
                          onChange={(event) => {
                            setEditEmail(event.target.value)
                            setEditError(null)
                          }}
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="edit-employee-phone">Teléfono</FieldLabel>
                        <Input
                          id="edit-employee-phone"
                          type="tel"
                          value={editPhone}
                          onChange={(event) => {
                            setEditPhone(event.target.value)
                            setEditError(null)
                          }}
                          required
                        />
                      </Field>
                    </FieldGroup>
                  </div>
                  <SheetFooter className="border-t px-6 py-4">
                    {editError && <p className="text-sm text-destructive">{editError}</p>}
                    <Button type="submit" className="w-full" disabled={isEditSubmitting}>
                      {isEditSubmitting ? "Guardando cambios..." : "Guardar cambios"}
                    </Button>
                  </SheetFooter>
                </form>
              </SheetContent>
            </Sheet>

            <Sheet open={isProfileOpen} onOpenChange={setIsProfileOpen}>
              <SheetContent side="right" className="p-0 sm:max-w-md lg:max-w-lg">
                <div className="flex h-full flex-col">
                  <SheetHeader className="border-b px-6 py-4 text-left">
                    <SheetTitle>Perfil de empleado</SheetTitle>
                    <SheetDescription>Consulta la información y métricas principales del perfil.</SheetDescription>
                  </SheetHeader>
                  <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
                    <Card>
                      <CardHeader className="space-y-1">
                        <CardTitle>{profileEmployee?.name ?? "Sin nombre"}</CardTitle>
                        <CardDescription>{profileEmployee?.email ?? "Sin correo"}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm text-muted-foreground">
                        <p>Teléfono: {profileEmployee?.phone ?? "Sin teléfono"}</p>
                        <p>Estado: {profileEmployee?.status ?? "Sin estado"}</p>
                      </CardContent>
                    </Card>

                    <div className="grid gap-3 md:grid-cols-2">
                      <Card>
                        <CardHeader className="space-y-1">
                          <CardTitle className="text-sm font-medium text-muted-foreground">Citas totales</CardTitle>
                          <CardDescription className="text-2xl font-bold text-foreground">
                            {formatNumber(profileEmployee?.totalAppointments ?? 0)}
                          </CardDescription>
                        </CardHeader>
                      </Card>
                      <Card>
                        <CardHeader className="space-y-1">
                          <CardTitle className="text-sm font-medium text-muted-foreground">Ingresos</CardTitle>
                          <CardDescription className="text-2xl font-bold text-foreground">
                            {formatCurrency(profileEmployee?.totalRevenue ?? 0)}
                          </CardDescription>
                        </CardHeader>
                      </Card>
                    </div>
                  </div>
                  <SheetFooter className="border-t px-6 py-4">
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (profileEmployee) {
                          handleOpenEdit(profileEmployee)
                        }
                      }}
                    >
                      Editar empleado
                    </Button>
                  </SheetFooter>
                </div>
              </SheetContent>
            </Sheet>
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
                <Button onClick={() => setIsRegisterOpen(true)}>
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
                      <Button variant="outline" onClick={handleReload}>
                        Reintentar
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
              <AdminEmployeesTable
                employees={employees}
                onViewProfile={handleViewProfile}
                onEditEmployee={handleOpenEdit}
                onDeleteEmployee={handleDeleteEmployee}
                deletingEmployeeId={isDeletingEmployeeId}
              />
            </>
          )}
        </section>
      </main>
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
