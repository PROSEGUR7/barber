import { NextResponse } from "next/server"
import { z } from "zod"

import { EmployeeRecordNotFoundError, getEmployeesWithStats, registerEmployee } from "@/lib/admin"
import { UserAlreadyExistsError } from "@/lib/auth"

const createEmployeeSchema = z.object({
  name: z.string().min(2, "El nombre es obligatorio"),
  email: z.string().email("Correo electrónico inválido"),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres"),
  phone: z
    .string()
    .trim()
    .max(20, "El teléfono es demasiado largo")
    .optional()
    .refine((value) => !value || value.length >= 7, {
      message: "El teléfono debe tener al menos 7 dígitos",
    }),
})

export async function GET() {
  try {
    const employees = await getEmployeesWithStats()
    return NextResponse.json({ employees })
  } catch (error) {
    console.error("Error loading employees", error)
    return NextResponse.json(
      { error: "No se pudieron cargar los empleados" },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => ({}))
    const payload = createEmployeeSchema.transform((data) => ({
      ...data,
      phone: data.phone ? data.phone.trim() : undefined,
    })).parse(json)

    const employee = await registerEmployee(payload)

    return NextResponse.json({ employee }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: error.flatten() },
        { status: 400 },
      )
    }

    if (error instanceof UserAlreadyExistsError) {
      return NextResponse.json(
        { error: "Ya existe un usuario con ese correo" },
        { status: 409 },
      )
    }

    if (error instanceof EmployeeRecordNotFoundError) {
      return NextResponse.json(
        { error: "No se pudo crear el empleado en el sistema" },
        { status: 500 },
      )
    }

    console.error("Error creating employee", error)
    return NextResponse.json(
      { error: "No se pudo crear el empleado" },
      { status: 500 },
    )
  }
}
