export type SaasPlanId = "fullstack" | "fullstack-sedes" | "fullstack-ia" | "fullstack-sedes-ia"

export const SAAS_PLAN_IDS: SaasPlanId[] = [
  "fullstack",
  "fullstack-sedes",
  "fullstack-ia",
  "fullstack-sedes-ia",
]

export type SaasPlan = {
  id: SaasPlanId
  title: string
  description: string
  priceInCop: number
  durationLabel: string
  features: string[]
  popular: boolean
}

export const SAAS_PLANS: SaasPlan[] = [
  {
    id: "fullstack",
    title: "Fullstack",
    description: "Ideal para iniciar con la operación digital de tu salón.",
    priceInCop: 120000,
    durationLabel: "/mes",
    features: ["Reservas online", "Gestión de clientes", "Panel fullstack"],
    popular: false,
  },
  {
    id: "fullstack-sedes",
    title: "Fullstack con sedes",
    description: "Diseñado para negocios con múltiples sedes y operación centralizada.",
    priceInCop: 160000,
    durationLabel: "/mes",
    features: ["Todo en Fullstack", "Gestión multi-sede", "Reportes por sede"],
    popular: true,
  },
  {
    id: "fullstack-ia",
    title: "Fullstack + IA",
    description: "Escala con automatizaciones avanzadas y flujos de IA.",
    priceInCop: 180000,
    durationLabel: "/mes",
    features: ["Todo en Fullstack", "Automatizaciones n8n", "IA para operación y atención"],
    popular: true,
  },
  {
    id: "fullstack-sedes-ia",
    title: "Fullstack con sedes + IA",
    description: "Para equipos con sedes que requieren máxima automatización.",
    priceInCop: 200000,
    durationLabel: "/mes",
    features: ["Todo en Fullstack con sedes", "IA aplicada multi-sede", "Soporte prioritario"],
    popular: false,
  },
]

export function getSaasPlanById(planId: SaasPlanId): SaasPlan {
  const plan = SAAS_PLANS.find((item) => item.id === planId)
  if (!plan) {
    throw new Error("SAAS_PLAN_NOT_FOUND")
  }

  return plan
}

export function isSaasPlanId(value: string | null | undefined): value is SaasPlanId {
  if (!value) {
    return false
  }

  return SAAS_PLAN_IDS.includes(value as SaasPlanId)
}

export function formatCop(amountInCop: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amountInCop)
}
