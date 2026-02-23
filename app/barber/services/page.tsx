"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, Save, Scissors } from "lucide-react"

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

export default function BarberServicesPage() {
  const { toast } = useToast()
  const [userId, setUserId] = useState<number | null>(null)

  const [allServices, setAllServices] = useState<Service[]>([])
  const [barberServices, setBarberServices] = useState<BarberServiceState[]>([])

  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [search, setSearch] = useState("")

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
        fetch(`/api/services`, { cache: "no-store" }),
        fetch(`/api/barber/services?userId=${uid}`, { cache: "no-store" }),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const toggleService = (serviceId: number, next: boolean) => {
    setBarberServices((prev) => {
      const existing = prev.find((x) => x.serviceId === serviceId)
      if (!existing) return [...prev, { serviceId, isEnabled: next }]
      return prev.map((x) => (x.serviceId === serviceId ? { ...x, isEnabled: next } : x))
    })
  }

  const save = async () => {
    if (!userId) return
    setIsSaving(true)
    try {
      const enabledServiceIds = Array.from(enabledSet)
      const response = await fetch(`/api/barber/services`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
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
          <p className="text-muted-foreground">Selecciona los servicios que ofreces.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scissors className="h-5 w-5" />
              Mis servicios
            </CardTitle>
            <CardDescription>Activa/desactiva servicios. Solo se mostrarán al cliente los activos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label>Buscar</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ej: Corte" />
            </div>

            <Separator />

            {isLoading ? (
              <div className="space-y-2">
                <div className="h-10 w-full bg-muted animate-pulse rounded" />
                <div className="h-10 w-full bg-muted animate-pulse rounded" />
                <div className="h-10 w-full bg-muted animate-pulse rounded" />
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((service) => {
                  const checked = enabledSet.has(service.id)
                  return (
                    <div key={service.id} className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <div className="font-medium text-sm">{service.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {service.durationMin != null ? `${service.durationMin} min` : ""}
                          {service.durationMin != null && service.price != null ? " · " : ""}
                          {service.price != null ? `$${service.price}` : ""}
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

            <Button onClick={save} disabled={!userId || isSaving || isLoading} className="w-full">
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Guardar servicios
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
