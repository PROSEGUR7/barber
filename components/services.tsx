"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Building2, Building, Bot, Sparkles } from "lucide-react"
import Link from "next/link"

import { formatCop, SAAS_PLANS, type SaasPlanId } from "@/lib/saas-plans"

const ICON_BY_PLAN: Record<SaasPlanId, typeof Building2> = {
  fullstack: Building2,
  "fullstack-sedes": Building,
  "fullstack-ia": Bot,
  "fullstack-sedes-ia": Sparkles,
}

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

        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2 xl:grid-cols-4">
          {SAAS_PLANS.map((plan) => {
            const Icon = ICON_BY_PLAN[plan.id]
            return (
              <Card key={plan.title} className="relative h-full overflow-hidden group hover:shadow-lg transition-shadow flex flex-col">
                <CardHeader>
                  <div className="mb-4 flex items-end justify-between gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex shrink-0 items-baseline gap-1 text-right">
                      <span className="whitespace-nowrap text-xl font-bold leading-none lg:text-2xl">{formatCop(plan.priceInCop)}</span>
                      <span className="whitespace-nowrap text-[10px] text-muted-foreground lg:text-xs">{plan.durationLabel}</span>
                    </div>
                  </div>
                  <CardTitle className="text-xl">{plan.title}</CardTitle>
                  <CardDescription className="text-base leading-relaxed">{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <ul className="mb-5 space-y-1 text-sm text-muted-foreground">
                    {plan.features.map((feature) => (
                      <li key={feature}>• {feature}</li>
                    ))}
                  </ul>
                  <div className="mt-auto flex gap-2">
                    <Button asChild className="w-full">
                      <Link href={`/register?plan=${encodeURIComponent(plan.id)}`}>Comenzar</Link>
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
