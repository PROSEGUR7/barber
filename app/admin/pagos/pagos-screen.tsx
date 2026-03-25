"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { BadgeDollarSign, Gift, Receipt, WalletCards } from "lucide-react"

import { AdminPaymentsTable, type AdminBillingPaymentSummary } from "@/components/admin/payments-table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { formatCurrency, formatNumber } from "@/lib/formatters"
import { cn } from "@/lib/utils"

type PaymentsResponse = {
  payments?: AdminBillingPaymentSummary[]
  error?: string
}

type GiftCardSummary = {
  id: number
  code: string
  clientId: number | null
  clientName: string | null
  balance: number
  initialAmount: number
  currency: string
  status: string
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  lastMovementAt: string | null
}

type GiftCardMovement = {
  id: number
  giftCardId: number
  giftCardCode: string
  movementType: "issue" | "topup" | "redeem" | "adjustment"
  amount: number
  reference: string | null
  note: string | null
  createdBy: string | null
  createdAt: string
}

type GiftCardsResponse = {
  cards?: GiftCardSummary[]
  movements?: GiftCardMovement[]
  error?: string
}

type ClientOption = {
  id: number
  name: string
}

type ClientsResponse = {
  clients?: Array<{
    id: number
    name: string
  }>
  error?: string
}

type PaymentMethodOption = "cash" | "gift_card" | "wompi"

const METHOD_OPTIONS: Array<{
  value: PaymentMethodOption
  label: string
  description: string
  icon: typeof BadgeDollarSign
  disabled?: boolean
}> = [
  {
    value: "cash",
    label: "Efectivo",
    description: "Cobro directo en caja",
    icon: BadgeDollarSign,
  },
  {
    value: "gift_card",
    label: "Tarjeta regalo",
    description: "Emitir, recargar y redimir",
    icon: Gift,
  },
  {
    value: "wompi",
    label: "Otros (Wompi)",
    description: "Pagos digitales",
    icon: WalletCards,
  },
]

function isPaidStatus(status: string | null): boolean {
  const normalized = status?.trim().toLowerCase() ?? ""

  return (
    normalized.includes("pag") ||
    normalized.includes("aprob") ||
    normalized.includes("complet") ||
    normalized.includes("final") ||
    normalized.includes("paid") ||
    normalized.includes("success")
  )
}

