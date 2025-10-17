import { NextResponse } from "next/server"
import { ZodError, z } from "zod"
import {
  AppUserRole,
  MissingProfileDataError,
  UserAlreadyExistsError,
  createUser,
} from "@/lib/auth"

const registerSchema = z.object({
  email: z
    .string()
    .email("Ingresa un correo válido")
    .transform((value) => value.trim()),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres"),
  name: z
    .string()
    .min(1, "Ingresa tu nombre")
    .transform((value) => value.trim()),
  phone: z
    .string()
    .min(7, "Ingresa un teléfono válido")
    .max(20, "El teléfono no puede exceder 20 caracteres")
    .transform((value) => value.trim()),
  role: z.enum(["client", "barber", "admin"]),
})

export async function POST(request: Request) {
  try {
    const json = await request.json()
    const { email, password, role, name, phone } = registerSchema.parse(json)

    const user = await createUser({
      email,
      password,
      role: role as AppUserRole,
      profile: {
        name,
        phone,
      },
    })

    return NextResponse.json(
      {
        user,
        message: "Cuenta creada correctamente",
      },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: error.flatten() },
        { status: 400 },
      )
    }

    if (error instanceof UserAlreadyExistsError) {
      return NextResponse.json(
        { error: "Ya existe una cuenta con este correo" },
        { status: 409 },
      )
    }

    if (error instanceof MissingProfileDataError) {
      return NextResponse.json(
        { error: "Faltan datos del perfil requeridos para este tipo de cuenta" },
        { status: 400 },
      )
    }

    console.error("Register error", error)

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
      { error: "Error al crear la cuenta" },
      { status: 500 },
    )
  }
}
