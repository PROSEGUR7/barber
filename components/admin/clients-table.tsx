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
  IconMail,
  IconPhone,
  IconUsers,
} from '@tabler/icons-react'
import {
  ArrowUpDown,
  CalendarClock,
  MoreHorizontal,
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
import type { ClientSummary } from '@/lib/admin'
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
} from '@/lib/formatters'
import { cn } from '@/lib/utils'

const COLUMN_LABELS: Record<string, string> = {
  name: 'Cliente',
  contact: 'Contacto',
  type: 'Tipo',
  totalAppointments: 'Citas',
  lastAppointmentAt: 'Última cita',
  totalSpent: 'Total invertido',
  actions: 'Acciones',
}

export function AdminClientsTable({
  clients,
}: {
  clients: ClientSummary[]
}) {
  const { toast } = useToast()
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'totalSpent', desc: true },
  ])
  const [columnVisibility, setColumnVisibility] =
    useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [density, setDensity] = useState<'comfortable' | 'compact'>(
    'comfortable',
  )

  const handleUnavailableAction = useCallback(
    (action: string, clientName: string) => {
      toast({
        title: `${action} aún no disponible`,
        description: `Pronto podrás gestionar esta acción para ${clientName}.`,
      })
    },
    [toast],
  )

  const typeOptions = useMemo(() => {
    const map = new Map<string, string>()

    for (const client of clients) {
      const normalized = normalizeClientType(client.type)
      map.set(normalized.value, normalized.label)
    }

    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }))
  }, [clients])

  const filteredClients = useMemo(() => {
    const search = searchTerm.trim().toLowerCase()

    return clients.filter((client) => {
      const matchesSearch =
        search.length === 0 ||
        [client.name, client.email, client.phone ?? '']
          .map((value) => value.toLowerCase())
          .some((value) => value.includes(search))

      if (!matchesSearch) {
        return false
      }

      if (typeFilter === 'all') {
        return true
      }

      if (typeFilter === 'sin-clasificar') {
        return !client.type
      }

      return client.type?.toLowerCase() === typeFilter
    })
  }, [clients, searchTerm, typeFilter])

  const columns = useMemo<ColumnDef<ClientSummary, unknown>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Seleccionar todos"
            className="translate-y-0.5"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label={`Seleccionar ${row.original.name}`}
            className="translate-y-0.5"
          />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 48,
      },
      {
        accessorKey: 'name',
        header: ({ column }: HeaderContext<ClientSummary, unknown>) => (
          <SortableHeader column={column} title="Cliente" />
        ),
        cell: ({ row }: CellContext<ClientSummary, unknown>) => (
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg border border-border/60 bg-background/70 text-sm font-semibold uppercase">
              {getInitials(row.original.name)}
            </div>
            <div className="flex flex-col">
              <span className="font-medium leading-tight">
                {row.original.name}
              </span>
              <span className="text-xs text-muted-foreground">
                ID usuario: {row.original.userId}
              </span>
            </div>
          </div>
        ),
      },
      {
        id: 'contact',
        header: () => <span className="text-xs uppercase text-muted-foreground">Contacto</span>,
        cell: ({ row }: CellContext<ClientSummary, unknown>) => (
          <div className="flex flex-col gap-1 text-sm">
            <span className="flex items-center gap-2">
              <IconMail size={16} className="text-muted-foreground" />
              {row.original.email}
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <IconPhone size={16} className="text-muted-foreground" />
              {row.original.phone ?? 'Sin teléfono'}
            </span>
          </div>
        ),
        enableSorting: false,
      },
      {
        id: 'type',
        header: () => <span className="text-xs uppercase text-muted-foreground">Tipo</span>,
        cell: ({ row }: CellContext<ClientSummary, unknown>) => (
          <div className="flex flex-col gap-1">
            <Badge
              variant={getClientTypeVariant(row.original.type)}
              className="capitalize"
            >
              {normalizeClientType(row.original.type).label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Registrado: {formatDate(row.original.registeredAt)}
            </span>
          </div>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'totalAppointments',
        header: ({ column }: HeaderContext<ClientSummary, unknown>) => (
          <SortableHeader column={column} title="Citas" />
        ),
        cell: ({ row }: CellContext<ClientSummary, unknown>) => (
          <div className="flex flex-col text-sm">
            <span className="font-semibold">
              {formatNumber(row.original.totalAppointments)}
            </span>
            <span className="text-xs text-muted-foreground">
              Próximas: {formatNumber(row.original.upcomingAppointments)}
            </span>
            <span className="text-xs text-muted-foreground">
              Completadas: {formatNumber(row.original.completedAppointments)}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'lastAppointmentAt',
        header: ({ column }: HeaderContext<ClientSummary, unknown>) => (
          <SortableHeader column={column} title="Última cita" />
        ),
        cell: ({ row }: CellContext<ClientSummary, unknown>) => (
          <div className="flex flex-col text-sm">
            <span>{formatDateTime(row.original.lastAppointmentAt)}</span>
            <span className="text-xs text-muted-foreground">
              Última completada: {formatDateTime(row.original.lastCompletedAppointmentAt)}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'totalSpent',
        header: ({ column }: HeaderContext<ClientSummary, unknown>) => (
          <SortableHeader column={column} title="Total invertido" align="right" />
        ),
        cell: ({ row }: CellContext<ClientSummary, unknown>) => (
          <div className="text-right font-semibold">
            {formatCurrency(row.original.totalSpent)}
          </div>
        ),
      },
      {
        id: 'actions',
        header: () => null,
        cell: ({ row }: CellContext<ClientSummary, unknown>) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="hover:bg-accent/60"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Acciones rápidas</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() =>
                  handleUnavailableAction('Ver perfil', row.original.name)
                }
              >
                Ver perfil
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  handleUnavailableAction('Editar cliente', row.original.name)
                }
              >
                Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() =>
                  handleUnavailableAction('Eliminar cliente', row.original.name)
                }
              >
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        enableSorting: false,
        enableHiding: false,
        size: 56,
      },
    ],
    [handleUnavailableAction],
  )

  const table = useReactTable<ClientSummary>({
    data: filteredClients,
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
  }, [filteredClients])

  const selectedCount = table.getFilteredSelectedRowModel().rows.length
  const totalFiltered = table.getFilteredRowModel().rows.length

  const handleExport = useCallback(() => {
    const rowsToExport = selectedCount
      ? table.getFilteredSelectedRowModel().rows
      : table.getFilteredRowModel().rows

    if (rowsToExport.length === 0) {
      toast({
        title: 'No hay datos para exportar',
        description: 'Selecciona al menos un cliente o ajusta los filtros.',
      })
      return
    }

    const header = [
      'Nombre',
      'Correo',
      'Teléfono',
      'Tipo',
      'Citas totales',
      'Total invertido',
    ]
    const csvRows = rowsToExport.map((row): string => {
      const client = row.original
      return [
        escapeCsv(client.name),
        escapeCsv(client.email),
        escapeCsv(client.phone ?? ''),
        escapeCsv(normalizeClientType(client.type).label),
        escapeCsv(String(client.totalAppointments)),
        escapeCsv(formatCurrency(client.totalSpent)),
      ].join(',')
    })

    const csvContent = [header.join(','), ...csvRows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute(
      'download',
      `clientes-${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({
      title: 'Exportación completada',
      description: `Descargaste ${rowsToExport.length} clientes.`,
    })
  }, [selectedCount, table, toast])

  const hasActiveFilters =
    searchTerm.trim().length > 0 || typeFilter !== 'all'

  const headerGroups = table.getHeaderGroups()
  const rows = table.getRowModel().rows
  const visibleColumns = table.getAllLeafColumns()

  const typeLabel =
    typeFilter === 'all' ? 'Todos' : normalizeClientTypeLabel(typeOptions, typeFilter)

  return (
    <Card className="border-border/60 bg-gradient-to-b from-background/80 via-background to-background/95">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <IconUsers size={20} />
          </div>
          <div>
            <CardTitle className="text-lg font-semibold">
              Clientes registrados
            </CardTitle>
            <CardDescription>
              Consulta historial, tipo de cliente y actividad de reservas.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ClientsToolbar
          table={table}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
          typeOptions={typeOptions}
          hasActiveFilters={hasActiveFilters}
          onResetFilters={() => {
            setSearchTerm('')
            setTypeFilter('all')
          }}
          density={density}
          onDensityChange={setDensity}
          selectedCount={selectedCount}
          onExport={handleExport}
          typeLabel={typeLabel}
        />
        <div className="overflow-x-auto rounded-xl border border-border/60 bg-background/60 shadow-sm">
          <Table className={cn('min-w-[960px]', density === 'compact' ? 'text-sm' : 'text-base')}>
            <TableHeader className="bg-muted/40">
              {headerGroups.map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="align-middle">
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
                      density === 'compact' ? 'h-12' : 'h-[76px]',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="align-middle">
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
                  <TableCell colSpan={visibleColumns.length} className="h-24 text-center text-muted-foreground">
                    No encontramos coincidencias con los filtros aplicados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div>
            {selectedCount > 0 ? (
              <span>
                {selectedCount} de {totalFiltered} clientes seleccionados.
              </span>
            ) : (
              <span>{totalFiltered} clientes filtrados en la tabla.</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Anterior
            </Button>
            <span className="text-xs text-muted-foreground">
              Página {table.getState().pagination.pageIndex + 1} de{' '}
              {table.getPageCount()}
            </span>
            <Button
              variant="ghost"
              size="sm"
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

type ToolbarProps = {
  table: TableInstance<ClientSummary>
  searchTerm: string
  onSearchChange: (value: string) => void
  typeFilter: string
  onTypeChange: (value: string) => void
  typeOptions: Array<{ value: string; label: string }>
  hasActiveFilters: boolean
  onResetFilters: () => void
  density: 'comfortable' | 'compact'
  onDensityChange: (value: 'comfortable' | 'compact') => void
  selectedCount: number
  onExport: () => void
  typeLabel: string
}

function ClientsToolbar({
  table,
  searchTerm,
  onSearchChange,
  typeFilter,
  onTypeChange,
  typeOptions,
  hasActiveFilters,
  onResetFilters,
  density,
  onDensityChange,
  selectedCount,
  onExport,
  typeLabel,
}: ToolbarProps) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar por nombre, correo o teléfono"
            className="pl-10"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <IconAdjustmentsHorizontal size={16} />
              {`Tipo: ${typeLabel.toLowerCase()}`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Filtrar por tipo</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => onTypeChange('all')}
              className={cn(typeFilter === 'all' && 'bg-accent/50')}
            >
              Todos
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {typeOptions.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => onTypeChange(option.value)}
                className={cn(typeFilter === option.value && 'bg-accent/50')}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={onResetFilters}>
            Limpiar filtros
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {selectedCount > 0 && (
          <Badge variant="secondary" className="hidden md:inline-flex">
            {selectedCount} seleccionados
          </Badge>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onDensityChange(
              density === 'comfortable' ? 'compact' : 'comfortable',
            )
          }
        >
          {density === 'comfortable' ? 'Modo compacto' : 'Modo amplio'}
        </Button>
        <ClientsViewOptions table={table} />
        <Button variant="secondary" size="sm" onClick={onExport}>
          <IconDownload size={16} />
          Exportar
        </Button>
      </div>
    </div>
  )
}

function ClientsViewOptions({
  table,
}: {
  table: TableInstance<ClientSummary>
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          Columnas
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
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
                className="capitalize"
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
  column: Column<ClientSummary, unknown>
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
      variant="ghost"
      size="sm"
      className={cn(
        '-ml-3 h-8 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
        align === 'right' && 'ml-auto flex-row-reverse',
      )}
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
    >
      {title}
      <ArrowUpDown className="ml-2 size-3.5" />
    </Button>
  )
}

function getInitials(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2) || 'CL'
}

function normalizeClientType(type: string | null | undefined) {
  if (!type) {
    return { value: 'sin-clasificar', label: 'Sin clasificar' }
  }

  const trimmed = type.trim()
  const value = trimmed.toLowerCase()
  const label = trimmed
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())

  return { value, label }
}

function normalizeClientTypeLabel(
  options: Array<{ value: string; label: string }>,
  value: string,
) {
  const match = options.find((option) => option.value === value)
  return match?.label ?? 'Personalizado'
}

function getClientTypeVariant(type: string | null | undefined) {
  const normalized = type?.toLowerCase() ?? ''

  if (normalized.includes('vip')) {
    return 'secondary' as const
  }

  if (normalized.includes('frecuente')) {
    return 'default' as const
  }

  if (normalized.includes('nuevo')) {
    return 'outline' as const
  }

  return 'outline' as const
}

function escapeCsv(value: string) {
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
