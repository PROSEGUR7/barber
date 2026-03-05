"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Building, Building2, Bot, Sparkles } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCop, isSaasPlanId, SAAS_PLANS, type SaasPlanId } from "@/lib/saas-plans"

type BillingCycle = "mensual" | "trimestral" | "anual"

type WompiCheckoutData = {
  publicKey: string
  currency: "COP"
  amountInCents: number
  reference: string
  signatureIntegrity: string
  redirectUrl: string
  acceptanceToken: string
  personalDataAuthToken?: string | null
}

type BillingAccessResponse = {
  hasPaidAccess?: boolean
  canAccessSections?: boolean
  accessReason?: string | null
  subscription?: {
    tenantId?: number | null
    tenantSchema?: string | null
    planCode?: string | null
    planName?: string | null
    billingCycle?: string | null
    periodEnd?: string | null
    nextChargeAt?: string | null
    subscriptionStatus?: string | null
  } | null
}

type PlanCatalogItem = {
  id: SaasPlanId
  title: string
  description: string
  durationLabel: string
  features: string[]
  monthlyPrice: number
  quarterlyPrice: number
  yearlyPrice: number
}

const ICON_BY_PLAN: Record<SaasPlanId, typeof Building2> = {
  fullstack: Building2,
  "fullstack-sedes": Building,
  "fullstack-ia": Bot,
  "fullstack-sedes-ia": Sparkles,
}

