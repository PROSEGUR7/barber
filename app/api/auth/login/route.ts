import { NextResponse } from "next/server"
import { ZodError, z } from "zod"
import { findUserByEmail, markUserLogin, verifyPassword } from "@/lib/auth"
import { userHasPasskeys } from "@/lib/webauthn"

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "La contraseña es obligatoria"),
})

export async function POST(request: Request) {
  try {
    const json = await request.json()
  const { email, password } = loginSchema.parse(json)

  const user = await findUserByEmail(email)
    if (!user) {
      return NextResponse.json(
        { error: "Credenciales incorrectas" },
        { status: 401 },
      )
    }

    const passwordOk = await verifyPassword(password, user.passwordHash)
    if (!passwordOk) {
      return NextResponse.json(
        { error: "Credenciales incorrectas" },
        { status: 401 },
      )
    }

  const hasPasskeys = await userHasPasskeys(user.id)

  await markUserLogin(user.id)

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        lastLogin: user.lastLogin,
        displayName: user.displayName ?? null,
        hasPasskeys,
      },
    })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: error.flatten() },
        { status: 400 },
      )
    }

    console.error("Login error", error)

    // Surface TLS certificate errors in a more actionable way for developers
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as any).code === "SELF_SIGNED_CERT_IN_CHAIN"
    ) {
      return NextResponse.json(
        {
          error:
            "Error de certificado TLS: certificado autofirmado en la cadena. En desarrollo puede desactivarse la verificación estableciendo NODE_ENV=development o PGSSLMODE=no-verify.",
        },
        { status: 500 },
      )
    }

    return NextResponse.json(
      { error: "Error al iniciar sesión" },
      { status: 500 },
    )
  }
}
