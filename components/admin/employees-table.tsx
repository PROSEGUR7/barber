'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  type ColumnDef,
  type Column,
  type CellContext,
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
  IconUsersGroup,
} from '@tabler/icons-react'
import {
  ArrowUpDown,
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
import type { EmployeeSummary } from '@/lib/admin'
import {
  formatCurrency,
  formatJoinedAt,
  formatNumber,
} from '@/lib/formatters'
import { cn } from '@/lib/utils'

const SERVICE_BADGE_LIMIT = 3
const COLUMN_LABELS: Record<string, string> = {
  name: 'Empleado',
  contact: 'Contacto',
  status: 'Estado',
  totalAppointments: 'Citas',
  totalRevenue: 'Ingresos',
  services: 'Servicios',
  actions: 'Acciones',
}

export function AdminEmployeesTable({
  employees,
}: {
  employees: EmployeeSummary[]
}) {
  const { toast } = useToast()
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'totalRevenue', desc: true },
  ])
  const [columnVisibility, setColumnVisibility] =
    useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [density, setDensity] = useState<'comfortable' | 'compact'>(
    'comfortable',
  )

  const handleCopy = useCallback(
    async (value: string | null | undefined, successMessage: string) => {
      if (!value) {
        toast({
          title: 'Sin datos para copiar',
          description: 'No hay información disponible.',
          variant: 'destructive',
        })
        return
      }

      try {
        await navigator.clipboard.writeText(value)
        toast({ title: successMessage, description: value })
      } catch (error) {
        console.error('Error copying to clipboard', error)
        toast({
          title: 'No se pudo copiar',
          description: 'Intenta nuevamente de forma manual.',
          variant: 'destructive',
        })
      }
    },
    [toast],
  )

  const statusOptions = useMemo(() => {
    const map = new Map<string, string>()

    for (const employee of employees) {
      const normalized = normalizeStatus(employee.status)
      map.set(normalized.value, normalized.label)
    }

    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }))
  }, [employees])

  const filteredEmployees = useMemo(() => {
    const search = searchTerm.trim().toLowerCase()

    return employees.filter((employee) => {
      const matchesSearch =
        search.length === 0 ||
        [
          employee.name,
          employee.email,
          employee.phone ?? '',
          employee.services.join(' '),
        ]
          .map((value) => value.toLowerCase())
          .some((value) => value.includes(search))

      if (!matchesSearch) {
        return false
      }

      if (statusFilter === 'all') {
        return true
      }

      if (statusFilter === 'sin-estado') {
        return !employee.status
      }

      return employee.status?.toLowerCase() === statusFilter
    })
  }, [employees, searchTerm, statusFilter])

  const columns = useMemo<ColumnDef<EmployeeSummary, unknown>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }: HeaderContext<EmployeeSummary, unknown>) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Seleccionar todos"
            className="translate-y-0.5"
          />
        ),
        cell: ({ row }: CellContext<EmployeeSummary, unknown>) => (
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
        header: ({ column }: HeaderContext<EmployeeSummary, unknown>) => (
          <SortableHeader column={column} title="Empleado" />
        ),
        cell: ({ row }: CellContext<EmployeeSummary, unknown>) => (
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
        cell: ({ row }) => (
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
        accessorKey: 'status',
        header: ({ column }: HeaderContext<EmployeeSummary, unknown>) => (
          <SortableHeader column={column} title="Estado" />
        ),
        cell: ({ row }: CellContext<EmployeeSummary, unknown>) => (
          <div className="flex flex-col gap-1">
            <Badge
              variant={getStatusVariant(row.original.status)}
              className="capitalize"
            >
              {normalizeStatus(row.original.status).label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Ingreso: {formatJoinedAt(row.original.joinedAt)}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'totalAppointments',
        header: ({ column }: HeaderContext<EmployeeSummary, unknown>) => (
          <SortableHeader column={column} title="Citas" />
        ),
        cell: ({ row }: CellContext<EmployeeSummary, unknown>) => (
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
        accessorKey: 'totalRevenue',
        header: ({ column }: HeaderContext<EmployeeSummary, unknown>) => (
          <SortableHeader column={column} title="Ingresos" align="right" />
        ),
        cell: ({ row }: CellContext<EmployeeSummary, unknown>) => (
          <div className="text-right font-semibold">
            {formatCurrency(row.original.totalRevenue)}
          </div>
        ),
      },
      {
        id: 'services',
        header: () => <span className="text-xs uppercase text-muted-foreground">Servicios</span>,
        cell: ({ row }: CellContext<EmployeeSummary, unknown>) => {
          const services = row.original.services
          const servicesToShow = services.slice(0, SERVICE_BADGE_LIMIT)
          const remaining = services.length - servicesToShow.length

          if (servicesToShow.length === 0) {
            return (
              <span className="text-sm text-muted-foreground">
                Sin servicios
              </span>
            )
          }

          return (
            <div className="flex flex-wrap gap-1">
              {servicesToShow.map((service: string) => (
                <Badge key={service} variant="secondary" className="capitalize">
                  {service}
                </Badge>
              ))}
              {remaining > 0 && (
                <Badge variant="outline">+{remaining}</Badge>
              )}
            </div>
          )
        },
        enableSorting: false,
      },
      {
        id: 'actions',
        header: () => null,
        cell: ({ row }: CellContext<EmployeeSummary, unknown>) => (
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
                onClick={() => handleCopy(row.original.email, 'Correo copiado')}
              >
                Copiar correo
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleCopy(row.original.phone, 'Teléfono copiado')}
              >
                Copiar teléfono
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                Ver perfil (próximamente)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        enableSorting: false,
        enableHiding: false,
        size: 56,
      },
    ],
    [handleCopy],
  )

  const table = useReactTable<EmployeeSummary>({
    data: filteredEmployees,
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
  }, [filteredEmployees])

  const selectedCount = table.getFilteredSelectedRowModel().rows.length
  const totalFiltered = table.getFilteredRowModel().rows.length

  const handleExport = useCallback(() => {
    const rowsToExport = selectedCount
      ? table.getFilteredSelectedRowModel().rows
      : table.getFilteredRowModel().rows

    if (rowsToExport.length === 0) {
      toast({
        title: 'No hay datos para exportar',
        description: 'Selecciona al menos un empleado o ajusta los filtros.',
      })
      return
    }

    const header = ['Nombre', 'Correo', 'Teléfono', 'Estado', 'Servicios']
    const csvRows = rowsToExport.map((row): string => {
      const employee = row.original
      return [
        escapeCsv(employee.name),
        escapeCsv(employee.email),
        escapeCsv(employee.phone ?? ''),
        escapeCsv(normalizeStatus(employee.status).label),
        escapeCsv(employee.services.join(' | ')),
      ].join(',')
    })

    const csvContent = [header.join(','), ...csvRows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute(
      'download',
      `empleados-${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({
      title: 'Exportación completada',
      description: `Descargaste ${rowsToExport.length} empleados.`,
    })
  }, [selectedCount, table, toast])

  const hasActiveFilters =
    searchTerm.trim().length > 0 || statusFilter !== 'all'

  const headerGroups = table.getHeaderGroups()
  const rows = table.getRowModel().rows
  const visibleColumns = table.getAllLeafColumns()

  return (
    <Card className="border-border/60 bg-gradient-to-b from-background/80 via-background to-background/95">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <IconUsersGroup size={20} />
          </div>
          <div>
            <CardTitle className="text-lg font-semibold">
              Empleados registrados
            </CardTitle>
            <CardDescription>
              Visualiza actividad, servicios asignados y rendimiento del equipo.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <DataTableToolbar
          table={table}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          statusOptions={statusOptions}
          hasActiveFilters={hasActiveFilters}
          onResetFilters={() => {
            setSearchTerm('')
            setStatusFilter('all')
          }}
          density={density}
          onDensityChange={setDensity}
          selectedCount={selectedCount}
          onExport={handleExport}
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
                {selectedCount} de {totalFiltered} empleados seleccionados.
              </span>
            ) : (
              <span>{totalFiltered} empleados filtrados en la tabla.</span>
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
  table: TableInstance<EmployeeSummary>
  searchTerm: string
  onSearchChange: (value: string) => void
  statusFilter: string
  onStatusChange: (value: string) => void
  statusOptions: Array<{ value: string; label: string }>
  hasActiveFilters: boolean
  onResetFilters: () => void
  density: 'comfortable' | 'compact'
  onDensityChange: (value: 'comfortable' | 'compact') => void
  selectedCount: number
  onExport: () => void
}

function DataTableToolbar({
  table,
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusChange,
  statusOptions,
  hasActiveFilters,
  onResetFilters,
  density,
  onDensityChange,
  selectedCount,
  onExport,
}: ToolbarProps) {
  const statusLabel =
    statusFilter === 'all'
      ? 'Todos'
      : normalizeStatusLabel(statusOptions, statusFilter)

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar por nombre, correo o servicio"
            className="pl-10"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <IconAdjustmentsHorizontal size={16} />
              {`Estado: ${statusLabel.toLowerCase()}`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Filtrar por estado</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => onStatusChange('all')}
              className={cn(statusFilter === 'all' && 'bg-accent/50')}
            >
              Todos
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {statusOptions.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => onStatusChange(option.value)}
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
        <TableViewOptions table={table} />
        <Button variant="secondary" size="sm" onClick={onExport}>
          <IconDownload size={16} />
          Exportar
        </Button>
      </div>
    </div>
  )
}

function TableViewOptions({
  table,
}: {
  table: TableInstance<EmployeeSummary>
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
  column: Column<EmployeeSummary, unknown>
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
    .slice(0, 2) || 'EM'
}

function normalizeStatus(status: string | null | undefined) {
  if (!status) {
    return { value: 'sin-estado', label: 'Sin estado' }
  }

  const trimmed = status.trim()
  const value = trimmed.toLowerCase()
  const label = trimmed
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())

  return { value, label }
}

function normalizeStatusLabel(
  options: Array<{ value: string; label: string }>,
  value: string,
) {
  const match = options.find((option) => option.value === value)
  return match?.label ?? 'Personalizado'
}

function getStatusVariant(status: string | null | undefined) {
  const normalized = status?.toLowerCase() ?? ''

  if (normalized.includes('suspend') || normalized.includes('bane')) {
    return 'destructive' as const
  }

  if (normalized.includes('inactivo') || normalized.includes('pausa')) {
    return 'outline' as const
  }

  if (normalized.includes('activo')) {
    return 'secondary' as const
  }

  return 'outline' as const
}

function escapeCsv(value: string) {
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
