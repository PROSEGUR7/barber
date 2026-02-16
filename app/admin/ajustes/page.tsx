"use client"

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { Settings2 } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { AdminSettingsSummary, AdminUserSettings } from "@/lib/admin"
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/formatters"

type SettingsResponse = {
  summary?: AdminSettingsSummary
  adminUsers?: AdminUserSettings[]
  error?: string
}

type AdminUserResponse = {
  adminUser?: AdminUserSettings
  error?: string
}

const EMPTY_SUMMARY: AdminSettingsSummary = {
  totalAdminUsers: 0,
  totalEmployees: 0,
  totalClients: 0,
  totalServices: 0,
  activeServices: 0,
  totalAppointments: 0,
  totalPayments: 0,
  totalPaymentsAmount: 0,
}

function normalizeStatus(status: string | null): string {
  if (!status) {
    return "Sin estado"
  }

  return status
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (chunk) => chunk.toUpperCase())
}

function getStatusVariant(status: string | null): "default" | "secondary" | "outline" {
  const normalized = status?.trim().toLowerCase() ?? ""

  if (normalized.includes("activo") || normalized.includes("active")) {
    return "secondary"
  }

  if (normalized.length === 0) {
    return "outline"
  }

  return "default"
}

export default function AdminAjustesPage() {
  const [summary, setSummary] = useState<AdminSettingsSummary>(EMPTY_SUMMARY)
  const [adminUsers, setAdminUsers] = useState<AdminUserSettings[]>([])
  const [areSettingsLoading, setAreSettingsLoading] = useState(true)
  const [settingsError, setSettingsError] = useState<string | null>(null)

  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editingAdmin, setEditingAdmin] = useState<AdminUserSettings | null>(null)
  const [editEmail, setEditEmail] = useState("")
  const [editError, setEditError] = useState<string | null>(null)
  const [isEditSubmitting, setIsEditSubmitting] = useState(false)

  const sortedAdmins = useMemo(() => {
    return [...adminUsers].sort((a, b) => a.email.localeCompare(b.email, "es", { sensitivity: "base" }))
  }, [adminUsers])

  const loadSettings = useCallback(
    async (signal?: AbortSignal) => {
      setAreSettingsLoading(true)
      setSettingsError(null)

      try {
        const response = await fetch("/api/admin/settings", { signal, cache: "no-store" })
        const data: SettingsResponse = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(data.error ?? "No se pudieron cargar los ajustes")
        }

        if (!signal?.aborted) {
          setSummary(data.summary ?? EMPTY_SUMMARY)
          setAdminUsers(Array.isArray(data.adminUsers) ? data.adminUsers : [])
        }
      } catch (error) {
        if (signal?.aborted) {
          return
        }

        console.error("Error fetching admin settings", error)
        setSettingsError("No se pudieron cargar los ajustes de plataforma.")
      } finally {
        if (!signal?.aborted) {
          setAreSettingsLoading(false)
        }
      }
    },
    [],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadSettings(controller.signal)

    return () => controller.abort()
  }, [loadSettings])

  useEffect(() => {
    if (!isEditOpen) {
      setEditingAdmin(null)
      setEditEmail("")
      setEditError(null)
      setIsEditSubmitting(false)
    }
  }, [isEditOpen])

  const handleReload = useCallback(() => {
    void loadSettings()
  }, [loadSettings])

  const handleOpenEdit = (adminUser: AdminUserSettings) => {
    setEditingAdmin(adminUser)
    setEditEmail(adminUser.email)
    setEditError(null)
    setIsEditOpen(true)
  }

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setEditError(null)

    if (!editingAdmin) {
      setEditError("No se seleccionó un administrador para editar.")
      return
    }

    const sanitizedEmail = editEmail.trim().toLowerCase()

    if (!sanitizedEmail || !sanitizedEmail.includes("@")) {
      setEditError("Ingresa un correo válido.")
      return
    }

    setIsEditSubmitting(true)

    try {
      const response = await fetch(`/api/admin/settings/${editingAdmin.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: sanitizedEmail,
        }),
      })

      const data: AdminUserResponse = await response.json().catch(() => ({} as AdminUserResponse))

      if (!response.ok || !data.adminUser) {
        setEditError(data.error ?? "No se pudo actualizar el administrador.")
        return
      }

      setAdminUsers((previous) => previous.map((item) => (item.id === data.adminUser!.id ? data.adminUser! : item)))
      setIsEditOpen(false)
    } catch (error) {
      console.error("Error updating admin user", error)
      setEditError("Error de conexión con el servidor.")
    } finally {
      setIsEditSubmitting(false)
    }
  }

  const shouldShowErrorCard = Boolean(settingsError) && !areSettingsLoading

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto space-y-8 px-4 py-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">Ajustes de la plataforma</h1>
          <p className="text-muted-foreground">
            Configura preferencias generales, permisos del equipo y personalización de la marca.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">Administradores</CardTitle>
              <CardDescription className="text-3xl font-bold text-foreground">
                {formatNumber(summary.totalAdminUsers)}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">Equipo operativo</CardTitle>
              <CardDescription className="text-3xl font-bold text-foreground">
                {formatNumber(summary.totalEmployees)}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">Clientes registrados</CardTitle>
              <CardDescription className="text-3xl font-bold text-foreground">
                {formatNumber(summary.totalClients)}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">Servicios activos</CardTitle>
              <CardDescription className="text-3xl font-bold text-foreground">
                {formatNumber(summary.activeServices)} / {formatNumber(summary.totalServices)}
              </CardDescription>
            </CardHeader>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">Agendamientos totales</CardTitle>
              <CardDescription className="text-3xl font-bold text-foreground">
                {formatNumber(summary.totalAppointments)}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">Registros de pagos</CardTitle>
              <CardDescription className="text-3xl font-bold text-foreground">
                {formatNumber(summary.totalPayments)}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">Monto acumulado</CardTitle>
              <CardDescription className="text-3xl font-bold text-foreground">
                {formatCurrency(summary.totalPaymentsAmount)}
              </CardDescription>
            </CardHeader>
          </Card>
        </section>

        {shouldShowErrorCard ? (
          <Card>
            <CardHeader>
              <CardTitle>No pudimos cargar el centro de configuración</CardTitle>
              <CardDescription>Intenta nuevamente para obtener la información más reciente.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleReload}>Reintentar</Button>
            </CardContent>
          </Card>
        ) : areSettingsLoading ? (
          <SettingsSkeleton />
        ) : sortedAdmins.length === 0 ? (
          <Card>
            <CardContent>
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Settings2 className="h-6 w-6" />
                  </EmptyMedia>
                  <EmptyTitle>Sin cuentas administradoras</EmptyTitle>
                  <EmptyDescription>No hay usuarios con rol administrador registrados en la base de datos.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent className="text-sm text-muted-foreground">
                  Crea o promueve un usuario con rol admin para habilitar la gestión avanzada.
                </EmptyContent>
              </Empty>
            </CardContent>
          </Card>
        ) : (
          <>
            {settingsError && (
              <Alert variant="destructive">
                <AlertTitle>Error al actualizar ajustes</AlertTitle>
                <AlertDescription>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span>{settingsError}</span>
                    <Button variant="outline" onClick={handleReload}>
                      Reintentar
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Administradores de la plataforma</CardTitle>
                <CardDescription>Edita el correo de acceso de las cuentas administradoras.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Correo</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Último acceso</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedAdmins.map((adminUser) => (
                      <TableRow key={adminUser.id}>
                        <TableCell className="font-medium">{adminUser.id}</TableCell>
                        <TableCell>{adminUser.email}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(adminUser.status)}>{normalizeStatus(adminUser.status)}</Badge>
                        </TableCell>
                        <TableCell>{adminUser.lastLogin ? formatDateTime(adminUser.lastLogin) : "Sin registro"}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => handleOpenEdit(adminUser)}>
                            Editar correo
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}

        <Sheet open={isEditOpen} onOpenChange={setIsEditOpen}>
          <SheetContent side="right" className="p-0 sm:max-w-md lg:max-w-lg">
            <form onSubmit={handleEditSubmit} className="flex h-full flex-col">
              <SheetHeader className="border-b px-6 py-4 text-left">
                <SheetTitle>Actualizar correo administrador</SheetTitle>
                <SheetDescription>Este correo será utilizado para iniciar sesión en el panel administrativo.</SheetDescription>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="admin-user-email">Correo</FieldLabel>
                    <Input
                      id="admin-user-email"
                      type="email"
                      value={editEmail}
                      onChange={(event) => {
                        setEditEmail(event.target.value)
                        setEditError(null)
                      }}
                      required
                    />
                  </Field>
                </FieldGroup>
              </div>
              <SheetFooter className="border-t px-6 py-4">
                {editError && <p className="text-sm text-destructive">{editError}</p>}
                <Button type="submit" className="w-full" disabled={isEditSubmitting}>
                  {isEditSubmitting ? "Guardando cambios..." : "Guardar cambios"}
                </Button>
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>
      </main>
    </div>
  )
}

function SettingsSkeleton() {
  return (
    <Card>
      <CardHeader className="space-y-2">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-4 w-72" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  )
}
