"use client"

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { Plus, UserCircle } from "lucide-react"

import { AdminClientsTable } from "@/components/admin"
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
import type { ClientSummary } from "@/lib/admin"
import { formatCurrency, formatNumber } from "@/lib/formatters"

type ClientsResponse = {
  clients?: ClientSummary[]
  error?: string
}

type CreateClientResponse = ClientsResponse & {
  client?: ClientSummary
}

function sortClients(list: ClientSummary[]): ClientSummary[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
}

export default function AdminClientsPage() {
  const { toast } = useToast()

  const [clients, setClients] = useState<ClientSummary[]>([])
  const [areClientsLoading, setAreClientsLoading] = useState(true)
  const [clientsError, setClientsError] = useState<string | null>(null)

  const [isRegisterOpen, setIsRegisterOpen] = useState(false)
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
    void loadClients(controller.signal)

    return () => controller.abort()
  }, [loadClients])

  useEffect(() => {
    if (!isRegisterOpen) {
      resetForm()
      setIsSubmitting(false)
    }
  }, [isRegisterOpen, resetForm])

  const metrics = useMemo(() => {
    const totals = {
      totalAppointments: 0,
      upcomingAppointments: 0,
      completedAppointments: 0,
      totalSpent: 0,
    }

    for (const client of clients) {
      totals.totalAppointments += client.totalAppointments
      totals.upcomingAppointments += client.upcomingAppointments
      totals.completedAppointments += client.completedAppointments
      totals.totalSpent += client.totalSpent
    }

    return totals
  }, [clients])

  const shouldShowErrorCard = Boolean(clientsError) && !areClientsLoading && clients.length === 0

  const handleReload = useCallback(() => {
    void loadClients()
  }, [loadClients])

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
      const response = await fetch("/api/admin/clients", {
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

      const data: CreateClientResponse = await response.json().catch(() => ({} as CreateClientResponse))

      if (!response.ok || !data.client) {
        setFormError(data.error ?? "No se pudo crear el cliente.")
        return
      }

      setClients((previous) => {
        const next = previous.filter((item) => item.id !== data.client!.id)
        next.push(data.client!)
        return sortClients(next)
      })

      setClientsError(null)
      resetForm()
      setIsRegisterOpen(false)

      toast({
        title: "Cliente registrado",
        description: "El nuevo cliente ya puede gestionar sus reservas.",
      })
    } catch (error) {
      console.error("Error creating client", error)
      setFormError("Error de conexión con el servidor.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto space-y-8 px-4 py-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">Gestión de clientes</h1>
          <p className="text-muted-foreground">Revisa historial, clasificaciones y registra nuevos clientes.</p>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">Clientes registrados</CardTitle>
              <CardDescription className="text-3xl font-bold text-foreground">
                {formatNumber(clients.length)}
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
              <CardTitle className="text-sm font-medium text-muted-foreground">Monto invertido</CardTitle>
              <CardDescription className="text-3xl font-bold text-foreground">
                {formatCurrency(metrics.totalSpent)}
              </CardDescription>
            </CardHeader>
          </Card>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold">Clientes en la plataforma</h2>
              <p className="text-muted-foreground">Filtra, exporta o genera nuevos accesos desde aquí.</p>
            </div>
            <Sheet open={isRegisterOpen} onOpenChange={setIsRegisterOpen}>
              <SheetTrigger asChild>
                <Button variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  Registrar cliente
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="p-0 sm:max-w-md lg:max-w-lg">
                <form onSubmit={handleSubmit} className="flex h-full flex-col">
                  <SheetHeader className="border-b px-6 py-4 text-left">
                    <SheetTitle>Registrar nuevo cliente</SheetTitle>
                    <SheetDescription>
                      Crea un acceso para un cliente. Podrá actualizar sus datos después.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="flex-1 overflow-y-auto px-6 py-4">
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="client-name">Nombre completo</FieldLabel>
                        <Input
                          id="client-name"
                          value={formName}
                          onChange={(event) => {
                            setFormName(event.target.value)
                            setFormError(null)
                          }}
                          placeholder="Ej. Andrea Gómez"
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="client-email">Correo electrónico</FieldLabel>
                        <Input
                          id="client-email"
                          type="email"
                          value={formEmail}
                          onChange={(event) => {
                            setFormEmail(event.target.value)
                            setFormError(null)
                          }}
                          placeholder="cliente@correo.com"
                          required
                        />
                        <FieldDescription>El cliente usará este correo para iniciar sesión.</FieldDescription>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="client-phone">Teléfono</FieldLabel>
                        <Input
                          id="client-phone"
                          type="tel"
                          value={formPhone}
                          onChange={(event) => {
                            setFormPhone(event.target.value)
                            setFormError(null)
                          }}
                          placeholder="Ej. 3109876543"
                          required
                        />
                        <FieldDescription>Solo números, espacios o símbolos + - (mínimo 7 caracteres).</FieldDescription>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="client-password">Contraseña temporal</FieldLabel>
                        <Input
                          id="client-password"
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
                      {isSubmitting ? "Registrando..." : "Registrar cliente"}
                    </Button>
                  </SheetFooter>
                </form>
              </SheetContent>
            </Sheet>
          </div>

          {shouldShowErrorCard ? (
            <Card>
              <CardHeader>
                <CardTitle>No pudimos cargar a los clientes</CardTitle>
                <CardDescription>Intenta nuevamente para obtener la lista actualizada de clientes.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <Button onClick={handleReload}>Reintentar</Button>
              </CardContent>
            </Card>
          ) : areClientsLoading ? (
            <ClientsTableSkeleton />
          ) : clients.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UserCircle className="h-5 w-5" />
                </EmptyMedia>
                <EmptyTitle>Sin clientes registrados</EmptyTitle>
                <EmptyDescription>Registra el primer cliente para gestionar reservas y seguimientos.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => setIsRegisterOpen(true)} variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  Registrar cliente
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <>
              {clientsError && (
                <Alert variant="destructive">
                  <AlertTitle>Error al actualizar la lista</AlertTitle>
                  <AlertDescription>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <span>{clientsError}</span>
                      <Button variant="outline" onClick={handleReload}>
                        Reintentar
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
              <AdminClientsTable clients={clients} />
            </>
          )}
        </section>
      </main>
    </div>
  )
}

function ClientsTableSkeleton() {
  return (
    <Card className="border-border/60 bg-gradient-to-b from-background/80 via-background to-background/95">
      <CardHeader className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-9 w-full sm:w-64" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-28" />
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
