"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

function buildTenantHeaders(): HeadersInit {
  if (typeof window === "undefined") {
    return {}
  }

  const tenant = (localStorage.getItem("tenantSchema") ?? localStorage.getItem("userTenant") ?? "").trim()
  const userEmail = (localStorage.getItem("userEmail") ?? "").trim().toLowerCase()
  const headers: Record<string, string> = {}

  if (tenant) {
    headers["x-tenant"] = tenant
  }

  if (userEmail) {
    headers["x-user-email"] = userEmail
  }

  return headers
}

export default function ConfirmacionPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [message, setMessage] = useState("Procesando confirmacion de pago...")

  const transactionId = useMemo(() => (searchParams.get("id") ?? "").trim(), [searchParams])
  const reference = useMemo(() => (searchParams.get("reference") ?? "").trim(), [searchParams])

  useEffect(() => {
    let isActive = true

    const run = async () => {
      const bookingUrl = new URL("/booking", window.location.origin)

      if (transactionId) {
        setMessage("Validando transaccion con Wompi...")
        try {
          await fetch(`/api/payments/wompi/transaction/${encodeURIComponent(transactionId)}`, {
            method: "GET",
            cache: "no-store",
            headers: buildTenantHeaders(),
          })
        } catch {
          // Keep redirect behavior even if this immediate call fails; webhook/fallback can still reconcile.
        }

        bookingUrl.searchParams.set("paymentProvider", "wompi")
        bookingUrl.searchParams.set("id", transactionId)
        if (reference) {
          bookingUrl.searchParams.set("reference", reference)
        }

        if (isActive) {
          setMessage("Pago procesado. Redirigiendo...")
          router.replace(`${bookingUrl.pathname}${bookingUrl.search}`)
        }
        return
      }

      if (reference) {
        setMessage("No llego id de transaccion, conciliando por referencia...")
        try {
          const byReference = await fetch(`/api/payments/wompi/reference/${encodeURIComponent(reference)}`, {
            method: "GET",
            cache: "no-store",
            headers: buildTenantHeaders(),
          })

          const byReferencePayload = (await byReference.json().catch(() => null)) as {
            transactionId?: string | null
          } | null

          if (byReference.ok && byReferencePayload?.transactionId) {
            await fetch(`/api/payments/wompi/transaction/${encodeURIComponent(byReferencePayload.transactionId)}`, {
              method: "GET",
              cache: "no-store",
              headers: buildTenantHeaders(),
            })

            bookingUrl.searchParams.set("paymentProvider", "wompi")
            bookingUrl.searchParams.set("id", byReferencePayload.transactionId)
            bookingUrl.searchParams.set("reference", reference)

            if (isActive) {
              setMessage("Pago procesado. Redirigiendo...")
              router.replace(`${bookingUrl.pathname}${bookingUrl.search}`)
            }
            return
          }
        } catch {
          // Ignore and continue to fallback redirect.
        }
      }

      if (isActive) {
        setMessage("No se pudo validar automaticamente, redirigiendo a reservas...")
        router.replace("/booking")
      }
    }

    void run()

    return () => {
      isActive = false
    }
  }, [router, transactionId, reference])

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center px-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Confirmacion de pago</h1>
        <p className="mt-3 text-sm text-muted-foreground">{message}</p>
      </div>
    </main>
  )
}
