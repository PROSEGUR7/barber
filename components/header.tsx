"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Menu, Scissors, User } from "lucide-react"
import { useState } from "react"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"

export function Header() {
  const [isOpen, setIsOpen] = useState(false)

  const navigation = [
    { name: "Inicio", href: "/" },
    { name: "Servicios", href: "#servicios" },
    { name: "Nosotros", href: "#nosotros" },
    { name: "Testimonios", href: "#testimonios" },
  ]

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
  <div className="container grid [grid-template-columns:auto_1fr_auto] items-center h-16 gap-4">
        {/* Left: Logo */}
        <Link href="/" className="flex items-center gap-2 justify-self-start">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <Scissors className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold tracking-tight">BarberPro</span>
        </Link>

        {/* Desktop Navigation */}
  <nav className="hidden md:flex items-center justify-center gap-8 justify-self-center">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.name}
            </Link>
          ))}
        </nav>

        {/* Right: Actions */}
        <div className="flex items-center gap-3 justify-self-end">
          <Button asChild variant="ghost" size="sm" className="hidden md:flex">
            <Link href="/login">
              <User className="mr-2 h-4 w-4" />
              Iniciar Sesión
            </Link>
          </Button>
          <Button asChild size="sm" className="hidden md:flex">
            <Link href="/booking">Agendar Cita</Link>
          </Button>

          {/* Mobile Menu */}
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px]">
              <div className="flex flex-col gap-6 mt-6">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className="text-lg font-medium transition-colors hover:text-primary"
                  >
                    {item.name}
                  </Link>
                ))}
                <div className="flex flex-col gap-3 pt-4 border-t">
                  <Button asChild variant="outline" className="w-full bg-transparent">
                    <Link href="/login">
                      <User className="mr-2 h-4 w-4" />
                      Iniciar Sesión
                    </Link>
                  </Button>
                  <Button asChild className="w-full">
                    <Link href="/booking">Agendar Cita</Link>
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
