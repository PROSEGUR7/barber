"use client"

import { BadgeCheck, CalendarDays, History, Scissors } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { AppSidebar } from "@/components/app-sidebar"
import { Badge } from "@/components/ui/badge"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"

type WalletCoupon = {
  code: string
  description: string
  expires: string
  discountPercent: number
  appliesTo: string
  status: string
}

type WalletReceipt = {
  id: number
  title: string
  subtitle: string
  dateLabel: string
  amountLabel: string
  status: string
  actionHref: string | null
}

type WalletSummary = {
  balance: number
  subscriptionPlan: string | null
  nextChargeLabel: string | null
}

type WalletResponse = {
  paymentMethods: unknown[]
  summary: WalletSummary
  receipts: WalletReceipt[]
  coupons: WalletCoupon[]
}

const EMPTY_WALLET: WalletResponse = {
  paymentMethods: [],
  summary: { balance: 0, subscriptionPlan: null, nextChargeLabel: null },
  receipts: [],
  coupons: [],
}

export default function WalletPage() {
  const { toast } = useToast()
  const [userId, setUserId] = useState<number | null>(null)
  const [wallet, setWallet] = useState<WalletResponse>(EMPTY_WALLET)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [promoOpen, setPromoOpen] = useState(false)
  const [isSubmittingPromo, setIsSubmittingPromo] = useState(false)
  const [promoCode, setPromoCode] = useState("")

  const receiptsAnchorId = "wallet-history"

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

  const readTenant = (): string => {
    if (typeof window === "undefined") {
      return ""
    }
    return (localStorage.getItem("tenantSchema") ?? localStorage.getItem("userTenant") ?? "").trim()
  }

  const servicesTakenLabel = useMemo(() => {
    const count = wallet.receipts.length
    return `${count} ${count === 1 ? "servicio tomado" : "servicios tomados"}`
  }, [wallet.receipts.length])

  const refreshWallet = async (options?: { silent?: boolean }) => {
    if (!userId) {
      setWallet(EMPTY_WALLET)
      setIsLoading(false)
      return
    }

    if (!options?.silent) {
      setIsLoading(true)
    }
    setError(null)

    try {
      const response = await fetch(`/api/wallet?userId=${userId}`, {
        method: "GET",
        cache: "no-store",
        headers: buildTenantHeaders(),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.error ?? "No se pudo cargar el historial")
        return
      }

      setWallet(data as WalletResponse)
    } catch (err) {
      console.error("Error loading wallet", err)
      setError("Error de conexión al cargar historial")
    } finally {
      if (!options?.silent) {
        setIsLoading(false)
      }
    }
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem("userId")
      const parsed = raw ? Number(raw) : Number.NaN
      setUserId(Number.isFinite(parsed) ? parsed : null)
    } catch {
      setUserId(null)
    }
  }, [])

  useEffect(() => {
    void refreshWallet()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  useEffect(() => {
    if (!promoOpen) return
    setPromoCode("")
  }, [promoOpen])

  const requireUser = (): number | null => {
    if (!userId) {
      toast({
        title: "Inicia sesión nuevamente",
        description: "No encontramos tu sesión activa.",
        variant: "destructive",
      })
      return null
    }
    return userId
  }

  const handleScrollHistory = () => {
    const element = document.getElementById(receiptsAnchorId)
    element?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const submitPromo = async () => {
    const uid = requireUser()
    if (!uid) return

    const code = promoCode.trim()
    if (!code) {
      toast({ title: "Código requerido", description: "Ingresa un código promocional.", variant: "destructive" })
      return
    }

    setIsSubmittingPromo(true)
    try {
      const response = await fetch("/api/wallet/promo", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildTenantHeaders() },
        body: JSON.stringify({ userId: uid, code }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        toast({ title: "No se pudo aplicar", description: data.error ?? "Intenta nuevamente.", variant: "destructive" })
        return
      }

      toast({ title: "Código aplicado", description: "Se agregó a tus cupones." })
      setPromoOpen(false)
      await refreshWallet({ silent: true })
    } finally {
      setIsSubmittingPromo(false)
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar:duration-200">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/dashboard">Inicio</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Pagos & Wallet</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
          {error ? <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}

          <section className="grid gap-4">
            <Card className="border border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Historial de servicios</CardTitle>
                <CardDescription>Consulta los servicios que ya tomaste con fecha, estado y total pagado.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm">
                  <p className="text-muted-foreground">Resumen</p>
                  {isLoading ? <Skeleton className="mt-2 h-6 w-36" /> : <p className="mt-1 text-lg font-semibold">{servicesTakenLabel}</p>}
                </div>

                {isLoading ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="rounded-lg border border-border/60 bg-muted/40 px-4 py-3">
                      <div className="mb-2 flex items-center justify-between">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                      <Skeleton className="h-3 w-56" />
                      <Skeleton className="mt-2 h-3 w-28" />
                    </div>
                  ))
                ) : wallet.receipts.length ? (
                  wallet.receipts.map((receipt) => (
                    <div key={receipt.id} className="rounded-lg border border-border/60 bg-muted/40 px-4 py-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Scissors className="text-primary h-4 w-4" />
                          <p className="font-medium">{receipt.subtitle}</p>
                        </div>
                        <Badge variant="secondary">{receipt.status}</Badge>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-muted-foreground">
                        <p className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4" />
                          {receipt.dateLabel}
                        </p>
                        <p className="font-medium text-foreground">{receipt.amountLabel}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Aún no tienes servicios registrados en tu historial.</p>
                )}

                <Button variant="outline" size="sm" className="w-full" onClick={handleScrollHistory}>
                  Ver comprobantes y facturas
                </Button>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card className="border border-border/70 shadow-sm" id={receiptsAnchorId}>
              <CardHeader>
                <CardTitle>Comprobantes y facturas</CardTitle>
                <CardDescription>Descarga recibos por fecha, servicio o barbero.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {isLoading ? (
                  Array.from({ length: 2 }).map((_, index) => (
                    <div key={index} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                      <div className="flex items-center gap-3">
                        <History className="text-primary h-5 w-5" />
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-48" />
                        </div>
                      </div>
                      <Skeleton className="h-7 w-24" />
                    </div>
                  ))
                ) : wallet.receipts.length ? (
                  wallet.receipts.map((receipt) => {
                    const tenant = readTenant()
                    const downloadHref =
                      userId && receipt.actionHref
                        ? `${receipt.actionHref}?userId=${userId}${tenant ? `&tenant=${encodeURIComponent(tenant)}` : ""}`
                        : null
                    return (
                      <div key={receipt.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                        <div className="flex items-center gap-3">
                          <History className="text-primary h-5 w-5" />
                          <div>
                            <p className="font-medium">{receipt.title}</p>
                            <p className="text-muted-foreground">{receipt.subtitle}</p>
                          </div>
                        </div>
                        {downloadHref ? (
                          <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
                            <a href={downloadHref}>Descargar</a>
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" className="text-muted-foreground" disabled>
                            Descargar
                          </Button>
                        )}
                      </div>
                    )
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">Aún no tienes comprobantes.</p>
                )}
              </CardContent>
            </Card>

            <Card className="border border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Cupones y códigos promo</CardTitle>
                <CardDescription>Aplica beneficios antes de confirmar tu cita.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoading ? (
                  Array.from({ length: 2 }).map((_, index) => (
                    <div key={index} className="flex items-center justify-between rounded-lg border border-dashed border-border/60 bg-muted/40 px-3 py-2 text-sm">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-3 w-48" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                      <Skeleton className="h-6 w-24 rounded-full" />
                    </div>
                  ))
                ) : wallet.coupons.length ? (
                  wallet.coupons.map((voucher) => (
                    <div
                      key={voucher.code}
                      className="flex items-center justify-between rounded-lg border border-dashed border-border/60 bg-muted/40 px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium text-foreground">{voucher.code}</p>
                        <p className="text-muted-foreground">{voucher.description}</p>
                        <p className="text-xs font-medium text-foreground">Descuento: {voucher.discountPercent}%</p>
                        <p className="text-xs text-muted-foreground">{voucher.appliesTo}</p>
                        <p className="text-xs text-muted-foreground">{voucher.expires}</p>
                      </div>
                      <Badge variant="secondary" className="gap-1">
                        <BadgeCheck className="h-4 w-4" />
                        {voucher.status}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No tienes cupones disponibles.</p>
                )}

                <Button variant="outline" size="sm" className="w-full" onClick={() => setPromoOpen(true)}>
                  Agregar código promocional
                </Button>
              </CardContent>
            </Card>
          </section>

          <Dialog open={promoOpen} onOpenChange={setPromoOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Agregar código promocional</DialogTitle>
                <DialogDescription>Aplica un código válido para agregarlo a tus cupones.</DialogDescription>
              </DialogHeader>

              <div className="grid gap-2">
                <Label htmlFor="promo-code">Código</Label>
                <Input
                  id="promo-code"
                  value={promoCode}
                  onChange={(event) => setPromoCode(event.target.value)}
                  placeholder="BIENVENIDO15"
                  autoCapitalize="characters"
                />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setPromoOpen(false)} disabled={isSubmittingPromo}>
                  Cancelar
                </Button>
                <Button onClick={submitPromo} disabled={isSubmittingPromo}>
                  {isSubmittingPromo ? "Aplicando..." : "Aplicar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
