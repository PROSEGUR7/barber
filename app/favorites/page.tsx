import Link from "next/link"
import { CalendarClock, Phone } from "lucide-react"

import { AppSidebar } from "@/components/app-sidebar"
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

const favoriteBarbers = [
  {
    name: "Camilo Andrade",
    specialty: "Fades y barbería moderna",
    rating: "4.9",
    nextAvailability: "Hoy · 6:30 PM",
    phone: "+57 320 123 4567",
  },
  {
    name: "Laura Méndez",
    specialty: "Color y tratamientos capilares",
    rating: "4.8",
    nextAvailability: "Mañana · 9:00 AM",
    phone: "+57 310 765 4321",
  },
  {
    name: "Miguel Ángel",
    specialty: "Afeitado clásico y diseño de barba",
    rating: "5.0",
    nextAvailability: "Sábado · 11:00 AM",
    phone: "+57 315 998 2211",
  },
]

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

export default function FavoritesPage() {
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
                  <BreadcrumbPage>Mis barberos favoritos</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
          <section className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">Mis barberos favoritos</h1>
            <p className="text-muted-foreground text-sm">
              Guarda a tu equipo de confianza para reservar más rápido y revisar horarios disponibles.
            </p>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {favoriteBarbers.map((barber) => (
              <Card key={barber.name} className="border border-border/70 shadow-sm">
                <CardHeader className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
                      {getInitials(barber.name)}
                    </div>
                    <div>
                      <CardTitle className="text-xl">{barber.name}</CardTitle>
                      <CardDescription>{barber.specialty}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{barber.rating}</span>
                    · Clientes lo recomiendan
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                    <CalendarClock className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-foreground">Próxima disponibilidad</p>
                      <p className="text-muted-foreground">{barber.nextAvailability}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                    <Phone className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-foreground">Contacto directo</p>
                      <p className="text-muted-foreground">{barber.phone}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm">
                      Ver horarios
                    </Button>
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/booking?barber=${encodeURIComponent(barber.name)}`}>
                        Reservar con {barber.name.split(" ")[0]}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
