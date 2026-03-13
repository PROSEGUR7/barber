"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { addDays, endOfMonth, format, startOfMonth } from "date-fns"
import { es } from "date-fns/locale"
import { Loader2, Save } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"
import type { EmployeeSummary } from "@/lib/admin"

const DOW_LABELS: Record<number, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
}

type WeeklyRule = {
  dayOfWeek: number
  isEnabled: boolean
  startTime: string
  endTime: string
}

type AvailabilityException = {
  date: string
  type: "off" | "custom"
  startTime: string | null
  endTime: string | null
  note: string | null
}

type EmployeesResponse = {
  ok?: boolean
  employees?: EmployeeSummary[]
  error?: string
}

type WeeklyResponse = {
  ok?: boolean
  rules?: Array<{
    dow?: number
    startTime?: string
    endTime?: string
    active?: boolean
  }>
  error?: string
}

type ExceptionsResponse = {
  ok?: boolean
  exceptions?: Array<{
    date?: string
    type?: "off" | "custom"
    startTime?: string | null
    endTime?: string | null
    note?: string | null
  }>
  error?: string
}

function toHHMM(value: string | null | undefined) {
  const raw = String(value ?? "")
  const parts = raw.split(":")
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`
  }

  return "09:00"
}

function createDefaultWeeklyRules() {
  return Array.from({ length: 7 }).map((_, dayOfWeek) => ({
    dayOfWeek,
    isEnabled: dayOfWeek >= 1 && dayOfWeek <= 5,
    startTime: "09:00",
    endTime: "18:00",
  }))
}

function sortEmployees(items: EmployeeSummary[]) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
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

export default function AdminDisponibilidadPage() {
  const { toast } = useToast()

  const [employees, setEmployees] = useState<EmployeeSummary[]>([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null)
  const [areEmployeesLoading, setAreEmployeesLoading] = useState(true)

  const [weeklyRules, setWeeklyRules] = useState<WeeklyRule[]>(createDefaultWeeklyRules)
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

  const [pageError, setPageError] = useState<string | null>(null)

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === selectedEmployeeId) ?? null,
    [employees, selectedEmployeeId],
  )

  const selectedWorkingWindow = useMemo(() => {
    const dow = exceptionDate.getDay()
    const rule = weeklyRules.find((item) => item.dayOfWeek === dow)
    if (!rule || !rule.isEnabled) return null

    return {
      start: rule.startTime,
      end: rule.endTime,
    }
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
    if (exceptionStart >= exceptionEnd) return "La hora fin debe ser mayor que la hora inicio."
    if (exceptionStart < selectedWorkingWindow.start || exceptionEnd > selectedWorkingWindow.end) {
      return `El rango debe estar dentro del horario semanal (${selectedWorkingWindow.start} - ${selectedWorkingWindow.end}).`
    }

    return null
  }, [exceptionEnabled, exceptionEnd, exceptionStart, selectedWorkingWindow])

  useEffect(() => {
    if (!exceptionEnabled || !selectedWorkingWindow) {
      return
    }

    let nextStart = exceptionStart
    let nextEnd = exceptionEnd

    if (nextStart < selectedWorkingWindow.start) {
      nextStart = selectedWorkingWindow.start
    }

    if (nextEnd > selectedWorkingWindow.end) {
      nextEnd = selectedWorkingWindow.end
    }

    if (!(nextStart < nextEnd)) {
      nextStart = selectedWorkingWindow.start
      nextEnd = selectedWorkingWindow.end
    }

    if (nextStart !== exceptionStart) {
      setExceptionStart(nextStart)
    }

    if (nextEnd !== exceptionEnd) {
      setExceptionEnd(nextEnd)
    }
  }, [exceptionDate, exceptionEnabled, exceptionEnd, exceptionStart, selectedWorkingWindow])

  const loadEmployees = useCallback(async () => {
    setAreEmployeesLoading(true)
    setPageError(null)

    try {
      const response = await fetch("/api/admin/employees", {
        method: "GET",
        cache: "no-store",
        headers: buildTenantHeaders(),
      })

      const data: EmployeesResponse = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error ?? "No se pudieron cargar los empleados")
      }

      const list = sortEmployees(Array.isArray(data.employees) ? data.employees : [])
      setEmployees(list)

      setSelectedEmployeeId((current) => {
        if (typeof current === "number" && list.some((employee) => employee.id === current)) {
          return current
        }

        return list[0]?.id ?? null
      })
    } catch (error) {
      console.error("Error loading employees", error)
      setEmployees([])
      setSelectedEmployeeId(null)
      setPageError("No se pudieron cargar los empleados.")
    } finally {
      setAreEmployeesLoading(false)
    }
  }, [])

  const loadWeekly = useCallback(async (employeeId: number) => {
    setIsLoadingWeekly(true)

    try {
      const response = await fetch(`/api/availability/weekly?employeeId=${employeeId}`, {
        method: "GET",
        cache: "no-store",
        headers: buildTenantHeaders(),
      })

      const data: WeeklyResponse = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error ?? "No se pudo cargar el horario semanal")
      }

      const incoming = Array.isArray(data.rules) ? data.rules : []
      const mapped = incoming.map((rule) => ({
        dayOfWeek: Number(rule.dow ?? 0),
        isEnabled: Boolean(rule.active ?? true),
        startTime: toHHMM(rule.startTime),
        endTime: toHHMM(rule.endTime),
      }))

      const byDow = new Map<number, WeeklyRule>()
      for (const rule of mapped) {
        byDow.set(rule.dayOfWeek, rule)
      }

      const full = Array.from({ length: 7 }).map((_, dayOfWeek) =>
        byDow.get(dayOfWeek) ?? {
          dayOfWeek,
          isEnabled: dayOfWeek >= 1 && dayOfWeek <= 5,
          startTime: "09:00",
          endTime: "18:00",
        },
      )

      setWeeklyRules(full)
    } catch (error) {
      console.error("Error loading weekly availability", error)
      setWeeklyRules(createDefaultWeeklyRules())
      toast({
        title: "No se pudo cargar",
        description: "No se pudo cargar la disponibilidad semanal del empleado.",
        variant: "destructive",
      })
    } finally {
      setIsLoadingWeekly(false)
    }
  }, [toast])

  const loadExceptions = useCallback(async (employeeId: number) => {
    setIsLoadingExceptions(true)

    try {
      const fromDate = format(startOfMonth(exceptionDate), "yyyy-MM-dd")
      const toDate = format(endOfMonth(exceptionDate), "yyyy-MM-dd")

      const query = new URLSearchParams({
        employeeId: String(employeeId),
        fromDate,
        toDate,
      })

      const response = await fetch(`/api/availability/exceptions?${query.toString()}`, {
        method: "GET",
        cache: "no-store",
        headers: buildTenantHeaders(),
      })

      const data: ExceptionsResponse = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error ?? "No se pudieron cargar las excepciones")
      }

      const incoming = Array.isArray(data.exceptions) ? data.exceptions : []
      setExceptions(
        incoming.map((item) => ({
          date: String(item.date ?? ""),
          type: item.type === "off" ? "off" : "custom",
          startTime: item.startTime ? toHHMM(item.startTime) : null,
          endTime: item.endTime ? toHHMM(item.endTime) : null,
          note: item.note ? String(item.note) : null,
        })),
      )
    } catch (error) {
      console.error("Error loading exceptions", error)
      setExceptions([])
      toast({
        title: "No se pudo cargar",
        description: "No se pudieron cargar las excepciones del empleado.",
        variant: "destructive",
      })
    } finally {
      setIsLoadingExceptions(false)
    }
  }, [exceptionDate, toast])

  useEffect(() => {
    void loadEmployees()
  }, [loadEmployees])

  useEffect(() => {
    if (!selectedEmployeeId) {
      setWeeklyRules(createDefaultWeeklyRules())
      setExceptions([])
      return
    }

    void loadWeekly(selectedEmployeeId)
    void loadExceptions(selectedEmployeeId)
  }, [loadExceptions, loadWeekly, selectedEmployeeId])

  useEffect(() => {
    if (!selectedEmployeeId) {
      return
    }

    void loadExceptions(selectedEmployeeId)
  }, [exceptionDate, loadExceptions, selectedEmployeeId])

  const orderedWeekly = useMemo(() => {
    return [...weeklyRules].sort((a, b) => a.dayOfWeek - b.dayOfWeek)
  }, [weeklyRules])

  const monthExceptions = useMemo(() => {
    return [...exceptions].sort((a, b) => a.date.localeCompare(b.date))
  }, [exceptions])

  const saveWeekly = useCallback(async () => {
    if (!selectedEmployeeId) {
      return
    }

    setIsSavingWeekly(true)
    try {
      const response = await fetch("/api/availability/weekly", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...buildTenantHeaders(),
        },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          rules: weeklyRules.map((rule) => ({
            dow: rule.dayOfWeek,
            startTime: rule.startTime,
            endTime: rule.endTime,
            active: rule.isEnabled,
          })),
          materializeDays: 60,
        }),
      })

      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        throw new Error(data.error ?? "No se pudo guardar la disponibilidad")
      }

      toast({ title: "Horario guardado", description: "Se actualizó la disponibilidad semanal del empleado." })
      await loadWeekly(selectedEmployeeId)
    } catch (error) {
      console.error("Error saving weekly availability", error)
      toast({
        title: "No se pudo guardar",
        description: error instanceof Error ? error.message : "Intenta de nuevo en unos segundos.",
        variant: "destructive",
      })
    } finally {
      setIsSavingWeekly(false)
    }
  }, [loadWeekly, selectedEmployeeId, toast, weeklyRules])

  const saveException = useCallback(async () => {
    if (!selectedEmployeeId) {
      return
    }

    if (!isExceptionRangeValid) {
      toast({ title: "Rango inválido", description: exceptionRangeError ?? "Revisa el rango horario.", variant: "destructive" })
      return
    }

    setIsSavingException(true)
    try {
      const date = format(exceptionDate, "yyyy-MM-dd")
      const payload = exceptionEnabled
        ? {
            type: "custom" as const,
            date,
            startTime: exceptionStart,
            endTime: exceptionEnd,
            note: exceptionReason.trim() || undefined,
          }
        : {
            type: "off" as const,
            date,
            note: exceptionReason.trim() || undefined,
          }

      const response = await fetch("/api/availability/exceptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildTenantHeaders(),
        },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          exception: payload,
          materializeDays: 60,
        }),
      })

      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        throw new Error(data.error ?? "No se pudo guardar la excepción")
      }

      toast({ title: "Excepción guardada", description: "Se aplicó la excepción de disponibilidad." })
      setExceptionReason("")
      await loadExceptions(selectedEmployeeId)
    } catch (error) {
      console.error("Error saving availability exception", error)
      toast({
        title: "No se pudo guardar",
        description: error instanceof Error ? error.message : "Intenta de nuevo en unos segundos.",
        variant: "destructive",
      })
    } finally {
      setIsSavingException(false)
    }
  }, [
    exceptionDate,
    exceptionEnabled,
    exceptionEnd,
    exceptionRangeError,
    exceptionReason,
    exceptionStart,
    isExceptionRangeValid,
    loadExceptions,
    selectedEmployeeId,
    toast,
  ])

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Disponibilidad del equipo</h1>
        <p className="text-muted-foreground">Administra horarios semanales y excepciones por fecha para cada empleado.</p>
      </div>

      {pageError ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudo cargar la información base</AlertTitle>
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Empleado</CardTitle>
          <CardDescription>Selecciona el empleado al que le vas a actualizar la disponibilidad.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={selectedEmployeeId ? String(selectedEmployeeId) : ""}
            onValueChange={(value) => setSelectedEmployeeId(Number(value))}
            disabled={areEmployeesLoading || employees.length === 0}
          >
            <SelectTrigger className="max-w-lg">
              <SelectValue
                placeholder={areEmployeesLoading ? "Cargando empleados..." : "Selecciona un empleado"}
              />
            </SelectTrigger>
            <SelectContent>
              {employees.map((employee) => (
                <SelectItem key={employee.id} value={String(employee.id)}>
                  {employee.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedEmployee ? (
            <p className="mt-2 text-sm text-muted-foreground">Editando disponibilidad de {selectedEmployee.name}.</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Horario semanal</CardTitle>
            <CardDescription>Define días activos y rango de horas base del empleado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingWeekly ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando horario semanal...
              </div>
            ) : null}

            <div className="space-y-3">
              {orderedWeekly.map((rule) => (
                <div key={rule.dayOfWeek} className="flex items-center gap-3">
                  <div className="w-28 text-sm font-medium">{DOW_LABELS[rule.dayOfWeek]}</div>

                  <Checkbox
                    checked={rule.isEnabled}
                    onCheckedChange={(checked) => {
                      setWeeklyRules((prev) =>
                        prev.map((item) =>
                          item.dayOfWeek === rule.dayOfWeek ? { ...item, isEnabled: Boolean(checked) } : item,
                        ),
                      )
                    }}
                  />

                  <Input
                    type="time"
                    value={rule.startTime}
                    disabled={!rule.isEnabled}
                    onChange={(event) => {
                      const value = event.target.value
                      setWeeklyRules((prev) =>
                        prev.map((item) =>
                          item.dayOfWeek === rule.dayOfWeek ? { ...item, startTime: value } : item,
                        ),
                      )
                    }}
                    className="w-32"
                  />

                  <span className="text-sm text-muted-foreground">a</span>

                  <Input
                    type="time"
                    value={rule.endTime}
                    disabled={!rule.isEnabled}
                    onChange={(event) => {
                      const value = event.target.value
                      setWeeklyRules((prev) =>
                        prev.map((item) =>
                          item.dayOfWeek === rule.dayOfWeek ? { ...item, endTime: value } : item,
                        ),
                      )
                    }}
                    className="w-32"
                  />
                </div>
              ))}
            </div>

            <Separator />

            <Button onClick={saveWeekly} disabled={!selectedEmployeeId || isSavingWeekly || isLoadingWeekly} className="w-full">
              {isSavingWeekly ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Guardar horario semanal
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Excepción por fecha</CardTitle>
            <CardDescription>
              Marca día libre completo o un rango especial dentro del horario semanal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[1fr_220px]">
              <div className="rounded-md border p-3">
                <Calendar
                  mode="single"
                  selected={exceptionDate}
                  onSelect={(date) => setExceptionDate(date ?? new Date())}
                  locale={es}
                  className="p-0"
                  disabled={(date) => date < addDays(new Date(), -1)}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-md border p-3">
                  <Checkbox
                    checked={exceptionEnabled}
                    onCheckedChange={(checked) => setExceptionEnabled(Boolean(checked))}
                  />
                  <Label>Horario especial (si no, día libre)</Label>
                </div>

                <div className="space-y-2">
                  <Label>Hora inicio</Label>
                  <Input
                    type="time"
                    value={exceptionStart}
                    disabled={!exceptionEnabled}
                    onChange={(event) => setExceptionStart(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Hora fin</Label>
                  <Input
                    type="time"
                    value={exceptionEnd}
                    disabled={!exceptionEnabled}
                    onChange={(event) => setExceptionEnd(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Motivo (opcional)</Label>
                  <Input
                    value={exceptionReason}
                    onChange={(event) => setExceptionReason(event.target.value)}
                    placeholder="Ej: reemplazo, cita médica, urgencia"
                    maxLength={300}
                  />
                </div>
              </div>
            </div>

            {exceptionRangeError ? <p className="text-sm text-destructive">{exceptionRangeError}</p> : null}

            <Button
              onClick={saveException}
              disabled={!selectedEmployeeId || isSavingException || isLoadingExceptions}
              className="w-full"
            >
              {isSavingException ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Guardar excepción
            </Button>

            <Separator />

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Excepciones del mes</h3>
              {isLoadingExceptions ? (
                <p className="text-sm text-muted-foreground">Cargando excepciones...</p>
              ) : monthExceptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay excepciones registradas para este mes.</p>
              ) : (
                <div className="space-y-2">
                  {monthExceptions.map((item) => {
                    const labelDate = format(new Date(`${item.date}T00:00:00`), "EEE d 'de' MMM", { locale: es })
                    const range =
                      item.type === "off"
                        ? "Día libre"
                        : `${item.startTime ?? "--:--"} - ${item.endTime ?? "--:--"}`

                    return (
                      <div key={`${item.date}-${item.type}-${item.startTime ?? "off"}`} className="rounded-md border p-2">
                        <p className="text-sm font-medium capitalize">{labelDate}</p>
                        <p className="text-sm text-muted-foreground">{range}</p>
                        {item.note ? <p className="text-xs text-muted-foreground">{item.note}</p> : null}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
