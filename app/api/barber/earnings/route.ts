import { NextResponse } from "next/server"
import { z } from "zod"

import {
  getBarberEarnings,
  getMonthlyEarningsForBarber,
  getTodayInBusinessTZ,
  getTopClientsForBarber,
} from "@/lib/barber-earnings"

const querySchema = z.object({
  userId: z.coerce.number().int().positive(),
  from: z
    .string()
    .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
    .optional(),
})

function parseYMD(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map((v) => Number(v))
  return { y, m, d }
}

function formatYMDUtc(dt: Date): string {
  const yyyy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(dt.getUTCDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function addDaysYMD(date: string, days: number): string {
  const { y, m, d } = parseYMD(date)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return formatYMDUtc(dt)
}

function startOfWeekMondayYMD(date: string): string {
  const { y, m, d } = parseYMD(date)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dow = dt.getUTCDay() // 0=Sun..6=Sat
  const offsetFromMonday = (dow + 6) % 7 // Mon=0..Sun=6
  return addDaysYMD(date, -offsetFromMonday)
}

function endOfWeekMondayYMD(date: string): string {
  const start = startOfWeekMondayYMD(date)
  return addDaysYMD(start, 6)
}

function startOfMonthYMD(date: string): string {
  const { y, m } = parseYMD(date)
  const mm = String(m).padStart(2, "0")
  return `${y}-${mm}-01`
}

function endOfMonthYMD(date: string): string {
  const { y, m } = parseYMD(date)
  const nextMonth = m === 12 ? 1 : m + 1
  const nextYear = m === 12 ? y + 1 : y
  const firstNext = new Date(Date.UTC(nextYear, nextMonth - 1, 1))
  firstNext.setUTCDate(firstNext.getUTCDate() - 1)
  return formatYMDUtc(firstNext)
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const params = querySchema.parse({
      userId: url.searchParams.get("userId"),
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    })

    const hasRange = typeof params.from === "string" && typeof params.to === "string"
    const hasPartialRange = (params.from && !params.to) || (!params.from && params.to)
    if (hasPartialRange) {
      return NextResponse.json({ error: "Parámetros inválidos: usa from+to o ninguno." }, { status: 400 })
    }

    if (hasRange) {
      const summary = await getBarberEarnings({
        userId: params.userId,
        fromDate: params.from!,
        toDate: params.to!,
      })

      return NextResponse.json({ summary }, { status: 200 })
    }

    const today = getTodayInBusinessTZ()
    const todaySummary = await getBarberEarnings({ userId: params.userId, fromDate: today, toDate: today })
    const weekFrom = startOfWeekMondayYMD(today)
    const weekTo = endOfWeekMondayYMD(today)
    const weekSummary = await getBarberEarnings({ userId: params.userId, fromDate: weekFrom, toDate: weekTo })
    const monthFrom = startOfMonthYMD(today)
    const monthTo = endOfMonthYMD(today)
    const monthSummary = await getBarberEarnings({ userId: params.userId, fromDate: monthFrom, toDate: monthTo })

    const monthlyEarnings = await getMonthlyEarningsForBarber({ userId: params.userId, monthsBack: 6 })
    const topClients = await getTopClientsForBarber({
      userId: params.userId,
      fromDate: monthFrom,
      toDate: monthTo,
      limit: 5,
    })

    return NextResponse.json(
      {
        summary: {
          today: { amount: todaySummary.paidAmount, count: todaySummary.completedCount },
          week: { amount: weekSummary.paidAmount, count: weekSummary.completedCount },
          month: { amount: monthSummary.paidAmount, count: monthSummary.completedCount },
        },
        analytics: {
          monthlyEarnings,
          topClients,
        },
      },
      { status: 200 },
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Parámetros inválidos", issues: error.flatten() }, { status: 400 })
    }

    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
        ? ((error as { code?: string }).code as string)
        : null

    if (code === "EMPLOYEE_PROFILE_NOT_FOUND") {
      return NextResponse.json({ error: "Tu cuenta no tiene perfil de empleado." }, { status: 409 })
    }

    console.error("Error fetching barber earnings", error)
    return NextResponse.json({ error: "No se pudieron cargar tus ganancias" }, { status: 500 })
  }
}
