'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  type CellContext,
  type Column,
  type ColumnDef,
  type HeaderContext,
  type RowSelectionState,
  type SortingState,
  type Table as TableInstance,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  IconAdjustmentsHorizontal,
  IconDownload,
  IconRefresh,
  IconReceipt,
} from '@tabler/icons-react'
import {
  ArrowUpDown,
  Search,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import {
  formatCurrency,
  formatDateTime,
} from '@/lib/formatters'
import { cn } from '@/lib/utils'

export type AdminBillingPaymentSummary = {
  paymentId: number
  amount: number
  currency: string
  paymentStatus: string | null
  paidAt: string | null
  createdAt: string | null
  paymentMethod: string | null
  paymentProvider: string | null
  externalReference: string | null
  billingCycle: string | null
  planCode: string | null
  planName: string | null
  invoiceNumber: string | null
  invoiceStatus: string | null
  tenantId: number
  tenantName: string
  tenantSchema: string | null
}

const COLUMN_LABELS: Record<string, string> = {
  paymentId: 'Pago',
  plan: 'Plan',
  billingCycle: 'Ciclo',
  paymentStatus: 'Estado pago',
  invoiceNumber: 'Factura',
  paidAt: 'Fecha pago',
  amount: 'Monto',
}

export function AdminPaymentsTable({
  payments,
  onReload,
}: {
  payments: AdminBillingPaymentSummary[]
  onReload?: () => void
}) {
  const { toast } = useToast()
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'paidAt', desc: true },
  ])
  const [columnVisibility, setColumnVisibility] =
    useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [density, setDensity] = useState<'comfortable' | 'compact'>(
    'comfortable',
  )

  const statusOptions = useMemo(() => {
    const map = new Map<string, string>()

    for (const payment of payments) {
      const normalized = normalizeStatus(payment.paymentStatus)
      map.set(normalized.value, normalized.label)
    }

    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }))
  }, [payments])

  const filteredPayments = useMemo(() => {
    const search = searchTerm.trim().toLowerCase()

    return payments.filter((payment) => {
      const statusMatches =
        statusFilter === 'all' ||
        normalizeStatus(payment.paymentStatus).value === statusFilter

      if (!statusMatches) {
        return false
      }

      if (search.length === 0) {
        return true
      }

      const searchableText = [
        payment.tenantName,
        payment.tenantSchema ?? '',
        payment.planName ?? '',
        payment.planCode ?? '',
        payment.invoiceNumber ?? '',
        payment.externalReference ?? '',
        payment.paymentStatus ?? '',
      ]
        .join(' ')
        .toLowerCase()

      return searchableText.includes(search)
    })
  }, [payments, searchTerm, statusFilter])

  const columns = useMemo<ColumnDef<AdminBillingPaymentSummary, unknown>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }: HeaderContext<AdminBillingPaymentSummary, unknown>) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label='Seleccionar todos'
            className='translate-y-0.5'
          />
        ),
        cell: ({ row }: CellContext<AdminBillingPaymentSummary, unknown>) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label={`Seleccionar pago ${row.original.paymentId}`}
            className='translate-y-0.5'
          />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 48,
      },
      {
        accessorKey: 'paymentId',
        header: ({ column }: HeaderContext<AdminBillingPaymentSummary, unknown>) => (
          <SortableHeader column={column} title='Pago' />
        ),
        cell: ({ row }: CellContext<AdminBillingPaymentSummary, unknown>) => (
          <div className='flex flex-col'>
            <span className='font-semibold'>#{row.original.paymentId}</span>
            <span className='text-xs text-muted-foreground'>
              Tenant: {row.original.tenantName}
            </span>
          </div>
        ),
      },
      {
        id: 'plan',
        accessorFn: (payment) => payment.planName ?? payment.planCode ?? 'Sin plan',
        header: ({ column }: HeaderContext<AdminBillingPaymentSummary, unknown>) => (
          <SortableHeader column={column} title='Plan' />
        ),
        cell: ({ row }: CellContext<AdminBillingPaymentSummary, unknown>) => (
          <div className='flex flex-col'>
            <span>{row.original.planName ?? row.original.planCode ?? 'Sin plan'}</span>
            <span className='text-xs text-muted-foreground'>
              {row.original.planCode ?? 'Sin código'}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'billingCycle',
        header: ({ column }: HeaderContext<AdminBillingPaymentSummary, unknown>) => (
          <SortableHeader column={column} title='Ciclo' />
        ),
        cell: ({ row }: CellContext<AdminBillingPaymentSummary, unknown>) => (
          <span className='capitalize'>{row.original.billingCycle ?? 'Sin ciclo'}</span>
        ),
      },
      {
        accessorKey: 'paymentStatus',
        header: ({ column }: HeaderContext<AdminBillingPaymentSummary, unknown>) => (
          <SortableHeader column={column} title='Estado pago' />
        ),
        cell: ({ row }: CellContext<AdminBillingPaymentSummary, unknown>) => (
          <Badge variant={getStatusVariant(row.original.paymentStatus)}>
            {normalizeStatus(row.original.paymentStatus).label}
          </Badge>
        ),
      },
      {
        accessorKey: 'invoiceNumber',
        header: ({ column }: HeaderContext<AdminBillingPaymentSummary, unknown>) => (
          <SortableHeader column={column} title='Factura' />
        ),
        cell: ({ row }: CellContext<AdminBillingPaymentSummary, unknown>) => (
          <div className='flex flex-col'>
            <span>{row.original.invoiceNumber ?? 'Sin factura'}</span>
            <span className='text-xs text-muted-foreground'>
              Ref: {row.original.externalReference ?? 'Sin referencia'}
            </span>
          </div>
        ),
      },
      {
        id: 'paidAt',
        accessorFn: (payment) => payment.paidAt ?? payment.createdAt ?? '',
        header: ({ column }: HeaderContext<AdminBillingPaymentSummary, unknown>) => (
          <SortableHeader column={column} title='Fecha pago' />
        ),
        cell: ({ row }: CellContext<AdminBillingPaymentSummary, unknown>) => (
          <span>
            {row.original.paidAt
              ? formatDateTime(row.original.paidAt)
              : row.original.createdAt
                ? formatDateTime(row.original.createdAt)
                : 'Sin fecha'}
          </span>
        ),
      },
      {
        accessorKey: 'amount',
        header: ({ column }: HeaderContext<AdminBillingPaymentSummary, unknown>) => (
          <SortableHeader column={column} title='Monto' align='right' />
        ),
        cell: ({ row }: CellContext<AdminBillingPaymentSummary, unknown>) => (
          <div className='text-right font-semibold'>
            {formatCurrency(row.original.amount)}
          </div>
        ),
      },
    ],
    [],
  )

  const table = useReactTable<AdminBillingPaymentSummary>({
    data: filteredPayments,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableRowSelection: true,
    initialState: {
      pagination: {
        pageSize: 8,
      },
    },
  })

  useEffect(() => {
    setRowSelection({})
  }, [filteredPayments])

  const selectedCount = table.getFilteredSelectedRowModel().rows.length
  const totalFiltered = table.getFilteredRowModel().rows.length

  const handleExport = useCallback(() => {
    const rowsToExport = selectedCount
      ? table.getFilteredSelectedRowModel().rows
      : table.getFilteredRowModel().rows

    if (rowsToExport.length === 0) {
      toast({
        title: 'No hay datos para exportar',
        description: 'Selecciona al menos un pago o ajusta los filtros.',
      })
      return
    }

    const header = [
      'Pago',
      'Tenant',
      'Plan',
      'Ciclo',
      'Estado',
      'Factura',
      'Referencia',
      'Fecha',
      'Monto',
    ]
    const csvRows = rowsToExport.map((row): string => {
      const payment = row.original
      const dateLabel = payment.paidAt ?? payment.createdAt ?? ''

      return [
        escapeCsv(String(payment.paymentId)),
        escapeCsv(payment.tenantName),
        escapeCsv(payment.planName ?? payment.planCode ?? 'Sin plan'),
        escapeCsv(payment.billingCycle ?? ''),
        escapeCsv(normalizeStatus(payment.paymentStatus).label),
        escapeCsv(payment.invoiceNumber ?? ''),
        escapeCsv(payment.externalReference ?? ''),
        escapeCsv(dateLabel),
        escapeCsv(String(payment.amount)),
      ].join(',')
    })

    const csvContent = [header.join(','), ...csvRows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute(
      'download',
      `pagos-${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({
      title: 'Exportación completada',
      description: `Descargaste ${rowsToExport.length} pagos.`,
    })
  }, [selectedCount, table, toast])

  const hasActiveFilters =
    searchTerm.trim().length > 0 || statusFilter !== 'all'

  const headerGroups = table.getHeaderGroups()
  const rows = table.getRowModel().rows
  const visibleColumns = table.getAllLeafColumns()

  const statusLabel =
    statusFilter === 'all' ? 'Todos' : normalizeStatusLabel(statusOptions, statusFilter)

  return (
    <Card className='border-border/60 bg-gradient-to-b from-background/80 via-background to-background/95'>
      <CardHeader className='pb-4'>
        <div className='flex items-center gap-3'>
          <div className='flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary'>
            <IconReceipt size={20} />
          </div>
          <div>
            <CardTitle className='text-lg font-semibold'>
              Movimientos de pagos
            </CardTitle>
            <CardDescription>
              Consulta cobros de suscripción por plan, estado y referencia.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
          <div className='flex flex-1 flex-wrap items-center gap-2'>
            <div className='relative min-w-[220px] flex-1 sm:max-w-sm'>
              <Search className='text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2' />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder='Buscar por tenant, plan, factura o referencia'
                className='pl-10'
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='outline' size='sm' className='gap-2'>
                  <IconAdjustmentsHorizontal size={16} />
                  {`Estado: ${statusLabel.toLowerCase()}`}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='start' className='w-56'>
                <DropdownMenuLabel>Filtrar por estado</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => setStatusFilter('all')}
                  className={cn(statusFilter === 'all' && 'bg-accent/50')}
                >
                  Todos
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {statusOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => setStatusFilter(option.value)}
                    className={cn(
                      statusFilter === option.value && 'bg-accent/50',
                    )}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {hasActiveFilters && (
              <Button variant='ghost' size='sm' onClick={() => {
                setSearchTerm('')
                setStatusFilter('all')
              }}>
                Limpiar filtros
              </Button>
            )}
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            {selectedCount > 0 && (
              <Badge variant='secondary' className='hidden md:inline-flex'>
                {selectedCount} seleccionados
              </Badge>
            )}
            {onReload && (
              <Button variant='ghost' size='sm' onClick={onReload}>
                <IconRefresh size={16} />
                Recargar
              </Button>
            )}
            <Button
              variant='ghost'
              size='sm'
              onClick={() =>
                setDensity(
                  density === 'comfortable' ? 'compact' : 'comfortable',
                )
              }
            >
              {density === 'comfortable' ? 'Modo compacto' : 'Modo amplio'}
            </Button>
            <TableViewOptions table={table} />
            <Button variant='secondary' size='sm' onClick={handleExport}>
              <IconDownload size={16} />
              Exportar
            </Button>
          </div>
        </div>

        <div className='overflow-x-auto rounded-xl border border-border/60 bg-background/60 shadow-sm'>
          <Table className={cn('min-w-[1000px]', density === 'compact' ? 'text-sm' : 'text-base')}>
            <TableHeader className='bg-muted/40'>
              {headerGroups.map((headerGroup) => (
                <TableRow key={headerGroup.id} className='hover:bg-transparent'>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className='align-middle'>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                    className={cn(
                      'border-border/50 transition-colors',
                      density === 'compact' ? 'h-12' : 'h-[72px]',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className='align-middle'>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={visibleColumns.length} className='h-24 text-center text-muted-foreground'>
                    No encontramos coincidencias con los filtros aplicados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className='flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between'>
          <div>
            {selectedCount > 0 ? (
              <span>
                {selectedCount} de {totalFiltered} pagos seleccionados.
              </span>
            ) : (
              <span>{totalFiltered} pagos filtrados en la tabla.</span>
            )}
          </div>
          <div className='flex items-center gap-2'>
            <Button
              variant='ghost'
              size='sm'
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Anterior
            </Button>
            <span className='text-xs text-muted-foreground'>
              Página {table.getState().pagination.pageIndex + 1} de{' '}
              {table.getPageCount()}
            </span>
            <Button
              variant='ghost'
              size='sm'
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function TableViewOptions({
  table,
}: {
  table: TableInstance<AdminBillingPaymentSummary>
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='sm' className='gap-2'>
          Columnas
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-56'>
        <DropdownMenuLabel>Visibilidad de columnas</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {table
          .getAllLeafColumns()
          .filter((column) => column.getCanHide())
          .map((column) => {
            const columnId = String(column.id)
            const label = COLUMN_LABELS[columnId] ?? columnId

            return (
              <DropdownMenuCheckboxItem
                key={column.id}
                className='capitalize'
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
              >
                {label}
              </DropdownMenuCheckboxItem>
            )
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type SortableHeaderProps = {
  column: Column<AdminBillingPaymentSummary, unknown>
  title: string
  align?: 'left' | 'right'
}

function SortableHeader({
  column,
  title,
  align = 'left',
}: SortableHeaderProps) {
  return (
    <Button
      variant='ghost'
      size='sm'
      className={cn(
        '-ml-3 h-8 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
        align === 'right' && 'ml-auto flex-row-reverse',
      )}
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
    >
      {title}
      <ArrowUpDown className='ml-2 size-3.5' />
    </Button>
  )
}

function normalizeStatus(status: string | null | undefined) {
  if (!status) {
    return { value: 'sin-estado', label: 'Sin estado' }
  }

  const trimmed = status.trim()
  const value = trimmed.toLowerCase()

  return {
    value,
    label: trimmed
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (chunk) => chunk.toUpperCase()),
  }
}

function getStatusVariant(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase() ?? ''

  if (normalized.includes('rech') || normalized.includes('cancel') || normalized.includes('fall')) {
    return 'destructive' as const
  }

  if (
    normalized.includes('pag') ||
    normalized.includes('aprob') ||
    normalized.includes('complet') ||
    normalized.includes('final') ||
    normalized.includes('paid') ||
    normalized.includes('success')
  ) {
    return 'secondary' as const
  }

  if (normalized.includes('pend') || normalized.includes('process')) {
    return 'default' as const
  }

  return 'outline' as const
}

function normalizeStatusLabel(
  options: Array<{ value: string; label: string }>,
  value: string,
) {
  const match = options.find((option) => option.value === value)
  return match?.label ?? 'Personalizado'
}

function escapeCsv(value: string) {
  const sanitized = value.replace(/\r?\n/g, ' ').trim()

  if (/[",]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`
  }

  return sanitized
}
