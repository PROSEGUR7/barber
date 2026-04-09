"use client"

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { Plus, Scissors } from "lucide-react"

import { AdminServicesTable } from "@/components/admin/services-table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import type { AdminSedeSummary, ServiceSummary } from "@/lib/admin"
import { formatCurrency, formatNumber } from "@/lib/formatters"

type ServicesResponse = {
  services?: ServiceSummary[]
  error?: string
}

type ServiceResponse = {
  service?: ServiceSummary
  error?: string
}

type SedesResponse = {
  sedes?: AdminSedeSummary[]
  error?: string
}

function sortServices(list: ServiceSummary[]): ServiceSummary[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
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

export default function AdminServiciosPage() {
  const { toast } = useToast()

  const [services, setServices] = useState<ServiceSummary[]>([])
  const [areServicesLoading, setAreServicesLoading] = useState(true)
  const [servicesError, setServicesError] = useState<string | null>(null)
  const [sedesCatalog, setSedesCatalog] = useState<AdminSedeSummary[]>([])
  const [areSedesLoading, setAreSedesLoading] = useState(true)
  const [areSedesAvailable, setAreSedesAvailable] = useState(true)

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingService, setEditingService] = useState<ServiceSummary | null>(null)
  const [formName, setFormName] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formPrice, setFormPrice] = useState("")
  const [formDurationMin, setFormDurationMin] = useState("")
  const [formServiceType, setFormServiceType] = useState<"individual" | "paquete">("individual")
  const [formCategoryName, setFormCategoryName] = useState("")
  const [formSedeIds, setFormSedeIds] = useState<number[]>([])
  const [formPackageItemServiceIds, setFormPackageItemServiceIds] = useState<number[]>([])
  const [formStatus, setFormStatus] = useState<"activo" | "inactivo">("activo")
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeletingId, setIsDeletingId] = useState<number | null>(null)

  const resetForm = useCallback(() => {
    setEditingService(null)
    setFormName("")
    setFormDescription("")
    setFormPrice("")
    setFormDurationMin("")
    setFormServiceType("individual")
    setFormCategoryName("")
    setFormSedeIds([])
    setFormPackageItemServiceIds([])
    setFormStatus("activo")
    setFormError(null)
  }, [])

  const loadServices = useCallback(
    async (signal?: AbortSignal) => {
      setAreServicesLoading(true)
      setServicesError(null)

      try {
        const response = await fetch("/api/admin/services", {
          signal,
          cache: "no-store",
          headers: buildTenantHeaders(),
        })
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

  const loadSedesCatalog = useCallback(
    async (signal?: AbortSignal) => {
      setAreSedesLoading(true)

      try {
        const response = await fetch("/api/admin/sedes", {
          signal,
          cache: "no-store",
          headers: buildTenantHeaders(),
        })
        const data: SedesResponse & { code?: string } = await response.json().catch(() => ({}))

        if (!response.ok) {
          if (response.status === 409 && data.code === "SEDES_MODULE_NOT_AVAILABLE") {
            if (!signal?.aborted) {
              setAreSedesAvailable(false)
              setSedesCatalog([])
            }
            return
          }

          throw new Error(data.error ?? "No se pudieron cargar las sedes")
        }

        if (!signal?.aborted) {
          setAreSedesAvailable(true)
          setSedesCatalog(Array.isArray(data.sedes) ? data.sedes : [])
        }
      } catch (error) {
        if (signal?.aborted) {
          return
        }

        console.error("Error fetching sedes catalog", error)
        setSedesCatalog([])
      } finally {
        if (!signal?.aborted) {
          setAreSedesLoading(false)
        }
      }
    },
    [],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadServices(controller.signal)
    void loadSedesCatalog(controller.signal)

    return () => controller.abort()
  }, [loadServices, loadSedesCatalog])

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
  const activeSedeIds = useMemo(() => {
    return sedesCatalog.filter((sede) => sede.active).map((sede) => sede.id)
  }, [sedesCatalog])
  const sedesCatalogIds = useMemo(() => sedesCatalog.map((sede) => sede.id), [sedesCatalog])
  const areAllSedesSelected = useMemo(() => {
    if (sedesCatalogIds.length === 0) {
      return false
    }

    return sedesCatalogIds.every((sedeId) => formSedeIds.includes(sedeId))
  }, [formSedeIds, sedesCatalogIds])
  const hasAnySedeSelected = useMemo(() => {
    if (sedesCatalogIds.length === 0) {
      return false
    }

    return sedesCatalogIds.some((sedeId) => formSedeIds.includes(sedeId))
  }, [formSedeIds, sedesCatalogIds])

  const packageDurationMin = useMemo(() => {
    if (formServiceType !== "paquete") {
      return 0
    }

    const durationsByServiceId = new Map<number, number>(
      services
        .filter((service) => service.serviceType === "individual")
        .map((service) => [service.id, service.durationMin]),
    )

    return formPackageItemServiceIds.reduce((total, serviceId) => {
      const durationMin = durationsByServiceId.get(serviceId)
      if (!Number.isFinite(durationMin)) {
        return total
      }

      return total + Number(durationMin)
    }, 0)
  }, [formPackageItemServiceIds, formServiceType, services])

  const availableIndividualServices = useMemo(() => {
    return services
      .filter((service) => {
        if (service.serviceType === "paquete") {
          return false
        }

        if (editingService && service.id === editingService.id) {
          return false
        }

        return true
      })
      .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
  }, [editingService, services])

  const handleReload = useCallback(() => {
    void loadServices()
  }, [loadServices])

  const openCreateForm = () => {
    resetForm()
    if (activeSedeIds.length > 0) {
      setFormSedeIds(activeSedeIds)
    }
    setIsFormOpen(true)
  }

  const openEditForm = (service: ServiceSummary) => {
    setEditingService(service)
    setFormName(service.name)
    setFormDescription(service.description ?? "")
    setFormPrice(String(service.price))
    setFormDurationMin(String(service.durationMin))
    setFormServiceType(service.serviceType)
    setFormCategoryName(service.category.name ?? "")
    setFormSedeIds(service.sedeIds)
    setFormPackageItemServiceIds(service.packageItemServiceIds)
    setFormStatus(service.status?.trim().toLowerCase() === "inactivo" ? "inactivo" : "activo")
    setFormError(null)
    setIsFormOpen(true)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    const name = formName.trim()
    const description = formDescription.trim()
    const categoryName = formCategoryName.trim()
    const price = Number(formPrice.replace(",", "."))
    const providedDurationMin = Number(formDurationMin)
    const durationMin = formServiceType === "paquete" ? packageDurationMin : providedDurationMin
    const normalizedSedeIds = Array.from(
      new Set(formSedeIds.map((sedeId) => Number(sedeId)).filter((sedeId) => Number.isInteger(sedeId) && sedeId > 0)),
    )

    if (name.length < 2) {
      setFormError("Ingresa un nombre válido (mínimo 2 caracteres).")
      return
    }

    if (!Number.isFinite(price) || price < 0) {
      setFormError("Ingresa un precio válido mayor o igual a 0.")
      return
    }

    if (
      formServiceType === "individual" &&
      (!Number.isInteger(durationMin) || durationMin < 5 || durationMin > 600)
    ) {
      setFormError("La duración debe ser un número entero entre 5 y 600 minutos.")
      return
    }

    if (formServiceType === "paquete" && formPackageItemServiceIds.length === 0) {
      setFormError("Selecciona al menos un servicio individual para construir el paquete.")
      return
    }

    if (formServiceType === "paquete" && (!Number.isInteger(durationMin) || durationMin <= 0)) {
      setFormError("La duración del paquete se calcula con la suma de los servicios seleccionados.")
      return
    }

    if (areSedesAvailable && !areSedesLoading && sedesCatalog.length > 0 && normalizedSedeIds.length === 0) {
      setFormError("Selecciona al menos una sede para este servicio.")
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
          ...buildTenantHeaders(),
        },
        body: JSON.stringify({
          name,
          description: description.length > 0 ? description : null,
          price,
          durationMin,
          serviceType: formServiceType,
          categoryName: categoryName.length > 0 ? categoryName : null,
          packageItemServiceIds: formServiceType === "paquete" ? formPackageItemServiceIds : [],
          sedeIds: areSedesAvailable && !areSedesLoading && sedesCatalog.length > 0 ? normalizedSedeIds : undefined,
          status: formStatus,
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
        headers: buildTenantHeaders(),
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
        <section className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-4">
          <CompactMetricCard title="Servicios totales" value={formatNumber(services.length)} />
          <CompactMetricCard title="Servicios activos" value={formatNumber(metrics.active)} />
          <CompactMetricCard title="Precio promedio" value={formatCurrency(metrics.averagePrice)} className="col-span-2 xl:col-span-1" />
          <CompactMetricCard title="Duración promedio" value={`${formatNumber(Math.round(metrics.averageDuration))} min`} className="col-span-2 xl:col-span-1" />
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
                        <FieldLabel htmlFor="service-type">Tipo de servicio</FieldLabel>
                        <Select
                          value={formServiceType}
                          onValueChange={(value: "individual" | "paquete") => {
                            setFormServiceType(value)
                            if (value === "individual") {
                              setFormPackageItemServiceIds([])
                            }
                            setFormError(null)
                          }}
                        >
                          <SelectTrigger id="service-type">
                            <SelectValue placeholder="Selecciona el tipo" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="individual">Servicio individual</SelectItem>
                            <SelectItem value="paquete">Paquete</SelectItem>
                          </SelectContent>
                        </Select>
                        <FieldDescription>
                          Los paquetes se componen de servicios individuales y pueden tener precio propio.
                        </FieldDescription>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="service-category">Categoría</FieldLabel>
                        <Input
                          id="service-category"
                          value={formCategoryName}
                          onChange={(event) => {
                            setFormCategoryName(event.target.value)
                            setFormError(null)
                          }}
                          placeholder="Ej. Barbería premium, Masajes, Facial"
                        />
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
                      {formServiceType === "individual" && (
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
                      )}
                      {formServiceType === "paquete" && (
                        <>
                          <Field>
                            <FieldLabel>Servicios incluidos en el paquete</FieldLabel>
                            <div className="max-h-60 space-y-2 overflow-y-auto rounded-md border border-border/60 p-3">
                              {availableIndividualServices.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  No hay servicios individuales disponibles para agregar al paquete.
                                </p>
                              ) : (
                                availableIndividualServices.map((service) => {
                                  const checked = formPackageItemServiceIds.includes(service.id)

                                  return (
                                    <label
                                      key={service.id}
                                      className="flex cursor-pointer items-start gap-3 rounded-md border border-transparent px-2 py-1 hover:border-border/60 hover:bg-muted/40"
                                    >
                                      <Checkbox
                                        checked={checked}
                                        onCheckedChange={(value) => {
                                          const isChecked = value === true

                                          setFormPackageItemServiceIds((current) => {
                                            if (isChecked) {
                                              return [...new Set([...current, service.id])]
                                            }

                                            return current.filter((itemId) => itemId !== service.id)
                                          })
                                          setFormError(null)
                                        }}
                                      />
                                      <span className="text-sm">
                                        <span className="font-medium">{service.name}</span>
                                        <span className="ml-2 text-muted-foreground">
                                          {formatCurrency(service.price)} · {formatNumber(service.durationMin)} min
                                        </span>
                                      </span>
                                    </label>
                                  )
                                })
                              )}
                            </div>
                            <FieldDescription>
                              Puedes ajustar el precio del paquete libremente sin alterar los servicios individuales.
                            </FieldDescription>
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="service-duration-package">Duración total del paquete</FieldLabel>
                            <Input
                              id="service-duration-package"
                              type="number"
                              value={Number.isFinite(packageDurationMin) ? packageDurationMin : 0}
                              readOnly
                              aria-readonly="true"
                              className="cursor-not-allowed border-muted-foreground/25 bg-muted text-muted-foreground"
                            />
                            <FieldDescription>
                              Este valor se calcula automáticamente con los servicios incluidos.
                            </FieldDescription>
                          </Field>
                        </>
                      )}
                      {areSedesAvailable && (
                        <Field>
                          <FieldLabel>Sedes donde estará disponible</FieldLabel>
                          <div className="mb-2 flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={areSedesLoading || sedesCatalog.length === 0 || areAllSedesSelected}
                              onClick={() => {
                                setFormSedeIds(sedesCatalogIds)
                                setFormError(null)
                              }}
                            >
                              Seleccionar todas
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={areSedesLoading || sedesCatalog.length === 0 || !hasAnySedeSelected}
                              onClick={() => {
                                setFormSedeIds([])
                                setFormError(null)
                              }}
                            >
                              Deseleccionar todas
                            </Button>
                          </div>
                          <div className="max-h-52 space-y-2 overflow-y-auto rounded-md border border-border/60 p-3">
                            {areSedesLoading ? (
                              <p className="text-sm text-muted-foreground">Cargando sedes...</p>
                            ) : sedesCatalog.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                No hay sedes registradas. Guarda la sede primero para asociar servicios.
                              </p>
                            ) : (
                              sedesCatalog.map((sede) => {
                                const checked = formSedeIds.includes(sede.id)

                                return (
                                  <label
                                    key={sede.id}
                                    className="flex cursor-pointer items-start gap-3 rounded-md border border-transparent px-2 py-1 hover:border-border/60 hover:bg-muted/40"
                                  >
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={(value) => {
                                        const isChecked = value === true

                                        setFormSedeIds((current) => {
                                          if (isChecked) {
                                            return [...new Set([...current, sede.id])]
                                          }

                                          return current.filter((sedeId) => sedeId !== sede.id)
                                        })
                                        setFormError(null)
                                      }}
                                    />
                                    <span className="text-sm">
                                      <span className="font-medium">{sede.name}</span>
                                      {!sede.active && <span className="ml-2 text-muted-foreground">(inactiva)</span>}
                                    </span>
                                  </label>
                                )
                              })
                            )}
                          </div>
                          <FieldDescription>
                            El servicio solo estará visible para reservas en las sedes seleccionadas.
                          </FieldDescription>
                        </Field>
                      )}
                      {!areSedesAvailable && (
                        <Field>
                          <FieldLabel>Sedes</FieldLabel>
                          <FieldDescription>
                            El módulo de sedes no está habilitado en este tenant. El servicio quedará disponible de forma general.
                          </FieldDescription>
                        </Field>
                      )}
                      <Field>
                        <FieldLabel htmlFor="service-status">Estado</FieldLabel>
                        <Select
                          value={formStatus}
                          onValueChange={(value: "activo" | "inactivo") => {
                            setFormStatus(value)
                            setFormError(null)
                          }}
                        >
                          <SelectTrigger id="service-status">
                            <SelectValue placeholder="Selecciona el estado" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="activo">Activo</SelectItem>
                            <SelectItem value="inactivo">Inactivo</SelectItem>
                          </SelectContent>
                        </Select>
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

              <AdminServicesTable
                services={services}
                onEditService={openEditForm}
                onDeleteService={(service) => void handleDelete(service)}
                deletingServiceId={isDeletingId}
              />
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
