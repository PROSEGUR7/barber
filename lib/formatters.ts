const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
})

const numberFormatter = new Intl.NumberFormat('es-AR')

const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
}

const DEFAULT_DATETIME_OPTIONS: Intl.DateTimeFormatOptions = {
  ...DEFAULT_DATE_OPTIONS,
  hour: '2-digit',
  minute: '2-digit',
}

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value)
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

export function formatDate(
  value: string | null,
  options: Intl.DateTimeFormatOptions = DEFAULT_DATE_OPTIONS,
  fallback = 'Sin fecha',
): string {
  if (!value) {
    return fallback
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return fallback
  }

  return date.toLocaleDateString('es-ES', options)
}

export function formatDateTime(value: string | null): string {
  if (!value) {
    return 'Sin fecha'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Sin fecha'
  }

  return date.toLocaleString('es-ES', DEFAULT_DATETIME_OPTIONS)
}

export function formatJoinedAt(value: string | null): string {
  return formatDate(value)
}
