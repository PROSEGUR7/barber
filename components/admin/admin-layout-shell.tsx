"use client"

import { useMemo } from "react"
import { usePathname } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import { AuthGuard } from "@/components/auth-guard"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

const ADMIN_SECTION_LABELS: Record<string, string> = {
  reportes: "Reportes",
  agendamientos: "Agendamientos",
  disponibilidad: "Disponibilidad Equipo",
  conversaciones: "Conversaciones",
  empleados: "Empleados",
  clientes: "Clientes",
  servicios: "Servicios",
  planes: "Planes",
  pagos: "Pagos y Facturación",
  ajustes: "Ajustes / Configuración",
}

function getAdminSectionLabel(pathname: string): string {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/admin"
  if (normalizedPath === "/admin") {
    return "Dashboard"
  }

  const segments = normalizedPath.split("/").filter(Boolean)
  const section = (segments[1] ?? "").toLowerCase()

  return ADMIN_SECTION_LABELS[section] ?? "Administración"
}

export function AdminLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const sectionLabel = useMemo(() => getAdminSectionLabel(pathname ?? "/admin"), [pathname])

  return (
    <AuthGuard allowedRoles={["admin"]}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="h-svh">
          <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar:duration-200">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink href="/">Inicio</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem>
                    <BreadcrumbLink href="/admin">Administración</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{sectionLabel}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden p-4 pt-0">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </AuthGuard>
  )
}
