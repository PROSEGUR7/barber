"use client"

import { Check, ChevronsUpDown } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"

export function TeamSwitcher({
  teams,
}: {
  teams: { name: string; logo: React.ComponentType<{ className?: string }>; plan: string }[]
}) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">
                    {teams[0]?.name?.charAt(0) ?? "A"}
                  </AvatarFallback>
                </Avatar>
                <div className="grid text-left leading-tight">
                  <span className="font-semibold">{teams[0]?.name}</span>
                  <span className="text-xs text-muted-foreground">{teams[0]?.plan}</span>
                </div>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 rounded-lg">
            <DropdownMenuLabel>Teams</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {teams.map((team) => (
              <DropdownMenuItem key={team.name} className="gap-2">
                <team.logo className="size-4" />
                <span className="flex-1">{team.name}</span>
                <Check className="size-4 opacity-0 data-[state=checked]:opacity-100" />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
