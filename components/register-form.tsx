"use client"

import { FormEvent, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type AlertState = {
  open: boolean
  title: string
  description: string
  actionLabel: string
  onConfirm?: () => void
}

type RegisterErrorResponse = {
  ok?: boolean
  error?: string
  code?: string
  field?: string
}

export function RegisterForm({ className, ...props }: React.ComponentProps<"div">) {
  const router = useRouter()
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [alertState, setAlertState] = useState<AlertState>({
    open: false,
    title: "",
    description: "",
    actionLabel: "Aceptar",
  })

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const sanitizedName = fullName.trim()
    const sanitizedPhone = phone.trim()
    const sanitizedEmail = email.trim()

    if (!sanitizedName) {
      setError("Ingresa tu nombre completo.")
      return
    }

    if (sanitizedPhone.length < 7) {
      setError("Ingresa un teléfono válido.")
      return
    }

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.")
      return
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.")
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: sanitizedName,
          phone: sanitizedPhone,
          email: sanitizedEmail,
          password,
          role: "client",
        }),
      })

      const data = (await response
        .json()
        .catch(() => ({} as RegisterErrorResponse))) as RegisterErrorResponse

      if (!response.ok) {
        const code = data.code

        if (response.status === 404) {
          setError(
            "El servicio de registro no está disponible (404). Intenta nuevamente en unos segundos.",
          )
          return
        }

        if (response.status === 409 || code === "EMAIL_EXISTS") {
          setAlertState({
            open: true,
            title: "Correo ya registrado",
            description:
              "Ya existe una cuenta con este correo. Puedes iniciar sesión o usar otro correo para registrarte.",
            actionLabel: "Entendido",
          })
          return
        }

        if (code === "EMAIL_INVALID") {
          setError("Ingresa un correo electrónico válido.")
          return
        }

        if (code === "PASSWORD_TOO_SHORT") {
          setError("La contraseña debe tener al menos 8 caracteres.")
          return
        }

        if (code === "PHONE_INVALID") {
          setError("Ingresa un teléfono válido.")
          return
        }

        if (code === "DATABASE_NOT_CONFIGURED") {
          setError(
            "El servidor no está configurado (DATABASE_URL faltante). Revisa tu .env.local.",
          )
          return
        }

        setError(
          data.error ?? `No se pudo crear la cuenta (HTTP ${response.status}).`,
        )
        return
      }

      localStorage.setItem("registeredEmail", sanitizedEmail)

      setAlertState({
        open: true,
        title: "Cuenta creada",
        description:
          "Tu cuenta se creó correctamente. Ya puedes iniciar sesión con el correo y la contraseña que acabas de ingresar.",
        actionLabel: "Ir a iniciar sesión",
        onConfirm: () => {
          router.push("/login")
        },
      })
    } catch (err) {
      console.error("Register error", err)
      setError("Error de conexión con el servidor.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0 md:min-h-[560px]">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-6 md:p-8" onSubmit={handleSubmit}>
            <FieldGroup>
              <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold">Crea tu cuenta</h1>
                <p className="text-muted-foreground text-balance">
                  Ingresa tu correo para crear tu cuenta
                </p>
              </div>
              <Field>
                <FieldLabel htmlFor="fullName">Nombre completo</FieldLabel>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Tu nombre completo"
                  required
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="phone">Teléfono</FieldLabel>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="Tu teléfono"
                  required
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="email">Correo electrónico</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@ejemplo.com"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Usaremos este correo para contactarte. No lo compartiremos con nadie.
                </p>
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="password">Contraseña</FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    placeholder="********"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="confirmPassword">
                    Confirmar contraseña
                  </FieldLabel>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="********"
                    required
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </Field>
              </div>
              <p className="text-xs text-muted-foreground">
                Debe tener al menos 8 caracteres.
              </p>
              <Field>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Creando cuenta..." : "Crear cuenta"}
                </Button>
              </Field>
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <FieldDescription>
                ¿Ya tienes una cuenta?{" "}
                <Link href="/login" className="underline-offset-2 hover:underline">
                  Inicia sesión
                </Link>
              </FieldDescription>
            </FieldGroup>
          </form>
          <div className="bg-muted relative hidden md:block md:min-h-[560px]">
            <img
              src="/modern-barbershop-haircut.png"
              alt="Imagen"
              className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
            />
          </div>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        Al continuar, aceptas nuestros{" "}
        <a href="#" className="underline-offset-2 hover:underline">
          Términos de servicio
        </a>{" "}
        y
        <a href="#" className="underline-offset-2 hover:underline">
          {" "}
          Política de privacidad
        </a>
        .
      </FieldDescription>
      <div className="text-center">
        <Link href="/" className="text-sm underline-offset-2 hover:underline">
          Volver al inicio
        </Link>
      </div>
      <AlertDialog
        open={alertState.open}
        onOpenChange={(open) =>
          setAlertState((previous) => ({
            ...previous,
            open,
          }))
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{alertState.title}</AlertDialogTitle>
            <AlertDialogDescription>{alertState.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setAlertState((previous) => ({
                  ...previous,
                  open: false,
                }))
                alertState.onConfirm?.()
              }}
            >
              {alertState.actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
