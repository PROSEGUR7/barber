'use client'

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{
    outcome: "accepted" | "dismissed"
    platform: string
  }>
}

const STORAGE_KEY = "pwa-install-dismissed"

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [showIOSHelp, setShowIOSHelp] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const alreadyStandalone = window.matchMedia("(display-mode: standalone)").matches
    const isIOS = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase())
    const alreadyInstalled = alreadyStandalone || (window.navigator as unknown as { standalone?: boolean }).standalone
    const dismissed = localStorage.getItem(STORAGE_KEY) === "true"

    if (alreadyInstalled || dismissed) {
      return
    }

    if (isIOS) {
      setShowIOSHelp(true)
      return
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
      setVisible(true)
      setShowIOSHelp(false)
    }

    const handleAppInstalled = () => {
      localStorage.setItem(STORAGE_KEY, "true")
      setVisible(false)
      setDeferredPrompt(null)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    window.addEventListener("appinstalled", handleAppInstalled)

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
      window.removeEventListener("appinstalled", handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      return
    }
    try {
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      if (choice.outcome === "accepted") {
        localStorage.setItem(STORAGE_KEY, "true")
      }
    } catch (error) {
      console.warn("Error instalando la PWA", error)
    } finally {
      setVisible(false)
      setDeferredPrompt(null)
    }
  }

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true")
    setVisible(false)
    setDeferredPrompt(null)
  }

  if (!visible && !showIOSHelp) {
    return null
  }

  return (
    <div className={cn("fixed inset-x-0 bottom-4 z-50 flex justify-center px-4")}
      role="dialog"
      aria-live="polite"
    >
      <Card className="flex w-full max-w-sm items-center gap-3 bg-background/95 px-4 py-3 shadow-lg">
        <div className="flex-1 text-sm">
          <p className="font-medium">Instala BarberPro</p>
          {showIOSHelp ? (
            <p className="text-muted-foreground text-xs">
              Ábrelo desde Safari y toca el botón de compartir, luego selecciona “Añadir a pantalla de inicio”.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Añade la app a tu dispositivo para acceder más rápido.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleDismiss}>
            Después
          </Button>
          {!showIOSHelp && deferredPrompt ? (
            <Button size="sm" onClick={handleInstallClick}>
              Instalar
            </Button>
          ) : null}
        </div>
      </Card>
    </div>
  )
}
