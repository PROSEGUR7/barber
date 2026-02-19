"use client"

import Link from "next/link"
import { BadgeCheck, CreditCard, History, Wallet } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { AppSidebar } from "@/components/app-sidebar"
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
} from "@/components/ui/dialog"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { useToast } from "@/components/ui/use-toast"

type WalletPaymentMethod = {
  brand: string
  lastFour: string
  expiry: string
  status: string
}

type WalletCoupon = {
  code: string
  description: string
  expires: string
  status: string
}

type WalletReceipt = {
  title: string
  subtitle: string
  actionHref: string | null
}

type WalletSummary = {
  balance: number
  subscriptionPlan: string | null
  nextChargeLabel: string | null
}

type WalletResponse = {
  paymentMethods: WalletPaymentMethod[]
  summary: WalletSummary
  receipts: WalletReceipt[]
  coupons: WalletCoupon[]
}

type PaymentMethodStatus = "Principal" | "Respaldo"

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

  const [addMethodOpen, setAddMethodOpen] = useState(false)
  const [rechargeOpen, setRechargeOpen] = useState(false)
  const [promoOpen, setPromoOpen] = useState(false)

  const [isSubmittingMethod, setIsSubmittingMethod] = useState(false)
  const [isSubmittingRecharge, setIsSubmittingRecharge] = useState(false)
  const [isSubmittingPromo, setIsSubmittingPromo] = useState(false)

  const [methodBrand, setMethodBrand] = useState("")
  const [methodLastFour, setMethodLastFour] = useState("")
  const [methodExpMonth, setMethodExpMonth] = useState("")
  const [methodExpYear, setMethodExpYear] = useState("")
  const [methodStatus, setMethodStatus] = useState<PaymentMethodStatus>("Respaldo")

  const [rechargeAmount, setRechargeAmount] = useState("")
  const [promoCode, setPromoCode] = useState("")

  const receiptsAnchorId = "wallet-history"

  const balanceLabel = useMemo(() => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0,
    }).format(wallet.summary.balance ?? 0)
  }, [wallet.summary.balance])

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
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.error ?? "No se pudo cargar el wallet")
        return
      }

      setWallet(data as WalletResponse)
    } catch (err) {
      console.error("Error loading wallet", err)
      setError("Error de conexión al cargar wallet")
    } finally {
      if (!options?.silent) {
        setIsLoading(false)
      }
    }
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem("userId")
      const parsed = raw ? Number(raw) : NaN
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
    if (!addMethodOpen) return
    setMethodBrand("")
    setMethodLastFour("")
    setMethodExpMonth("")
    setMethodExpYear("")
    setMethodStatus("Respaldo")
  }, [addMethodOpen])

  useEffect(() => {
    if (!rechargeOpen) return
    setRechargeAmount("")
  }, [rechargeOpen])

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

  const submitAddPaymentMethod = async () => {
    const uid = requireUser()
    if (!uid) return

    const brand = methodBrand.trim()
    const lastFour = methodLastFour.trim()
    const expMonth = Number(methodExpMonth)
    const expYear = Number(methodExpYear)

    if (!brand) {
      toast({ title: "Marca requerida", description: "Ingresa una marca (ej: Visa).", variant: "destructive" })
      return
    }

    if (!/^\d{4}$/.test(lastFour)) {
      toast({ title: "Últimos 4 inválidos", description: "Ingresa exactamente 4 dígitos.", variant: "destructive" })
      return
    }

    if (!Number.isInteger(expMonth) || expMonth < 1 || expMonth > 12) {
      toast({ title: "Mes inválido", description: "El mes debe estar entre 1 y 12.", variant: "destructive" })
      return
    }

    if (!Number.isInteger(expYear) || expYear < 0 || expYear > 99) {
      toast({ title: "Año inválido", description: "Usa el año en formato YY (0-99).", variant: "destructive" })
      return
    }

    setIsSubmittingMethod(true)
    try {
      const response = await fetch("/api/wallet/methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid, brand, lastFour, expMonth, expYear, status: methodStatus }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        toast({ title: "No se pudo guardar", description: data.error ?? "Intenta nuevamente.", variant: "destructive" })
        return
      }

      toast({ title: "Método guardado", description: "Se agregó tu método de pago." })
      setAddMethodOpen(false)
      await refreshWallet({ silent: true })
    } finally {
      setIsSubmittingMethod(false)
    }
  }

  const submitRecharge = async () => {
    const uid = requireUser()
    if (!uid) return

    const amount = Number(rechargeAmount.trim().replace(/[^0-9.]/g, ""))
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: "Monto inválido", description: "Ingresa un número mayor a 0.", variant: "destructive" })
      return
    }

    setIsSubmittingRecharge(true)
    try {
      const response = await fetch("/api/wallet/recharge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid, amount }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        toast({ title: "No se pudo recargar", description: data.error ?? "Intenta nuevamente.", variant: "destructive" })
        return
      }

      toast({ title: "Saldo recargado", description: "Actualizamos tu saldo." })
      setRechargeOpen(false)
      await refreshWallet({ silent: true })
    } finally {
      setIsSubmittingRecharge(false)
    }
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
        headers: { "Content-Type": "application/json" },
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
          {error ? (
            <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          ) : null}

          <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <Card className="border border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Métodos guardados</CardTitle>
                <CardDescription>Gestiona tarjetas tokenizadas para pagos rápidos y seguros.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? (
                  Array.from({ length: 2 }).map((_, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 px-4 py-3 text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <CreditCard className="text-primary h-5 w-5" />
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-44" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                      <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                  ))
                ) : wallet.paymentMethods.length ? (
                  wallet.paymentMethods.map((method) => (
                    <div
                      key={`${method.brand}-${method.lastFour}-${method.expiry}`}
                      className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 px-4 py-3 text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <CreditCard className="text-primary h-5 w-5" />
                        <div>
                          <p className="font-medium text-foreground">
                            {method.brand} ···· {method.lastFour}
                          </p>
                          <p className="text-muted-foreground">Expira {method.expiry}</p>
                        </div>
                      </div>
                      <Badge variant="secondary">{method.status}</Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No tienes métodos de pago guardados.</p>
                )}

                <Button variant="outline" className="w-full" size="sm" onClick={() => setAddMethodOpen(true)}>
                  Agregar nuevo método
                </Button>
              </CardContent>
            </Card>

            <Card className="border border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Suscripción / Wallet</CardTitle>
                <CardDescription>Consulta tu saldo, cargos recurrentes y renovaciones de membresía.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg bg-muted/60 px-4 py-3">
                  <p className="text-sm text-muted-foreground">Saldo disponible</p>
                  {isLoading ? <Skeleton className="mt-2 h-8 w-32" /> : <p className="text-2xl font-semibold">{balanceLabel}</p>}
                </div>

                <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                  <Wallet className="text-primary h-5 w-5" />
                  <div>
                    <p className="font-medium">
                      {wallet.summary.subscriptionPlan ? `Suscripción ${wallet.summary.subscriptionPlan}` : "Sin suscripción"}
                    </p>
                    <p className="text-muted-foreground">{wallet.summary.nextChargeLabel ?? ""}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" className="flex-1" onClick={() => setRechargeOpen(true)}>
                    Recargar saldo
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={handleScrollHistory}>
                    Ver historial
                  </Button>
                </div>
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
                  wallet.receipts.map((receipt) => (
                    <div key={receipt.title} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                      <div className="flex items-center gap-3">
                        <History className="text-primary h-5 w-5" />
                        <div>
                          <p className="font-medium">{receipt.title}</p>
                          <p className="text-muted-foreground">{receipt.subtitle}</p>
                        </div>
                      </div>
                      <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary" disabled={!receipt.actionHref}>
                        <Link href={receipt.actionHref ?? "#"}>Descargar</Link>
                      </Button>
                    </div>
                  ))
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

          <Dialog open={addMethodOpen} onOpenChange={setAddMethodOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Agregar método de pago</DialogTitle>
                <DialogDescription>Guarda un método para pagos rápidos (sin procesar cobros reales).</DialogDescription>
              </DialogHeader>

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="method-brand">Marca</Label>
                  <Input
                    id="method-brand"
                    value={methodBrand}
                    onChange={(event) => setMethodBrand(event.target.value)}
                    placeholder="Visa, Mastercard"
                    autoComplete="cc-type"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="method-last4">Últimos 4 dígitos</Label>
                  <Input
                    id="method-last4"
                    value={methodLastFour}
                    onChange={(event) => setMethodLastFour(event.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="1234"
                    inputMode="numeric"
                    autoComplete="cc-number"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="method-exp-month">Mes</Label>
                    <Input
                      id="method-exp-month"
                      value={methodExpMonth}
                      onChange={(event) => setMethodExpMonth(event.target.value.replace(/\D/g, "").slice(0, 2))}
                      placeholder="MM"
                      inputMode="numeric"
                      autoComplete="cc-exp-month"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="method-exp-year">Año</Label>
                    <Input
                      id="method-exp-year"
                      value={methodExpYear}
                      onChange={(event) => setMethodExpYear(event.target.value.replace(/\D/g, "").slice(0, 2))}
                      placeholder="YY"
                      inputMode="numeric"
                      autoComplete="cc-exp-year"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>Tipo</Label>
                  <Select value={methodStatus} onValueChange={(value) => setMethodStatus(value as PaymentMethodStatus)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Principal">Principal</SelectItem>
                      <SelectItem value="Respaldo">Respaldo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setAddMethodOpen(false)} disabled={isSubmittingMethod}>
                  Cancelar
                </Button>
                <Button onClick={submitAddPaymentMethod} disabled={isSubmittingMethod}>
                  {isSubmittingMethod ? "Guardando..." : "Guardar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={rechargeOpen} onOpenChange={setRechargeOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Recargar saldo</DialogTitle>
                <DialogDescription>Aumenta tu saldo interno (COP).</DialogDescription>
              </DialogHeader>

              <div className="grid gap-2">
                <Label htmlFor="recharge-amount">Monto (COP)</Label>
                <Input
                  id="recharge-amount"
                  value={rechargeAmount}
                  onChange={(event) => setRechargeAmount(event.target.value)}
                  placeholder="50000"
                  inputMode="numeric"
                />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setRechargeOpen(false)} disabled={isSubmittingRecharge}>
                  Cancelar
                </Button>
                <Button onClick={submitRecharge} disabled={isSubmittingRecharge}>
                  {isSubmittingRecharge ? "Recargando..." : "Recargar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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
