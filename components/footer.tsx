import Link from "next/link"
import { Scissors, Facebook, Instagram, Twitter } from "lucide-react"
import { Button } from "@/components/ui/button"

export function Footer() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="container py-12 lg:py-16">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                <Scissors className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">BarberPro</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Estilo y elegancia en cada corte. Tu barbería de confianza desde 2009.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" asChild>
                <a href="https://facebook.com" target="_blank" rel="noopener noreferrer">
                  <Facebook className="h-5 w-5" />
                </a>
              </Button>
              <Button variant="ghost" size="icon" asChild>
                <a href="https://instagram.com" target="_blank" rel="noopener noreferrer">
                  <Instagram className="h-5 w-5" />
                </a>
              </Button>
              <Button variant="ghost" size="icon" asChild>
                <a href="https://twitter.com" target="_blank" rel="noopener noreferrer">
                  <Twitter className="h-5 w-5" />
                </a>
              </Button>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Navegación</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
                  Inicio
                </Link>
              </li>
              <li>
                <Link href="#servicios" className="text-muted-foreground hover:text-foreground transition-colors">
                  Servicios
                </Link>
              </li>
              <li>
                <Link href="#nosotros" className="text-muted-foreground hover:text-foreground transition-colors">
                  Nosotros
                </Link>
              </li>
              <li>
                <Link href="#testimonios" className="text-muted-foreground hover:text-foreground transition-colors">
                  Testimonios
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Servicios</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/booking" className="text-muted-foreground hover:text-foreground transition-colors">
                  Corte de Cabello
                </Link>
              </li>
              <li>
                <Link href="/booking" className="text-muted-foreground hover:text-foreground transition-colors">
                  Afeitado Clásico
                </Link>
              </li>
              <li>
                <Link href="/booking" className="text-muted-foreground hover:text-foreground transition-colors">
                  Coloración
                </Link>
              </li>
              <li>
                <Link href="/booking" className="text-muted-foreground hover:text-foreground transition-colors">
                  Paquete Premium
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Contacto</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>Av. Principal #123</li>
              <li>Ciudad, Estado 12345</li>
              <li className="pt-2">Tel: (555) 123-4567</li>
              <li>Email: info@barberpro.com</li>
            </ul>
          </div>
        </div>

        <div className="border-t mt-12 pt-8 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} BarberPro. Todos los derechos reservados.</p>
        </div>
      </div>
    </footer>
  )
}