export default function AdminPlanesScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [plans, setPlans] = useState<PlanCatalogItem[]>(
    SAAS_PLANS.map((plan) => ({
      ...plan,
      monthlyPrice: plan.priceInCop,
      quarterlyPrice: plan.priceInCop * 3,
      yearlyPrice: plan.priceInCop * 12,
    })),
  )
  const [selectedPlanId, setSelectedPlanId] = useState<SaasPlanId | null>(null)
  const [checkoutPlanId, setCheckoutPlanId] = useState<SaasPlanId | null>(null)
  const [hasPaidAccess, setHasPaidAccess] = useState(false)
  const [canAccessSections, setCanAccessSections] = useState(false)
  const [accessReason, setAccessReason] = useState<string | null>(null)
  const [activePlanCode, setActivePlanCode] = useState<SaasPlanId | null>(null)
  const [activePlanName, setActivePlanName] = useState<string | null>(null)
  const [activeBillingCycle, setActiveBillingCycle] = useState<string | null>(null)
  const [isSubscriptionStateLoading, setIsSubscriptionStateLoading] = useState(true)
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<BillingCycle>("mensual")
  const [planValidUntil, setPlanValidUntil] = useState<string | null>(null)
  const [nextChargeAt, setNextChargeAt] = useState<string | null>(null)
  const [showPlanCatalog, setShowPlanCatalog] = useState(false)
  const [checkoutTenantSchema, setCheckoutTenantSchema] = useState<string | null>(null)
  const [checkoutEmail, setCheckoutEmail] = useState<string | null>(null)
  const [isReconcilingPayment, setIsReconcilingPayment] = useState(false)
  const [inlineNotice, setInlineNotice] = useState<InlineNotice | null>(null)

  const cycleOptions: Array<{ value: BillingCycle; label: string }> = [
    { value: "mensual", label: "Mensual" },
    { value: "trimestral", label: "Trimestral" },
    { value: "anual", label: "Anual" },
  ]

  const plansMetaById = useMemo(
    () =>
      SAAS_PLANS.reduce(
        (accumulator, plan) => {
          accumulator[plan.id] = plan
          return accumulator
        },
        {} as Record<SaasPlanId, (typeof SAAS_PLANS)[number]>,
      ),
    [],
  )

  useEffect(() => {
    const controller = new AbortController()

    const loadPlans = async () => {
      try {
        const response = await fetch("/api/admin/plans", {
          signal: controller.signal,
          cache: "no-store",
        })
        const payload = (await response.json().catch(() => null)) as {
          plans?: Array<{
            code?: string
            name?: string
            description?: string | null
            monthlyPrice?: number
            quarterlyPrice?: number
            yearlyPrice?: number
          }>
        } | null

        if (!response.ok || !Array.isArray(payload?.plans)) {
          return
        }

        const normalized = payload.plans
          .filter((plan) => isSaasPlanId(plan.code ?? ""))
          .map((plan) => {
            const id = plan.code as SaasPlanId
            const fallback = plansMetaById[id]
            return {
              ...fallback,
              id,
              title: plan.name?.trim() || fallback.title,
              description: plan.description?.trim() || fallback.description,
              monthlyPrice:
                typeof plan.monthlyPrice === "number" && Number.isFinite(plan.monthlyPrice) && plan.monthlyPrice > 0
                  ? Math.round(plan.monthlyPrice)
                  : fallback.priceInCop,
              quarterlyPrice:
                typeof plan.quarterlyPrice === "number" && Number.isFinite(plan.quarterlyPrice) && plan.quarterlyPrice > 0
                  ? Math.round(plan.quarterlyPrice)
                  : fallback.priceInCop * 3,
              yearlyPrice:
                typeof plan.yearlyPrice === "number" && Number.isFinite(plan.yearlyPrice) && plan.yearlyPrice > 0
                  ? Math.round(plan.yearlyPrice)
                  : fallback.priceInCop * 12,
            }
          })

        if (!controller.signal.aborted && normalized.length > 0) {
          setPlans(normalized)
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn("No se pudieron cargar planes desde admin_platform", error)
        }
      }
    }

    void loadPlans()
    return () => controller.abort()
  }, [plansMetaById])

  useEffect(() => {
    const controller = new AbortController()

    const loadSubscriptionState = async () => {
      setIsSubscriptionStateLoading(true)

      try {
        const tenantSchema =
          typeof window !== "undefined"
            ? (localStorage.getItem("tenantSchema") ?? localStorage.getItem("userTenant") ?? "").trim()
            : ""
        const userEmail =
          typeof window !== "undefined"
            ? (localStorage.getItem("userEmail") ?? "").trim()
            : ""

        const query = new URLSearchParams()
        if (tenantSchema) {
          query.set("tenant", tenantSchema)
        }
        if (userEmail) {
          query.set("email", userEmail)
        }

        const response = await fetch(`/api/admin/billing/access${query.toString() ? `?${query.toString()}` : ""}`, {
          signal: controller.signal,
          cache: "no-store",
        })

        const payload = (await response.json().catch(() => null)) as BillingAccessResponse | null
        if (!response.ok) {
          return
        }

        const nextHasPaidAccess = Boolean(payload?.hasPaidAccess)
        setHasPaidAccess(nextHasPaidAccess)
        setCanAccessSections(Boolean(payload?.canAccessSections))
        setAccessReason(payload?.accessReason ?? null)
        const resolvedTenantSchema = payload?.subscription?.tenantSchema?.trim() || tenantSchema || null
        const resolvedEmail = userEmail || null
        setCheckoutTenantSchema(resolvedTenantSchema)
        setCheckoutEmail(resolvedEmail)
        setActivePlanCode(isSaasPlanId(payload?.subscription?.planCode ?? "") ? (payload?.subscription?.planCode as SaasPlanId) : null)
        setActivePlanName(payload?.subscription?.planName?.trim() || null)
        const nextBillingCycle = payload?.subscription?.billingCycle?.trim()?.toLowerCase() || null
        setActiveBillingCycle(nextBillingCycle)
        if (nextBillingCycle === "mensual" || nextBillingCycle === "trimestral" || nextBillingCycle === "anual") {
          setSelectedBillingCycle(nextBillingCycle)
        }
        setPlanValidUntil(payload?.subscription?.periodEnd ?? null)
        setNextChargeAt(payload?.subscription?.nextChargeAt ?? null)
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn("No se pudo cargar el estado de suscripción", error)
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSubscriptionStateLoading(false)
        }
      }
    }

    void loadSubscriptionState()
    return () => controller.abort()
  }, [])

  const formattedPlanValidUntil = useMemo(() => {
    if (!planValidUntil) {
      return null
    }

    const parsed = new Date(planValidUntil)
    if (Number.isNaN(parsed.getTime())) {
      return null
    }

    return new Intl.DateTimeFormat("es-CO", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(parsed)
  }, [planValidUntil])

  const formattedNextChargeAt = useMemo(() => {
    if (!nextChargeAt) {
      return null
    }

    const parsed = new Date(nextChargeAt)
    if (Number.isNaN(parsed.getTime())) {
      return null
    }

    return new Intl.DateTimeFormat("es-CO", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(parsed)
  }, [nextChargeAt])

  const remainingTimeLabel = useMemo(() => {
    if (!planValidUntil) {
      return null
    }

    const target = new Date(planValidUntil).getTime()
    if (!Number.isFinite(target)) {
      return null
    }

    const now = Date.now()
    const diffMs = target - now
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays < 0) {
      return "Vencido"
    }

    if (diffDays === 0) {
      return "Vence hoy"
    }

    return `${diffDays} día(s) restante(s)`
  }, [planValidUntil])

  const remainingTimeHint = useMemo(() => {
    if (!remainingTimeLabel || !activeBillingCycle || !planValidUntil) {
      return null
    }

    const target = new Date(planValidUntil).getTime()
    if (!Number.isFinite(target)) {
      return null
    }

    const diffDays = Math.ceil((target - Date.now()) / (1000 * 60 * 60 * 24))
    const expectedDaysByCycle: Record<string, number> = {
      mensual: 31,
      trimestral: 93,
      anual: 366,
    }

    const expectedDays = expectedDaysByCycle[activeBillingCycle]
    if (!expectedDays || diffDays <= expectedDays + 3) {
      return null
    }

    return "Tienes cobertura acumulada por un pago adelantado sobre tu plan actual."
  }, [remainingTimeLabel, activeBillingCycle, planValidUntil])

  const getPriceByCycle = useCallback((plan: PlanCatalogItem, cycle: BillingCycle) => {
    if (cycle === "trimestral") {
      return plan.quarterlyPrice
    }

    if (cycle === "anual") {
      return plan.yearlyPrice
    }

    return plan.monthlyPrice
  }, [])

  const getCycleDurationLabel = useCallback((cycle: BillingCycle) => {
    if (cycle === "trimestral") {
      return "/ trimestre"
    }

    if (cycle === "anual") {
      return "/ año"
    }

    return "/ mes"
  }, [])

  const handleSelectPlan = useCallback(async (planId: SaasPlanId, cycleOverride?: BillingCycle) => {
    setSelectedPlanId(planId)
    setCheckoutPlanId(planId)
    const billingCycle = cycleOverride ?? selectedBillingCycle
    const tenantSchemaFromStorage =
      typeof window !== "undefined"
        ? (localStorage.getItem("tenantSchema") ?? localStorage.getItem("userTenant") ?? "").trim()
        : ""
    const userEmailFromStorage =
      typeof window !== "undefined"
        ? (localStorage.getItem("userEmail") ?? "").trim()
        : ""
    const tenantSchema = checkoutTenantSchema?.trim() || tenantSchemaFromStorage
    const userEmail = checkoutEmail?.trim() || userEmailFromStorage

    if (!tenantSchema || !userEmail) {
      setInlineNotice({
        type: "error",
        title: "Sesión incompleta",
        message: "No se pudo resolver tu contexto de sesión (tenant/email). Cierra sesión y vuelve a ingresar.",
      })
      setCheckoutPlanId(null)
      return
    }

    try {
      const response = await fetch("/api/payments/wompi/plans/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId,
          billingCycle,
          tenant: tenantSchema,
          email: userEmail,
        }),
      })

      const payload = (await response.json().catch(() => null)) as {
        wompiCheckout?: WompiCheckoutData
        error?: string
        code?: string
      } | null

      if (response.status === 409 && payload?.code === "PLAN_CHANGE_NOT_SUPPORTED") {
        setInlineNotice({
          type: "error",
          title: "Cambio de plan no habilitado",
          message:
            payload.error?.trim() ||
            "El cambio de plan aún no está habilitado en billing. Solo puedes pagar tu plan actual desde esta pantalla.",
        })
        return
      }

      if (!response.ok || !payload?.wompiCheckout) {
        throw new Error(payload?.error?.trim() || "No se pudo iniciar el checkout del plan.")
      }

      const checkout = payload.wompiCheckout
      const normalizedRedirectUrl = checkout.redirectUrl?.trim() ?? ""
      const canUseRedirectUrl =
        normalizedRedirectUrl.length > 0 && !/localhost|127\.0\.0\.1/i.test(normalizedRedirectUrl)

      const form = document.createElement("form")
      form.method = "GET"
      form.action = "https://checkout.wompi.co/p/"
      form.target = "_self"

      const fields: Array<{ name: string; value: string }> = [
        { name: "public-key", value: checkout.publicKey },
        { name: "currency", value: checkout.currency },
        { name: "amount-in-cents", value: String(checkout.amountInCents) },
        { name: "reference", value: checkout.reference },
        { name: "signature:integrity", value: checkout.signatureIntegrity },
        { name: "acceptance-token", value: checkout.acceptanceToken },
      ]

      if (checkout.personalDataAuthToken?.trim()) {
        fields.push({ name: "personal-data-auth-token", value: checkout.personalDataAuthToken })
      }

      if (canUseRedirectUrl) {
        fields.push({ name: "redirect-url", value: normalizedRedirectUrl })
      }

      for (const field of fields) {
        const input = document.createElement("input")
        input.type = "hidden"
        input.name = field.name
        input.value = field.value
        form.appendChild(input)
      }

      document.body.appendChild(form)
      form.submit()
      form.remove()
    } catch (error) {
      console.error("Error starting admin plan checkout", error)
      setInlineNotice({
        type: "error",
        title: "No se pudo iniciar el pago",
        message: error instanceof Error ? error.message : "No se pudo iniciar el pago del plan",
      })
    } finally {
      setCheckoutPlanId(null)
    }
  }, [checkoutEmail, checkoutTenantSchema, selectedBillingCycle])

  useEffect(() => {
    const paymentProvider = (searchParams.get("paymentProvider") ?? "").trim().toLowerCase()
    const reference = (searchParams.get("reference") ?? "").trim()

    if (paymentProvider !== "wompi" || !reference) {
      return
    }

    let isCancelled = false

    const reconcilePayment = async () => {
      if (!isCancelled) {
        setIsReconcilingPayment(true)
      }

      try {
        const byReferenceResponse = await fetch(`/api/payments/wompi/reference/${encodeURIComponent(reference)}`, {
          cache: "no-store",
        })

        const byReferencePayload = (await byReferenceResponse.json().catch(() => null)) as {
          transactionId?: string | null
          error?: string
        } | null

        if (!byReferenceResponse.ok || !byReferencePayload?.transactionId) {
          throw new Error(byReferencePayload?.error?.trim() || "No se pudo resolver la transacción de Wompi.")
        }

        const transactionResponse = await fetch(
          `/api/payments/wompi/transaction/${encodeURIComponent(byReferencePayload.transactionId)}`,
          { cache: "no-store" },
        )

        const transactionPayload = (await transactionResponse.json().catch(() => null)) as {
          billingRegistration?: {
            registered?: boolean
            skipped?: boolean
            rejected?: boolean
            message?: string | null
          }
          billingRejectMessage?: string | null
          error?: string
        } | null

        if (!transactionResponse.ok) {
          throw new Error(transactionPayload?.error?.trim() || "No se pudo conciliar el pago de Wompi.")
        }

        if (transactionPayload?.billingRegistration?.registered || transactionPayload?.billingRegistration?.skipped) {
          setInlineNotice({
            type: "success",
            title: "Pago conciliado",
            message: "Tu suscripción fue actualizada correctamente.",
          })
        } else if (transactionPayload?.billingRegistration?.rejected) {
          setInlineNotice({
            type: "error",
            title: "Pago rechazado por billing",
            message:
              transactionPayload.billingRejectMessage?.trim() ||
              transactionPayload.billingRegistration.message?.trim() ||
              "El pago fue aprobado en pasarela pero rechazado por billing.",
          })
        }
      } catch (error) {
        if (!isCancelled) {
          setInlineNotice({
            type: "error",
            title: "No se pudo validar el pago",
            message: error instanceof Error ? error.message : "No se pudo validar el pago de Wompi",
          })
        }
      } finally {
        if (!isCancelled) {
          setIsReconcilingPayment(false)
          router.replace("/admin/planes")
        }
      }
    }

    void reconcilePayment()

    return () => {
      isCancelled = true
    }
  }, [router, searchParams])

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto space-y-4 px-4 py-4">
        <header className="space-y-1.5">
          <h1 className="text-3xl font-bold">Planes</h1>
          <p className="text-muted-foreground">
            Escoge uno de los 4 planes disponibles para gestionar tu suscripción.
          </p>
          {inlineNotice && (
            <Alert variant={inlineNotice.type === "error" ? "destructive" : "default"}>
              {inlineNotice.type === "error" ? <TriangleAlert /> : <CircleCheck />}
              <AlertTitle className="flex items-center justify-between gap-2">
                <span>{inlineNotice.title}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setInlineNotice(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </AlertTitle>
              <AlertDescription>{inlineNotice.message}</AlertDescription>
            </Alert>
          )}
          {isReconcilingPayment && (
            <p className="text-sm text-muted-foreground">Validando pago en Wompi y actualizando billing...</p>
          )}
          {isSubscriptionStateLoading && (
            <p className="text-sm text-muted-foreground">Cargando estado de tu plan...</p>
          )}
          {hasPaidAccess && formattedPlanValidUntil && (
            <p className="text-sm text-muted-foreground">
              Plan activo: <span className="font-medium text-foreground">{activePlanName ?? "Plan vigente"}</span>. Habilitado hasta el <span className="font-medium text-foreground">{formattedPlanValidUntil}</span>.
            </p>
          )}
        </header>

        <section className="mx-auto w-full max-w-6xl space-y-3">
          <div className="inline-flex rounded-lg border bg-background p-1">
            {cycleOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={selectedBillingCycle === option.value ? "default" : "ghost"}
                className="h-8 px-3 text-sm"
                onClick={() => setSelectedBillingCycle(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {!isSubscriptionStateLoading && hasPaidAccess && activePlanCode ? (
            <div className="grid gap-2 lg:grid-cols-3">
              <Card className="gap-1 py-2.5">
                <CardHeader className="space-y-0.5 p-2.5">
                  <CardTitle className="text-sm">Plan actual</CardTitle>
                  <CardDescription className="text-base font-semibold text-foreground">{activePlanName ?? activePlanCode}</CardDescription>
                </CardHeader>
                <CardContent className="px-2.5 pb-2.5 pt-0 text-sm text-muted-foreground">Ciclo: {activeBillingCycle ?? "No disponible"}</CardContent>
              </Card>
              <Card className="gap-1 py-2.5">
                <CardHeader className="space-y-0.5 p-2.5">
                  <CardTitle className="text-sm">Próximo cobro</CardTitle>
                  <CardDescription className="text-base font-semibold text-foreground">{formattedNextChargeAt ?? "No disponible"}</CardDescription>
                </CardHeader>
                <CardContent className="px-2.5 pb-2.5 pt-0 text-sm text-muted-foreground">Vigente hasta {formattedPlanValidUntil ?? "No disponible"}</CardContent>
              </Card>
              <Card className="gap-1 py-2.5">
                <CardHeader className="space-y-0.5 p-2.5">
                  <CardTitle className="text-sm">Tiempo restante</CardTitle>
                  <CardDescription className="text-base font-semibold text-foreground">{remainingTimeLabel ?? "No disponible"}</CardDescription>
                </CardHeader>
                <CardContent className="px-2.5 pb-2.5 pt-0 text-sm text-muted-foreground">{remainingTimeHint ?? "Sin cobertura acumulada adicional."}</CardContent>
              </Card>

              <Card className="gap-1.5 py-3 lg:col-span-3">
                <CardHeader className="space-y-1 p-3">
                  <CardTitle>Acciones de plan</CardTitle>
                  <CardDescription>Aquí puedes adelantar el pago de tu plan actual o cambiar a otro plan.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 px-3 pb-3 pt-0">
                  {!canAccessSections && (
                    <p className="text-sm text-destructive">
                      Tu plan está vencido o en mora ({accessReason ?? "sin acceso"}). Debes pagar para volver a habilitar las demás secciones.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="h-8 text-sm"
                      onClick={() => void handleSelectPlan(activePlanCode, (activeBillingCycle === "mensual" || activeBillingCycle === "trimestral" || activeBillingCycle === "anual") ? activeBillingCycle : selectedBillingCycle)}
                      disabled={checkoutPlanId === activePlanCode}
                    >
                      {checkoutPlanId === activePlanCode ? "Cargando..." : `Adelantar pago de ${activePlanName ?? "plan actual"} (${activeBillingCycle ?? selectedBillingCycle})`}
                    </Button>
                    <Button className="h-8 text-sm" variant="outline" onClick={() => setShowPlanCatalog((previous) => !previous)}>
                      {showPlanCatalog ? "Ocultar otros planes" : "Quiero cambiar de plan"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </section>

        {!isSubscriptionStateLoading && (!hasPaidAccess || showPlanCatalog) && (
          <section className="mx-auto grid max-w-6xl gap-3 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => {
              const Icon = ICON_BY_PLAN[plan.id]
              const isSelected = selectedPlanId === plan.id
              const isCheckingOut = checkoutPlanId === plan.id
              const priceByCycle = getPriceByCycle(plan, selectedBillingCycle)
              const durationLabel = getCycleDurationLabel(selectedBillingCycle)

              return (
                <Card key={plan.id} className={`relative h-full overflow-hidden group transition-shadow hover:shadow-lg flex flex-col gap-1.5 py-3 ${isSelected ? "border-primary" : ""}`}>
                  <CardHeader className="p-3 pb-1.5">
                    <div className="mb-2 flex items-end justify-between gap-2">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/20">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex shrink-0 items-baseline gap-1 text-right">
                        <span className="whitespace-nowrap text-lg font-bold leading-none lg:text-xl">{formatCop(priceByCycle)}</span>
                        <span className="whitespace-nowrap text-xs text-muted-foreground">{durationLabel}</span>
                      </div>
                    </div>
                    <CardTitle className="text-lg">{plan.title}</CardTitle>
                    <CardDescription className="text-sm leading-snug">{plan.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col px-3 pb-3 pt-0">
                    <ul className="mb-2 space-y-0.5 text-sm text-muted-foreground">
                      {plan.features.map((feature) => (
                        <li key={feature}>• {feature}</li>
                      ))}
                    </ul>
                    <Button
                      className="mt-auto h-8 w-full text-sm"
                      onClick={() => void handleSelectPlan(plan.id)}
                      disabled={checkoutPlanId === plan.id}
                    >
                      {isCheckingOut
                        ? "Cargando..."
                        : isSelected
                          ? "Plan seleccionado"
                          : "Escoger plan"}
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </section>
        )}
      </main>
    </div>
  )
}
