"use client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Users,
  Scissors,
  DollarSign,
  TrendingUp,
  Calendar,
  Clock,
  BarChart3,
  PieChart,
  Plus,
  Edit,
  Trash2,
} from "lucide-react"
import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface Service {
  id: number
  name: string
  price: number
  duration: string
  bookings: number
}

interface Barber {
  id: number
  name: string
  specialty: string
  appointments: number
  rating: number
  revenue: number
}

interface Client {
  id: number
  name: string
  email: string
  totalVisits: number
  lastVisit: string
  totalSpent: number
}

const mockServices: Service[] = [
  { id: 1, name: "Corte de Cabello", price: 2300, duration: "30 min", bookings: 145 },
  { id: 2, name: "Corte + Barba", price: 3500, duration: "45 min", bookings: 98 },
  { id: 3, name: "Afeitado Clásico", price: 1800, duration: "30 min", bookings: 67 },
  { id: 4, name: "Coloración", price: 4500, duration: "60 min", bookings: 34 },
  { id: 5, name: "Tratamiento Capilar", price: 3800, duration: "45 min", bookings: 23 },
]

const mockBarbers: Barber[] = [
  { id: 1, name: "Juan Rivera", specialty: "Cortes Modernos", appointments: 156, rating: 4.9, revenue: 358800 },
  { id: 2, name: "Carlos Méndez", specialty: "Barbería Clásica", appointments: 142, rating: 4.8, revenue: 326600 },
  { id: 3, name: "Miguel Ángel", specialty: "Diseños Creativos", appointments: 134, rating: 4.7, revenue: 308200 },
]

const mockClients: Client[] = [
  {
    id: 1,
    name: "Roberto Sánchez",
    email: "roberto@email.com",
    totalVisits: 12,
    lastVisit: "2024-12-18",
    totalSpent: 27600,
  },
  {
    id: 2,
    name: "Carlos Rodríguez",
    email: "carlos@email.com",
    totalVisits: 8,
    lastVisit: "2024-12-17",
    totalSpent: 18400,
  },
  {
    id: 3,
    name: "Miguel Torres",
    email: "miguel@email.com",
    totalVisits: 15,
    lastVisit: "2024-12-19",
    totalSpent: 34500,
  },
  { id: 4, name: "José Martínez", email: "jose@email.com", totalVisits: 6, lastVisit: "2024-12-16", totalSpent: 13800 },
]

