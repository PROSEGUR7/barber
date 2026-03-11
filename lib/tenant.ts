import { BASE_TENANT_SCHEMA, findTenantSchemaByEmail } from "@/lib/auth"

const TENANT_SCHEMA_PATTERN = /^tenant_[a-z0-9_]+$/i

function quotePgIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`
}

export function normalizeTenantSchema(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (!TENANT_SCHEMA_PATTERN.test(normalized)) {
    return null
  }

  return normalized
}

export function resolveTenantHintFromRequest(request: Request): string | null {
  const fromHeader = normalizeTenantSchema(request.headers.get("x-tenant"))
  if (fromHeader) {
    return fromHeader
  }

  const fromQuery = normalizeTenantSchema(new URL(request.url).searchParams.get("tenant"))
  if (fromQuery) {
    return fromQuery
  }

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? ""
  const hostname = host.split(":")[0]?.trim().toLowerCase() ?? ""
  const firstLabel = hostname.split(".")[0] ?? ""

  return normalizeTenantSchema(firstLabel)
}

export async function resolveTenantSchemaForRequest(request: Request): Promise<string> {
  const hint = resolveTenantHintFromRequest(request)
  const userEmail = request.headers.get("x-user-email")?.trim().toLowerCase() ?? ""

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
    const byEmail = await findTenantSchemaByEmail(userEmail, hint)
    if (byEmail) {
      return byEmail
    }
  }

  return hint ?? BASE_TENANT_SCHEMA
}

export async function resolveTenantSchemaForAdminRequest(request: Request): Promise<string | null> {
  const hint = resolveTenantHintFromRequest(request)
  const userEmail = request.headers.get("x-user-email")?.trim().toLowerCase() ?? ""

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
    const byEmail = await findTenantSchemaByEmail(userEmail, hint)
    if (byEmail) {
      return byEmail
    }
  }

  return hint
}

export function tenantSql(sql: string, tenantSchema: string | null | undefined): string {
  const resolved = normalizeTenantSchema(tenantSchema) ?? BASE_TENANT_SCHEMA
  const schemaIdentifier = quotePgIdentifier(resolved)

  return sql.replace(/\btenant_base\b/g, schemaIdentifier)
}
