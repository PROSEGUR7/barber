"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Receipt } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/formatters"

type AdminBillingPaymentSummary = {
  paymentId: number
  amount: number
  currency: string
  paymentStatus: string | null
  paidAt: string | null
  createdAt: string | null
  paymentMethod: string | null
  paymentProvider: string | null
  externalReference: string | null
  billingCycle: string | null
  planCode: string | null
  planName: string | null
  invoiceNumber: string | null
  invoiceStatus: string | null
  tenantId: number
  tenantName: string
  tenantSchema: string | null
}

type PaymentsResponse = {
  payments?: AdminBillingPaymentSummary[]
  error?: string
}

function getStatusLabel(status: string | null): string {
  if (!status) {
    return "Sin estado"
  }

  return status
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (chunk) => chunk.toUpperCase())
}

function getStatusVariant(status: string | null): "default" | "secondary" | "outline" | "destructive" {
  const normalized = status?.trim().toLowerCase() ?? ""

  if (normalized.includes("rech") || normalized.includes("cancel") || normalized.includes("fall")) {
    return "destructive"
  }

  if (
    normalized.includes("pag") ||
    normalized.includes("aprob") ||
    normalized.includes("complet") ||
    normalized.includes("final") ||
    normalized.includes("paid") ||
    normalized.includes("success")
  ) {
    return "secondary"
  }

  if (normalized.includes("pend") || normalized.includes("process")) {
    return "default"
  }

  return "outline"
}

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

  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

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

  const statusOptions = useMemo(() => {
    const values = new Set<string>()

    for (const payment of payments) {
      const normalized = payment.paymentStatus?.trim().toLowerCase()
      if (normalized) {
        values.add(normalized)
      }
    }

    return [...values].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }))
  }, [payments])

  const filteredPayments = useMemo(() => {
    const search = searchTerm.trim().toLowerCase()

    return payments.filter((payment) => {
      const statusMatches = statusFilter === "all" || (payment.paymentStatus?.trim().toLowerCase() ?? "") === statusFilter
      if (!statusMatches) {
        return false
      }

      if (search.length === 0) {
        return true
      }

      const searchableText = [
        payment.tenantName,
        payment.planName ?? "",
        payment.planCode ?? "",
        payment.invoiceNumber ?? "",
        payment.externalReference ?? "",
        payment.paymentStatus ?? "",
      ]
        .join(" ")
        .toLowerCase()

      return searchableText.includes(search)
    })
  }, [payments, searchTerm, statusFilter])

  const metrics = useMemo(() => {
    const totals = {
      totalRecords: filteredPayments.length,
      paidRecords: 0,
      pendingRecords: 0,
      paidAmount: 0,
      totalAmount: 0,
    }

    for (const payment of filteredPayments) {
      totals.totalAmount += payment.amount

      if (isPaidStatus(payment.paymentStatus)) {
        totals.paidRecords += 1
        totals.paidAmount += payment.amount
      } else {
        totals.pendingRecords += 1
      }
    }

    return totals
  }, [filteredPayments])

  const shouldShowErrorCard = Boolean(paymentsError) && !arePaymentsLoading && payments.length === 0

  const handleReload = useCallback(() => {
    void loadPayments()
  }, [loadPayments])

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto space-y-8 px-4 py-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">Pagos y facturación</h1>
          <p className="text-muted-foreground">
            Visualiza los pagos de suscripción Fullstack registrados en admin_platform para tu tenant.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">Movimientos</CardTitle>
              <CardDescription className="text-3xl font-bold text-foreground">
                {formatNumber(metrics.totalRecords)}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pagos realizados</CardTitle>
              <CardDescription className="text-3xl font-bold text-foreground">
                {formatNumber(metrics.paidRecords)}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pendientes / otros</CardTitle>
              <CardDescription className="text-3xl font-bold text-foreground">
                {formatNumber(metrics.pendingRecords)}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">Monto pagado</CardTitle>
              <CardDescription className="text-3xl font-bold text-foreground">
                {formatCurrency(metrics.paidAmount)}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">Monto total registrado</CardTitle>
              <CardDescription className="text-3xl font-bold text-foreground">
                {formatCurrency(metrics.totalAmount)}
              </CardDescription>
            </CardHeader>
          </Card>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold">Movimientos de pagos</h2>
              <p className="text-muted-foreground">Consulta cobros de suscripción por plan, estado y referencia.</p>
            </div>
            <Button variant="outline" onClick={handleReload}>
              Recargar
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar por tenant, plan, factura o referencia"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                {statusOptions.map((status) => (
                  <SelectItem key={status} value={status}>
                    {getStatusLabel(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        {shouldShowErrorCard ? (
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
        ) : filteredPayments.length === 0 ? (
          <Card>
            <CardContent>
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Receipt className="h-6 w-6" />
                  </EmptyMedia>
                  <EmptyTitle>Sin movimientos de pago</EmptyTitle>
                  <EmptyDescription>
                    No encontramos pagos para los filtros actuales.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent className="text-sm text-muted-foreground">
                  Ajusta filtros o registra pagos de suscripción desde el flujo de planes.
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

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pago</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Ciclo</TableHead>
                      <TableHead>Estado pago</TableHead>
                      <TableHead>Factura</TableHead>
                      <TableHead>Fecha pago</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayments.map((payment) => (
                      <TableRow key={payment.paymentId}>
                        <TableCell className="font-medium">#{payment.paymentId}</TableCell>
                        <TableCell>{payment.planName ?? payment.planCode ?? "Sin plan"}</TableCell>
                        <TableCell>{payment.billingCycle ?? "Sin ciclo"}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(payment.paymentStatus)}>{getStatusLabel(payment.paymentStatus)}</Badge>
                        </TableCell>
                        <TableCell>{payment.invoiceNumber ?? "Sin factura"}</TableCell>
                        <TableCell>{payment.paidAt ? formatDateTime(payment.paidAt) : payment.createdAt ? formatDateTime(payment.createdAt) : "Sin fecha"}</TableCell>
                        <TableCell className="text-right">{formatCurrency(payment.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
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
