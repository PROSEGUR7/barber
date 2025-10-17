import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "BarberPro",
    short_name: "BarberPro",
    description:
      "Barbería profesional con servicios de corte, afeitado y reservas en línea.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "fullscreen"],
    background_color: "#ffffff",
    theme_color: "#111827",
    orientation: "portrait",
    lang: "es",
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    screenshots: [
      {
        src: "/modern-barbershop.png",
        sizes: "1920x1080",
        type: "image/png",
        form_factor: "wide",
      },
      {
        src: "/modern-barbershop-haircut.png",
        sizes: "1080x1920",
        type: "image/png",
        form_factor: "narrow",
      },
    ],
    shortcuts: [
      {
        name: "Reservar cita",
        short_name: "Reservar",
        url: "/booking",
        description: "Agenda tu próximo servicio",
      },
      {
        name: "Ver servicios",
        short_name: "Servicios",
        url: "/#servicios",
        description: "Explora nuestro catálogo",
      },
    ],
    categories: ["lifestyle", "productivity"],
    prefer_related_applications: false,
  }
}
