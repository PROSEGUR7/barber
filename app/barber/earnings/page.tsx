"use client"

import { type ComponentType, useEffect, useMemo, useState } from "react"
import { DollarSign, Loader2, TrendingUp, Wallet } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { format } from "date-fns"
import { es } from "date-fns/locale"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"

type EarningsSummary = {
  today: { count: number; amount: number }
  week: { count: number; amount: number }
  month: { count: number; amount: number }
}

type MonthlyEarningsPoint = {
  month: string
  amount: number
  count: number
}

type TopClient = {
  clientId: number
  clientName: string
  count: number
  amount: number
}

type EarningsAnalytics = {
  monthlyEarnings: MonthlyEarningsPoint[]
  topClients: TopClient[]
}

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
})

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function formatCurrency(value: number): string {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0)
}

export default function BarberEarningsPage() {
  const { toast } = useToast()
  const [userId, setUserId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [summary, setSummary] = useState<EarningsSummary | null>(null)
  const [analytics, setAnalytics] = useState<EarningsAnalytics | null>(null)

  const [commissionRate, setCommissionRate] = useState("50")
  const [monthlyGoal, setMonthlyGoal] = useState("3000000")

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

      const savedCommissionRate = localStorage.getItem("barberCommissionRate")
      const savedMonthlyGoal = localStorage.getItem("barberMonthlyGoal")
      if (savedCommissionRate) setCommissionRate(savedCommissionRate)
      if (savedMonthlyGoal) setMonthlyGoal(savedMonthlyGoal)
    } catch {
      setUserId(null)
    }
  }, [])

  useEffect(() => {
    if (!userId) return

    const load = async () => {
      setIsLoading(true)
      try {
        const response = await fetch(`/api/barber/earnings?userId=${userId}`, {
          cache: "no-store",
          headers: buildTenantHeaders(),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          toast({ title: "Error", description: data.error ?? "No se pudieron cargar las ganancias", variant: "destructive" })
          setSummary(null)
          setAnalytics(null)
          return
        }

        const s = data.summary ?? data
        setSummary({
          today: { count: toNumber(s?.today?.count), amount: toNumber(s?.today?.amount) },
          week: { count: toNumber(s?.week?.count), amount: toNumber(s?.week?.amount) },
          month: { count: toNumber(s?.month?.count), amount: toNumber(s?.month?.amount) },
        })

        const a = data.analytics
        const monthly = Array.isArray(a?.monthlyEarnings) ? (a.monthlyEarnings as any[]) : []
        const clients = Array.isArray(a?.topClients) ? (a.topClients as any[]) : []
        setAnalytics({
          monthlyEarnings: monthly.map((p) => ({
            month: String(p.month),
            amount: toNumber(p.amount),
            count: toNumber(p.count),
          })),
          topClients: clients.map((c) => ({
            clientId: toNumber(c.clientId),
            clientName: String(c.clientName ?? "Cliente"),
            count: toNumber(c.count),
            amount: toNumber(c.amount),
          })),
        })
      } catch (err) {
        console.error(err)
        toast({ title: "Error", description: "Error de conexión", variant: "destructive" })
        setSummary(null)
        setAnalytics(null)
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [userId])

  const monthlyChartConfig = {
    amount: {
      label: "Ganancias",
      color: "hsl(var(--primary))",
    },
  } satisfies ChartConfig

  const clientsChartConfig = {
    count: {
      label: "Citas",
      color: "hsl(var(--primary))",
    },
  } satisfies ChartConfig

  const formatMonthLabel = (yyyyMm: string) => {
    const dt = new Date(`${yyyyMm}-01T00:00:00Z`)
    return format(dt, "MMM yyyy", { locale: es })
  }

  const topClient = analytics?.topClients?.[0] ?? null
  const bestMonth = analytics?.monthlyEarnings?.reduce<MonthlyEarningsPoint | null>((best, cur) => {
    if (!best) return cur
    return cur.amount > best.amount ? cur : best
  }, null)

  const derived = useMemo(() => {
    const monthlyAmount = summary?.month.amount ?? 0
    const weeklyAmount = summary?.week.amount ?? 0

    const rate = Math.max(0, Math.min(100, Number(commissionRate) || 0))
    const goal = Math.max(0, Number(monthlyGoal) || 0)

    const commission = monthlyAmount * (rate / 100)
    const projection = Math.round((weeklyAmount * 4.3 + monthlyAmount) / 2)
    const goalProgress = goal > 0 ? Math.min(100, Math.round((monthlyAmount / goal) * 100)) : 0

    return {
      rate,
      goal,
      commission,
      projection,
      goalProgress,
    }
  }, [commissionRate, monthlyGoal, summary])

  const saveTargets = () => {
    localStorage.setItem("barberCommissionRate", String(Math.max(0, Math.min(100, Number(commissionRate) || 0))))
    localStorage.setItem("barberMonthlyGoal", String(Math.max(0, Number(monthlyGoal) || 0)))
    toast({ title: "Objetivos guardados", description: "Tus metas financieras fueron actualizadas." })
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Ganancias</h1>
          <p className="text-muted-foreground">Vista financiera operativa con proyección, comisiones y metas.</p>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-4">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : !summary ? (
          <Card>
            <CardContent className="py-10">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                No hay datos para mostrar.
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Metric title="Hoy" count={summary.today.count} amount={summary.today.amount} icon={DollarSign} />
              <Metric title="Esta semana" count={summary.week.count} amount={summary.week.amount} icon={TrendingUp} />
              <Metric title="Este mes" count={summary.month.count} amount={summary.month.amount} icon={Wallet} />
              <Metric title="Proyección mensual" count={0} amount={derived.projection} icon={TrendingUp} subtitle="estimada" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Ganancias por mes</CardTitle>
                  <CardDescription>
                    Comparativa de los últimos 6 meses.
                    {bestMonth ? ` Mejor mes: ${formatMonthLabel(bestMonth.month)} (${formatCurrency(bestMonth.amount)}).` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={monthlyChartConfig} className="h-[290px] w-full">
                    <BarChart data={analytics?.monthlyEarnings ?? []} margin={{ top: 12, right: 8, left: 8, bottom: 0 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="month"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        minTickGap={16}
                        tickFormatter={(value) => formatMonthLabel(String(value))}
                      />
                      <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => formatCurrency(Number(value))} />
                      <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent formatter={(value) => formatCurrency(Number(value))} />}
                      />
                      <Bar dataKey="amount" fill="var(--color-amount)" radius={10} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Clientes más atendidos</CardTitle>
                  <CardDescription>
                    Este mes.
                    {topClient ? ` Top: ${topClient.clientName} (${topClient.count} citas).` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {(analytics?.topClients.length ?? 0) === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <TrendingUp className="h-4 w-4" />
                      No hay clientes para mostrar.
                    </div>
                  ) : (
                    <ChartContainer config={clientsChartConfig} className="h-[290px] w-full">
                      <BarChart
                        data={analytics?.topClients ?? []}
                        layout="vertical"
                        margin={{ top: 12, right: 16, left: 8, bottom: 0 }}
                      >
                        <CartesianGrid horizontal={false} />
                        <YAxis dataKey="clientName" type="category" tickLine={false} axisLine={false} width={140} />
                        <XAxis dataKey="count" type="number" tickLine={false} axisLine={false} allowDecimals={false} />
                        <ChartTooltip
                          cursor={false}
                          content={<ChartTooltipContent formatter={(value) => `${Number(value)} citas`} />}
                        />
                        <Bar dataKey="count" fill="var(--color-count)" radius={10} />
                      </BarChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Comisiones y liquidación</CardTitle>
                  <CardDescription>Simula tu comisión mensual según tu porcentaje actual.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Porcentaje comisión</label>
                      <Input type="number" min={0} max={100} value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Meta mensual</label>
                      <Input type="number" min={0} value={monthlyGoal} onChange={(e) => setMonthlyGoal(e.target.value)} />
                    </div>
                  </div>

                  <div className="rounded-md border bg-muted/20 p-3 text-sm">
                    <p className="text-muted-foreground">Comisión estimada del mes</p>
                    <p className="text-xl font-semibold">{formatCurrency(derived.commission)}</p>
                  </div>

                  <button
                    type="button"
                    onClick={saveTargets}
                    className="w-full rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-muted/40"
                  >
                    Guardar objetivos financieros
                  </button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Objetivo mensual</CardTitle>
                  <CardDescription>Seguimiento del avance frente a tu meta de ingreso.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>Progreso</span>
                    <span className="font-medium">{derived.goalProgress}%</span>
                  </div>
                  <Progress value={derived.goalProgress} />
                  <div className="rounded-md border bg-muted/20 p-3 text-sm">
                    <p className="text-muted-foreground">Meta configurada</p>
                    <p className="font-semibold">{formatCurrency(derived.goal)}</p>
                    <p className="mt-1 text-muted-foreground">Ingresado este mes: {formatCurrency(summary.month.amount)}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {!userId && (
          <Card className="mt-6">
            <CardContent className="py-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4" />
                No encontramos sesión activa.
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}

function Metric({
  title,
  count,
  amount,
  icon: Icon,
  subtitle,
}: {
  title: string
  count: number
  amount: number
  icon: ComponentType<{ className?: string }>
  subtitle?: string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold">{formatCurrency(amount)}</div>
            <div className="text-xs text-muted-foreground">{subtitle ?? `${count} citas`}</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
