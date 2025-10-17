import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

export const metadata: Metadata = {
  title: "BarberPro - Estilo y Elegancia en Cada Corte",
  description:
    "Barbería profesional con más de 15 años de experiencia. Servicios de corte, afeitado, coloración y más.",
  generator: "v0.app",
  applicationName: "BarberPro",
  manifest: "/manifest.webmanifest",
  themeColor: "#111827",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BarberPro",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192x192.png" }],
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es">
      <body
        suppressHydrationWarning
        className={`font-sans ${GeistSans.variable} ${GeistMono.variable} antialiased`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  )
}
