"use client"

import { Receipt } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

export default function AdminPagosPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto space-y-8 px-4 py-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">Pagos y facturación</h1>
          <p className="text-muted-foreground">
            Visualiza el historial de pagos, abonos y facturas asociados a las reservas de clientes.
          </p>
        </header>

        <Card className="border border-dashed">
          <CardHeader>
            <CardTitle>Resumen financiero no disponible</CardTitle>
            <CardDescription>
              Este módulo permitirá conciliar ingresos, exportar facturas y revisar estados de pago.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Receipt className="h-6 w-6" />
                </EmptyMedia>
                <EmptyTitle>Panel de pagos en desarrollo</EmptyTitle>
                <EmptyDescription>
                  Muy pronto podrás monitorear cobros pendientes, devoluciones y movimientos contables.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="text-sm text-muted-foreground">
                Mientras tanto, utiliza el módulo de citas para revisar pagos asociados manualmente.
              </EmptyContent>
            </Empty>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
