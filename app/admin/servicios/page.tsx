"use client"

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { MoreHorizontal, Plus, Scissors } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import type { ServiceSummary } from "@/lib/admin"
import { formatCurrency, formatNumber } from "@/lib/formatters"

type ServicesResponse = {
  services?: ServiceSummary[]
  error?: string
}

type ServiceResponse = {
  service?: ServiceSummary
  error?: string
}

function sortServices(list: ServiceSummary[]): ServiceSummary[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
}

function normalizeStatus(status: string | null): { value: string; label: string } {
  const value = status?.trim().toLowerCase() ?? "sin-estado"

  if (value === "activo") {
    return { value, label: "Activo" }
  }

  if (value === "inactivo") {
    return { value, label: "Inactivo" }
  }

  if (value === "sin-estado") {
    return { value, label: "Sin estado" }
  }

  return { value, label: status ?? "Sin estado" }
}

function getStatusVariant(status: string | null): "default" | "secondary" | "outline" {
  const normalized = status?.trim().toLowerCase()

  if (normalized === "activo") {
    return "default"
  }

  if (normalized === "inactivo") {
    return "secondary"
  }

  return "outline"
}

export default function AdminServiciosPage() {
  const { toast } = useToast()

  const [services, setServices] = useState<ServiceSummary[]>([])
  const [areServicesLoading, setAreServicesLoading] = useState(true)
  const [servicesError, setServicesError] = useState<string | null>(null)

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingService, setEditingService] = useState<ServiceSummary | null>(null)
  const [formName, setFormName] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formPrice, setFormPrice] = useState("")
  const [formDurationMin, setFormDurationMin] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeletingId, setIsDeletingId] = useState<number | null>(null)

  const resetForm = useCallback(() => {
    setEditingService(null)
    setFormName("")
    setFormDescription("")
    setFormPrice("")
    setFormDurationMin("")
    setFormError(null)
  }, [])

  const loadServices = useCallback(
    async (signal?: AbortSignal) => {
      setAreServicesLoading(true)
      setServicesError(null)

      try {
        const response = await fetch("/api/admin/services", { signal, cache: "no-store" })
        const data: ServicesResponse = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(data.error ?? "No se pudieron cargar los servicios")
        }

        if (!signal?.aborted) {
          const list = Array.isArray(data.services) ? data.services : []
          setServices(sortServices(list))
        }
      } catch (error) {
        if (signal?.aborted) {
          return
        }

        console.error("Error fetching services", error)
        setServicesError("No se pudieron cargar los servicios.")
      } finally {
        if (!signal?.aborted) {
          setAreServicesLoading(false)
        }
      }
    },
    [],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadServices(controller.signal)

    return () => controller.abort()
  }, [loadServices])

  useEffect(() => {
    if (!isFormOpen) {
      resetForm()
      setIsSubmitting(false)
    }
  }, [isFormOpen, resetForm])

  const metrics = useMemo(() => {
    const totals = {
      active: 0,
      inactive: 0,
      averagePrice: 0,
      averageDuration: 0,
      totalPrice: 0,
      totalDuration: 0,
    }

    for (const service of services) {
      const normalizedStatus = service.status?.trim().toLowerCase()

      if (normalizedStatus === "activo") {
        totals.active += 1
      } else if (normalizedStatus === "inactivo") {
        totals.inactive += 1
      }

      totals.totalPrice += service.price
      totals.totalDuration += service.durationMin
    }

    if (services.length > 0) {
      totals.averagePrice = totals.totalPrice / services.length
      totals.averageDuration = totals.totalDuration / services.length
    }

    return totals
  }, [services])

  const shouldShowErrorCard = Boolean(servicesError) && !areServicesLoading && services.length === 0

  const handleReload = useCallback(() => {
    void loadServices()
  }, [loadServices])

  const openCreateForm = () => {
    resetForm()
    setIsFormOpen(true)
  }

  const openEditForm = (service: ServiceSummary) => {
    setEditingService(service)
    setFormName(service.name)
    setFormDescription(service.description ?? "")
    setFormPrice(String(service.price))
    setFormDurationMin(String(service.durationMin))
    setFormError(null)
    setIsFormOpen(true)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    const name = formName.trim()
    const description = formDescription.trim()
    const price = Number(formPrice.replace(",", "."))
    const durationMin = Number(formDurationMin)

    if (name.length < 2) {
      setFormError("Ingresa un nombre válido (mínimo 2 caracteres).")
      return
    }

    if (!Number.isFinite(price) || price < 0) {
      setFormError("Ingresa un precio válido mayor o igual a 0.")
      return
    }

    if (!Number.isInteger(durationMin) || durationMin < 5 || durationMin > 600) {
      setFormError("La duración debe ser un número entero entre 5 y 600 minutos.")
      return
    }

    setIsSubmitting(true)

    try {
      const isEditing = Boolean(editingService)
      const endpoint = isEditing ? `/api/admin/services/${editingService!.id}` : "/api/admin/services"
      const method = isEditing ? "PATCH" : "POST"

      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description: description.length > 0 ? description : null,
          price,
          durationMin,
        }),
      })

      const data: ServiceResponse = await response.json().catch(() => ({} as ServiceResponse))

      if (!response.ok || !data.service) {
        setFormError(data.error ?? "No se pudo guardar el servicio.")
        return
      }

      setServices((previous) => {
        const next = previous.filter((item) => item.id !== data.service!.id)
        next.push(data.service!)
        return sortServices(next)
      })

      setServicesError(null)
      setIsFormOpen(false)

      toast({
        title: isEditing ? "Servicio actualizado" : "Servicio creado",
        description: `${data.service.name} ya está disponible en el catálogo de administración.`,
      })
    } catch (error) {
      console.error("Error saving service", error)
      setFormError("Error de conexión con el servidor.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (service: ServiceSummary) => {
    setIsDeletingId(service.id)

    try {
      const response = await fetch(`/api/admin/services/${service.id}`, {
        method: "DELETE",
      })

      const data = (await response.json().catch(() => ({}))) as { error?: string }

      if (!response.ok) {
        toast({
          title: "No se pudo eliminar",
          description: data.error ?? "El servicio no pudo eliminarse.",
          variant: "destructive",
        })
        return
      }

      setServices((previous) => previous.filter((item) => item.id !== service.id))
      toast({
        title: "Servicio eliminado",
        description: `${service.name} fue eliminado del catálogo.`,
      })
    } catch (error) {
      console.error("Error deleting service", error)
      toast({
        title: "Error de conexión",
        description: "No fue posible eliminar el servicio.",
        variant: "destructive",
      })
    } finally {
      setIsDeletingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto space-y-8 px-4 py-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">Servicios</h1>
          <p className="text-muted-foreground">
            Administra el catálogo de servicios, precios y duraciones ofrecidas por la barbería.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">Servicios totales</CardTitle>
              <CardDescription className="text-3xl font-bold text-foreground">
                {formatNumber(services.length)}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">Servicios activos</CardTitle>
              <CardDescription className="text-3xl font-bold text-foreground">
                {formatNumber(metrics.active)}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">Precio promedio</CardTitle>
              <CardDescription className="text-3xl font-bold text-foreground">
                {formatCurrency(metrics.averagePrice)}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">Duración promedio</CardTitle>
              <CardDescription className="text-3xl font-bold text-foreground">
                {formatNumber(Math.round(metrics.averageDuration))} min
              </CardDescription>
            </CardHeader>
          </Card>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold">Catálogo de servicios</h2>
              <p className="text-muted-foreground">Crea, edita y elimina servicios desde esta sección.</p>
            </div>
            <Sheet open={isFormOpen} onOpenChange={setIsFormOpen}>
              <SheetTrigger asChild>
                <Button onClick={openCreateForm}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nuevo servicio
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="p-0 sm:max-w-md lg:max-w-lg">
                <form onSubmit={handleSubmit} className="flex h-full flex-col">
                  <SheetHeader className="border-b px-6 py-4 text-left">
                    <SheetTitle>{editingService ? "Editar servicio" : "Crear nuevo servicio"}</SheetTitle>
                    <SheetDescription>
                      Define nombre, precio y duración para mantener actualizado el catálogo.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="flex-1 overflow-y-auto px-6 py-4">
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="service-name">Nombre</FieldLabel>
                        <Input
                          id="service-name"
                          value={formName}
                          onChange={(event) => {
                            setFormName(event.target.value)
                            setFormError(null)
                          }}
                          placeholder="Ej. Corte clásico"
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="service-description">Descripción</FieldLabel>
                        <Textarea
                          id="service-description"
                          value={formDescription}
                          onChange={(event) => {
                            setFormDescription(event.target.value)
                            setFormError(null)
                          }}
                          placeholder="Describe en qué consiste este servicio"
                          rows={4}
                        />
                        <FieldDescription>Opcional. Puedes detallar beneficios o alcance.</FieldDescription>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="service-price">Precio</FieldLabel>
                        <Input
                          id="service-price"
                          type="number"
                          min={0}
                          step={0.01}
                          value={formPrice}
                          onChange={(event) => {
                            setFormPrice(event.target.value)
                            setFormError(null)
                          }}
                          placeholder="Ej. 25000"
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="service-duration">Duración (minutos)</FieldLabel>
                        <Input
                          id="service-duration"
                          type="number"
                          min={5}
                          max={600}
                          step={1}
                          value={formDurationMin}
                          onChange={(event) => {
                            setFormDurationMin(event.target.value)
                            setFormError(null)
                          }}
                          placeholder="Ej. 45"
                          required
                        />
                      </Field>
                    </FieldGroup>
                  </div>
                  <SheetFooter className="border-t px-6 py-4">
                    {formError && <p className="text-sm text-destructive">{formError}</p>}
                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                      {isSubmitting ? "Guardando..." : editingService ? "Actualizar servicio" : "Crear servicio"}
                    </Button>
                  </SheetFooter>
                </form>
              </SheetContent>
            </Sheet>
          </div>

          {shouldShowErrorCard ? (
            <Card>
              <CardHeader>
                <CardTitle>No pudimos cargar el catálogo</CardTitle>
                <CardDescription>Intenta nuevamente para obtener la información más reciente.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleReload}>Reintentar</Button>
              </CardContent>
            </Card>
          ) : areServicesLoading ? (
            <ServicesTableSkeleton />
          ) : services.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Scissors className="h-5 w-5" />
                </EmptyMedia>
                <EmptyTitle>Sin servicios registrados</EmptyTitle>
                <EmptyDescription>Crea el primer servicio para habilitar reservas en el sistema.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={openCreateForm}>
                  <Plus className="mr-2 h-4 w-4" />
                  Crear servicio
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <>
              {servicesError && (
                <Alert variant="destructive">
                  <AlertTitle>Error al actualizar el catálogo</AlertTitle>
                  <AlertDescription>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <span>{servicesError}</span>
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
                        <TableHead>Servicio</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead className="text-right">Precio</TableHead>
                        <TableHead className="text-right">Duración</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {services.map((service) => (
                        <TableRow key={service.id}>
                          <TableCell className="font-medium">{service.name}</TableCell>
                          <TableCell className="max-w-md text-muted-foreground">
                            {service.description?.trim() || "Sin descripción"}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(service.price)}</TableCell>
                          <TableCell className="text-right">{formatNumber(service.durationMin)} min</TableCell>
                          <TableCell>
                            <Badge variant={getStatusVariant(service.status)}>{normalizeStatus(service.status).label}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm" className="hover:bg-accent/60" aria-label="Acciones">
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem onClick={() => openEditForm(service)}>Editar</DropdownMenuItem>
                                <DropdownMenuItem
                                  variant="destructive"
                                  disabled={isDeletingId === service.id}
                                  onClick={() => void handleDelete(service)}
                                >
                                  {isDeletingId === service.id ? "Eliminando..." : "Eliminar"}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </section>
      </main>
    </div>
  )
}

function ServicesTableSkeleton() {
  return (
    <Card>
      <CardHeader className="space-y-2">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-4 w-72" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  )
}
