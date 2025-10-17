import Link from "next/link"
import {
  ArrowRight,
  CalendarDays,
  MapPin,
  Sparkles,
  Star,
  Trophy,
  User as UserIcon,
} from "lucide-react"

import { AppSidebar } from "@/components/app-sidebar"
import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

const userProfile = {
  name: "Brandon",
  membership: "Silver",
  nextAppointment: "viernes 18 a las 4:30 pm",
}

const quickLinks = [
  {
    title: "Reservar ahora",
    description: "Agenda en minutos tu próxima visita.",
    href: "/booking",
  },
  {
    title: "Mis citas",
    description: "Consulta o actualiza tus reservas.",
    href: "/dashboard/appointments",
  },
  {
    title: "Pagos y wallet",
    description: "Gestiona métodos, recibos y cupones.",
    href: "/wallet",
  },
  {
    title: "Mis barberos",
    description: "Repite con tu equipo favorito.",
    href: "/favorites",
  },
]

const recommendations = [
  {
    name: "Repite con Camilo",
    detail: "Es tu barbero más frecuente, reserva tu mismo combo en segundos.",
    cta: "/booking?barber=camilo",
  },
  {
    name: "Paquete fidelidad",
    detail: "Corte + barba con 10% OFF por ser nivel Silver.",
    cta: "/booking?package=fidelidad",
  },
  {
    name: "Nuevo tratamiento Detox",
    detail: "Complementa tus servicios habituales con limpieza profunda.",
    cta: "/booking?service=detox",
  },
]

export default function Page() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar:duration-200">
          <div className="flex w-full items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/dashboard">Inicio</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Panel cliente</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ml-auto flex items-center gap-3 text-sm">
              <Badge variant="secondary" className="flex items-center gap-1">
                <Trophy className="h-3 w-3" />
                {userProfile.membership}
              </Badge>
              <span className="hidden md:block text-muted-foreground">
                👋 Hola {userProfile.name}, tu próxima cita es el {userProfile.nextAppointment}.
              </span>
            </div>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
          <p className="text-sm text-muted-foreground md:hidden">
            👋 Hola {userProfile.name}, tu próxima cita es el {userProfile.nextAppointment}.
          </p>
          <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <Card className="border border-border/70 shadow-sm">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Badge variant="secondary" className="mb-2 w-fit uppercase">
                    Próxima cita
                  </Badge>
                  <CardTitle className="text-2xl">Corte + Diseño de Barba</CardTitle>
                  <CardDescription>
                    Viernes 18 de octubre · 4:30 PM · 50 min
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline">Reprogramar</Button>
                  <Button variant="ghost" className="text-destructive hover:text-destructive">
                    Cancelar
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <div className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2">
                  <CalendarDays className="text-primary h-5 w-5" />
                  <div className="text-sm">
                    <p className="font-medium">Viernes 18 de octubre</p>
                    <p className="text-muted-foreground">4:30 PM · 50 minutos</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2">
                  <MapPin className="text-primary h-5 w-5" />
                  <div className="text-sm">
                    <p className="font-medium">Sucursal Centro</p>
                    <p className="text-muted-foreground">Cl. 45 #23-10</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2">
                  <UserIcon className="text-primary h-5 w-5" />
                  <div className="text-sm">
                    <p className="font-medium">Con Camilo Andrade</p>
                    <p className="text-muted-foreground">Especialista en fades</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border border-border/70 shadow-sm">
              <CardHeader>
                <Badge variant="outline" className="w-fit uppercase">
                  Membresía
                </Badge>
                <CardTitle className="text-xl">Nivel Silver</CardTitle>
                <CardDescription>
                  180 pts acumulados · Próximo beneficio a 250 pts
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Progress value={72} />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Puntos disponibles</span>
                  <span className="font-medium">180</span>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button variant="secondary" size="sm" className="sm:flex-1">
                    Ver recompensas
                  </Button>
                  <Button variant="outline" size="sm" className="sm:flex-1">
                    Subir de nivel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="border border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Acciones rápidas</CardTitle>
                <CardDescription>
                  Basado en tus últimas reservas y pagos.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Button asChild>
                  <Link href="/booking?repeat=last">Reprogramar última cita</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/wallet#recibos">Ver recibo reciente</Link>
                </Button>
                <Button asChild variant="ghost" className="justify-start text-left">
                  <Link href="/favorites?contact=camilo">Contactar a Camilo</Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="border border-border/70 bg-primary/5 shadow-sm">
              <CardHeader>
                <Badge variant="secondary" className="flex w-fit items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  Promo destacada
                </Badge>
                <CardTitle>Paquete Detox + Estilo</CardTitle>
                <CardDescription>
                  Corte premium, limpieza facial y masaje capilar con 15% OFF de lunes a jueves.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  Disponible solo en sucursal Centro. Reserva antes del 30 de octubre.
                </p>
                <Button asChild variant="secondary">
                  <Link href="/booking?promo=detox">Aprovechar promoción</Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="border border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Accesos rápidos</CardTitle>
                <CardDescription>Accede a tus secciones favoritas.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {quickLinks.map((item) => (
                  <Link
                    key={item.title}
                    href={item.href}
                    className="border-border/50 hover:border-primary/40 hover:bg-muted/60 group flex items-start justify-between rounded-lg border px-3 py-2 text-sm transition"
                  >
                    <div>
                      <p className="font-medium group-hover:text-primary">{item.title}</p>
                      <p className="text-muted-foreground">{item.description}</p>
                    </div>
                    <ArrowRight className="text-muted-foreground group-hover:text-primary h-4 w-4" />
                  </Link>
                ))}
              </CardContent>
            </Card>
          </section>

          <section>
            <Card className="border border-border/70 shadow-sm">
              <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Te puede gustar</CardTitle>
                  <CardDescription>
                    Basado en tus reservas frecuentes y tendencias de la semana.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="flex items-center gap-1">
                  <Star className="h-3 w-3 text-yellow-500" />
                  Top picks
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent flex gap-4 overflow-x-auto pb-2">
                  {recommendations.map((item) => (
                    <div
                      key={item.name}
                      className="w-[240px] flex-shrink-0 rounded-xl border border-border/60 bg-card p-4"
                    >
                      <p className="text-sm font-semibold">{item.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="mt-4 justify-start px-0 text-primary"
                      >
                        <Link href={item.cta}>Reservar</Link>
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
