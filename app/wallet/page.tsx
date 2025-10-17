import Link from "next/link"
import { BadgeCheck, CreditCard, History, TicketPercent, Wallet } from "lucide-react"

import { AppSidebar } from "@/components/app-sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

const paymentMethods = [
  {
    brand: "Mastercard",
    lastFour: "9281",
    expiry: "08/27",
    status: "Principal",
  },
  {
    brand: "Visa",
    lastFour: "4412",
    expiry: "01/26",
    status: "Respaldo",
  },
]

const vouchers = [
  {
    code: "BIENVENIDO15",
    description: "15% en tu primera reserva",
    expires: "Vence 31/10/25",
  },
  {
    code: "MEMBRESIA10",
    description: "10% extra para nivel Silver",
    expires: "Sin fecha de caducidad",
  },
]

export default function WalletPage() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar:duration-200">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/dashboard">Inicio</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Pagos & Wallet</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
          <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <Card className="border border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Métodos guardados</CardTitle>
                <CardDescription>
                  Gestiona tarjetas tokenizadas para pagos rápidos y seguros.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {paymentMethods.map((method) => (
                  <div
                    key={method.lastFour}
                    className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 px-4 py-3 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <CreditCard className="text-primary h-5 w-5" />
                      <div>
                        <p className="font-medium text-foreground">
                          {method.brand} ···· {method.lastFour}
                        </p>
                        <p className="text-muted-foreground">Expira {method.expiry}</p>
                      </div>
                    </div>
                    <Badge variant="secondary">{method.status}</Badge>
                  </div>
                ))}
                <Button variant="outline" className="w-full" size="sm">
                  Agregar nuevo método
                </Button>
              </CardContent>
            </Card>

            <Card className="border border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Suscripción / Wallet</CardTitle>
                <CardDescription>
                  Consulta tu saldo, cargos recurrentes y renovaciones de membresía.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg bg-muted/60 px-4 py-3">
                  <p className="text-sm text-muted-foreground">Saldo disponible</p>
                  <p className="text-2xl font-semibold">$54.500</p>
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                  <Wallet className="text-primary h-5 w-5" />
                  <div>
                    <p className="font-medium">Suscripción Silver</p>
                    <p className="text-muted-foreground">Próximo cobro · 1 de noviembre</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" className="flex-1">
                    Recargar saldo
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1">
                    Ver historial
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card className="border border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Comprobantes y facturas</CardTitle>
                <CardDescription>
                  Descarga recibos por fecha, servicio o barbero.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                  <div className="flex items-center gap-3">
                    <History className="text-primary h-5 w-5" />
                    <div>
                      <p className="font-medium">Recibo #4523</p>
                      <p className="text-muted-foreground">Corte + barba · 12 oct</p>
                    </div>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
                    <Link href="#">Descargar</Link>
                  </Button>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                  <div className="flex items-center gap-3">
                    <History className="text-primary h-5 w-5" />
                    <div>
                      <p className="font-medium">Factura electrónica</p>
                      <p className="text-muted-foreground">Tratamiento capilar · 02 oct</p>
                    </div>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
                    <Link href="#">Descargar</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Cupones y códigos promo</CardTitle>
                <CardDescription>
                  Aplica beneficios antes de confirmar tu cita.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {vouchers.map((voucher) => (
                  <div
                    key={voucher.code}
                    className="flex items-center justify-between rounded-lg border border-dashed border-border/60 bg-muted/40 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium text-foreground">{voucher.code}</p>
                      <p className="text-muted-foreground">{voucher.description}</p>
                      <p className="text-xs text-muted-foreground">{voucher.expires}</p>
                    </div>
                    <Badge variant="secondary" className="gap-1">
                      <BadgeCheck className="h-4 w-4" />
                      Disponible
                    </Badge>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full">
                  Agregar código promocional
                </Button>
              </CardContent>
            </Card>
          </section>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
