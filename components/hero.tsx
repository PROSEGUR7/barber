import { Button } from "@/components/ui/button"
import { Calendar, Clock, Star } from "lucide-react"
import Link from "next/link"

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-background to-muted/20">
      <div className="container py-24 lg:py-32">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2 xl:gap-16">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/10 border border-secondary/20">
              <Star className="h-4 w-4 text-secondary fill-secondary" />
              <span className="text-sm font-medium">Calificación 4.9/5 - Más de 500 clientes</span>
            </div>

            <h1 className="text-5xl lg:text-7xl font-bold tracking-tight text-balance">
              Estilo y elegancia en cada corte
            </h1>

            <p className="text-xl text-muted-foreground text-pretty leading-relaxed">
              Experimenta el arte de la barbería tradicional con técnicas modernas. Nuestros expertos barberos
              transforman tu look con precisión y estilo.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button asChild size="lg" className="text-base">
                <Link href="/booking">
                  <Calendar className="mr-2 h-5 w-5" />
                  Agendar Cita Ahora
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-base bg-transparent">
                <Link href="#servicios">Ver Servicios</Link>
              </Button>
            </div>

            <div className="flex items-center gap-8 pt-4">
              <div className="flex flex-col">
                <span className="text-3xl font-bold">500+</span>
                <span className="text-sm text-muted-foreground">Clientes Felices</span>
              </div>
              <div className="h-12 w-px bg-border" />
              <div className="flex flex-col">
                <span className="text-3xl font-bold">15+</span>
                <span className="text-sm text-muted-foreground">Años Experiencia</span>
              </div>
              <div className="h-12 w-px bg-border" />
              <div className="flex flex-col">
                <span className="text-3xl font-bold">10</span>
                <span className="text-sm text-muted-foreground">Barberos Expertos</span>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-secondary/20 to-transparent rounded-3xl" />
            <img
              src="/modern-barbershop-haircut.png"
              alt="Barbero profesional"
              className="rounded-3xl shadow-2xl w-full h-auto"
            />
            <div className="absolute bottom-6 left-6 right-6 bg-card/95 backdrop-blur-sm rounded-2xl p-6 border border-border shadow-lg">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                  <Clock className="h-6 w-6 text-secondary-foreground" />
                </div>
                <div>
                  <p className="font-semibold">Horario Flexible</p>
                  <p className="text-sm text-muted-foreground">Lun - Sáb: 9:00 AM - 8:00 PM</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
