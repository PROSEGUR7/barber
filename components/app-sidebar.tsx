"use client"

import * as React from "react"
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  Clock,
  DollarSign,
  Heart,
  Home,
  MapPin,
  MessageSquare,
  Receipt,
  Scissors,
  Settings2,
  TrendingUp,
  UserCircle,
  Users,
} from "lucide-react"

import { NavMain } from "./nav-main"
import { NavUser } from "./nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
} from "@/components/ui/sidebar"

type RoleKey = "client" | "barber" | "admin"

const roleLabels: Record<RoleKey, string> = {
  client: "Cliente",
  barber: "Peluquero",
  admin: "Administrador",
}

const defaultAvatar = "/placeholder-user.jpg"

function formatDisplayName(raw: string): string {
  if (!raw) {
    return ""
  }

  return raw
    .split(/\s+/)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ")
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [role, setRole] = React.useState<RoleKey>("client")
  const [canAccessAdminSections, setCanAccessAdminSections] = React.useState(true)
  const [userInfo, setUserInfo] = React.useState({
    name: "Usuario Hair Salon",
    email: "",
    avatar: defaultAvatar,
    roleLabel: roleLabels.client,
  })

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const syncSidebarUserInfo = () => {
      const storedRole = localStorage.getItem("userRole") as RoleKey | null
      if (storedRole === "client" || storedRole === "barber" || storedRole === "admin") {
        setRole(storedRole)
      }

      const storedEmail = (localStorage.getItem("userEmail") ?? "").trim()
      const storedDisplayName = (localStorage.getItem("userDisplayName") ?? "").trim()
      const storedAvatar = (localStorage.getItem("userAvatar") ?? "").trim()
      const fallbackName = storedDisplayName || (storedEmail ? storedEmail.split("@")[0] : "Usuario Hair Salon")
      const formattedName = formatDisplayName(fallbackName).trim() || "Usuario Hair Salon"

      setUserInfo((previous) => ({
        ...previous,
        name: formattedName,
        email: storedEmail,
        avatar: storedAvatar || defaultAvatar,
      }))
    }

    syncSidebarUserInfo()

    const handleProfileUpdated = () => {
      syncSidebarUserInfo()
    }

    const handleFocusSync = () => {
      syncSidebarUserInfo()
    }

    window.addEventListener("user-profile-updated", handleProfileUpdated)
    window.addEventListener("focus", handleFocusSync)

    const storedRole = localStorage.getItem("userRole") as RoleKey | null
    if (storedRole === "admin") {
      const tenantSchema =
        (localStorage.getItem("tenantSchema") ?? localStorage.getItem("userTenant") ?? "").trim() || null
      const userEmail = (localStorage.getItem("userEmail") ?? "").trim() || null

      let isDisposed = false
      let activeController: AbortController | null = null

      const refreshBillingAccess = async () => {
        activeController?.abort()
        const controller = new AbortController()
        activeController = controller

        const query = new URLSearchParams()
        if (tenantSchema) {
          query.set("tenant", tenantSchema)
        }
        if (userEmail) {
          query.set("email", userEmail)
        }

        try {
          const response = await fetch(`/api/admin/billing/access${query.toString() ? `?${query.toString()}` : ""}`, {
            signal: controller.signal,
            cache: "no-store",
          })

          const payload = (await response.json().catch(() => null)) as { canAccessSections?: boolean } | null
          if (!response.ok || isDisposed) {
            return
          }

          setCanAccessAdminSections(Boolean(payload?.canAccessSections))
        } catch (error) {
          if (controller.signal.aborted || isDisposed) {
            return
          }

          console.warn("No se pudo validar el acceso admin por suscripción", error)
        }
      }

      void refreshBillingAccess()

      const intervalId = window.setInterval(() => {
        void refreshBillingAccess()
      }, 30000)

      const handleFocus = () => {
        void refreshBillingAccess()
      }

      const handleBillingUpdated = () => {
        void refreshBillingAccess()
      }

      const handleStorage = (event: StorageEvent) => {
        if (["userEmail", "userDisplayName", "userRole", "userAvatar"].includes(event.key ?? "")) {
          syncSidebarUserInfo()
        }

        if (event.key !== "adminBillingUpdatedAt") {
          return
        }

        void refreshBillingAccess()
      }

      const handleVisibilityChange = () => {
        if (document.visibilityState === "visible") {
          void refreshBillingAccess()
        }
      }

      window.addEventListener("focus", handleFocus)
      window.addEventListener("admin-billing-updated", handleBillingUpdated)
      window.addEventListener("storage", handleStorage)
      document.addEventListener("visibilitychange", handleVisibilityChange)

      return () => {
        isDisposed = true
        activeController?.abort()
        window.clearInterval(intervalId)
        window.removeEventListener("user-profile-updated", handleProfileUpdated)
        window.removeEventListener("focus", handleFocusSync)
        window.removeEventListener("focus", handleFocus)
        window.removeEventListener("admin-billing-updated", handleBillingUpdated)
        window.removeEventListener("storage", handleStorage)
        document.removeEventListener("visibilitychange", handleVisibilityChange)
      }
    }

    const handleStorage = (event: StorageEvent) => {
      if (["userEmail", "userDisplayName", "userRole", "userAvatar"].includes(event.key ?? "")) {
        syncSidebarUserInfo()
      }
    }

    window.addEventListener("storage", handleStorage)

    return () => {
      window.removeEventListener("user-profile-updated", handleProfileUpdated)
      window.removeEventListener("focus", handleFocusSync)
      window.removeEventListener("storage", handleStorage)
    }
  }, [])

  React.useEffect(() => {
    setUserInfo((previous) => ({
      ...previous,
      roleLabel: roleLabels[role],
    }))
  }, [role])

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const email = (userInfo.email ?? "").trim().toLowerCase()
    if (!email) {
      return
    }

    const tenant = (localStorage.getItem("tenantSchema") ?? localStorage.getItem("userTenant") ?? "").trim()
    const headers: Record<string, string> = {
      "x-user-email": email,
    }

    if (tenant) {
      headers["x-tenant"] = tenant
    }

    const controller = new AbortController()

    const hydrateAvatar = async () => {
      try {
        const response = await fetch(`/api/profile?email=${encodeURIComponent(email)}`, {
          cache: "no-store",
          headers,
          signal: controller.signal,
        })

        const payload = (await response.json().catch(() => null)) as
          | { profile?: { avatarUrl?: string | null; name?: string | null } }
          | null

        if (!response.ok || !payload?.profile) {
          return
        }

        const nextAvatar = payload.profile.avatarUrl?.trim() || defaultAvatar
        const nextName = payload.profile.name?.trim() || userInfo.name

        if (nextAvatar && nextAvatar !== defaultAvatar) {
          localStorage.setItem("userAvatar", nextAvatar)
        } else {
          localStorage.removeItem("userAvatar")
        }

        setUserInfo((previous) => ({
          ...previous,
          name: nextName,
          avatar: nextAvatar,
        }))
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }
        console.warn("No se pudo hidratar el avatar del usuario", error)
      }
    }

    void hydrateAvatar()

    return () => {
      controller.abort()
    }
  }, [userInfo.email])

  const menusByRole = React.useMemo(() => {
    const clientNav = [
      { title: "Inicio", url: "/dashboard", icon: Home },
      {
        title: "Reservar",
        url: "/booking",
        icon: CalendarDays,
      },
      { title: "Mis Citas", url: "/dashboard/appointments", icon: ClipboardList },
      { title: "Mis barberos favoritos", url: "/favorites", icon: Heart },
      { title: "Pagos / Wallet", url: "/wallet", icon: DollarSign },
      { title: "Perfil", url: "/profile", icon: UserCircle },
    ]

    const barberNav = [
      { title: "Dashboard / Mi Agenda", url: "/barber", icon: Home },
      { title: "Agendamientos", url: "/barber/agendamientos", icon: CalendarDays },
      { title: "Mis Citas", url: "/barber/appointments", icon: ClipboardList },
      { title: "Mi Disponibilidad", url: "/barber/availability", icon: Clock },
      { title: "Mis Servicios", url: "/barber/services", icon: Scissors },
      { title: "Mis Ganancias", url: "/barber/earnings", icon: TrendingUp },
    ]

    const adminNav = [
      { title: "Dashboard General", url: "/admin", icon: Home },
      { title: "Agendamientos", url: "/admin/agendamientos", icon: CalendarDays },
      { title: "Disponibilidad Equipo", url: "/admin/disponibilidad", icon: Clock },
      { title: "Conversaciones", url: "/admin/conversaciones", icon: MessageSquare },
      { title: "Empleados", url: "/admin/empleados", icon: Users },
      { title: "Clientes", url: "/admin/clientes", icon: Users },
      { title: "Servicios", url: "/admin/servicios", icon: Scissors },
      { title: "Sedes", url: "/admin/sedes", icon: MapPin },
      { title: "Planes", url: "/admin/planes", icon: DollarSign },
      { title: "Pagos y Facturación", url: "/admin/pagos", icon: Receipt },
      { title: "Reportes", url: "/admin/reportes", icon: BarChart3 },
      { title: "Ajustes / Configuración", url: "/admin/ajustes", icon: Settings2 },
    ].map((item) => {
      if (canAccessAdminSections) {
        return item
      }

      const isEnabledWithoutPayment = item.url === "/admin/planes"
      if (isEnabledWithoutPayment) {
        return item
      }

      return {
        ...item,
        disabled: true,
        disabledReason: "Debes tener un pago aprobado del plan para habilitar esta sección.",
      }
    })

    return {
      client: { nav: clientNav },
      barber: { nav: barberNav },
      admin: { nav: adminNav },
    }
  }, [canAccessAdminSections])

  const current = menusByRole[role]

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarContent>
        <NavMain label="Barbería" items={current.nav} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={userInfo} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
