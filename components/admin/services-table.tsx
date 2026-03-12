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
} from '@tabler/icons-react'
import {
  ArrowUpDown,
  MoreHorizontal,
  Search,
  Scissors,
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
import type { ServiceSummary } from '@/lib/admin'
import {
  formatCurrency,
  formatNumber,
} from '@/lib/formatters'
import { cn } from '@/lib/utils'

const COLUMN_LABELS: Record<string, string> = {
  name: 'Servicio',
  description: 'Descripción',
  price: 'Precio',
  durationMin: 'Duración',
  status: 'Estado',
  actions: 'Acciones',
}

export function AdminServicesTable({
  services,
  onEditService,
  onDeleteService,
  deletingServiceId,
}: {
  services: ServiceSummary[]
  onEditService: (service: ServiceSummary) => void
  onDeleteService: (service: ServiceSummary) => void
  deletingServiceId?: number | null
}) {
  const { toast } = useToast()
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'name', desc: false },
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

    for (const service of services) {
      const normalized = normalizeStatus(service.status)
      map.set(normalized.value, normalized.label)
    }

    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }))
  }, [services])

  const filteredServices = useMemo(() => {
    const search = searchTerm.trim().toLowerCase()

    return services.filter((service) => {
      const matchesSearch =
        search.length === 0 ||
        [service.name, service.description ?? '']
          .map((value) => value.toLowerCase())
          .some((value) => value.includes(search))

      if (!matchesSearch) {
        return false
      }

      if (statusFilter === 'all') {
        return true
      }

      return normalizeStatus(service.status).value === statusFilter
    })
  }, [services, searchTerm, statusFilter])

  const columns = useMemo<ColumnDef<ServiceSummary, unknown>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }: HeaderContext<ServiceSummary, unknown>) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label='Seleccionar todos'
            className='translate-y-0.5'
          />
        ),
        cell: ({ row }: CellContext<ServiceSummary, unknown>) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label={`Seleccionar ${row.original.name}`}
            className='translate-y-0.5'
          />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 48,
      },
      {
        accessorKey: 'name',
        header: ({ column }: HeaderContext<ServiceSummary, unknown>) => (
          <SortableHeader column={column} title='Servicio' />
        ),
        cell: ({ row }: CellContext<ServiceSummary, unknown>) => (
          <div className='flex items-center gap-3'>
            <div className='flex size-10 items-center justify-center rounded-lg border border-border/60 bg-background/70 text-sm font-semibold uppercase'>
              {getInitials(row.original.name)}
            </div>
            <div className='flex flex-col'>
              <span className='font-medium leading-tight'>
                {row.original.name}
              </span>
              <span className='text-xs text-muted-foreground'>
                ID servicio: {row.original.id}
              </span>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'description',
        header: () => <span className='text-xs uppercase text-muted-foreground'>Descripción</span>,
        cell: ({ row }: CellContext<ServiceSummary, unknown>) => (
          <div className='max-w-md text-sm text-muted-foreground'>
            {row.original.description?.trim() || 'Sin descripción'}
          </div>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'price',
        header: ({ column }: HeaderContext<ServiceSummary, unknown>) => (
          <SortableHeader column={column} title='Precio' align='right' />
        ),
        cell: ({ row }: CellContext<ServiceSummary, unknown>) => (
          <div className='text-right font-semibold'>
            {formatCurrency(row.original.price)}
          </div>
        ),
      },
      {
        accessorKey: 'durationMin',
        header: ({ column }: HeaderContext<ServiceSummary, unknown>) => (
          <SortableHeader column={column} title='Duración' align='right' />
        ),
        cell: ({ row }: CellContext<ServiceSummary, unknown>) => (
          <div className='text-right text-sm'>
            {formatNumber(row.original.durationMin)} min
          </div>
        ),
      },
      {
        id: 'status',
        accessorFn: (service) => normalizeStatus(service.status).value,
        header: ({ column }: HeaderContext<ServiceSummary, unknown>) => (
          <SortableHeader column={column} title='Estado' />
        ),
        cell: ({ row }: CellContext<ServiceSummary, unknown>) => (
          <Badge variant={getStatusVariant(row.original.status)}>
            {normalizeStatus(row.original.status).label}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: () => null,
        cell: ({ row }: CellContext<ServiceSummary, unknown>) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant='ghost'
                size='icon-sm'
                className='hover:bg-accent/60'
              >
                <MoreHorizontal className='size-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-40'>
              <DropdownMenuItem onClick={() => onEditService(row.original)}>
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                variant='destructive'
                onClick={() => onDeleteService(row.original)}
                disabled={deletingServiceId === row.original.id}
              >
                {deletingServiceId === row.original.id ? 'Eliminando...' : 'Eliminar'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        enableSorting: false,
        enableHiding: false,
        size: 56,
      },
    ],
    [deletingServiceId, onDeleteService, onEditService],
  )

  const table = useReactTable<ServiceSummary>({
    data: filteredServices,
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
  }, [filteredServices])

  const selectedCount = table.getFilteredSelectedRowModel().rows.length
  const totalFiltered = table.getFilteredRowModel().rows.length

  const handleExport = useCallback(() => {
    const rowsToExport = selectedCount
      ? table.getFilteredSelectedRowModel().rows
      : table.getFilteredRowModel().rows

    if (rowsToExport.length === 0) {
      toast({
        title: 'No hay datos para exportar',
        description: 'Selecciona al menos un servicio o ajusta los filtros.',
      })
      return
    }

    const header = [
      'Servicio',
      'Descripción',
      'Precio',
      'Duración (min)',
      'Estado',
    ]
    const csvRows = rowsToExport.map((row): string => {
      const service = row.original
      return [
        escapeCsv(service.name),
        escapeCsv(service.description ?? ''),
        escapeCsv(String(service.price)),
        escapeCsv(String(service.durationMin)),
        escapeCsv(normalizeStatus(service.status).label),
      ].join(',')
    })

    const csvContent = [header.join(','), ...csvRows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute(
      'download',
      `servicios-${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({
      title: 'Exportación completada',
      description: `Descargaste ${rowsToExport.length} servicios.`,
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
            <Scissors size={20} />
          </div>
          <div>
            <CardTitle className='text-lg font-semibold'>
              Catálogo de servicios
            </CardTitle>
            <CardDescription>
              Consulta y administra servicios, precios y estado operativo.
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
                placeholder='Buscar por servicio o descripción'
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
          <Table className={cn('min-w-[920px]', density === 'compact' ? 'text-sm' : 'text-base')}>
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
                {selectedCount} de {totalFiltered} servicios seleccionados.
              </span>
            ) : (
              <span>{totalFiltered} servicios filtrados en la tabla.</span>
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
  table: TableInstance<ServiceSummary>
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
  column: Column<ServiceSummary, unknown>
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

function getInitials(value: string) {
  return (
    value
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((chunk) => chunk[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 2) || 'SV'
  )
}

function normalizeStatus(status: string | null | undefined) {
  if (!status) {
    return { value: 'sin-estado', label: 'Sin estado' }
  }

  const trimmed = status.trim()
  const value = trimmed.toLowerCase()

  if (value === 'activo') {
    return { value, label: 'Activo' }
  }

  if (value === 'inactivo') {
    return { value, label: 'Inactivo' }
  }

  return {
    value,
    label: trimmed
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase()),
  }
}

function getStatusVariant(status: string | null | undefined) {
  const value = normalizeStatus(status).value

  if (value === 'activo') {
    return 'default' as const
  }

  if (value === 'inactivo') {
    return 'secondary' as const
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
