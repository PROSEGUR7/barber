import { Badge } from "@/components/ui/badge"
import { CheckCircle2 } from "lucide-react"

const features = [
  "Reservas y agenda centralizada para todo tu equipo",
  "Gestión de clientes, pagos y reportes en tiempo real",
  "Automatizaciones con n8n para tareas operativas",
  "Flujos de IA para atención y seguimiento",
  "Escalabilidad por plan según etapa del negocio",
  "Implementación rápida y soporte continuo",
]

export function About() {
  return (
    <section id="nosotros" className="py-24 lg:py-32 bg-muted/30">
      <div className="container">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2 xl:gap-16">
          <div className="relative order-2 lg:order-1">
            <div className="grid grid-cols-2 gap-4">
              <img
                src="/modern-barbershop.png"
                alt="Interior barbería"
                className="rounded-2xl shadow-lg w-full h-auto"
              />
              <img
                src="/barber-tools-and-products.jpg"
                alt="Herramientas de barbería"
                className="rounded-2xl shadow-lg w-full h-auto mt-8"
              />
            </div>
            <div className="absolute -bottom-6 -right-6 bg-secondary text-secondary-foreground rounded-2xl p-6 shadow-xl max-w-[200px]">
              <p className="text-4xl font-bold">15+</p>
              <p className="text-sm">Años construyendo soluciones digitales</p>
            </div>
          </div>

          <div className="space-y-6 order-1 lg:order-2">
            <Badge variant="secondary" className="text-sm">
              Sobre la Plataforma
            </Badge>
            <h2 className="text-4xl lg:text-5xl font-bold tracking-tight text-balance">
              Operación inteligente para salones modernos
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed text-pretty">
              Hair Salon SaaS centraliza toda la operación de tu negocio en una sola plataforma y te ayuda a crecer con automatización e IA.
            </p>

            <div className="space-y-3 pt-4">
              {features.map((feature) => (
                <div key={feature} className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-secondary shrink-0 mt-0.5" />
                  <span className="text-base leading-relaxed">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
