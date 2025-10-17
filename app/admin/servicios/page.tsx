"use client"

import { Scissors } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

export default function AdminServiciosPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto space-y-8 px-4 py-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">Servicios</h1>
          <p className="text-muted-foreground">
            Administra el catálogo de servicios, precios y duraciones ofrecidas por la barbería.
          </p>
        </header>

        <Card className="border border-dashed">
          <CardHeader>
            <CardTitle>Módulo en construcción</CardTitle>
            <CardDescription>
              Pronto podrás crear, editar y desactivar servicios, así como definir combos y tiempos de atención.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Scissors className="h-6 w-6" />
                </EmptyMedia>
                <EmptyTitle>Catálogo aún no disponible</EmptyTitle>
                <EmptyDescription>
                  Estamos preparando una experiencia para gestionar servicios, categorías y variantes de precio.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="text-sm text-muted-foreground">
                Si necesitas agregar un servicio urgente, contacta al soporte técnico temporalmente.
              </EmptyContent>
            </Empty>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
