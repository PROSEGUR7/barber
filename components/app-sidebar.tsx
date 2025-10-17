"use client"

import * as React from "react"
import {
  Boxes,
  CalendarDays,
  ClipboardList,
  Clock,
  DollarSign,
  Heart,
  Home,
  Layers3,
  Receipt,
  Scissors,
  Settings2,
  TrendingUp,
  UserCircle,
  UserCog,
  Users,
} from "lucide-react"

import { NavMain } from "./nav-main"
import { NavUser } from "./nav-user"
import { TeamSwitcher } from "./team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"

// Menú adaptado a Barbería: secciones base (Inicio, Empleados, Clientes, Servicios, Agendamientos, Disponibilidad, Pagos)
const data = {
  user: {
    name: "Cliente Demo",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
  teams: [
    {
      name: "Cliente",
      logo: Layers3,
      plan: "Role",
    },
    {
      name: "Peluquero",
      logo: UserCog,
      plan: "Role",
    },
    {
      name: "Administrador",
      logo: Settings2,
      plan: "Role",
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [role, setRole] = React.useState<"client" | "barber" | "admin">("client")

  React.useEffect(() => {
    const r = (typeof window !== "undefined" && localStorage.getItem("userRole")) as
      | "client"
      | "barber"
      | "admin"
      | null
    if (r === "client" || r === "barber" || r === "admin") setRole(r)
  }, [])

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
      {
        title: "Agendamientos",
        url: "/admin#citas",
        icon: CalendarDays,
        items: [
          { title: "Reservar", url: "/booking" },
          { title: "Todas las Citas", url: "/admin#citas" },
        ],
      },
      { title: "Empleados", url: "/admin#empleados", icon: Users, items: [
        { title: "Listado", url: "/admin#empleados" },
        { title: "Horarios", url: "/admin#horarios" },
      ] },
      { title: "Clientes", url: "/admin#clientes", icon: Users, items: [
        { title: "Listado", url: "/admin#clientes" },
        { title: "Historial", url: "/admin#historial" },
      ] },
      { title: "Servicios", url: "/admin#servicios", icon: Scissors, items: [
        { title: "Catálogo", url: "/admin#servicios" },
        { title: "Precios", url: "/admin#precios" },
      ] },
      { title: "Pagos y Facturación", url: "/admin#pagos", icon: Receipt },
      { title: "Inventario / Productos", url: "/admin#inventario", icon: Boxes },
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
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain label="Barbería" items={current.nav} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
