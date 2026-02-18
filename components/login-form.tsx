"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { startAuthentication, startRegistration } from "@simplewebauthn/browser"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()
  const { toast } = useToast()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false)

  useEffect(() => {
    try {
      const storedEmail =
        localStorage.getItem("registeredEmail") ??
        localStorage.getItem("userEmail")

      if (storedEmail) {
        setEmail(storedEmail)
      }

    } catch (err) {
      console.warn("No fue posible restaurar datos de sesión", err)
    }
  }, [])

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault()

    setError(null)
    setIsSubmitting(true)

    try {
      const sanitizedEmail = email.trim()

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: sanitizedEmail,
          password,
        }),
      })

      const data = (await response.json().catch(() => ({}))) as {
        error?: string
        code?: string
      }

      if (!response.ok) {
        const code = data.code

        if (response.status === 404) {
          setError(
            "El servicio de inicio de sesión no está disponible (404). Intenta nuevamente en unos segundos.",
          )
          return
        }

        if (code === "EMAIL_INVALID") {
          setError("Ingresa un correo electrónico válido.")
          return
        }

        if (code === "EMAIL_REQUIRED") {
          setError("Ingresa tu correo electrónico.")
          return
        }

        if (code === "PASSWORD_REQUIRED") {
          setError("Ingresa tu contraseña.")
          return
        }

        if (code === "USER_NOT_FOUND") {
          setError("No existe una cuenta con ese correo.")
          return
        }

        if (code === "PASSWORD_INVALID") {
          setError("La contraseña es incorrecta.")
          return
        }

        if (code === "DATABASE_NOT_CONFIGURED") {
          setError(
            "El servidor no está configurado (DATABASE_URL faltante). Revisa tu .env.local.",
          )
          return
        }

        setError(data.error ?? `No se pudo iniciar sesión (HTTP ${response.status}).`)
        return
      }

      const user = (data?.user ?? {}) as {
        id?: number
        email?: string
        role?: string
        hasPasskeys?: boolean
        displayName?: string | null
      }

      if (user.email) {
        localStorage.setItem("userEmail", user.email)
        if (user.email !== email) {
          setEmail(user.email)
        }
      } else {
        localStorage.removeItem("userEmail")
      }

      if (user.displayName) {
        localStorage.setItem("userDisplayName", user.displayName)
      } else {
        localStorage.removeItem("userDisplayName")
      }
      const userId = typeof user.id === "number" ? user.id : null

      if (userId != null) {
        localStorage.setItem("userId", String(userId))
      } else {
        localStorage.removeItem("userId")
      }
      if (user.role) {
        localStorage.setItem("userRole", user.role)
      } else {
        localStorage.removeItem("userRole")
      }

      const destination =
        user.role === "admin"
          ? "/admin"
          : user.role === "barber"
            ? "/barber"
            : "/booking"

      if (userId && !user.hasPasskeys) {
        const wantsPasskey = window.confirm(
          "Tu cuenta aún no tiene una llave de acceso. ¿Deseas configurarla ahora?",
        )

        if (wantsPasskey) {
          const registered = await registerPasskeyForUser(userId)
          if (!registered) {
            setError(
              "No fue posible registrar la llave de acceso. Intenta de nuevo desde la configuración de tu cuenta.",
            )
          }
        }
      }

      router.push(destination)
    } catch (err) {
      console.error("Login error", err)
      setError("Error de conexión con el servidor.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handlePasskeyLogin = async () => {
    const sanitizedEmail = email.trim()

    if (!sanitizedEmail) {
      setError("Ingresa tu correo antes de usar tu llave de acceso.")
      return
    }

    setError(null)
    setIsPasskeyLoading(true)

    try {
      const optionsResponse = await fetch("/api/webauthn/auth/options", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: sanitizedEmail }),
      })

      const optionsData = await optionsResponse.json().catch(() => ({}))

      if (!optionsResponse.ok) {
        setError(optionsData.error ?? "No se pudieron generar las opciones de llave de acceso.")
        return
      }

  const credential = await startAuthentication({ optionsJSON: optionsData.options })

      const verifyResponse = await fetch("/api/webauthn/auth/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ credential }),
      })

      const verifyData = await verifyResponse.json().catch(() => ({}))

      if (!verifyResponse.ok) {
        setError(verifyData.error ?? "No se pudo iniciar sesión con tu llave de acceso.")
        return
      }

      const user = (verifyData?.user ?? {}) as {
        id?: number
        email?: string
        role?: string
        displayName?: string | null
      }

      if (user.email) {
        localStorage.setItem("userEmail", user.email)
        if (user.email !== email) {
          setEmail(user.email)
        }
      } else {
        localStorage.removeItem("userEmail")
      }

      if (user.displayName) {
        localStorage.setItem("userDisplayName", user.displayName)
      } else {
        localStorage.removeItem("userDisplayName")
      }

      if (typeof user.id === "number") {
        localStorage.setItem("userId", String(user.id))
      } else {
        localStorage.removeItem("userId")
      }

      if (user.role) {
        localStorage.setItem("userRole", user.role)
      } else {
        localStorage.removeItem("userRole")
      }

      toast({
        title: "Sesión iniciada",
        description: "Bienvenido de nuevo con tu llave de acceso.",
      })

      switch (user.role) {
        case "admin":
          router.push("/admin")
          break
        case "barber":
          router.push("/barber")
          break
        default:
          router.push("/booking")
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("La autenticación fue cancelada.")
      } else if (err instanceof Error) {
        console.error("Passkey login error", err)
        setError(err.message)
      } else {
        setError("Ocurrió un error con la llave de acceso.")
      }
    } finally {
      setIsPasskeyLoading(false)
    }
  }

  const registerPasskeyForUser = async (userId: number) => {
    setError(null)

    try {
      const optionsResponse = await fetch("/api/webauthn/register/options", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId }),
      })

      const optionsData = await optionsResponse.json().catch(() => ({}))

      if (!optionsResponse.ok) {
        setError(optionsData.error ?? "No se pudieron generar las opciones para registrar tu llave.")
        return false
      }

  const credential = await startRegistration({ optionsJSON: optionsData.options })

      const verifyResponse = await fetch("/api/webauthn/register/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId, credential }),
      })

      const verifyData = await verifyResponse.json().catch(() => ({}))

      if (!verifyResponse.ok) {
        setError(verifyData.error ?? "No se pudo guardar la llave de acceso.")
        return false
      }

      toast({
        title: "Llave registrada",
        description: "Listo, podrás iniciar sesión con tu llave de acceso la próxima vez.",
      })

      return true
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("El registro de la llave fue cancelado.")
      } else if (err instanceof Error) {
        console.error("Passkey registration error", err)
        setError(err.message)
      } else {
        setError("Ocurrió un error al registrar la llave de acceso.")
      }

      return false
    }
  }

  return (
    <div
      className={cn("flex flex-col gap-6", className)}
      suppressHydrationWarning
      {...props}
    >
      <Card className="overflow-hidden p-0 md:min-h-[560px]">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-6 md:p-8" onSubmit={handleLogin}>
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-bold">Bienvenido de nuevo</h1>
                <p className="text-muted-foreground text-balance">
                  Inicia sesión en tu cuenta de BarberPro
                </p>
              </div>
              <Field>
                <FieldLabel htmlFor="email">Correo electrónico</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@email.com"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">Contraseña</FieldLabel>
                  <a
                    href="#"
                    className="ml-auto text-sm underline-offset-2 hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </a>
                </div>
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
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Iniciando sesión..." : "Iniciar sesión"}
                </Button>
              </Field>
              <Field>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={isSubmitting || isPasskeyLoading}
                  onClick={handlePasskeyLogin}
                >
                  {isPasskeyLoading ? "Verificando llave..." : "Iniciar con llave de acceso"}
                </Button>
              </Field>
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <FieldDescription className="text-center">
                ¿No tienes cuenta?{" "}
                <Link
                  href="/register"
                  className="underline-offset-2 hover:underline"
                >
                  Regístrate
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
        <Link
          href="/"
          className="text-sm underline-offset-2 hover:underline"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
