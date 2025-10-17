"use client"

import { CalendarDays } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

export default function AdminAgendamientosPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto space-y-8 px-4 py-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">Agendamientos</h1>
          <p className="text-muted-foreground">
            Visualiza y gestiona la agenda completa de la barbería. Esta vista se encuentra en desarrollo.
          </p>
        </header>

        <Card className="border border-dashed">
          <CardHeader>
            <CardTitle>Próximamente</CardTitle>
            <CardDescription>
              Estamos construyendo la vista de flujo completo para agendamientos, reasignaciones y cancelaciones.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CalendarDays className="h-6 w-6" />
                </EmptyMedia>
                <EmptyTitle>Agenda central en camino</EmptyTitle>
                <EmptyDescription>
                  Aquí podrás revisar citas activas, cambios de estado y disponibilidad global en un solo lugar.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="text-sm text-muted-foreground">
                Mientras tanto, consulta cada empleado para ver sus citas asignadas o utiliza el dashboard general.
              </EmptyContent>
            </Empty>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
