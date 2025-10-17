"use client"

import * as React from "react"
import {
  CalendarDays,
  ClipboardList,
  Clock,
  DollarSign,
  Heart,
  Home,
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
  const [userInfo, setUserInfo] = React.useState({
    name: "Usuario BarberPro",
    email: "",
    avatar: defaultAvatar,
    roleLabel: roleLabels.client,
  })

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const storedRole = localStorage.getItem("userRole") as RoleKey | null
    if (storedRole === "client" || storedRole === "barber" || storedRole === "admin") {
      setRole(storedRole)
    }

  const storedEmail = (localStorage.getItem("userEmail") ?? "").trim()
  const storedDisplayName = (localStorage.getItem("userDisplayName") ?? "").trim()
    const fallbackName = storedDisplayName || (storedEmail ? storedEmail.split("@")[0] : "Usuario BarberPro")
    const formattedName = formatDisplayName(fallbackName).trim() || "Usuario BarberPro"

    setUserInfo((previous) => ({
      ...previous,
      name: formattedName,
      email: storedEmail,
    }))
  }, [])

  React.useEffect(() => {
    setUserInfo((previous) => ({
      ...previous,
      roleLabel: roleLabels[role],
    }))
  }, [role])

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
      { title: "Mis Citas", url: "/barber#mis-citas", icon: ClipboardList },
      { title: "Mi Disponibilidad", url: "/barber#disponibilidad", icon: Clock },
      { title: "Mis Servicios", url: "/barber#servicios", icon: Scissors },
      { title: "Mis Ganancias", url: "/barber#ganancias", icon: TrendingUp },
    ]

    const adminNav = [
      { title: "Dashboard General", url: "/admin", icon: Home },
      { title: "Agendamientos", url: "/admin#citas", icon: CalendarDays },
      { title: "Empleados", url: "/admin#empleados", icon: Users },
      { title: "Clientes", url: "/admin#clientes", icon: Users },
      { title: "Servicios", url: "/admin#servicios", icon: Scissors },
      { title: "Pagos y Facturación", url: "/admin#pagos", icon: Receipt },
      { title: "Ajustes / Configuración", url: "/admin#ajustes", icon: Settings2 },
    ]

    return {
      client: { nav: clientNav },
      barber: { nav: barberNav },
      admin: { nav: adminNav },
    }
  }, [])

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
