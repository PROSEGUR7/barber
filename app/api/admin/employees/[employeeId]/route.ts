import { NextResponse } from "next/server"
import { z } from "zod"

import { EmployeeRecordNotFoundError, deleteEmployee, getEmployeesWithStats, updateEmployee } from "@/lib/admin"

const paramsSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
})

const updateEmployeeSchema = z.object({
  name: z.string().trim().min(2, "El nombre es obligatorio"),
  email: z.string().email("Correo electrónico inválido"),
  phone: z
    .string()
    .trim()
    .min(7, "Ingresa un teléfono válido")
    .max(20, "El teléfono es demasiado largo")
    .regex(/^[0-9+\-\s]+$/, "El teléfono solo puede tener números y símbolos + -"),
})

export async function GET(
  _request: Request,
  context: { params: Promise<{ employeeId: string }> },
) {
  try {
    const { employeeId } = paramsSchema.parse(await context.params)

    const employees = await getEmployeesWithStats({ employeeId })
    const employee = employees[0]

    if (!employee) {
      return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 })
    }

    return NextResponse.json({ employee })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 })
    }

    console.error("Error loading employee", error)
    return NextResponse.json({ error: "No se pudo cargar el empleado" }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ employeeId: string }> },
) {
  try {
    const { employeeId } = paramsSchema.parse(await context.params)
    const json = await request.json().catch(() => ({}))
    const payload = updateEmployeeSchema.parse(json)

    const employee = await updateEmployee({
      employeeId,
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
    })

    return NextResponse.json({ employee })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: error.flatten() },
        { status: 400 },
      )
    }

    if (error instanceof EmployeeRecordNotFoundError) {
      return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 })
    }

    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "Ya existe un usuario con ese correo" }, { status: 409 })
    }

    console.error("Error updating employee", error)
    return NextResponse.json({ error: "No se pudo actualizar el empleado" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ employeeId: string }> },
) {
  try {
    const { employeeId } = paramsSchema.parse(await context.params)

    await deleteEmployee(employeeId)

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 })
    }

    if (error instanceof EmployeeRecordNotFoundError) {
      return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 })
    }

    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23503") {
      return NextResponse.json(
        { error: "No se puede eliminar el empleado porque tiene registros asociados" },
        { status: 409 },
      )
    }

    console.error("Error deleting employee", error)
    return NextResponse.json({ error: "No se pudo eliminar el empleado" }, { status: 500 })
  }
}
