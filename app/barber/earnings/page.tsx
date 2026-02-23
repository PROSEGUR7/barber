"use client"

import { useEffect, useState } from "react"
import { DollarSign, Loader2, TrendingUp } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { format } from "date-fns"
import { es } from "date-fns/locale"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"

type EarningsSummary = {
  today: { count: number; amount: number }
  week: { count: number; amount: number }
  month: { count: number; amount: number }
}

type MonthlyEarningsPoint = {
  month: string // YYYY-MM
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

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

export default function BarberEarningsPage() {
  const { toast } = useToast()
  const [userId, setUserId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [summary, setSummary] = useState<EarningsSummary | null>(null)
  const [analytics, setAnalytics] = useState<EarningsAnalytics | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem("userId")
      const parsed = stored ? Number.parseInt(stored, 10) : NaN
      setUserId(Number.isFinite(parsed) ? parsed : null)
    } catch {
      setUserId(null)
    }
  }, [])

  useEffect(() => {
    if (!userId) return

    const load = async () => {
      setIsLoading(true)
      try {
        const response = await fetch(`/api/barber/earnings?userId=${userId}`, { cache: "no-store" })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const Metric = ({ title, count, amount }: { title: string; count: number; amount: number }) => (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold">${amount}</div>
            <div className="text-xs text-muted-foreground">{count} citas</div>
          </div>
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <DollarSign className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  )

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

  const getIntegerTicks = (max: number) => {
    const safeMax = Math.max(0, Math.trunc(Number.isFinite(max) ? max : 0))
    if (safeMax <= 10) {
      return Array.from({ length: safeMax + 1 }, (_, i) => i)
    }

    const step = Math.max(1, Math.ceil(safeMax / 5))
    const ticks: number[] = []
    for (let v = 0; v <= safeMax; v += step) ticks.push(v)
    if (ticks[ticks.length - 1] !== safeMax) ticks.push(safeMax)
    return ticks
  }

  const bestMonth = analytics?.monthlyEarnings?.reduce<MonthlyEarningsPoint | null>((best, cur) => {
    if (!best) return cur
    return cur.amount > best.amount ? cur : best
  }, null)

  const topClient = analytics?.topClients?.[0] ?? null

  const topClientsMaxCount = analytics?.topClients?.reduce((max, c) => Math.max(max, c.count), 0) ?? 0
  const topClientsTicks = getIntegerTicks(topClientsMaxCount)

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Ganancias</h1>
          <p className="text-muted-foreground">Resumen de tus ingresos por citas completadas.</p>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-3">
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
            <div className="grid gap-4 md:grid-cols-3">
              <Metric title="Hoy" count={summary.today.count} amount={summary.today.amount} />
              <Metric title="Esta semana" count={summary.week.count} amount={summary.week.amount} />
              <Metric title="Este mes" count={summary.month.count} amount={summary.month.amount} />
            </div>

            {analytics && (
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Ganancias por mes</CardTitle>
                    <CardDescription>
                      Comparativa de los últimos 6 meses.
                      {bestMonth ? ` Mejor mes: ${formatMonthLabel(bestMonth.month)} ($${bestMonth.amount}).` : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={monthlyChartConfig} className="h-[290px] w-full">
                      <BarChart data={analytics.monthlyEarnings} margin={{ top: 12, right: 8, left: 8, bottom: 0 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis
                          dataKey="month"
                          tickLine={false}
                          axisLine={false}
                          tickMargin={8}
                          minTickGap={16}
                          tickFormatter={(value) => formatMonthLabel(String(value))}
                        />
                        <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `$${Number(value)}`} />
                        <ChartTooltip
                          cursor={false}
                          content={<ChartTooltipContent formatter={(value) => `$${Number(value)}`} />}
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
                    {analytics.topClients.length === 0 ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <TrendingUp className="h-4 w-4" />
                        No hay clientes para mostrar.
                      </div>
                    ) : (
                      <ChartContainer config={clientsChartConfig} className="h-[290px] w-full">
                        <BarChart
                          data={analytics.topClients}
                          layout="vertical"
                          margin={{ top: 12, right: 16, left: 8, bottom: 0 }}
                        >
                          <CartesianGrid horizontal={false} />
                          <YAxis
                            dataKey="clientName"
                            type="category"
                            tickLine={false}
                            axisLine={false}
                            width={140}
                          />
                          <XAxis
                            dataKey="count"
                            type="number"
                            tickLine={false}
                            axisLine={false}
                            allowDecimals={false}
                            domain={[0, Math.max(1, topClientsMaxCount)]}
                            ticks={topClientsTicks}
                            tickFormatter={(value) => String(Math.trunc(Number(value)))}
                          />
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
            )}
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
