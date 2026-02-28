"use client"

import { useEffect } from "react"

const SESSION_FLAG = "__dev_sw_reset_done__"

function isLocalDevelopmentHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase()
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1"
}

export function DevServiceWorkerReset() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    if (!isLocalDevelopmentHost(window.location.hostname)) {
      return
    }

    if (!("serviceWorker" in navigator)) {
      return
    }

    let isCancelled = false

    const resetServiceWorkers = async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations()
        const hadRegistrations = registrations.length > 0

        await Promise.all(registrations.map((registration) => registration.unregister()))

        let deletedAnyCache = false
        if ("caches" in window) {
          const cacheNames = await caches.keys()
          if (cacheNames.length > 0) {
            deletedAnyCache = true
            await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))
          }
        }

        if (isCancelled) {
          return
        }

        const shouldReload = hadRegistrations || deletedAnyCache
        const alreadyReloaded = sessionStorage.getItem(SESSION_FLAG) === "1"

        if (shouldReload && !alreadyReloaded) {
          sessionStorage.setItem(SESSION_FLAG, "1")
          window.location.reload()
        }
      } catch (error) {
        console.warn("No fue posible limpiar Service Workers en desarrollo", error)
      }
    }

    void resetServiceWorkers()

    return () => {
      isCancelled = true
    }
  }, [])

  return null
}
