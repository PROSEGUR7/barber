import { Button } from "@/components/ui/button"
import { Calendar } from "lucide-react"
import Link from "next/link"
import Spline from "@splinetool/react-spline/next"

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-black text-white">
      <div className="absolute inset-0 z-0">
        <Spline
          scene="https://prod.spline.design/xVMffAdnUnduUZWk/scene.splinecode"
          className="h-full w-full"
        />
      </div>
      <div className="absolute inset-0 z-10 pointer-events-none bg-gradient-to-b from-black/80 via-black/30 to-black/80" />

      <div className="relative z-20 container min-h-[calc(100vh-4rem)] py-20 lg:py-28 flex items-center justify-center pointer-events-none">
        <div className="mx-auto max-w-4xl text-center space-y-7">
          <p className="text-sm font-medium tracking-wide text-white/70">
            Soluciones de IA para tu Hair Salon
          </p>

          <h1 className="font-bold tracking-tight text-balance">
            <span className="block text-5xl sm:text-6xl lg:text-7xl">SOLUCIONES</span>
            <span className="block text-5xl sm:text-6xl lg:text-7xl text-primary">IA</span>
            <span className="block mt-3 text-2xl sm:text-3xl lg:text-4xl text-white/90">
              en tu Hair Salon
            </span>
          </h1>

          <p className="text-base sm:text-lg text-white/70 text-pretty leading-relaxed">
            Automatiza reservas, recordatorios y atención al cliente sin perder el toque humano.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2 pointer-events-auto">
            <Button asChild size="lg" className="text-base">
              <Link href="/booking">
                <Calendar className="mr-2 h-5 w-5" />
                Agendar Cita
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="text-base bg-transparent border-white/20 text-white hover:bg-white/10">
              <Link href="#servicios">Ver Servicios</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
