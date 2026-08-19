import { useMemo, useState } from 'react';
import { Building2, Plus, Search } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useViewPreferences } from '@/hooks/useViewPreferences';
import { FACILITIES_QUERY_KEY, useFacilities } from '@/hooks/useFacilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import ColumnVisibilityMenu from '@/components/shared/ColumnVisibilityMenu';
import SortableTableHead from '@/components/shared/SortableTableHead';
import FacilityDialog from '@/components/facilities/FacilityDialog';
import { compareValues, nextSortState } from '@/lib/listSorting';
import { FACILITY_TYPES, FACILITY_TYPE_LABELS, type Facility } from '@/lib/facilities';
import { US_STATES } from '@/lib/usStates';
import {
  DEFAULT_FACILITY_COLUMNS, FACILITY_COLUMNS, FACILITY_COLUMN_TOGGLES,
} from './facilitiesColumns';

const VIEW_KEY = 'facilities_list';

export default function FacilitiesListPage() {
  const qc = useQueryClient();
  const { data: facilities, isLoading, error, refetch } = useFacilities();
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Facility | null>(null);
  const debouncedSearch = useDebouncedValue(search, 200);

  const { visibleColumns, sort, setVisibleColumns, setSort, reset } = useViewPreferences({
    viewKey: VIEW_KEY,
    defaultVisibleColumns: DEFAULT_FACILITY_COLUMNS,
  });

  const columns = useMemo(
    () => FACILITY_COLUMNS.filter(c => c.locked || visibleColumns.includes(c.key)),
    [visibleColumns],
  );

  const activeColumn = sort ? FACILITY_COLUMNS.find(c => c.key === sort.column) ?? null : null;

  const stateOptions = useMemo(() => {
    const used = new Set((facilities ?? []).map(f => f.state).filter(Boolean) as string[]);
    return US_STATES.filter(s => used.has(s.code));
  }, [facilities]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const rows = (facilities ?? []).filter(f => {
      if (stateFilter !== 'all' && f.state !== stateFilter) return false;
      if (typeFilter !== 'all' && f.facility_type !== typeFilter) return false;
      if (!q) return true;
      return [f.facility_name, f.city].filter(Boolean).some(v => (v as string).toLowerCase().includes(q));
    });
    if (sort && activeColumn) {
      return rows.slice().sort((a, b) =>
        compareValues(activeColumn.sortValue(a), activeColumn.sortValue(b), sort.direction));
    }
    return rows;
  }, [facilities, debouncedSearch, stateFilter, typeFilter, sort, activeColumn]);

  const openAdd = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (facility: Facility) => { setEditing(facility); setDialogOpen(true); };

  const addButton = (
    <Button onClick={openAdd} className="gap-1.5 bg-gold text-surface-dark hover:bg-gold-light">
      <Plus className="h-4 w-4" />
      Add Facility
    </Button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold text-foreground">Facilities</h1>
        {addButton}
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2.5">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search facility or city…"
            className="pl-9"
          />
        </div>
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="sm:w-44"><SelectValue placeholder="All States" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            {stateOptions.map(s => (
              <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="sm:w-48"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {FACILITY_TYPES.map(t => (
              <SelectItem key={t} value={t}>{FACILITY_TYPE_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ColumnVisibilityMenu
          columns={FACILITY_COLUMN_TOGGLES}
          visible={visibleColumns}
          onChange={setVisibleColumns}
          onReset={reset}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/8 p-4 text-sm text-destructive flex items-center justify-between gap-3">
          <span>Could not load facilities.</span>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      )}

      {isLoading && !error && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      )}

      {!isLoading && !error && (facilities ?? []).length === 0 && (
        <div className="rounded-lg border border-border bg-card px-6 py-14 text-center">
          <Building2 className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="mt-3 text-sm font-semibold text-foreground">No facilities yet</p>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            Save shippers, receivers, and yards here so stops fill in automatically on new loads.
          </p>
          <div className="mt-4 flex justify-center">{addButton}</div>
        </div>
      )}

      {!isLoading && !error && (facilities ?? []).length > 0 && filtered.length === 0 && (
        <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
          <p className="text-sm font-semibold text-foreground">No facilities match the current filters</p>
          <Button
            size="sm" variant="outline" className="mt-4"
            onClick={() => { setSearch(''); setStateFilter('all'); setTypeFilter('all'); }}
          >
            Clear filters
          </Button>
        </div>
      )}

      {!isLoading && !error && filtered.length > 0 && (
        <>
          <div className="hidden md:block rounded-lg border border-border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  {columns.map(col => (
                    <SortableTableHead
                      key={col.key}
                      columnKey={col.key}
                      label={col.label}
                      align={col.align}
                      sort={sort}
                      onSort={key => setSort(nextSortState(sort, key))}
                    />
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(f => (
                  <TableRow key={f.id} onClick={() => openEdit(f)} className="cursor-pointer">
                    {columns.map(col => (
                      <TableCell key={col.key} className={col.cellClassName}>{col.render(f)}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="px-4 py-2.5 border-t border-border bg-muted/20 text-xs text-muted-foreground">
              Showing {filtered.length} of {(facilities ?? []).length} facilit
              {(facilities ?? []).length !== 1 ? 'ies' : 'y'}
            </div>
          </div>

          <div className="md:hidden space-y-2.5">
            {filtered.map(f => (
              <button
                key={f.id}
                onClick={() => openEdit(f)}
                className="w-full text-left rounded-lg border border-border bg-card p-3 active:bg-muted/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm text-foreground truncate">{f.facility_name}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0">{f.times_used} uses</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[f.city, f.state].filter(Boolean).join(', ') || '—'}
                </p>
              </button>
            ))}
          </div>
        </>
      )}

      <FacilityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        facility={editing}
        allowDeactivate={!!editing}
        onSaved={() => { void qc.invalidateQueries({ queryKey: FACILITIES_QUERY_KEY }); }}
      />
    </div>
  );
}
