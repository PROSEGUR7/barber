import { AppSidebar } from "@/components/app-sidebar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

const notificationChannels = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "email", label: "Email" },
  { id: "sms", label: "SMS" },
]

export default function ProfilePage() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar:duration-200">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/dashboard">Inicio</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Perfil</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
          <section className="grid gap-4 xl:grid-cols-[2fr_1fr]">
            <Card className="border border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Datos personales</CardTitle>
                <CardDescription>Actualiza tu información básica.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre completo</Label>
                  <Input id="name" defaultValue="Cliente Demo" placeholder="Tu nombre" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input id="phone" defaultValue="+57 300 000 0000" placeholder="Tu teléfono" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="email">Correo electrónico</Label>
                  <Input id="email" type="email" defaultValue="cliente@ejemplo.com" placeholder="tucorreo@dominio.com" />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button>Guardar cambios</Button>
              </CardFooter>
            </Card>

            <Card className="border border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Preferencias</CardTitle>
                <CardDescription>
                  Idioma, tema y canales para tus notificaciones.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="language">Idioma</Label>
                  <Input id="language" defaultValue="Español" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="theme">Tema</Label>
                  <Input id="theme" defaultValue="Automático" />
                </div>
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">Notificaciones</p>
                  {notificationChannels.map((channel) => (
                    <div key={channel.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                      <span className="text-sm">{channel.label}</span>
                      <Switch id={`notify-${channel.id}`} defaultChecked={channel.id !== "sms"} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card className="border border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Seguridad</CardTitle>
                <CardDescription>Protege tu cuenta y gestiona tus dispositivos.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="font-medium">Contraseña</p>
                  <p className="text-muted-foreground">Último cambio: hace 3 meses</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="font-medium">Sesiones activas</p>
                  <p className="text-muted-foreground">2 dispositivos conectados</p>
                </div>
              </CardContent>
              <CardFooter className="flex gap-2">
                <Button variant="outline" size="sm">
                  Cerrar sesión en otros dispositivos
                </Button>
                <Button size="sm">Actualizar contraseña</Button>
              </CardFooter>
            </Card>

            <Card className="border border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Privacidad</CardTitle>
                <CardDescription>Descarga tus datos o solicita la eliminación.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="font-medium">Reporte de actividad</p>
                  <p className="text-muted-foreground">Historial de citas y pagos.</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="font-medium">Eliminación de cuenta</p>
                  <p className="text-muted-foreground">Procesamos la solicitud en 7 días.</p>
                </div>
              </CardContent>
              <CardFooter className="flex gap-2">
                <Button variant="outline" size="sm">
                  Descargar mis datos
                </Button>
                <Button variant="destructive" size="sm">
                  Solicitar eliminación
                </Button>
              </CardFooter>
            </Card>
          </section>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
