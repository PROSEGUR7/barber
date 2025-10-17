"use client"

import { ChevronsUpDown, LogOut, Mail, Moon, Settings, Sun } from "lucide-react"
import { useRouter } from "next/navigation"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"

export function NavUser({
  user,
}: {
  user: { name: string; email: string; avatar: string }
}) {
  const { isMobile } = useSidebar()
  const router = useRouter()

  const handleLogout = () => {
    try {
      localStorage.removeItem("userRole")
      localStorage.removeItem("userEmail")
    } catch {}
    router.push("/login")
  }
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg">
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-lg">{user.name[0]?.toUpperCase() ?? "U"}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={isMobile ? "bottom" : "right"}
            align={isMobile ? "end" : "start"}
            className="w-56 rounded-lg"
          >
            <DropdownMenuLabel className="font-normal">
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg">{user.name[0]?.toUpperCase() ?? "U"}</AvatarFallback>
                </Avatar>
                <div className="grid text-left leading-tight">
                  <span className="font-semibold">{user.name}</span>
                  <span className="text-xs text-muted-foreground">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Mail className="text-muted-foreground" />
              <span>Bandeja de entrada</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="text-muted-foreground" />
              <span>Configuración</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Sun className="text-muted-foreground" />
              <span>Claro</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Moon className="text-muted-foreground" />
              <span>Oscuro</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="text-muted-foreground" />
              <span>Cerrar sesión</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
