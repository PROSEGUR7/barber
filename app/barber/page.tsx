"use client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { useState } from "react"
import { Clock, User, DollarSign, CheckCircle, XCircle, CalendarIcon } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface Appointment {
  id: number
  clientName: string
  service: string
  time: string
  duration: string
  price: number
  status: "pending" | "confirmed" | "completed" | "cancelled"
  date: string
}

const mockAppointments: Appointment[] = [
  {
    id: 1,
    clientName: "Carlos Rodríguez",
    service: "Corte de Cabello",
    time: "09:30",
    duration: "30 min",
    price: 2300,
    status: "confirmed",
    date: "2024-12-20",
  },
  {
    id: 2,
    clientName: "Miguel Ángel Torres",
    service: "Corte + Barba",
    time: "10:30",
    duration: "45 min",
    price: 3500,
    status: "confirmed",
    date: "2024-12-20",
  },
  {
    id: 3,
    clientName: "José Luis Martínez",
    service: "Afeitado Clásico",
    time: "14:00",
    duration: "30 min",
    price: 1800,
    status: "pending",
    date: "2024-12-20",
  },
  {
    id: 4,
    clientName: "Roberto Sánchez",
    service: "Coloración",
    time: "15:30",
    duration: "60 min",
    price: 4500,
    status: "confirmed",
    date: "2024-12-20",
  },
  {
    id: 5,
    clientName: "Fernando López",
    service: "Corte de Cabello",
    time: "17:00",
    duration: "30 min",
    price: 2300,
    status: "pending",
    date: "2024-12-20",
  },
]

export default function BarberDashboard() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())
  const [appointments, setAppointments] = useState<Appointment[]>(mockAppointments)

  const todayAppointments = appointments.filter((apt) => apt.date === "2024-12-20")
  const pendingCount = todayAppointments.filter((apt) => apt.status === "pending").length
  const confirmedCount = todayAppointments.filter((apt) => apt.status === "confirmed").length
  const completedCount = todayAppointments.filter((apt) => apt.status === "completed").length
  const totalEarnings = todayAppointments
    .filter((apt) => apt.status === "completed")
    .reduce((sum, apt) => sum + apt.price, 0)

  const handleStatusChange = (id: number, newStatus: Appointment["status"]) => {
    setAppointments(appointments.map((apt) => (apt.id === id ? { ...apt, status: newStatus } : apt)))
  }

  const getStatusColor = (status: Appointment["status"]) => {
    switch (status) {
      case "pending":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
      case "confirmed":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20"
      case "completed":
        return "bg-green-500/10 text-green-500 border-green-500/20"
      case "cancelled":
        return "bg-red-500/10 text-red-500 border-red-500/20"
    }
  }

  const getStatusText = (status: Appointment["status"]) => {
    switch (status) {
      case "pending":
        return "Pendiente"
      case "confirmed":
        return "Confirmada"
      case "completed":
        return "Completada"
      case "cancelled":
        return "Cancelada"
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Panel de Peluquero</h1>
            <p className="text-muted-foreground">Gestiona tus citas y horarios del día</p>
          </div>

          {/* Stats */}
          <div className="grid md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Citas Hoy</CardDescription>
                <CardTitle className="text-3xl">{todayAppointments.length}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Total de citas programadas</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Pendientes</CardDescription>
                <CardTitle className="text-3xl text-yellow-500">{pendingCount}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Por confirmar</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Confirmadas</CardDescription>
                <CardTitle className="text-3xl text-blue-500">{confirmedCount}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Listas para atender</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Completadas</CardDescription>
                <CardTitle className="text-3xl text-green-500">{completedCount}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Ingresos: ${totalEarnings}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Appointments List */}
            <div className="lg:col-span-2">
              <Tabs defaultValue="today" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="today">Hoy</TabsTrigger>
                  <TabsTrigger value="upcoming">Próximas</TabsTrigger>
                  <TabsTrigger value="history">Historial</TabsTrigger>
                </TabsList>

                <TabsContent value="today" className="space-y-4 mt-4">
                  {todayAppointments.length === 0 ? (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <CalendarIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground">No hay citas para hoy</p>
                      </CardContent>
                    </Card>
                  ) : (
                    todayAppointments.map((appointment) => (
                      <Card key={appointment.id}>
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-start gap-4">
                              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                                <User className="h-6 w-6 text-primary" />
                              </div>
                              <div>
                                <h3 className="font-semibold text-lg mb-1">{appointment.clientName}</h3>
                                <p className="text-sm text-muted-foreground mb-2">{appointment.service}</p>
                                <div className="flex items-center gap-4 text-sm">
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                    {appointment.time} ({appointment.duration})
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <DollarSign className="h-4 w-4 text-muted-foreground" />${appointment.price}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <Badge variant="outline" className={getStatusColor(appointment.status)}>
                              {getStatusText(appointment.status)}
                            </Badge>
                          </div>

                          <div className="flex gap-2">
                            {appointment.status === "pending" && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => handleStatusChange(appointment.id, "confirmed")}
                                  className="flex-1"
                                >
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Confirmar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleStatusChange(appointment.id, "cancelled")}
                                  className="flex-1"
                                >
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Cancelar
                                </Button>
                              </>
                            )}
                            {appointment.status === "confirmed" && (
                              <Button
                                size="sm"
                                onClick={() => handleStatusChange(appointment.id, "completed")}
                                className="w-full"
                              >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Marcar como Completada
                              </Button>
                            )}
                            {appointment.status === "completed" && (
                              <div className="w-full text-center py-2 text-sm text-green-500 font-medium">
                                Cita completada exitosamente
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="upcoming" className="mt-4">
                  <Card>
                    <CardContent className="py-12 text-center">
                      <CalendarIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-muted-foreground">No hay citas próximas</p>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="history" className="mt-4">
                  <Card>
                    <CardContent className="py-12 text-center">
                      <CalendarIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-muted-foreground">No hay historial de citas</p>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>

            {/* Calendar & Quick Stats */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Calendario</CardTitle>
                  <CardDescription>Selecciona una fecha para ver citas</CardDescription>
                </CardHeader>
                <CardContent>
                  <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} className="rounded-md" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Resumen del Día</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Primera cita</span>
                    <span className="font-semibold">09:30</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Última cita</span>
                    <span className="font-semibold">17:00</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Tiempo total</span>
                    <span className="font-semibold">3h 15min</span>
                  </div>
                  <div className="flex items-center justify-between pt-4 border-t">
                    <span className="text-sm font-medium">Ingresos estimados</span>
                    <span className="font-bold text-lg text-primary">
                      ${todayAppointments.reduce((sum, apt) => sum + apt.price, 0)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
      </main>
    </div>
  )
}
