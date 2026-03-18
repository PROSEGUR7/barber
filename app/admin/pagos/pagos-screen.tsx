"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Receipt } from "lucide-react"

import { AdminPaymentsTable, type AdminBillingPaymentSummary } from "@/components/admin/payments-table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency, formatNumber } from "@/lib/formatters"

type PaymentsResponse = {
  payments?: AdminBillingPaymentSummary[]
  error?: string
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

  const metrics = useMemo(() => {
    const totals = {
      totalRecords: payments.length,
      paidRecords: 0,
      pendingRecords: 0,
      paidAmount: 0,
      totalAmount: 0,
    }

    for (const payment of payments) {
      totals.totalAmount += payment.amount

      if (isPaidStatus(payment.paymentStatus)) {
        totals.paidRecords += 1
        totals.paidAmount += payment.amount
      } else {
        totals.pendingRecords += 1
      }
    }

    return totals
  }, [payments])

  const shouldShowErrorCard = Boolean(paymentsError) && !arePaymentsLoading && payments.length === 0

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
        ) : payments.length === 0 ? (
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

            <AdminPaymentsTable payments={payments} onReload={handleReload} />
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
