import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Star } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

const testimonials = [
  {
    name: "Carlos Mendoza",
    role: "Cliente Regular",
    image: "/professional-man-portrait.png",
    content:
      "El mejor lugar para un corte de cabello en la ciudad. Los barberos son verdaderos artistas y el ambiente es increíble.",
    rating: 5,
  },
  {
    name: "Miguel Ángel Torres",
    role: "Empresario",
    image: "/confident-businessman.png",
    content:
      "Llevo años viniendo aquí y nunca me han decepcionado. Siempre salgo luciendo impecable para mis reuniones.",
    rating: 5,
  },
  {
    name: "Roberto Sánchez",
    role: "Diseñador",
    image: "/creative-man-portrait.png",
    content: "Atención personalizada y resultados excepcionales. El equipo realmente entiende lo que necesito.",
    rating: 5,
  },
]

export function Testimonials() {
  return (
    <section id="testimonios" className="py-24 lg:py-32">
      <div className="container">
        <div className="text-center space-y-4 mb-16">
          <Badge variant="secondary" className="text-sm">
            Testimonios
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold tracking-tight text-balance">Lo que dicen nuestros clientes</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto text-pretty">
            La satisfacción de nuestros clientes es nuestra mejor carta de presentación
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((testimonial) => (
            <Card key={testimonial.name} className="hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <Star key={i} className="h-5 w-5 fill-secondary text-secondary" />
                  ))}
                </div>
                <p className="text-base leading-relaxed mb-6 text-pretty">"{testimonial.content}"</p>
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={testimonial.image || "/placeholder.svg"} alt={testimonial.name} />
                    <AvatarFallback>
                      {testimonial.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold">{testimonial.name}</p>
                    <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
