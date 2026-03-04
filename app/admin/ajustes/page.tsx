"use client"

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { Settings2 } from "lucide-react"
import { useTheme } from "next-themes"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
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

type ProfileRole = "client" | "barber" | "admin"
type ThemeMode = "light" | "dark" | "system"

type ProfilePayload = {
  id: number
  email: string
  role: ProfileRole
  name: string
  phone: string
  lastLogin: string | null
}

type ProfileResponse = {
  profile?: ProfilePayload
  error?: string
}

type Preferences = {
  themeMode: ThemeMode
  notifyWhatsapp: boolean
  notifyEmail: boolean
  notifySms: boolean
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

const DEFAULT_PREFERENCES: Preferences = {
  themeMode: "system",
  notifyWhatsapp: true,
  notifyEmail: true,
  notifySms: false,
}

function getPreferencesKey(email: string) {
  return `profilePreferences:${email.toLowerCase()}`
}

function getRoleLabel(role: ProfileRole) {
  if (role === "admin") {
    return "Administrador"
  }

  if (role === "barber") {
    return "Peluquero"
  }

  return "Cliente"
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
  const { setTheme } = useTheme()

  const [isProfileLoading, setIsProfileLoading] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [currentEmail, setCurrentEmail] = useState("")
  const [role, setRole] = useState<ProfileRole>("admin")
  const [lastLogin, setLastLogin] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isSavingPreferences, setIsSavingPreferences] = useState(false)
  const [profileFeedback, setProfileFeedback] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null)
  const [settingsView, setSettingsView] = useState<"personal" | "platform">("personal")

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

  const roleLabel = useMemo(() => getRoleLabel(role), [role])

  const loadProfileSettings = useCallback(async () => {
    setIsProfileLoading(true)
    setProfileError(null)
    setProfileFeedback(null)

    try {
      const storedEmail = typeof window !== "undefined" ? localStorage.getItem("userEmail")?.trim() ?? "" : ""
      const storedDisplayName = typeof window !== "undefined" ? localStorage.getItem("userDisplayName")?.trim() ?? "" : ""
      const tenantSchema = typeof window !== "undefined" ? localStorage.getItem("tenantSchema")?.trim() ?? localStorage.getItem("userTenant")?.trim() ?? "" : ""

      if (!storedEmail) {
        setProfileError("No encontramos tu sesión para cargar la configuración personal.")
        return
      }

      const query = new URLSearchParams({ email: storedEmail })
      if (tenantSchema) {
        query.set("tenant", tenantSchema)
      }

      const response = await fetch(`/api/profile?${query.toString()}`, {
        cache: "no-store",
      })

      const data: ProfileResponse = await response.json().catch(() => ({}))

      if (!response.ok || !data.profile) {
        if (response.status === 404) {
          const fallbackName = storedDisplayName || storedEmail.split("@")[0] || "Administrador"

          setCurrentEmail(storedEmail)
          setRole("admin")
          setLastLogin(null)
          setName(fallbackName)
          setEmail(storedEmail)
          setPhone("")
          setProfileError(null)
          setProfileFeedback({
            type: "info",
            message: "No encontramos tu perfil en la base tenant. Mostramos datos de sesión para que puedas continuar.",
          })

          const fallbackPreferencesRaw = localStorage.getItem(getPreferencesKey(storedEmail))
          if (fallbackPreferencesRaw) {
            const parsed = JSON.parse(fallbackPreferencesRaw) as Partial<Preferences>
            setPreferences({
              themeMode:
                parsed.themeMode === "dark" || parsed.themeMode === "light" || parsed.themeMode === "system"
                  ? parsed.themeMode
                  : DEFAULT_PREFERENCES.themeMode,
              notifyWhatsapp: parsed.notifyWhatsapp ?? DEFAULT_PREFERENCES.notifyWhatsapp,
              notifyEmail: parsed.notifyEmail ?? DEFAULT_PREFERENCES.notifyEmail,
              notifySms: parsed.notifySms ?? DEFAULT_PREFERENCES.notifySms,
            })
          } else {
            setPreferences(DEFAULT_PREFERENCES)
          }

          return
        }

        throw new Error(data.error ?? "No se pudo cargar el perfil")
      }

      const profile = data.profile
      setCurrentEmail(profile.email)
      setRole(profile.role)
      setLastLogin(profile.lastLogin)
      setName(profile.name)
      setEmail(profile.email)
      setPhone(profile.phone)

      localStorage.setItem("userEmail", profile.email)
      localStorage.setItem("userDisplayName", profile.name)

      const rawPreferences = localStorage.getItem(getPreferencesKey(profile.email))

      if (rawPreferences) {
        const parsed = JSON.parse(rawPreferences) as Partial<Preferences>
        setPreferences({
          themeMode:
            parsed.themeMode === "dark" || parsed.themeMode === "light" || parsed.themeMode === "system"
              ? parsed.themeMode
              : DEFAULT_PREFERENCES.themeMode,
          notifyWhatsapp: parsed.notifyWhatsapp ?? DEFAULT_PREFERENCES.notifyWhatsapp,
          notifyEmail: parsed.notifyEmail ?? DEFAULT_PREFERENCES.notifyEmail,
          notifySms: parsed.notifySms ?? DEFAULT_PREFERENCES.notifySms,
        })
      } else {
        setPreferences(DEFAULT_PREFERENCES)
      }
    } catch (error) {
      console.error("Error loading profile settings", error)
      setProfileError("No se pudo cargar tu configuración personal.")
    } finally {
      setIsProfileLoading(false)
    }
  }, [])

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
    void loadProfileSettings()
  }, [loadProfileSettings])

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

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setProfileFeedback(null)

    const sanitizedEmail = email.trim().toLowerCase()
    const sanitizedName = name.trim()
    const sanitizedPhone = phone.trim()
    const tenantSchema = typeof window !== "undefined" ? localStorage.getItem("tenantSchema")?.trim() ?? localStorage.getItem("userTenant")?.trim() ?? "" : ""

    if (!sanitizedEmail || !sanitizedEmail.includes("@")) {
      setProfileFeedback({ type: "error", message: "Ingresa un correo válido para guardar tu perfil." })
      return
    }

    if (!sanitizedName) {
      setProfileFeedback({ type: "error", message: "El nombre es obligatorio." })
      return
    }

    if (!currentEmail) {
      setProfileFeedback({ type: "error", message: "No encontramos tu sesión actual para guardar cambios." })
      return
    }

    setIsSavingProfile(true)

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentEmail,
          email: sanitizedEmail,
          name: sanitizedName,
          phone: sanitizedPhone,
          tenantSchema,
        }),
      })

      const data: ProfileResponse = await response.json().catch(() => ({}))

      if (!response.ok || !data.profile) {
        setProfileFeedback({ type: "error", message: data.error ?? "No se pudo actualizar tu perfil." })
        return
      }

      const updated = data.profile
      const previousEmail = currentEmail

      setCurrentEmail(updated.email)
      setRole(updated.role)
      setLastLogin(updated.lastLogin)
      setName(updated.name)
      setEmail(updated.email)
      setPhone(updated.phone)

      localStorage.setItem("userEmail", updated.email)
      localStorage.setItem("userDisplayName", updated.name)

      if (previousEmail && previousEmail !== updated.email) {
        const previousKey = getPreferencesKey(previousEmail)
        const nextKey = getPreferencesKey(updated.email)
        const previousPreferences = localStorage.getItem(previousKey)

        if (previousPreferences) {
          localStorage.setItem(nextKey, previousPreferences)
          localStorage.removeItem(previousKey)
        }
      }

      setProfileFeedback({ type: "success", message: "Configuración personal actualizada correctamente." })
    } catch (error) {
      console.error("Error updating profile", error)
      setProfileFeedback({ type: "error", message: "No fue posible guardar tu configuración personal." })
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handlePreferencesSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setProfileFeedback(null)

    if (!currentEmail) {
      setProfileFeedback({ type: "error", message: "No encontramos tu sesión para guardar preferencias." })
      return
    }

    setIsSavingPreferences(true)

    try {
      localStorage.setItem(getPreferencesKey(currentEmail), JSON.stringify(preferences))
      setTheme(preferences.themeMode)
      setProfileFeedback({ type: "success", message: "Preferencias personales guardadas." })
    } catch (error) {
      console.error("Error saving preferences", error)
      setProfileFeedback({ type: "error", message: "No fue posible guardar tus preferencias." })
    } finally {
      setIsSavingPreferences(false)
    }
  }

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
          <h1 className="text-3xl font-bold">Ajustes</h1>
          <p className="text-muted-foreground">
            Configura en una sola vista tus ajustes personales y la administración de plataforma.
          </p>
          <div className="inline-flex rounded-lg border bg-background p-1">
            <Button
              type="button"
              variant={settingsView === "personal" ? "default" : "ghost"}
              className="h-8 px-4 text-sm"
              onClick={() => setSettingsView("personal")}
            >
              Personal
            </Button>
            <Button
              type="button"
              variant={settingsView === "platform" ? "default" : "ghost"}
              className="h-8 px-4 text-sm"
              onClick={() => setSettingsView("platform")}
            >
              Administración
            </Button>
          </div>
        </header>

        {settingsView === "personal" && (
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold">Configuración personal</h2>
            <p className="text-sm text-muted-foreground">
              Gestiona tus datos de perfil y preferencias. Rol actual: {roleLabel}.
              {" "}
              Último acceso: {lastLogin ? formatDateTime(lastLogin) : "Sin registro"}.
            </p>
          </div>

          {profileFeedback && (
            <Alert variant={profileFeedback.type === "error" ? "destructive" : "default"}>
              <AlertTitle>
                {profileFeedback.type === "error"
                  ? "No se pudo guardar"
                  : profileFeedback.type === "success"
                    ? "Cambios guardados"
                    : "Información"}
              </AlertTitle>
              <AlertDescription>{profileFeedback.message}</AlertDescription>
            </Alert>
          )}

          {isProfileLoading ? (
            <Card>
              <CardHeader>
                <CardTitle>Cargando configuración personal</CardTitle>
                <CardDescription>Espera un momento mientras obtenemos tus datos.</CardDescription>
              </CardHeader>
            </Card>
          ) : profileError ? (
            <Card>
              <CardHeader>
                <CardTitle>No se pudo cargar la configuración personal</CardTitle>
                <CardDescription>{profileError}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" onClick={() => void loadProfileSettings()}>
                  Reintentar
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <form onSubmit={handleProfileSubmit}>
                  <CardHeader>
                    <CardTitle>Datos personales</CardTitle>
                    <CardDescription>Actualiza tu nombre, teléfono y correo de acceso.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="admin-profile-name">Nombre completo</Label>
                      <Input
                        id="admin-profile-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Tu nombre"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="admin-profile-phone">Teléfono</Label>
                      <Input
                        id="admin-profile-phone"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        placeholder="Tu teléfono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="admin-profile-email">Correo electrónico</Label>
                      <Input
                        id="admin-profile-email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="tucorreo@dominio.com"
                        required
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button type="submit" disabled={isSavingProfile}>
                        {isSavingProfile ? "Guardando..." : "Guardar perfil"}
                      </Button>
                    </div>
                  </CardContent>
                </form>
              </Card>

              <Card>
                <form onSubmit={handlePreferencesSubmit}>
                  <CardHeader>
                    <CardTitle>Preferencias</CardTitle>
                    <CardDescription>Personaliza tema y notificaciones de tu cuenta.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Tema</Label>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <Button
                          type="button"
                          variant={preferences.themeMode === "light" ? "default" : "outline"}
                          onClick={() =>
                            setPreferences((previous) => ({
                              ...previous,
                              themeMode: "light",
                            }))
                          }
                        >
                          Claro
                        </Button>
                        <Button
                          type="button"
                          variant={preferences.themeMode === "dark" ? "default" : "outline"}
                          onClick={() =>
                            setPreferences((previous) => ({
                              ...previous,
                              themeMode: "dark",
                            }))
                          }
                        >
                          Oscuro
                        </Button>
                        <Button
                          type="button"
                          variant={preferences.themeMode === "system" ? "default" : "outline"}
                          onClick={() =>
                            setPreferences((previous) => ({
                              ...previous,
                              themeMode: "system",
                            }))
                          }
                        >
                          Sistema
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="text-sm font-medium text-foreground">Notificaciones</p>
                      <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                        <span className="text-sm">WhatsApp</span>
                        <Switch
                          checked={preferences.notifyWhatsapp}
                          onCheckedChange={(checked) =>
                            setPreferences((previous) => ({ ...previous, notifyWhatsapp: checked }))
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                        <span className="text-sm">Email</span>
                        <Switch
                          checked={preferences.notifyEmail}
                          onCheckedChange={(checked) =>
                            setPreferences((previous) => ({ ...previous, notifyEmail: checked }))
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                        <span className="text-sm">SMS</span>
                        <Switch
                          checked={preferences.notifySms}
                          onCheckedChange={(checked) =>
                            setPreferences((previous) => ({ ...previous, notifySms: checked }))
                          }
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button type="submit" disabled={isSavingPreferences}>
                        {isSavingPreferences ? "Guardando..." : "Guardar preferencias"}
                      </Button>
                    </div>
                  </CardContent>
                </form>
              </Card>
            </div>
          )}
        </section>
        )}

        {settingsView === "platform" && (
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold">Configuración de plataforma</h2>
            <p className="text-sm text-muted-foreground">
              Métricas operativas y gestión de cuentas administradoras.
            </p>
          </div>

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
        </section>
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
