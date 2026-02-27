import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Building2, Rocket, Crown } from "lucide-react"
import Link from "next/link"

const plans = [
  {
    icon: Building2,
    title: "Plan Básico",
    description: "Ideal para iniciar con la operación digital de tu salón.",
    price: "$49",
    duration: "/mes",
    features: ["Reservas online", "Gestión de clientes", "Panel fullstack"],
    popular: true,
  },
  {
    icon: Rocket,
    title: "Plan Pro",
    description: "Escala con automatizaciones avanzadas y flujos de IA.",
    price: "$149",
    duration: "/mes",
    features: ["Todo en Básico", "Automatizaciones n8n", "IA para operación y atención"],
    popular: true,
  },
  {
    icon: Crown,
    title: "Plan Enterprise",
    description: "Para cadenas o equipos que necesitan implementación a medida.",
    price: "Custom",
    duration: "",
    features: ["Arquitectura personalizada", "Integraciones dedicadas", "Soporte prioritario"],
    popular: false,
  },
]

export function Services() {
  return (
    <section id="planes" className="py-24 lg:py-32">
      <div className="container">
        <div className="text-center space-y-4 mb-16">
          <Badge variant="secondary" className="text-sm">
            Planes SaaS
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold tracking-tight text-balance">
            Elige el plan ideal para tu negocio
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto text-pretty">
            Desde operaciones básicas fullstack hasta automatizaciones con IA y soluciones empresariales.
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-3">
          {plans.map((plan) => {
            const Icon = plan.icon
            return (
              <Card key={plan.title} className="relative overflow-hidden group hover:shadow-lg transition-shadow">
                {plan.popular && (
                  <div className="absolute top-4 right-4">
                    <Badge className="bg-secondary text-secondary-foreground">Popular</Badge>
                  </div>
                )}
                <CardHeader>
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 mb-4 group-hover:bg-primary/20 transition-colors">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl">{plan.title}</CardTitle>
                  <CardDescription className="text-base leading-relaxed">{plan.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">{plan.duration}</span>
                  </div>
                  <ul className="mb-5 space-y-1 text-sm text-muted-foreground">
                    {plan.features.map((feature) => (
                      <li key={feature}>• {feature}</li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    <Button asChild className="w-full">
                      <Link href={plan.title === "Plan Enterprise" ? "/login" : "/register"}>
                        {plan.title === "Plan Enterprise" ? "Contactar" : "Comenzar"}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
