import { Badge } from "@/components/ui/badge"
import { CheckCircle2 } from "lucide-react"

const features = [
  "Barberos certificados con más de 10 años de experiencia",
  "Productos premium de marcas reconocidas internacionalmente",
  "Ambiente relajado y profesional",
  "Atención personalizada para cada cliente",
  "Técnicas tradicionales y modernas",
  "Higiene y esterilización de primer nivel",
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
              <p className="text-sm">Años de excelencia en barbería</p>
            </div>
          </div>

          <div className="space-y-6 order-1 lg:order-2">
            <Badge variant="secondary" className="text-sm">
              Sobre Nosotros
            </Badge>
            <h2 className="text-4xl lg:text-5xl font-bold tracking-tight text-balance">
              Tradición y modernidad en cada servicio
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed text-pretty">
              En BarberPro, combinamos las técnicas clásicas de barbería con las tendencias más modernas para ofrecerte
              una experiencia única. Nuestro equipo de expertos está comprometido con la excelencia y tu satisfacción.
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
