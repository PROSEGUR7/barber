"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Bot, Building2, Crown, Sparkles, User } from "lucide-react"
import Link from "next/link"

import { formatCop, SAAS_PLANS, type SaasPlanId } from "@/lib/saas-plans"

const ICON_BY_PLAN: Record<SaasPlanId, typeof Building2> = {
  independiente: User,
  "independiente-ia": Bot,
  "comercial-lite": Building2,
  "comercial-lite-ia": Sparkles,
  "comercial-pro-ia": Crown,
}

export function Services() {
  return (
    <section id="planes" className="py-24 lg:py-32">
      <div className="container">
        <div className="text-center space-y-4 mb-16">
          <Badge variant="secondary" className="text-sm">
            Planes de suscripcion
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold tracking-tight text-balance">
            Elige el plan ideal para tu barberia
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto text-pretty">
            Cinco planes con precios claros: primer mes y valor mensual desde el segundo mes.
          </p>
        </div>

        <div className="mx-auto grid max-w-7xl gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {SAAS_PLANS.map((plan) => {
            const Icon = ICON_BY_PLAN[plan.id]
            const introPrice = plan.introPriceInCop ?? plan.priceInCop
            const recurringPrice = plan.recurringPriceInCop ?? plan.priceInCop
            return (
              <Card key={plan.title} className="relative h-full overflow-hidden group hover:shadow-lg transition-shadow flex flex-col">
                <CardHeader className="pb-3">
                  <div className="mb-4 flex items-end justify-between gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex shrink-0 flex-col items-end text-right">
                      <span className="text-[10px] uppercase text-muted-foreground">Primer mes</span>
                      <span className="whitespace-nowrap text-xl font-bold leading-none lg:text-2xl">
                        {formatCop(introPrice)}
                      </span>
                      <span className="whitespace-nowrap text-[10px] text-muted-foreground lg:text-xs">
                        Luego {formatCop(recurringPrice)}{plan.durationLabel}
                      </span>
                    </div>
                  </div>
                  <CardTitle className="text-xl">{plan.title}</CardTitle>
                  <CardDescription className="text-base leading-relaxed">{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <ul className="mb-6 space-y-1.5 text-sm text-muted-foreground">
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
