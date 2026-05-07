export type SaasPlanId =
  | "independiente"
  | "independiente-ia"
  | "comercial-lite"
  | "comercial-lite-ia"
  | "comercial-pro-ia"

export const SAAS_PLAN_IDS: SaasPlanId[] = [
  "independiente",
  "independiente-ia",
  "comercial-lite",
  "comercial-lite-ia",
  "comercial-pro-ia",
]

export type SaasPlan = {
  id: SaasPlanId
  title: string
  description: string
  priceInCop: number
  durationLabel: string
  features: string[]
  popular: boolean
  introPriceInCop?: number
  recurringPriceInCop?: number
  implementationFeeInCop?: number | null
}

export const SAAS_PLANS: SaasPlan[] = [
  {
    id: "independiente",
    title: "Plan Independiente",
    description: "Para barberias que inician con operacion digital basica.",
    priceInCop: 59900,
    durationLabel: "/mes",
    features: [
      "Plataforma administrativa",
      "Agendamiento",
      "Cliente via web",
      "Usuarios administrativos: 1",
      "Empleados: 1",
    ],
    popular: false,
    introPriceInCop: 29900,
    recurringPriceInCop: 59900,
    implementationFeeInCop: null,
  },
  {
    id: "independiente-ia",
    title: "Plan Independiente + Chatbot IA",
    description: "Incluye atencion automatizada via WhatsApp con IA.",
    priceInCop: 99900,
    durationLabel: "/mes",
    features: [
      "Plataforma administrativa",
      "Agendamiento",
      "Cliente via web",
      "Usuarios administrativos: 1",
      "Empleados: 1",
      "Chatbot IA WhatsApp (atencion cliente, agendamientos y consultas)",
      "Capacidad chats: ~300 citas/mes",
      "Limite tokens: 1.2 millones",
      "Valor unico implementacion: $150.000",
    ],
    popular: false,
    introPriceInCop: 49900,
    recurringPriceInCop: 99900,
    implementationFeeInCop: 150000,
  },
  {
    id: "comercial-lite",
    title: "Plan Comercial Lite",
    description: "Ideal para equipos con mas personal y multiples sedes.",
    priceInCop: 99900,
    durationLabel: "/mes",
    features: [
      "Plataforma administrativa",
      "Agendamiento",
      "Cliente via web",
      "Usuarios administrativos: 10",
      "Empleados: 10",
      "Multi-sedes",
    ],
    popular: true,
    introPriceInCop: 49900,
    recurringPriceInCop: 99900,
    implementationFeeInCop: null,
  },
  {
    id: "comercial-lite-ia",
    title: "Plan Comercial Lite + Chatbot IA",
    description: "Automatizacion con IA para equipos con varias sedes.",
    priceInCop: 149900,
    durationLabel: "/mes",
    features: [
      "Plataforma administrativa",
      "Agendamiento",
      "Cliente via web",
      "Usuarios administrativos: 10",
      "Empleados: 10",
      "Multi-sedes",
      "Chatbot IA WhatsApp (atencion cliente, agendamientos y consultas)",
      "Capacidad chats: ~800 citas/mes",
      "Limite tokens: 3.5 millones",
      "Valor unico implementacion: $150.000",
    ],
    popular: true,
    introPriceInCop: 75900,
    recurringPriceInCop: 149900,
    implementationFeeInCop: 150000,
  },
  {
    id: "comercial-pro-ia",
    title: "Plan Comercial Pro + Chatbot IA",
    description: "Operacion avanzada con IA para multiples sedes y alto volumen.",
    priceInCop: 299900,
    durationLabel: "/mes",
    features: [
      "Plataforma administrativa",
      "Agendamiento",
      "Cliente via web",
      "Usuarios administrativos: 50",
      "Empleados: 50",
      "Multi-sedes",
      "Chatbot IA WhatsApp (atencion cliente, agendamientos y consultas)",
      "Capacidad chats: ~2,000+ citas/mes",
      "Limite tokens: 8 millones",
      "Valor unico implementacion: $250.000",
    ],
    popular: false,
    introPriceInCop: 149900,
    recurringPriceInCop: 299900,
    implementationFeeInCop: 250000,
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
