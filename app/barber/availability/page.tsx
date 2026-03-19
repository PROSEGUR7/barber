"use client"

import { useEffect, useMemo, useState } from "react"
import { addDays, endOfMonth, format, startOfMonth } from "date-fns"
import { es } from "date-fns/locale"
import { CalendarIcon, Loader2, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/components/ui/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

type WeeklyRule = {
  dayOfWeek: number
  isEnabled: boolean
  startTime: string
  endTime: string
}

type AvailabilityException = {
  id: string
  date: string
  type: "off" | "custom"
  startTime: string | null
  endTime: string | null
  note: string | null
}

const DOW_LABELS: Record<number, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
}

function toHHMM(value: string) {
  // accepts HH:mm or HH:mm:ss
  const parts = String(value ?? "").split(":")
  if (parts.length >= 2) return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`
  return "09:00"
}

export default function BarberAvailabilityPage() {
  const { toast } = useToast()
  const [userId, setUserId] = useState<number | null>(null)

  const [weeklyRules, setWeeklyRules] = useState<WeeklyRule[]>([])
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([])

  const [isLoadingWeekly, setIsLoadingWeekly] = useState(false)
  const [isSavingWeekly, setIsSavingWeekly] = useState(false)
  const [isLoadingExceptions, setIsLoadingExceptions] = useState(false)
  const [isSavingException, setIsSavingException] = useState(false)

  const [exceptionDate, setExceptionDate] = useState<Date>(() => new Date())
  const [exceptionEnabled, setExceptionEnabled] = useState(true)
  const [exceptionStart, setExceptionStart] = useState("09:00")
  const [exceptionEnd, setExceptionEnd] = useState("18:00")
  const [exceptionReason, setExceptionReason] = useState("")
  const [isConfirmExceptionOpen, setIsConfirmExceptionOpen] = useState(false)
  const [isDuplicateExceptionOpen, setIsDuplicateExceptionOpen] = useState(false)
  const [duplicateExceptionMessage, setDuplicateExceptionMessage] = useState<string | null>(null)

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

  const selectedWorkingWindow = useMemo(() => {
    const dow = exceptionDate.getDay()
    const rule = weeklyRules.find((r) => r.dayOfWeek === dow)
    if (!rule || !rule.isEnabled) return null
    return { start: rule.startTime, end: rule.endTime }
  }, [exceptionDate, weeklyRules])

  const isExceptionRangeValid = useMemo(() => {
    if (!exceptionEnabled) return true
    if (!selectedWorkingWindow) return false
    if (!(exceptionStart < exceptionEnd)) return false
    if (exceptionStart < selectedWorkingWindow.start) return false
    if (exceptionEnd > selectedWorkingWindow.end) return false
    return true
  }, [exceptionEnabled, exceptionEnd, exceptionStart, selectedWorkingWindow])

  const exceptionRangeError = useMemo(() => {
    if (!exceptionEnabled) return null
    if (!selectedWorkingWindow) return "No puedes crear una excepción en un día sin horario laboral."
    if (exceptionStart >= exceptionEnd) return "El rango no es válido: la hora fin debe ser mayor que la hora inicio."
    if (exceptionStart < selectedWorkingWindow.start || exceptionEnd > selectedWorkingWindow.end) {
      return `El rango debe estar dentro de tu horario: ${selectedWorkingWindow.start} a ${selectedWorkingWindow.end}.`
    }
    return null
  }, [exceptionEnabled, exceptionEnd, exceptionStart, selectedWorkingWindow])

  useEffect(() => {
    // Keep exception times within working window when date/schedule changes.
    if (!exceptionEnabled) return
    if (!selectedWorkingWindow) return

    let nextStart = exceptionStart
    let nextEnd = exceptionEnd

    if (nextStart < selectedWorkingWindow.start) nextStart = selectedWorkingWindow.start
    if (nextEnd > selectedWorkingWindow.end) nextEnd = selectedWorkingWindow.end

    // If the current range becomes invalid after clamping, reset to full working window.
    if (!(nextStart < nextEnd)) {
      nextStart = selectedWorkingWindow.start
      nextEnd = selectedWorkingWindow.end
    }

    if (nextStart !== exceptionStart) setExceptionStart(nextStart)
    if (nextEnd !== exceptionEnd) setExceptionEnd(nextEnd)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exceptionDate, exceptionEnabled, selectedWorkingWindow?.start, selectedWorkingWindow?.end])

  useEffect(() => {
    try {
      const stored = localStorage.getItem("userId")
      const parsed = stored ? Number.parseInt(stored, 10) : NaN
      setUserId(Number.isFinite(parsed) ? parsed : null)
    } catch {
      setUserId(null)
    }
  }, [])

  const loadWeekly = async (uid: number) => {
    setIsLoadingWeekly(true)
    try {
      const response = await fetch(`/api/barber/availability/weekly?userId=${uid}`, {
        cache: "no-store",
        headers: buildTenantHeaders(),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        toast({ title: "Error", description: data.error ?? "No se pudo cargar la disponibilidad", variant: "destructive" })
        setWeeklyRules([])
        return
      }

      const rules = Array.isArray(data.rules) ? (data.rules as any[]) : []
      const normalized: WeeklyRule[] = rules.map((r) => ({
        dayOfWeek: Number(r.dow ?? r.dayOfWeek),
        isEnabled: Boolean(r.active ?? r.isEnabled ?? true),
        startTime: toHHMM(r.startTime),
        endTime: toHHMM(r.endTime),
      }))

      // Ensure all 7 days exist
      const byDow = new Map<number, WeeklyRule>()
      for (const rule of normalized) byDow.set(rule.dayOfWeek, rule)
      const full = Array.from({ length: 7 }).map((_, dayOfWeek) =>
        byDow.get(dayOfWeek) ?? {
          dayOfWeek,
          isEnabled: dayOfWeek >= 1 && dayOfWeek <= 5,
          startTime: "09:00",
          endTime: "18:00",
        },
      )

      setWeeklyRules(full)
    } catch (err) {
      console.error(err)
      setWeeklyRules([])
      toast({ title: "Error", description: "Error de conexión", variant: "destructive" })
    } finally {
      setIsLoadingWeekly(false)
    }
  }

  const loadExceptions = async (uid: number) => {
    setIsLoadingExceptions(true)
    try {
      const from = format(startOfMonth(exceptionDate), "yyyy-MM-dd")
      const to = format(endOfMonth(exceptionDate), "yyyy-MM-dd")
      const response = await fetch(
        `/api/barber/availability/exceptions?userId=${uid}&from=${from}&to=${to}`,
        { cache: "no-store", headers: buildTenantHeaders() },
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        toast({ title: "Error", description: data.error ?? "No se pudieron cargar las excepciones", variant: "destructive" })
        setExceptions([])
        return
      }

      const items = Array.isArray(data.exceptions) ? (data.exceptions as any[]) : []
      setExceptions(
        items.map((e) => ({
          id: String(e.id ?? `${String(e.type)}-${String(e.date)}-${String(e.startTime ?? "")}-${String(e.endTime ?? "")}`),
          date: String(e.date),
          type: e.type === "off" ? "off" : "custom",
          startTime: e.startTime ? toHHMM(e.startTime) : null,
          endTime: e.endTime ? toHHMM(e.endTime) : null,
          note: e.note != null ? String(e.note) : null,
        })),
      )
    } catch (err) {
      console.error(err)
      setExceptions([])
      toast({ title: "Error", description: "Error de conexión", variant: "destructive" })
    } finally {
      setIsLoadingExceptions(false)
    }
  }

  useEffect(() => {
    if (!userId) return
    void loadWeekly(userId)
    void loadExceptions(userId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  useEffect(() => {
    if (!userId) return
    void loadExceptions(userId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exceptionDate])

  const orderedWeekly = useMemo(() => {
    const copy = [...weeklyRules]
    copy.sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    return copy
  }, [weeklyRules])

  const isWorkingDay = (date: Date): boolean => {
    const dow = date.getDay()
    const rule = weeklyRules.find((r) => r.dayOfWeek === dow)
    return Boolean(rule?.isEnabled)
  }

  const findNextWorkingDay = (from: Date): Date => {
    // Avoid infinite loops; within 14 days we should find at least one enabled day.
    for (let offset = 0; offset < 14; offset += 1) {
      const candidate = addDays(from, offset)
      if (isWorkingDay(candidate)) return candidate
    }
    return from
  }

  useEffect(() => {
    // If user disables the currently selected exception day (e.g., turns off Saturdays),
    // move the selection to the next enabled day.
    if (weeklyRules.length === 0) return
    if (!isWorkingDay(exceptionDate)) {
      setExceptionDate(findNextWorkingDay(new Date()))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeklyRules])

  const saveWeekly = async () => {
    if (!userId) return
    setIsSavingWeekly(true)
    try {
      const response = await fetch(`/api/barber/availability/weekly`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...buildTenantHeaders() },
        body: JSON.stringify({
          userId,
          rules: weeklyRules.map((rule) => ({
            dow: rule.dayOfWeek,
            startTime: rule.startTime,
            endTime: rule.endTime,
            active: rule.isEnabled,
          })),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        toast({ title: "No se pudo guardar", description: data.error ?? "Intenta nuevamente", variant: "destructive" })
        return
      }
      toast({ title: "Guardado", description: "Tu disponibilidad semanal se actualizó." })
      await loadWeekly(userId)
    } catch (err) {
      console.error(err)
      toast({ title: "Error", description: "Error de conexión", variant: "destructive" })
    } finally {
      setIsSavingWeekly(false)
    }
  }

  const saveException = async (): Promise<boolean> => {
    if (!userId) return false

    if (!isExceptionRangeValid) {
      toast({ title: "Rango inválido", description: exceptionRangeError ?? "Revisa el rango horario.", variant: "destructive" })
      return false
    }

    setIsSavingException(true)
    try {
      const date = format(exceptionDate, "yyyy-MM-dd")

      const exception = exceptionEnabled
        ? {
            type: "custom" as const,
            date,
            startTime: exceptionStart,
            endTime: exceptionEnd,
            note: exceptionReason.trim() ? exceptionReason.trim() : undefined,
          }
        : {
            type: "off" as const,
            date,
            note: exceptionReason.trim() ? exceptionReason.trim() : undefined,
          }

      const response = await fetch(`/api/barber/availability/exceptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildTenantHeaders() },
        body: JSON.stringify({
          userId,
          exception,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (response.status === 409 && data?.code === "EXCEPTION_ALREADY_EXISTS") {
          setDuplicateExceptionMessage(typeof data?.error === "string" ? data.error : "Ya existe una excepción para este día.")
          setIsDuplicateExceptionOpen(true)
          return false
        }
        toast({ title: "No se pudo guardar", description: data.error ?? "Intenta nuevamente", variant: "destructive" })
        return false
      }

      toast({ title: "Excepción guardada", description: "Se aplicó la excepción de disponibilidad." })
      setExceptionReason("")
      await loadExceptions(userId)
      return true
    } catch (err) {
      console.error(err)
      toast({ title: "Error", description: "Error de conexión", variant: "destructive" })
      return false
    } finally {
      setIsSavingException(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AlertDialog open={isDuplicateExceptionOpen} onOpenChange={setIsDuplicateExceptionOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excepción ya registrada</AlertDialogTitle>
            <AlertDialogDescription>
              {duplicateExceptionMessage ?? "Ya existe una excepción para ese día y horario."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setIsDuplicateExceptionOpen(false)}>Entendido</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Disponibilidad</h1>
          <p className="text-muted-foreground">Configura tu horario semanal y excepciones por fecha.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Horario semanal</CardTitle>
              <CardDescription>Activa o desactiva cada día y define el rango de horas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingWeekly ? (
                <div className="space-y-3">
                  <div className="h-10 w-full bg-muted animate-pulse rounded" />
                  <div className="h-10 w-full bg-muted animate-pulse rounded" />
                  <div className="h-10 w-full bg-muted animate-pulse rounded" />
                </div>
              ) : (
                <div className="space-y-3">
                  {orderedWeekly.map((rule) => (
                    <div key={rule.dayOfWeek} className="flex items-center gap-3">
                      <div className="w-28 text-sm font-medium">{DOW_LABELS[rule.dayOfWeek]}</div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={rule.isEnabled}
                          onCheckedChange={(checked) => {
                            setWeeklyRules((prev) =>
                              prev.map((r) =>
                                r.dayOfWeek === rule.dayOfWeek ? { ...r, isEnabled: Boolean(checked) } : r,
                              ),
                            )
                          }}
                          aria-label={`Habilitar ${DOW_LABELS[rule.dayOfWeek]}`}
                        />
                        <span className="text-sm text-muted-foreground">Activo</span>
                      </div>
                      <div className="ml-auto flex items-center gap-2">
                        <Input
                          type="time"
                          value={rule.startTime}
                          disabled={!rule.isEnabled}
                          onChange={(e) => {
                            const v = e.target.value
                            setWeeklyRules((prev) =>
                              prev.map((r) => (r.dayOfWeek === rule.dayOfWeek ? { ...r, startTime: v } : r)),
                            )
                          }}
                          className="w-28"
                        />
                        <span className="text-sm text-muted-foreground">a</span>
                        <Input
                          type="time"
                          value={rule.endTime}
                          disabled={!rule.isEnabled}
                          onChange={(e) => {
                            const v = e.target.value
                            setWeeklyRules((prev) =>
                              prev.map((r) => (r.dayOfWeek === rule.dayOfWeek ? { ...r, endTime: v } : r)),
                            )
                          }}
                          className="w-28"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Separator />

              <Button onClick={saveWeekly} disabled={!userId || isLoadingWeekly || isSavingWeekly} className="w-full">
                {isSavingWeekly ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Guardar horario semanal
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Excepciones</CardTitle>
              <CardDescription>Cambia tu disponibilidad en una fecha específica.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Fecha</Label>
                  <div className="rounded-md border p-2">
                    <Calendar
                      mode="single"
                      selected={exceptionDate}
                      onSelect={(d) => d && setExceptionDate(d)}
                      disabled={(d) => !isWorkingDay(d)}
                      className="rounded-md"
                    />
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {format(exceptionDate, "EEEE d 'de' MMMM", { locale: es })}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={exceptionEnabled} onCheckedChange={(c) => setExceptionEnabled(Boolean(c))} />
                    <span className="text-sm text-muted-foreground">Bloquear rango horario (no disponible)</span>
                  </div>

                  <div className="grid gap-2">
                    <Label>Rango horario</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={exceptionStart}
                        disabled={!exceptionEnabled}
                        min={selectedWorkingWindow?.start}
                        max={selectedWorkingWindow?.end}
                        onChange={(e) => setExceptionStart(e.target.value)}
                      />
                      <span className="text-sm text-muted-foreground">a</span>
                      <Input
                        type="time"
                        value={exceptionEnd}
                        disabled={!exceptionEnabled}
                        min={selectedWorkingWindow?.start}
                        max={selectedWorkingWindow?.end}
                        onChange={(e) => setExceptionEnd(e.target.value)}
                      />
                    </div>
                    {exceptionRangeError && <p className="text-xs text-destructive">{exceptionRangeError}</p>}
                  </div>

                  <div className="grid gap-2">
                    <Label>Motivo (opcional)</Label>
                    <Input value={exceptionReason} onChange={(e) => setExceptionReason(e.target.value)} placeholder="Ej: No disponible" />
                  </div>

                    <AlertDialog open={isConfirmExceptionOpen} onOpenChange={setIsConfirmExceptionOpen}>
                      <AlertDialogTrigger asChild>
                        <Button disabled={!userId || isSavingException || !isExceptionRangeValid}>
                          {isSavingException ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                          Guardar excepción
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Confirmar excepción</AlertDialogTitle>
                          <AlertDialogDescription>
                            ¿Deseas guardar esta excepción para el {format(exceptionDate, "EEEE d 'de' MMMM", { locale: es })}?
                            {exceptionEnabled
                              ? `\nNo disponible de ${exceptionStart} a ${exceptionEnd}.`
                              : "\nQuedará marcado como no disponible."}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel disabled={isSavingException}>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={async () => {
                              const ok = await saveException()
                              if (ok) setIsConfirmExceptionOpen(false)
                            }}
                            disabled={isSavingException || !isExceptionRangeValid}
                          >
                            Confirmar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="text-sm font-medium">Historial de excepciones</div>
                {isLoadingExceptions ? (
                  <div className="space-y-2">
                    <div className="h-8 w-full bg-muted animate-pulse rounded" />
                    <div className="h-8 w-full bg-muted animate-pulse rounded" />
                  </div>
                ) : exceptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aún no tienes excepciones registradas.</p>
                ) : (
                  <div className="space-y-2">
                    {exceptions
                      .slice()
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((ex) => (
                        <div key={ex.id} className="flex items-center justify-between rounded-md border p-3">
                          <div>
                            <div className="font-medium text-sm">{ex.date}</div>
                            <div className="text-xs text-muted-foreground">
                              {ex.type === "custom" && ex.startTime && ex.endTime ? `No disponible ${ex.startTime} - ${ex.endTime}` : "No disponible"}
                              {ex.note ? ` · ${ex.note}` : ""}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
