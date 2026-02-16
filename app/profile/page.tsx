"use client"

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"

import { AppSidebar } from "@/components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import { formatDateTime } from "@/lib/formatters"

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

export default function ProfilePage() {
  const router = useRouter()
  const { toast } = useToast()
  const { setTheme } = useTheme()

  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [currentEmail, setCurrentEmail] = useState("")
  const [role, setRole] = useState<ProfileRole>("client")
  const [lastLogin, setLastLogin] = useState<string | null>(null)

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")

  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isSavingPreferences, setIsSavingPreferences] = useState(false)
  const [isSavingPassword, setIsSavingPassword] = useState(false)

  const loadProfile = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)

    try {
      const storedEmail = typeof window !== "undefined" ? localStorage.getItem("userEmail")?.trim() ?? "" : ""

      if (!storedEmail) {
        router.push("/login")
        return
      }

      const response = await fetch(`/api/profile?email=${encodeURIComponent(storedEmail)}`, {
        cache: "no-store",
      })

      const data: ProfileResponse = await response.json().catch(() => ({}))

      if (!response.ok || !data.profile) {
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
          notifyWhatsapp: Boolean(parsed.notifyWhatsapp),
          notifyEmail: Boolean(parsed.notifyEmail),
          notifySms: Boolean(parsed.notifySms),
        })
      } else {
        setPreferences(DEFAULT_PREFERENCES)
      }
    } catch (error) {
      console.error("Error loading profile", error)
      setLoadError("No se pudo cargar tu configuración de perfil.")
    } finally {
      setIsLoading(false)
    }
  }, [router])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  const roleLabel = useMemo(() => getRoleLabel(role), [role])

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const sanitizedEmail = email.trim().toLowerCase()
    const sanitizedName = name.trim()
    const sanitizedPhone = phone.trim()

    if (!sanitizedEmail || !sanitizedEmail.includes("@")) {
      toast({
        variant: "destructive",
        title: "Correo inválido",
        description: "Ingresa un correo válido para continuar.",
      })
      return
    }

    if (!sanitizedName) {
      toast({
        variant: "destructive",
        title: "Nombre obligatorio",
        description: "Ingresa tu nombre para guardar el perfil.",
      })
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
        }),
      })

      const data: ProfileResponse = await response.json().catch(() => ({}))

      if (!response.ok || !data.profile) {
        toast({
          variant: "destructive",
          title: "No se pudo guardar",
          description: data.error ?? "Error al actualizar tu perfil.",
        })
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

      toast({
        title: "Perfil actualizado",
        description: "Tus datos se guardaron correctamente.",
      })
    } catch (error) {
      console.error("Error updating profile", error)
      toast({
        variant: "destructive",
        title: "Error de conexión",
        description: "No fue posible guardar el perfil.",
      })
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handlePreferencesSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!currentEmail) {
      toast({
        variant: "destructive",
        title: "Sesión inválida",
        description: "Vuelve a iniciar sesión para actualizar tus preferencias.",
      })
      return
    }

    setIsSavingPreferences(true)

    try {
      localStorage.setItem(getPreferencesKey(currentEmail), JSON.stringify(preferences))
      setTheme(preferences.themeMode)

      toast({
        title: "Preferencias guardadas",
        description: "Se actualizaron tus ajustes personales.",
      })
    } finally {
      setIsSavingPreferences(false)
    }
  }

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!currentEmail) {
      toast({
        variant: "destructive",
        title: "Sesión inválida",
        description: "No encontramos tu sesión actual.",
      })
      return
    }

    if (newPassword.length < 8) {
      toast({
        variant: "destructive",
        title: "Contraseña inválida",
        description: "La nueva contraseña debe tener al menos 8 caracteres.",
      })
      return
    }

    if (newPassword !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Confirmación inválida",
        description: "La confirmación no coincide con la nueva contraseña.",
      })
      return
    }

    setIsSavingPassword(true)

    try {
      const response = await fetch("/api/profile/password", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: currentEmail,
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      })

      const data = (await response.json().catch(() => ({}))) as { error?: string }

      if (!response.ok) {
        toast({
          variant: "destructive",
          title: "No se pudo actualizar",
          description: data.error ?? "No fue posible cambiar la contraseña.",
        })
        return
      }

      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")

      toast({
        title: "Contraseña actualizada",
        description: "Tu nueva contraseña ya está activa.",
      })
    } catch (error) {
      console.error("Error changing password", error)
      toast({
        variant: "destructive",
        title: "Error de conexión",
        description: "No fue posible actualizar la contraseña.",
      })
    } finally {
      setIsSavingPassword(false)
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar:duration-200">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/dashboard">Inicio</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Configuración de perfil</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
          <section className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Configuración personal</h1>
            <p className="text-sm text-muted-foreground">
              Gestiona tus datos de perfil, preferencias de cuenta y seguridad. Rol actual: {roleLabel}.
            </p>
            <p className="text-xs text-muted-foreground">
              Último acceso: {lastLogin ? formatDateTime(lastLogin) : "Sin registro"}
            </p>
          </section>

          {isLoading ? (
            <Card>
              <CardHeader>
                <CardTitle>Cargando configuración</CardTitle>
                <CardDescription>Espera un momento mientras obtenemos tu perfil.</CardDescription>
              </CardHeader>
            </Card>
          ) : loadError ? (
            <Card>
              <CardHeader>
                <CardTitle>No se pudo cargar la configuración</CardTitle>
                <CardDescription>{loadError}</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button onClick={() => void loadProfile()}>Reintentar</Button>
              </CardFooter>
            </Card>
          ) : (
            <Tabs defaultValue="perfil" className="space-y-4">
              <TabsList>
                <TabsTrigger value="perfil">Perfil</TabsTrigger>
                <TabsTrigger value="preferencias">Preferencias</TabsTrigger>
                <TabsTrigger value="seguridad">Seguridad</TabsTrigger>
              </TabsList>

              <TabsContent value="perfil">
                <Card className="border border-border/70 shadow-sm">
                  <form onSubmit={handleProfileSubmit}>
                    <CardHeader>
                      <CardTitle>Datos personales</CardTitle>
                      <CardDescription>Actualiza tu información principal para la cuenta.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="profile-name">Nombre completo</Label>
                        <Input
                          id="profile-name"
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          placeholder="Tu nombre"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="profile-phone">Teléfono</Label>
                        <Input
                          id="profile-phone"
                          value={phone}
                          onChange={(event) => setPhone(event.target.value)}
                          placeholder="Tu teléfono"
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="profile-email">Correo electrónico</Label>
                        <Input
                          id="profile-email"
                          type="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          placeholder="tucorreo@dominio.com"
                          required
                        />
                      </div>
                    </CardContent>
                    <CardFooter className="mt-2 flex justify-end pt-4">
                      <Button type="submit" disabled={isSavingProfile}>
                        {isSavingProfile ? "Guardando..." : "Guardar cambios"}
                      </Button>
                    </CardFooter>
                  </form>
                </Card>
              </TabsContent>

              <TabsContent value="preferencias">
                <Card className="border border-border/70 shadow-sm">
                  <form onSubmit={handlePreferencesSubmit}>
                    <CardHeader>
                      <CardTitle>Ajustes de preferencia</CardTitle>
                      <CardDescription>Personaliza tema y notificaciones.</CardDescription>
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
                    </CardContent>
                    <CardFooter className="mt-2 flex justify-end pt-4">
                      <Button type="submit" disabled={isSavingPreferences}>
                        {isSavingPreferences ? "Guardando..." : "Guardar preferencias"}
                      </Button>
                    </CardFooter>
                  </form>
                </Card>
              </TabsContent>

              <TabsContent value="seguridad">
                <Card className="border border-border/70 shadow-sm">
                  <form onSubmit={handlePasswordSubmit}>
                    <CardHeader>
                      <CardTitle>Seguridad de la cuenta</CardTitle>
                      <CardDescription>Cambia tu contraseña para mantener tu cuenta protegida.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="current-password">Contraseña actual</Label>
                        <Input
                          id="current-password"
                          type="password"
                          value={currentPassword}
                          onChange={(event) => setCurrentPassword(event.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-password">Nueva contraseña</Label>
                        <Input
                          id="new-password"
                          type="password"
                          value={newPassword}
                          onChange={(event) => setNewPassword(event.target.value)}
                          required
                          minLength={8}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirm-password">Confirmar nueva contraseña</Label>
                        <Input
                          id="confirm-password"
                          type="password"
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          required
                          minLength={8}
                        />
                      </div>
                    </CardContent>
                    <CardFooter className="mt-2 flex justify-end pt-4">
                      <Button type="submit" disabled={isSavingPassword}>
                        {isSavingPassword ? "Actualizando..." : "Actualizar contraseña"}
                      </Button>
                    </CardFooter>
                  </form>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
