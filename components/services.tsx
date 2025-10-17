import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Scissors, Sparkles, Palette, Waves, Zap, Crown } from "lucide-react"
import Link from "next/link"

const services = [
  {
    icon: Scissors,
    title: "Corte de Cabello",
    description: "Cortes clásicos y modernos adaptados a tu estilo personal",
    price: "$2,300",
    duration: "45 min",
    popular: true,
  },
  {
    icon: Sparkles,
    title: "Afeitado Clásico",
    description: "Afeitado tradicional con toalla caliente y productos premium",
    price: "$1,800",
    duration: "30 min",
    popular: false,
  },
  {
    icon: Palette,
    title: "Coloración",
    description: "Tintes y mechas profesionales con productos de alta calidad",
    price: "$3,500",
    duration: "90 min",
    popular: false,
  },
  {
    icon: Waves,
    title: "Peinado y Estilo",
    description: "Peinados para eventos especiales y ocasiones importantes",
    price: "$1,200",
    duration: "30 min",
    popular: false,
  },
  {
    icon: Zap,
    title: "Tratamiento Capilar",
    description: "Tratamientos revitalizantes para cabello y cuero cabelludo",
    price: "$2,800",
    duration: "60 min",
    popular: false,
  },
  {
    icon: Crown,
    title: "Paquete Premium",
    description: "Corte + Afeitado + Tratamiento - La experiencia completa",
    price: "$5,500",
    duration: "120 min",
    popular: true,
  },
]

export function Services() {
  return (
    <section id="servicios" className="py-24 lg:py-32">
      <div className="container">
        <div className="text-center space-y-4 mb-16">
          <Badge variant="secondary" className="text-sm">
            Nuestros Servicios
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold tracking-tight text-balance">
            Servicios de barbería profesional
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto text-pretty">
            Ofrecemos una amplia gama de servicios diseñados para que luzcas y te sientas increíble
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => {
            const Icon = service.icon
            return (
              <Card key={service.title} className="relative overflow-hidden group hover:shadow-lg transition-shadow">
                {service.popular && (
                  <div className="absolute top-4 right-4">
                    <Badge className="bg-secondary text-secondary-foreground">Popular</Badge>
                  </div>
                )}
                <CardHeader>
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 mb-4 group-hover:bg-primary/20 transition-colors">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl">{service.title}</CardTitle>
                  <CardDescription className="text-base leading-relaxed">{service.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-3xl font-bold">{service.price}</span>
                    <span className="text-sm text-muted-foreground">{service.duration}</span>
                  </div>
                  <Button asChild className="w-full">
                    <Link href="/booking">Agendar Ahora</Link>
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