export default function AdminDashboard() {
  const [services] = useState<Service[]>(mockServices)
  const [barbers] = useState<Barber[]>(mockBarbers)
  const [clients] = useState<Client[]>(mockClients)

  const totalRevenue = barbers.reduce((sum, barber) => sum + barber.revenue, 0)
  const totalAppointments = barbers.reduce((sum, barber) => sum + barber.appointments, 0)
  const totalClients = clients.length
  const avgRating = (barbers.reduce((sum, barber) => sum + barber.rating, 0) / barbers.length).toFixed(1)

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Panel de Administración</h1>
            <p className="text-muted-foreground">Gestiona tu barbería y monitorea el rendimiento</p>
          </div>

          {/* Stats Overview */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardDescription>Ingresos Totales</CardDescription>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </div>
                <CardTitle className="text-3xl">${totalRevenue.toLocaleString()}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-xs text-green-500">
                  <TrendingUp className="h-3 w-3" />
                  <span>+12.5% vs mes anterior</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardDescription>Citas Totales</CardDescription>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </div>
                <CardTitle className="text-3xl">{totalAppointments}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-xs text-green-500">
                  <TrendingUp className="h-3 w-3" />
                  <span>+8.3% vs mes anterior</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardDescription>Clientes Activos</CardDescription>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </div>
                <CardTitle className="text-3xl">{totalClients}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-xs text-green-500">
                  <TrendingUp className="h-3 w-3" />
                  <span>+15.2% vs mes anterior</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardDescription>Calificación Promedio</CardDescription>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </div>
                <CardTitle className="text-3xl">{avgRating}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">De {barbers.length} peluqueros</p>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Tabs */}
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList>
              <TabsTrigger value="overview">
                <PieChart className="h-4 w-4 mr-2" />
                Resumen
              </TabsTrigger>
              <TabsTrigger value="services">
                <Scissors className="h-4 w-4 mr-2" />
                Servicios
              </TabsTrigger>
              <TabsTrigger value="barbers">
                <Users className="h-4 w-4 mr-2" />
                Peluqueros
              </TabsTrigger>
              <TabsTrigger value="clients">
                <Users className="h-4 w-4 mr-2" />
                Clientes
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              <div className="grid lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Servicios Más Populares</CardTitle>
                    <CardDescription>Por número de reservas este mes</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {services
                        .sort((a, b) => b.bookings - a.bookings)
                        .slice(0, 5)
                        .map((service, index) => (
                          <div key={service.id} className="flex items-center gap-4">
                            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary font-semibold text-sm">
                              {index + 1}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium">{service.name}</span>
                                <span className="text-sm text-muted-foreground">{service.bookings} reservas</span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary"
                                  style={{ width: `${(service.bookings / services[0].bookings) * 100}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Rendimiento de Peluqueros</CardTitle>
                    <CardDescription>Ingresos generados este mes</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {barbers
                        .sort((a, b) => b.revenue - a.revenue)
                        .map((barber, index) => (
                          <div key={barber.id} className="flex items-center gap-4">
                            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary font-semibold text-sm">
                              {index + 1}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium">{barber.name}</span>
                                <span className="text-sm font-semibold">${barber.revenue.toLocaleString()}</span>
                              </div>
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{barber.appointments} citas</span>
                                <span>⭐ {barber.rating}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid lg:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Horarios Pico</CardTitle>
                    <CardDescription>Horas más ocupadas</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">10:00 - 12:00</span>
                      </div>
                      <Badge>Alta demanda</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">15:00 - 17:00</span>
                      </div>
                      <Badge>Alta demanda</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">18:00 - 20:00</span>
                      </div>
                      <Badge variant="outline">Media demanda</Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Tasa de Ocupación</CardTitle>
                    <CardDescription>Promedio semanal</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center">
                      <div className="text-4xl font-bold text-primary mb-2">87%</div>
                      <p className="text-sm text-muted-foreground mb-4">Excelente ocupación</p>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: "87%" }} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Clientes Nuevos</CardTitle>
                    <CardDescription>Este mes</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center">
                      <div className="text-4xl font-bold text-primary mb-2">24</div>
                      <p className="text-sm text-muted-foreground mb-4">+18% vs mes anterior</p>
                      <div className="flex items-center justify-center gap-2 text-xs text-green-500">
                        <TrendingUp className="h-3 w-3" />
                        <span>Crecimiento sostenido</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Services Tab */}
            <TabsContent value="services" className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Gestión de Servicios</h2>
                  <p className="text-muted-foreground">Administra los servicios de tu barbería</p>
                </div>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo Servicio
                </Button>
              </div>

              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Servicio</TableHead>
                      <TableHead>Precio</TableHead>
                      <TableHead>Duración</TableHead>
                      <TableHead>Reservas</TableHead>
                      <TableHead>Ingresos</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {services.map((service) => (
                      <TableRow key={service.id}>
                        <TableCell className="font-medium">{service.name}</TableCell>
                        <TableCell>${service.price}</TableCell>
                        <TableCell>{service.duration}</TableCell>
                        <TableCell>{service.bookings}</TableCell>
                        <TableCell className="font-semibold">
                          ${(service.price * service.bookings).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="icon">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>

            {/* Barbers Tab */}
            <TabsContent value="barbers" className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Gestión de Peluqueros</h2>
                  <p className="text-muted-foreground">Administra tu equipo de profesionales</p>
                </div>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo Peluquero
                </Button>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {barbers.map((barber) => (
                  <Card key={barber.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle>{barber.name}</CardTitle>
                          <CardDescription>{barber.specialty}</CardDescription>
                        </div>
                        <Badge variant="outline">⭐ {barber.rating}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Citas completadas</span>
                          <span className="font-semibold">{barber.appointments}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Ingresos generados</span>
                          <span className="font-semibold">${barber.revenue.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Promedio por cita</span>
                          <span className="font-semibold">${Math.round(barber.revenue / barber.appointments)}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button variant="outline" size="sm" className="flex-1 bg-transparent">
                          <Edit className="h-3 w-3 mr-2" />
                          Editar
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1 bg-transparent">
                          Ver Horarios
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Clients Tab */}
            <TabsContent value="clients" className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Gestión de Clientes</h2>
                  <p className="text-muted-foreground">Administra tu base de clientes</p>
                </div>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo Cliente
                </Button>
              </div>

              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Visitas</TableHead>
                      <TableHead>Última Visita</TableHead>
                      <TableHead>Total Gastado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clients.map((client) => (
                      <TableRow key={client.id}>
                        <TableCell className="font-medium">{client.name}</TableCell>
                        <TableCell>{client.email}</TableCell>
                        <TableCell>{client.totalVisits}</TableCell>
                        <TableCell>{new Date(client.lastVisit).toLocaleDateString("es-ES")}</TableCell>
                        <TableCell className="font-semibold">${client.totalSpent.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="icon">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="sm">
                              Ver Historial
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>
          </Tabs>
      </main>
    </div>
  )
}
