"use client"

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { Plus } from "lucide-react"
import { useTheme } from "next-themes"

import { AdminPromoCodesTable, type PromoCodeSummary } from "@/components/admin/promo-codes-table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
import type { AdminSettingsSummary } from "@/lib/admin"
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/formatters"

type SettingsResponse = {
  summary?: AdminSettingsSummary
  error?: string
}

type PromoCodesResponse = {
  promoCodes?: PromoCodeSummary[]
  promoCode?: PromoCodeSummary
  error?: string
}

type AdminServiceOption = {
  id: number
  name: string
}

type ServicesResponse = {
  services?: Array<{ id: number; name: string }>
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

function getRoleLabel(role: ProfileRole) {
  if (role === "admin") {
    return "Administrador"
  }

  if (role === "barber") {
    return "Peluquero"
  }

  return "Cliente"
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
  const [areSettingsLoading, setAreSettingsLoading] = useState(true)
  const [settingsError, setSettingsError] = useState<string | null>(null)

  const [promoCodes, setPromoCodes] = useState<PromoCodeSummary[]>([])
  const [promoCodesError, setPromoCodesError] = useState<string | null>(null)
  const [isPromoCodesLoading, setIsPromoCodesLoading] = useState(false)
  const [isPromoSheetOpen, setIsPromoSheetOpen] = useState(false)
  const [promoCodeInput, setPromoCodeInput] = useState("")
  const [promoDescriptionInput, setPromoDescriptionInput] = useState("")
  const [promoExpiresAtInput, setPromoExpiresAtInput] = useState("")
  const [promoDiscountPercentInput, setPromoDiscountPercentInput] = useState("10")
  const [promoApplyToAllServicesInput, setPromoApplyToAllServicesInput] = useState(true)
  const [promoSelectedServiceIdsInput, setPromoSelectedServiceIdsInput] = useState<number[]>([])
  const [promoActiveInput, setPromoActiveInput] = useState(true)
  const [promoFormError, setPromoFormError] = useState<string | null>(null)
  const [isPromoSubmitting, setIsPromoSubmitting] = useState(false)
  const [updatingPromoCode, setUpdatingPromoCode] = useState<string | null>(null)
  const [serviceOptions, setServiceOptions] = useState<AdminServiceOption[]>([])

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
        const response = await fetch("/api/admin/settings", {
          signal,
          cache: "no-store",
          headers: buildTenantHeaders(),
        })
        const data: SettingsResponse = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(data.error ?? "No se pudieron cargar los ajustes")
        }

        if (!signal?.aborted) {
          setSummary(data.summary ?? EMPTY_SUMMARY)
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
    if (!isPromoSheetOpen) {
      setPromoCodeInput("")
      setPromoDescriptionInput("")
      setPromoExpiresAtInput("")
      setPromoDiscountPercentInput("10")
      setPromoApplyToAllServicesInput(true)
      setPromoSelectedServiceIdsInput([])
      setPromoActiveInput(true)
      setPromoFormError(null)
      setIsPromoSubmitting(false)
    }
  }, [isPromoSheetOpen])

  const loadServiceOptions = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/services", {
        cache: "no-store",
        headers: buildTenantHeaders(),
      })
      const data: ServicesResponse = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error ?? "No se pudieron cargar servicios")
      }

      setServiceOptions(Array.isArray(data.services) ? data.services : [])
    } catch (error) {
      console.error("Error loading services for promo form", error)
      setServiceOptions([])
    }
  }, [])

  const loadPromoCodes = useCallback(async () => {
    setIsPromoCodesLoading(true)
    setPromoCodesError(null)

    try {
      const response = await fetch("/api/admin/promo-codes", {
        cache: "no-store",
        headers: buildTenantHeaders(),
      })
      const data: PromoCodesResponse = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error ?? "No se pudieron cargar los códigos promo")
      }

      setPromoCodes(Array.isArray(data.promoCodes) ? data.promoCodes : [])
    } catch (error) {
      console.error("Error loading promo codes", error)
      setPromoCodesError("No se pudieron cargar los códigos promocionales.")
    } finally {
      setIsPromoCodesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (settingsView !== "platform") {
      return
    }

    void loadPromoCodes()
    void loadServiceOptions()
  }, [loadPromoCodes, loadServiceOptions, settingsView])

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

  const handleCreatePromoCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPromoFormError(null)

    const code = promoCodeInput.trim().toUpperCase()
    const description = promoDescriptionInput.trim()
    const expiresAt = promoExpiresAtInput.trim()
    const discountPercent = Number(promoDiscountPercentInput)
    const serviceIds = promoApplyToAllServicesInput
      ? null
      : promoSelectedServiceIdsInput.length > 0
        ? promoSelectedServiceIdsInput
        : null

    if (code.length < 3) {
      setPromoFormError("El código debe tener al menos 3 caracteres.")
      return
    }

    if (!/^[A-Z0-9_-]+$/.test(code)) {
      setPromoFormError("El código solo puede contener letras, números, guion y guion bajo.")
      return
    }

    if (description.length < 2) {
      setPromoFormError("Ingresa una descripción válida.")
      return
    }

    if (expiresAt && Number.isNaN(Date.parse(expiresAt))) {
      setPromoFormError("Selecciona una fecha válida de expiración.")
      return
    }

    if (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 100) {
      setPromoFormError("El porcentaje de descuento debe estar entre 1 y 100.")
      return
    }

    if (!promoApplyToAllServicesInput && (!serviceIds || serviceIds.length === 0)) {
      setPromoFormError("Selecciona al menos un servicio o marca que aplica a todos.")
      return
    }

    setIsPromoSubmitting(true)

    try {
      const response = await fetch("/api/admin/promo-codes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildTenantHeaders(),
        },
        body: JSON.stringify({
          code,
          description,
          expiresAt: expiresAt || null,
          discountPercent,
          serviceIds,
          active: promoActiveInput,
        }),
      })

      const data: PromoCodesResponse = await response.json().catch(() => ({}))

      if (!response.ok || !data.promoCode) {
        setPromoFormError(data.error ?? "No se pudo crear el código promo.")
        return
      }

      setPromoCodes((previous) => [
        data.promoCode!,
        ...previous.filter((item) => item.code !== data.promoCode!.code),
      ])
      setIsPromoSheetOpen(false)
    } catch (error) {
      console.error("Error creating promo code", error)
      setPromoFormError("Error de conexión con el servidor.")
    } finally {
      setIsPromoSubmitting(false)
    }
  }

  const handleTogglePromoCode = useCallback(async (promoCode: PromoCodeSummary) => {
    setUpdatingPromoCode(promoCode.code)
    setPromoCodesError(null)

    try {
      const response = await fetch(`/api/admin/promo-codes/${encodeURIComponent(promoCode.code)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...buildTenantHeaders(),
        },
        body: JSON.stringify({ active: !promoCode.active }),
      })

      const data: PromoCodesResponse = await response.json().catch(() => ({}))

      if (!response.ok || !data.promoCode) {
        setPromoCodesError(data.error ?? "No se pudo actualizar el código promocional.")
        return
      }

      setPromoCodes((previous) =>
        previous.map((item) => (item.code === data.promoCode!.code ? data.promoCode! : item)),
      )
    } catch (error) {
      console.error("Error updating promo code", error)
      setPromoCodesError("No se pudo actualizar el código promocional.")
    } finally {
      setUpdatingPromoCode(null)
    }
  }, [])

  const shouldShowErrorCard = Boolean(settingsError) && !areSettingsLoading
  const activePromoCodes = useMemo(() => promoCodes.filter((item) => item.active).length, [promoCodes])

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto space-y-8 px-4 py-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">Ajustes</h1>
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
          </div>

          <section className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-4">
          <CompactMetricCard title="Administradores" value={formatNumber(summary.totalAdminUsers)} />
          <CompactMetricCard title="Equipo operativo" value={formatNumber(summary.totalEmployees)} />
          <CompactMetricCard title="Clientes registrados" value={formatNumber(summary.totalClients)} />
          <CompactMetricCard title="Servicios activos" value={`${formatNumber(summary.activeServices)} / ${formatNumber(summary.totalServices)}`} className="col-span-2 xl:col-span-1" />
          </section>

          <section className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-4">
          <CompactMetricCard title="Agendamientos totales" value={formatNumber(summary.totalAppointments)} />
          <CompactMetricCard title="Registros de pagos" value={formatNumber(summary.totalPayments)} />
          <CompactMetricCard title="Monto acumulado" value={formatCurrency(summary.totalPaymentsAmount)} className="col-span-2 xl:col-span-1" />
          <CompactMetricCard title="Promo codes activos" value={`${formatNumber(activePromoCodes)} / ${formatNumber(promoCodes.length)}`} className="col-span-2 xl:col-span-1" />
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
          ) : null}

          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-xl font-semibold">Códigos promocionales</h3>
                <p className="text-sm text-muted-foreground">
                  Solo administradores pueden crear, activar o desactivar promo codes.
                </p>
              </div>
              <Button onClick={() => setIsPromoSheetOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Crear promo code
              </Button>
            </div>

            {promoCodesError && (
              <Alert variant="destructive">
                <AlertTitle>Error en promo codes</AlertTitle>
                <AlertDescription>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span>{promoCodesError}</span>
                    <Button variant="outline" onClick={() => void loadPromoCodes()}>
                      Reintentar
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {isPromoCodesLoading ? (
              <SettingsSkeleton />
            ) : (
              <AdminPromoCodesTable
                promoCodes={promoCodes}
                onToggleActive={handleTogglePromoCode}
                isUpdatingCode={updatingPromoCode}
              />
            )}
          </div>
        </section>
        )}

        <Sheet open={isPromoSheetOpen} onOpenChange={setIsPromoSheetOpen}>
          <SheetContent side="right" className="p-0 sm:max-w-md lg:max-w-lg">
            <form onSubmit={handleCreatePromoCode} className="flex h-full flex-col">
              <SheetHeader className="border-b px-6 py-4 text-left">
                <SheetTitle>Crear código promocional</SheetTitle>
                <SheetDescription>Define los códigos que podrán redimirse en Wallet.</SheetDescription>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="promo-code">Código</FieldLabel>
                    <Input
                      id="promo-code"
                      value={promoCodeInput}
                      onChange={(event) => {
                        setPromoCodeInput(event.target.value)
                        setPromoFormError(null)
                      }}
                      placeholder="Ej. BIENVENIDA2026"
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="promo-description">Descripción</FieldLabel>
                    <Input
                      id="promo-description"
                      value={promoDescriptionInput}
                      onChange={(event) => {
                        setPromoDescriptionInput(event.target.value)
                        setPromoFormError(null)
                      }}
                      placeholder="Ej. Regalo de apertura"
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="promo-expires-date">Fecha de expiración</FieldLabel>
                    <Input
                      id="promo-expires-date"
                      type="date"
                      value={promoExpiresAtInput}
                      onChange={(event) => {
                        setPromoExpiresAtInput(event.target.value)
                        setPromoFormError(null)
                      }}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="promo-discount">Porcentaje de descuento</FieldLabel>
                    <Input
                      id="promo-discount"
                      type="number"
                      min={1}
                      max={100}
                      value={promoDiscountPercentInput}
                      onChange={(event) => {
                        setPromoDiscountPercentInput(event.target.value)
                        setPromoFormError(null)
                      }}
                      placeholder="Ej. 10"
                      required
                    />
                  </Field>
                  <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                    <span className="text-sm">Aplica a todos los servicios</span>
                    <Switch
                      checked={promoApplyToAllServicesInput}
                      onCheckedChange={(checked) => {
                        setPromoApplyToAllServicesInput(checked)
                        if (checked) {
                          setPromoSelectedServiceIdsInput([])
                        }
                        setPromoFormError(null)
                      }}
                    />
                  </div>
                  {!promoApplyToAllServicesInput && (
                    <Field>
                      <FieldLabel>Servicios incluidos</FieldLabel>
                      <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg border border-border/60 bg-muted/30 p-3">
                        {serviceOptions.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No hay servicios disponibles.</p>
                        ) : (
                          serviceOptions.map((service) => {
                            const checked = promoSelectedServiceIdsInput.includes(service.id)
                            return (
                              <label key={service.id} className="flex cursor-pointer items-center gap-2 text-sm">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(value) => {
                                    setPromoSelectedServiceIdsInput((previous) => {
                                      if (value) {
                                        return previous.includes(service.id) ? previous : [...previous, service.id]
                                      }

                                      return previous.filter((item) => item !== service.id)
                                    })
                                    setPromoFormError(null)
                                  }}
                                />
                                <span>{service.name}</span>
                              </label>
                            )
                          })
                        )}
                      </div>
                    </Field>
                  )}
                  <div className="rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    Si seleccionas servicios específicos, el cupón solo aplicará en esos servicios.
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                    <span className="text-sm">Activo al crear</span>
                    <Switch
                      checked={promoActiveInput}
                      onCheckedChange={(checked) => {
                        setPromoActiveInput(checked)
                        setPromoFormError(null)
                      }}
                    />
                  </div>
                </FieldGroup>
              </div>
              <SheetFooter className="border-t px-6 py-4">
                {promoFormError && <p className="text-sm text-destructive">{promoFormError}</p>}
                <Button type="submit" className="w-full" disabled={isPromoSubmitting}>
                  {isPromoSubmitting ? "Creando..." : "Crear promo code"}
                </Button>
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>
      </main>
    </div>
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
