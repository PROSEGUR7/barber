"use client"

import { Settings2 } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

export default function AdminAjustesPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto space-y-8 px-4 py-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">Ajustes de la plataforma</h1>
          <p className="text-muted-foreground">
            Configura preferencias generales, permisos del equipo y personalización de la marca.
          </p>
        </header>

        <Card className="border border-dashed">
          <CardHeader>
            <CardTitle>Centro de configuración en proceso</CardTitle>
            <CardDescription>
              Permitirá administrar roles, permisos, branding y notificaciones para toda la plataforma.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Settings2 className="h-6 w-6" />
                </EmptyMedia>
                <EmptyTitle>Configuraciones aún no disponibles</EmptyTitle>
                <EmptyDescription>
                  Estamos preparando opciones avanzadas para adaptar la experiencia de BarberPro a tu negocio.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="text-sm text-muted-foreground">
                Si necesitas actualizar información crítica, comunícate con soporte mientras liberamos el módulo.
              </EmptyContent>
            </Empty>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
