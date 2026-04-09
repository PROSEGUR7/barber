"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCheck, Loader2, Save, Scissors, Sparkles, TimerReset } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/components/ui/use-toast"

type Service = {
  id: number
  name: string
  price: number | null
  durationMin: number | null
}

type BarberServiceState = {
  serviceId: number
  isEnabled: boolean
}

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
})

function formatCurrency(value: number | null) {
  if (value == null || Number.isNaN(value)) return "Sin precio"
  return currencyFormatter.format(value)
}

export default function BarberServicesPage() {
  const { toast } = useToast()
  const [userId, setUserId] = useState<number | null>(null)

  const [allServices, setAllServices] = useState<Service[]>([])
  const [barberServices, setBarberServices] = useState<BarberServiceState[]>([])

  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [search, setSearch] = useState("")

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

  const loadData = async (uid: number) => {
    setIsLoading(true)
    try {
      const [servicesRes, barberRes] = await Promise.all([
        fetch(`/api/services`, { cache: "no-store", headers: buildTenantHeaders() }),
        fetch(`/api/barber/services?userId=${uid}`, { cache: "no-store", headers: buildTenantHeaders() }),
      ])

      const servicesData = await servicesRes.json().catch(() => ({}))
      const barberData = await barberRes.json().catch(() => ({}))

      if (!servicesRes.ok) {
        toast({ title: "Error", description: servicesData.error ?? "No se pudieron cargar los servicios", variant: "destructive" })
        setAllServices([])
      } else {
        const items = Array.isArray(servicesData.services) ? (servicesData.services as any[]) : []
        setAllServices(
          items.map((s) => ({
            id: Number(s.id),
            name: String(s.name ?? "Servicio"),
            price: s.price != null && Number.isFinite(Number(s.price)) ? Number(s.price) : null,
            durationMin: s.durationMin != null && Number.isFinite(Number(s.durationMin)) ? Number(s.durationMin) : null,
          })),
        )
      }

      if (!barberRes.ok) {
        toast({ title: "Error", description: barberData.error ?? "No se pudieron cargar tus servicios", variant: "destructive" })
        setBarberServices([])
      } else {
        const items = Array.isArray(barberData.services) ? (barberData.services as any[]) : []
        setBarberServices(
          items.map((x) => ({
            serviceId: Number(x.serviceId ?? x.id),
            isEnabled: Boolean(x.isEnabled ?? x.enabled ?? true),
          })),
        )
      }
    } catch (err) {
      console.error(err)
      toast({ title: "Error", description: "Error de conexión", variant: "destructive" })
      setAllServices([])
      setBarberServices([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!userId) return
    void loadData(userId)
  }, [userId])

  const enabledSet = useMemo(() => {
    const set = new Set<number>()
    for (const item of barberServices) {
      if (item.isEnabled) set.add(item.serviceId)
    }
    return set
  }, [barberServices])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allServices
    return allServices.filter((s) => s.name.toLowerCase().includes(q))
  }, [allServices, search])

  const metrics = useMemo(() => {
    const activeCount = allServices.filter((service) => enabledSet.has(service.id)).length
    const inactiveCount = Math.max(0, allServices.length - activeCount)

    const activeServices = allServices.filter((service) => enabledSet.has(service.id))

    const avgDuration =
      activeServices.length > 0
        ? Math.round(activeServices.reduce((sum, service) => sum + (service.durationMin ?? 0), 0) / activeServices.length)
        : 0

    const avgPrice =
      activeServices.length > 0
        ? Math.round(activeServices.reduce((sum, service) => sum + (service.price ?? 0), 0) / activeServices.length)
        : 0

    const topPriced = [...activeServices]
      .filter((service) => service.price != null)
      .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))[0]

    return {
      total: allServices.length,
      activeCount,
      inactiveCount,
      avgDuration,
      avgPrice,
      topPriced,
    }
  }, [allServices, enabledSet])

  const toggleService = (serviceId: number, next: boolean) => {
    setBarberServices((prev) => {
      const existing = prev.find((x) => x.serviceId === serviceId)
      if (!existing) return [...prev, { serviceId, isEnabled: next }]
      return prev.map((x) => (x.serviceId === serviceId ? { ...x, isEnabled: next } : x))
    })
  }

  const toggleAllFiltered = (next: boolean) => {
    setBarberServices((prev) => {
      const nextMap = new Map<number, boolean>()
      for (const item of prev) nextMap.set(item.serviceId, item.isEnabled)
      for (const service of filtered) nextMap.set(service.id, next)

      return allServices.map((service) => ({
        serviceId: service.id,
        isEnabled: nextMap.get(service.id) ?? false,
      }))
    })
  }

  const save = async () => {
    if (!userId) return
    setIsSaving(true)
    try {
      const enabledServiceIds = Array.from(enabledSet)
      const response = await fetch(`/api/barber/services`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...buildTenantHeaders() },
        body: JSON.stringify({ userId, serviceIds: enabledServiceIds }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        toast({ title: "No se pudo guardar", description: data.error ?? "Intenta nuevamente", variant: "destructive" })
        return
      }
      toast({ title: "Guardado", description: "Tus servicios fueron actualizados." })
      await loadData(userId)
    } catch (err) {
      console.error(err)
      toast({ title: "Error", description: "Error de conexión", variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Servicios</h1>
          <p className="text-muted-foreground">Gestiona tu portafolio activo y su capacidad operativa.</p>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Servicios catálogo" value={String(metrics.total)} subtitle={`${metrics.activeCount} activos`} />
          <MetricCard title="Duración promedio" value={`${metrics.avgDuration} min`} subtitle="Servicios habilitados" />
          <MetricCard title="Ticket promedio" value={formatCurrency(metrics.avgPrice)} subtitle="Portafolio activo" />
          <MetricCard title="Servicio premium" value={metrics.topPriced?.name ?? "Sin datos"} subtitle={formatCurrency(metrics.topPriced?.price ?? null)} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scissors className="h-5 w-5" />
              Mis servicios
            </CardTitle>
            <CardDescription>Activa o desactiva servicios. Solo se mostrarán al cliente los activos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label>Buscar</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ej: Corte" />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => toggleAllFiltered(true)}>
                <CheckCheck className="mr-2 h-4 w-4" />
                Activar filtrados
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => toggleAllFiltered(false)}>
                <TimerReset className="mr-2 h-4 w-4" />
                Desactivar filtrados
              </Button>
              <Badge variant="secondary">{metrics.inactiveCount} inactivos</Badge>
              <Badge variant="outline">{filtered.length} visibles</Badge>
            </div>

            <Separator />

            {isLoading ? (
              <div className="space-y-2">
                <div className="h-10 w-full animate-pulse rounded bg-muted" />
                <div className="h-10 w-full animate-pulse rounded bg-muted" />
                <div className="h-10 w-full animate-pulse rounded bg-muted" />
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((service) => {
                  const checked = enabledSet.has(service.id)
                  return (
                    <div key={service.id} className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-medium">{service.name}</div>
                          {checked && (
                            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700">
                              Activo
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {service.durationMin != null ? `${service.durationMin} min` : "Duración pendiente"}
                          {service.durationMin != null && service.price != null ? " · " : ""}
                          {formatCurrency(service.price)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox checked={checked} onCheckedChange={(c) => toggleService(service.id, Boolean(c))} />
                        <span className="text-sm text-muted-foreground">Activo</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <Separator />

            <div className="rounded-md border bg-muted/20 p-3">
              <div className="mb-1.5 flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4" />
                Recomendación operativa
              </div>
              <p className="text-xs text-muted-foreground">
                Mantén activos los servicios de mayor demanda y revisa semanalmente tu ticket promedio para optimizar el portafolio.
              </p>
            </div>

            <Button onClick={save} disabled={!userId || isSaving || isLoading} className="w-full">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Guardar servicios
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

function MetricCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  )
}