function sortPayments(list: AdminBillingPaymentSummary[]): AdminBillingPaymentSummary[] {
  return [...list].sort((a, b) => {
    const aDate = a.paidAt ? new Date(a.paidAt).getTime() : a.createdAt ? new Date(a.createdAt).getTime() : 0
    const bDate = b.paidAt ? new Date(b.paidAt).getTime() : b.createdAt ? new Date(b.createdAt).getTime() : 0

    if (aDate === bDate) {
      return b.paymentId - a.paymentId
    }

    return bDate - aDate
  })
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

export default function AdminPagosPage() {
  const [payments, setPayments] = useState<AdminBillingPaymentSummary[]>([])
  const [arePaymentsLoading, setArePaymentsLoading] = useState(true)
  const [paymentsError, setPaymentsError] = useState<string | null>(null)
  const [tenantSchema, setTenantSchema] = useState<string | null>(null)
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodOption>("wompi")
  const [giftCards, setGiftCards] = useState<GiftCardSummary[]>([])
  const [giftCardMovements, setGiftCardMovements] = useState<GiftCardMovement[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [isGiftCardsLoading, setIsGiftCardsLoading] = useState(false)
  const [isGiftActionLoading, setIsGiftActionLoading] = useState(false)
  const [giftCardsError, setGiftCardsError] = useState<string | null>(null)

  const [newGiftClientId, setNewGiftClientId] = useState<string>("none")
  const [newGiftCode, setNewGiftCode] = useState("")
  const [newGiftAmount, setNewGiftAmount] = useState("")
  const [newGiftExpireAt, setNewGiftExpireAt] = useState("")
  const [newGiftNote, setNewGiftNote] = useState("")

  const [selectedGiftCardId, setSelectedGiftCardId] = useState<string>("none")
  const [topupAmount, setTopupAmount] = useState("")
  const [redeemAmount, setRedeemAmount] = useState("")
  const [giftMovementNote, setGiftMovementNote] = useState("")

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const stored = localStorage.getItem("tenantSchema") ?? localStorage.getItem("userTenant")
    setTenantSchema(stored?.trim() || null)
  }, [])

  const loadPayments = useCallback(
    async (signal?: AbortSignal) => {
      setArePaymentsLoading(true)
      setPaymentsError(null)

      try {
        const query = new URLSearchParams()
        if (tenantSchema) {
          query.set("tenant", tenantSchema)
        }

        const response = await fetch(`/api/admin/payments${query.toString() ? `?${query.toString()}` : ""}`, {
          signal,
          cache: "no-store",
          headers: buildTenantHeaders(),
        })
        const data: PaymentsResponse = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(data.error ?? "No se pudieron cargar los pagos")
        }

        if (!signal?.aborted) {
          const list = Array.isArray(data.payments) ? data.payments : []
          setPayments(sortPayments(list))
        }
      } catch (error) {
        if (signal?.aborted) {
          return
        }

        console.error("Error fetching admin payments", error)
        setPaymentsError("No se pudieron cargar los pagos.")
      } finally {
        if (!signal?.aborted) {
          setArePaymentsLoading(false)
        }
      }
    },
    [tenantSchema],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadPayments(controller.signal)

    return () => controller.abort()
  }, [loadPayments])

  const loadGiftCards = useCallback(
    async (signal?: AbortSignal) => {
      setIsGiftCardsLoading(true)
      setGiftCardsError(null)

      try {
        const query = new URLSearchParams()
        if (tenantSchema) {
          query.set("tenant", tenantSchema)
        }

        const response = await fetch(`/api/admin/gift-cards${query.toString() ? `?${query.toString()}` : ""}`, {
          signal,
          cache: "no-store",
          headers: buildTenantHeaders(),
        })
        const data: GiftCardsResponse = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(data.error ?? "No se pudieron cargar las tarjetas regalo")
        }

        if (!signal?.aborted) {
          setGiftCards(Array.isArray(data.cards) ? data.cards : [])
          setGiftCardMovements(Array.isArray(data.movements) ? data.movements : [])
        }
      } catch (error) {
        if (signal?.aborted) {
          return
        }

        console.error("Error fetching gift cards", error)
        setGiftCardsError("No se pudieron cargar las tarjetas regalo.")
      } finally {
        if (!signal?.aborted) {
          setIsGiftCardsLoading(false)
        }
      }
    },
    [tenantSchema],
  )

  const loadClients = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const query = new URLSearchParams()
        if (tenantSchema) {
          query.set("tenant", tenantSchema)
        }

        const response = await fetch(`/api/admin/clients${query.toString() ? `?${query.toString()}` : ""}`, {
          signal,
          cache: "no-store",
          headers: buildTenantHeaders(),
        })
        const data: ClientsResponse = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(data.error ?? "No se pudieron cargar los clientes")
        }

        if (!signal?.aborted) {
          const list = Array.isArray(data.clients)
            ? data.clients
                .map((client) => ({ id: client.id, name: client.name }))
                .filter((client) => Number.isFinite(client.id) && client.name.trim().length > 0)
            : []
          setClients(list)
        }
      } catch (error) {
        if (!signal?.aborted) {
          console.error("Error fetching clients for gift cards", error)
        }
      }
    },
    [tenantSchema],
  )

  useEffect(() => {
    if (selectedMethod !== "gift_card") {
      return
    }

    const controller = new AbortController()
    void loadGiftCards(controller.signal)
    void loadClients(controller.signal)

    return () => controller.abort()
  }, [selectedMethod, loadGiftCards, loadClients])

  const submitGiftCardAction = useCallback(
    async (payload: Record<string, unknown>) => {
      setIsGiftActionLoading(true)
      setGiftCardsError(null)

      try {
        const response = await fetch("/api/admin/gift-cards", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...buildTenantHeaders(),
          },
          body: JSON.stringify(payload),
        })
        const data = (await response.json().catch(() => ({}))) as { error?: string }

        if (!response.ok) {
          throw new Error(data.error ?? "No se pudo completar la operación")
        }

        await loadGiftCards()
      } catch (error) {
        console.error("Error running gift card action", error)
        setGiftCardsError(error instanceof Error ? error.message : "No se pudo completar la operación.")
      } finally {
        setIsGiftActionLoading(false)
      }
    },
    [loadGiftCards],
  )

  const handleCreateGiftCard = useCallback(async () => {
    const parsedAmount = Number(newGiftAmount)
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setGiftCardsError("Ingresa un monto inicial válido para la tarjeta.")
      return
    }

    await submitGiftCardAction({
      action: "create",
      clientId: newGiftClientId === "none" ? null : Number(newGiftClientId),
      code: newGiftCode.trim() || null,
      amount: parsedAmount,
      expiresAt: newGiftExpireAt ? new Date(`${newGiftExpireAt}T23:59:59`).toISOString() : null,
      note: newGiftNote.trim() || null,
    })

    setNewGiftCode("")
    setNewGiftAmount("")
    setNewGiftExpireAt("")
    setNewGiftNote("")
  }, [newGiftAmount, newGiftClientId, newGiftCode, newGiftExpireAt, newGiftNote, submitGiftCardAction])

  const handleTopupGiftCard = useCallback(async () => {
    if (selectedGiftCardId === "none") {
      setGiftCardsError("Selecciona una tarjeta para recargar.")
      return
    }

    const amount = Number(topupAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setGiftCardsError("Ingresa un monto válido para recargar.")
      return
    }

    await submitGiftCardAction({
      action: "topup",
      giftCardId: Number(selectedGiftCardId),
      amount,
      note: giftMovementNote.trim() || null,
    })

    setTopupAmount("")
  }, [selectedGiftCardId, topupAmount, giftMovementNote, submitGiftCardAction])

  const handleRedeemGiftCard = useCallback(async () => {
    if (selectedGiftCardId === "none") {
      setGiftCardsError("Selecciona una tarjeta para redimir.")
      return
    }

    const amount = Number(redeemAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setGiftCardsError("Ingresa un monto válido para redimir.")
      return
    }

    await submitGiftCardAction({
      action: "redeem",
      giftCardId: Number(selectedGiftCardId),
      amount,
      note: giftMovementNote.trim() || null,
    })

    setRedeemAmount("")
  }, [selectedGiftCardId, redeemAmount, giftMovementNote, submitGiftCardAction])

  const visiblePayments = useMemo(() => {
    return payments.filter((payment) => {
      const normalizedMethod = (payment.paymentMethod ?? payment.paymentProvider ?? "").trim().toLowerCase()

      if (selectedMethod === "cash") {
        return normalizedMethod.includes("cash") || normalizedMethod.includes("efect")
      }

      if (selectedMethod === "gift_card") {
        return false
      }

      return normalizedMethod.includes("wompi") || normalizedMethod.length === 0
    })
  }, [payments, selectedMethod])

  const metrics = useMemo(() => {
    const totals = {
      totalRecords: visiblePayments.length,
      paidRecords: 0,
      pendingRecords: 0,
      paidAmount: 0,
      totalAmount: 0,
    }

    for (const payment of visiblePayments) {
      totals.totalAmount += payment.amount

      if (isPaidStatus(payment.paymentStatus)) {
        totals.paidRecords += 1
        totals.paidAmount += payment.amount
      } else {
        totals.pendingRecords += 1
      }
    }

    return totals
  }, [visiblePayments])

  const shouldShowErrorCard = Boolean(paymentsError) && !arePaymentsLoading && payments.length === 0
  const isGiftCardView = selectedMethod === "gift_card"

  const handleReload = useCallback(() => {
    void loadPayments()
  }, [loadPayments])

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto space-y-8 px-4 py-8">
        <section className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-5">
          <CompactMetricCard title="Movimientos" value={formatNumber(metrics.totalRecords)} />
          <CompactMetricCard title="Pagos realizados" value={formatNumber(metrics.paidRecords)} />
          <CompactMetricCard title="Pendientes / otros" value={formatNumber(metrics.pendingRecords)} />
          <CompactMetricCard title="Monto pagado" value={formatCurrency(metrics.paidAmount)} className="col-span-2 xl:col-span-1" />
          <CompactMetricCard title="Monto total registrado" value={formatCurrency(metrics.totalAmount)} className="col-span-2 xl:col-span-1" />
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold">Movimientos de pagos</h2>
              <p className="text-muted-foreground">Consulta cobros de suscripción por plan, estado y referencia.</p>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Seleccionar pago</CardTitle>
              <CardDescription>Elige cómo quieres revisar y operar tus pagos.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {METHOD_OPTIONS.map((option) => {
                  const Icon = option.icon
                  const isSelected = selectedMethod === option.value

                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={option.disabled}
                      onClick={() => setSelectedMethod(option.value)}
                      className={cn(
                        "flex min-h-28 flex-col items-start justify-between rounded-xl border p-4 text-left transition",
                        "hover:border-primary/60 hover:bg-muted/30",
                        isSelected && "border-primary bg-primary/5",
                        option.disabled && "cursor-not-allowed opacity-60 hover:border-border hover:bg-background",
                      )}
                    >
                      <div className="flex w-full items-center justify-between">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                        {option.disabled && <span className="text-[11px] text-muted-foreground">Próximamente</span>}
                      </div>
                      <div>
                        <p className="text-base font-semibold">{option.label}</p>
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </section>

        {isGiftCardView ? (
          <div className="space-y-4">
            {giftCardsError && (
              <Alert variant="destructive">
                <AlertTitle>Error en tarjetas regalo</AlertTitle>
                <AlertDescription>{giftCardsError}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Emitir tarjeta regalo</CardTitle>
                  <CardDescription>Crea una nueva tarjeta con saldo inicial y cliente opcional.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <Label>Cliente (opcional)</Label>
                    <Select value={newGiftClientId} onValueChange={setNewGiftClientId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona cliente" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin asignar</SelectItem>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={String(client.id)}>
                            {client.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Código (opcional)</Label>
                      <Input value={newGiftCode} onChange={(event) => setNewGiftCode(event.target.value)} placeholder="GC-2026-AB12CD" />
                    </div>
                    <div className="space-y-1">
                      <Label>Monto inicial</Label>
                      <Input type="number" min={0} step="1000" value={newGiftAmount} onChange={(event) => setNewGiftAmount(event.target.value)} placeholder="50000" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label>Vence el (opcional)</Label>
                    <Input type="date" value={newGiftExpireAt} onChange={(event) => setNewGiftExpireAt(event.target.value)} />
                  </div>

                  <div className="space-y-1">
                    <Label>Nota</Label>
                    <Textarea value={newGiftNote} onChange={(event) => setNewGiftNote(event.target.value)} placeholder="Detalle de emisión" rows={3} />
                  </div>

                  <Button onClick={handleCreateGiftCard} disabled={isGiftActionLoading || isGiftCardsLoading}>
                    Crear tarjeta
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recargar o redimir</CardTitle>
                  <CardDescription>Aplica movimientos sobre tarjetas activas.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <Label>Tarjeta</Label>
                    <Select value={selectedGiftCardId} onValueChange={setSelectedGiftCardId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona tarjeta" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Selecciona tarjeta</SelectItem>
                        {giftCards.map((card) => (
                          <SelectItem key={card.id} value={String(card.id)}>
                            {card.code} - {formatCurrency(card.balance)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Monto recarga</Label>
                      <Input type="number" min={0} step="1000" value={topupAmount} onChange={(event) => setTopupAmount(event.target.value)} placeholder="30000" />
                    </div>
                    <div className="space-y-1">
                      <Label>Monto redimir</Label>
                      <Input type="number" min={0} step="1000" value={redeemAmount} onChange={(event) => setRedeemAmount(event.target.value)} placeholder="15000" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label>Nota del movimiento</Label>
                    <Textarea
                      value={giftMovementNote}
                      onChange={(event) => setGiftMovementNote(event.target.value)}
                      placeholder="Venta mostrador, ajuste, devolución..."
                      rows={3}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={handleTopupGiftCard} disabled={isGiftActionLoading || isGiftCardsLoading}>
                      Recargar saldo
                    </Button>
                    <Button onClick={handleRedeemGiftCard} disabled={isGiftActionLoading || isGiftCardsLoading}>
                      Redimir saldo
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Tarjetas regalo activas</CardTitle>
                <CardDescription>Inventario de tarjetas y su saldo disponible.</CardDescription>
              </CardHeader>
              <CardContent>
                {isGiftCardsLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Skeleton key={index} className="h-11 w-full" />
                    ))}
                  </div>
                ) : giftCards.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aún no hay tarjetas regalo registradas.</p>
                ) : (
                  <div className="space-y-2">
                    {giftCards.map((card) => (
                      <div key={card.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                        <div>
                          <p className="text-sm font-semibold">{card.code}</p>
                          <p className="text-xs text-muted-foreground">
                            Cliente: {card.clientName ?? "Sin asignar"} · Estado: {card.status}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{formatCurrency(card.balance)}</p>
                          <p className="text-xs text-muted-foreground">Inicial: {formatCurrency(card.initialAmount)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Movimientos de tarjeta regalo</CardTitle>
                <CardDescription>Historial de emisiones, recargas y redenciones.</CardDescription>
              </CardHeader>
              <CardContent>
                {isGiftCardsLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Skeleton key={index} className="h-11 w-full" />
                    ))}
                  </div>
                ) : giftCardMovements.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin movimientos registrados todavía.</p>
                ) : (
                  <div className="space-y-2">
                    {giftCardMovements.map((movement) => (
                      <div key={movement.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                        <div>
                          <p className="text-sm font-semibold">
                            {movement.giftCardCode} · {movement.movementType}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(movement.createdAt).toLocaleString("es-CO")} · {movement.note ?? "Sin nota"}
                          </p>
                        </div>
                        <p className="text-sm font-semibold">{formatCurrency(movement.amount)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : shouldShowErrorCard ? (
          <Card>
            <CardHeader>
              <CardTitle>No pudimos cargar los pagos</CardTitle>
              <CardDescription>Intenta nuevamente para obtener la información más reciente.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleReload}>Reintentar</Button>
            </CardContent>
          </Card>
        ) : arePaymentsLoading ? (
          <PaymentsTableSkeleton />
        ) : visiblePayments.length === 0 ? (
          <Card>
            <CardContent>
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Receipt className="h-6 w-6" />
                  </EmptyMedia>
                  <EmptyTitle>Sin movimientos de pago</EmptyTitle>
                  <EmptyDescription>
                    No encontramos pagos para el método seleccionado.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent className="text-sm text-muted-foreground">
                  Cambia de método o registra pagos de suscripción desde el flujo de planes.
                </EmptyContent>
              </Empty>
            </CardContent>
          </Card>
        ) : (
          <>
            {paymentsError && (
              <Alert variant="destructive">
                <AlertTitle>Error al actualizar los pagos</AlertTitle>
                <AlertDescription>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span>{paymentsError}</span>
                    <Button variant="outline" onClick={handleReload}>
                      Reintentar
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <AdminPaymentsTable payments={visiblePayments} onReload={handleReload} />
          </>
        )}
      </main>
    </div>
  )
}

function PaymentsTableSkeleton() {
  return (
    <Card>
      <CardHeader className="space-y-2">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-4 w-72" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 7 }).map((_, index) => (
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
        <CardDescription className="text-[1.9rem] font-bold leading-none text-foreground sm:text-3xl">
          {value}
        </CardDescription>
      </CardHeader>
    </Card>
  )
}
