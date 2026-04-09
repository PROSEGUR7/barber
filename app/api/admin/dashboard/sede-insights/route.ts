import { NextResponse } from "next/server"

import {
  getAdminSedeInsightsReport,
  getAdminSedeRevenueSeries,
  SedesModuleNotAvailableError,
  type AdminReportsGranularity,
  type AdminSedeInsightsScope,
} from "@/lib/admin"
import { resolveTenantSchemaForAdminRequest } from "@/lib/tenant"

export const runtime = "nodejs"

const ALLOWED_GRANULARITIES = new Set<AdminReportsGranularity>(["day", "month", "year"])
const ALLOWED_SCOPES = new Set<AdminSedeInsightsScope>(["month", "quarter", "year"])

function jsonError(status: number, payload: { error: string; code?: string }) {
  return NextResponse.json(
    {
      ok: false,
      ...payload,
    },
    { status },
  )
}

function resolveGranularity(value: string | null): AdminReportsGranularity {
  const normalized = (value ?? "").trim().toLowerCase() as AdminReportsGranularity
  if (ALLOWED_GRANULARITIES.has(normalized)) {
    return normalized
  }

  return "day"
}

function resolveScope(value: string | null): AdminSedeInsightsScope {
  const normalized = (value ?? "").trim().toLowerCase() as AdminSedeInsightsScope
  if (ALLOWED_SCOPES.has(normalized)) {
    return normalized
  }

  return "month"
}

function resolveSedeId(value: string | null): number | null {
  if (!value) {
    return null
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null
  }

  return parsed
}

export async function GET(request: Request) {
  try {
    const tenantSchema = await resolveTenantSchemaForAdminRequest(request)
    if (!tenantSchema) {
      return jsonError(400, {
        code: "TENANT_NOT_RESOLVED",
        error: "No se pudo resolver el tenant de la sesion.",
      })
    }

    const url = new URL(request.url)
    const scope = resolveScope(url.searchParams.get("scope"))
    const granularity = resolveGranularity(url.searchParams.get("granularity"))
    const sedeId = resolveSedeId(url.searchParams.get("sedeId"))

    try {
      const [sedeInsights, focusedSeries] = await Promise.all([
        getAdminSedeInsightsReport({
          tenantSchema,
          scope,
        }),
        sedeId
          ? getAdminSedeRevenueSeries({
              tenantSchema,
              sedeId,
              granularity,
            })
          : Promise.resolve([]),
      ])

      return NextResponse.json(
        {
          ok: true,
          sedeInsights,
          focusedSeries,
        },
        { status: 200 },
      )
    } catch (error) {
      if (error instanceof SedesModuleNotAvailableError) {
        return NextResponse.json(
          {
            ok: true,
            sedeInsights: null,
            focusedSeries: [],
            warning: "El modulo de sedes aun no esta habilitado para este tenant.",
          },
          { status: 200 },
        )
      }

      throw error
    }
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_URL env var is not set") {
      return jsonError(503, {
        code: "DATABASE_NOT_CONFIGURED",
        error: "El servidor no esta configurado (DATABASE_URL faltante).",
      })
    }

    console.error("Admin dashboard sede insights API error", error)
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: "No se pudieron cargar los insights por sede.",
    })
  }
}
