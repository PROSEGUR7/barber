'use client'

import {
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
  IconDiscount,
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
import { formatDateTime } from '@/lib/formatters'
import { cn } from '@/lib/utils'

function formatDateOnly(value: string | null): string {
  if (!value) return 'Sin fecha'

  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value

  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed)
}

export type PromoCodeSummary = {
  code: string
  description: string
  expiresAt: string | null
  discountPercent: number
  serviceIds: number[] | null
  serviceNames: string[]
  active: boolean
  createdAt: string | null
}

const COLUMN_LABELS: Record<string, string> = {
  code: 'Código',
  description: 'Descripción',
  discountPercent: 'Descuento',
  expiresAt: 'Caduca',
  serviceNames: 'Servicios',
  active: 'Estado',
  createdAt: 'Creado',
  actions: 'Acciones',
}

export function AdminPromoCodesTable({
  promoCodes,
  onToggleActive,
  isUpdatingCode,
}: {
  promoCodes: PromoCodeSummary[]
  onToggleActive: (promoCode: PromoCodeSummary) => void
  isUpdatingCode?: string | null
}) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: true },
  ])
  const [columnVisibility, setColumnVisibility] =
    useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable')

  const filteredPromoCodes = useMemo(() => {
    const search = searchTerm.trim().toLowerCase()

    return promoCodes.filter((promoCode) => {
      if (statusFilter === 'active' && !promoCode.active) {
        return false
      }

      if (statusFilter === 'inactive' && promoCode.active) {
        return false
      }

      if (search.length === 0) {
        return true
      }

      const searchableText = [
        promoCode.code,
        promoCode.description,
        `${promoCode.discountPercent}%`,
        promoCode.expiresAt ?? '',
        promoCode.serviceNames.join(' ') || 'todos los servicios',
      ]
        .join(' ')
        .toLowerCase()

      return searchableText.includes(search)
    })
  }, [promoCodes, searchTerm, statusFilter])

  const columns = useMemo<ColumnDef<PromoCodeSummary, unknown>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }: HeaderContext<PromoCodeSummary, unknown>) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label='Seleccionar todos'
            className='translate-y-0.5'
          />
        ),
        cell: ({ row }: CellContext<PromoCodeSummary, unknown>) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label={`Seleccionar ${row.original.code}`}
            className='translate-y-0.5'
          />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 48,
      },
      {
        accessorKey: 'code',
        header: ({ column }: HeaderContext<PromoCodeSummary, unknown>) => (
          <SortableHeader column={column} title='Código' />
        ),
        cell: ({ row }: CellContext<PromoCodeSummary, unknown>) => (
          <span className='font-semibold'>{row.original.code}</span>
        ),
      },
      {
        accessorKey: 'description',
        header: ({ column }: HeaderContext<PromoCodeSummary, unknown>) => (
          <SortableHeader column={column} title='Descripción' />
        ),
        cell: ({ row }: CellContext<PromoCodeSummary, unknown>) => (
          <span>{row.original.description}</span>
        ),
      },
      {
        accessorKey: 'discountPercent',
        header: ({ column }: HeaderContext<PromoCodeSummary, unknown>) => (
          <SortableHeader column={column} title='Descuento' />
        ),
        cell: ({ row }: CellContext<PromoCodeSummary, unknown>) => (
          <span className='font-medium'>{row.original.discountPercent}%</span>
        ),
      },
      {
        accessorKey: 'expiresAt',
        header: ({ column }: HeaderContext<PromoCodeSummary, unknown>) => (
          <SortableHeader column={column} title='Caduca' />
        ),
        cell: ({ row }: CellContext<PromoCodeSummary, unknown>) => (
          <span>{formatDateOnly(row.original.expiresAt)}</span>
        ),
      },
      {
        accessorKey: 'serviceNames',
        header: ({ column }: HeaderContext<PromoCodeSummary, unknown>) => (
          <SortableHeader column={column} title='Servicios' />
        ),
        cell: ({ row }: CellContext<PromoCodeSummary, unknown>) => (
          <span>
            {row.original.serviceNames.length > 0
              ? row.original.serviceNames.join(', ')
              : 'Todos los servicios'}
          </span>
        ),
      },
      {
        accessorKey: 'active',
        header: ({ column }: HeaderContext<PromoCodeSummary, unknown>) => (
          <SortableHeader column={column} title='Estado' />
        ),
        cell: ({ row }: CellContext<PromoCodeSummary, unknown>) => (
          <Badge variant={row.original.active ? 'secondary' : 'outline'}>
            {row.original.active ? 'Activo' : 'Inactivo'}
          </Badge>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }: HeaderContext<PromoCodeSummary, unknown>) => (
          <SortableHeader column={column} title='Creado' />
        ),
        cell: ({ row }: CellContext<PromoCodeSummary, unknown>) => (
          <span>{row.original.createdAt ? formatDateTime(row.original.createdAt) : 'Sin registro'}</span>
        ),
      },
      {
        id: 'actions',
        header: () => null,
        cell: ({ row }: CellContext<PromoCodeSummary, unknown>) => (
          <Button
            variant='outline'
            size='sm'
            onClick={() => onToggleActive(row.original)}
            disabled={isUpdatingCode === row.original.code}
          >
            {isUpdatingCode === row.original.code
              ? 'Guardando...'
              : row.original.active
                ? 'Desactivar'
                : 'Activar'}
          </Button>
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [isUpdatingCode, onToggleActive],
  )

  const table = useReactTable<PromoCodeSummary>({
    data: filteredPromoCodes,
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

  const selectedCount = table.getFilteredSelectedRowModel().rows.length
  const totalFiltered = table.getFilteredRowModel().rows.length
  const hasActiveFilters = searchTerm.trim().length > 0 || statusFilter !== 'all'

  const headerGroups = table.getHeaderGroups()
  const rows = table.getRowModel().rows
  const visibleColumns = table.getAllLeafColumns()

  const statusLabel =
    statusFilter === 'all' ? 'todos' : statusFilter === 'active' ? 'activos' : 'inactivos'

  return (
    <Card className='border-border/60 bg-gradient-to-b from-background/80 via-background to-background/95'>
      <CardHeader className='pb-4'>
        <div className='flex items-center gap-3'>
          <div className='flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary'>
            <IconDiscount size={20} />
          </div>
          <div>
            <CardTitle className='text-lg font-semibold'>
              Códigos promocionales
            </CardTitle>
            <CardDescription>
              Solo administradores pueden crear, activar o desactivar promo codes.
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
                placeholder='Buscar por código o descripción'
                className='pl-10'
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='outline' size='sm' className='gap-2'>
                  <IconAdjustmentsHorizontal size={16} />
                  {`Estado: ${statusLabel}`}
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
                <DropdownMenuItem
                  onClick={() => setStatusFilter('active')}
                  className={cn(statusFilter === 'active' && 'bg-accent/50')}
                >
                  Activos
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setStatusFilter('inactive')}
                  className={cn(statusFilter === 'inactive' && 'bg-accent/50')}
                >
                  Inactivos
                </DropdownMenuItem>
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
              onClick={() => setDensity(density === 'comfortable' ? 'compact' : 'comfortable')}
            >
              {density === 'comfortable' ? 'Modo compacto' : 'Modo amplio'}
            </Button>
            <TableViewOptions table={table} />
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
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={visibleColumns.length} className='h-24 text-center text-muted-foreground'>
                    No encontramos códigos promo con los filtros aplicados.
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
                {selectedCount} de {totalFiltered} códigos seleccionados.
              </span>
            ) : (
              <span>{totalFiltered} códigos filtrados en la tabla.</span>
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
              Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}
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
  table: TableInstance<PromoCodeSummary>
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
  column: Column<PromoCodeSummary, unknown>
  title: string
}

function SortableHeader({
  column,
  title,
}: SortableHeaderProps) {
  return (
    <Button
      variant='ghost'
      size='sm'
      className='-ml-3 h-8 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground'
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
    >
      {title}
      <ArrowUpDown className='ml-2 size-3.5' />
    </Button>
  )
}
