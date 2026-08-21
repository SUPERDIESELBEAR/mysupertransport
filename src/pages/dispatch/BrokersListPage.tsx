import { useMemo, useState } from 'react';
import { Handshake, Plus, Search } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useViewPreferences } from '@/hooks/useViewPreferences';
import { BROKERS_QUERY_KEY, useBrokers } from '@/hooks/useBrokers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import ColumnVisibilityMenu from '@/components/shared/ColumnVisibilityMenu';
import SortableTableHead from '@/components/shared/SortableTableHead';
import BrokerDialog from '@/components/dispatch/loadForm/BrokerDialog';
import { compareValues, nextSortState } from '@/lib/listSorting';
import { FACTORING_STATUSES, FACTORING_STATUS_LABELS, type Broker } from '@/lib/brokers';
import { normalizeMC } from '@/lib/brokerDuplicates';
import {
  BROKER_COLUMNS, BROKER_COLUMN_TOGGLES, DEFAULT_BROKER_COLUMNS,
} from './brokersColumns';

const VIEW_KEY = 'brokers_list';

export default function BrokersListPage() {
  const qc = useQueryClient();
  const { isManagement } = useAuth();
  const { data: brokers, isLoading, error, refetch } = useBrokers();
  const [search, setSearch] = useState('');
  const [factoringFilter, setFactoringFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('active');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Broker | null>(null);
  const debouncedSearch = useDebouncedValue(search, 200);

  const { visibleColumns, sort, setVisibleColumns, setSort, reset } = useViewPreferences({
    viewKey: VIEW_KEY,
    defaultVisibleColumns: DEFAULT_BROKER_COLUMNS,
  });

  const columns = useMemo(
    () => BROKER_COLUMNS.filter(c => c.locked || visibleColumns.includes(c.key)),
    [visibleColumns],
  );

  const activeColumn = sort ? BROKER_COLUMNS.find(c => c.key === sort.column) ?? null : null;

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const qDigits = normalizeMC(debouncedSearch);
    const rows = (brokers ?? []).filter(b => {
      if (factoringFilter !== 'all' && (b.factoring_status ?? '') !== factoringFilter) return false;
      if (activeFilter === 'active' && !b.is_active) return false;
      if (activeFilter === 'inactive' && b.is_active) return false;
      if (!q) return true;
      if (b.company_name.toLowerCase().includes(q)) return true;
      const mc = normalizeMC(b.mc_number);
      return !!qDigits && !!mc && mc.includes(qDigits);
    });
    if (sort && activeColumn) {
      return rows.slice().sort((a, b) =>
        compareValues(activeColumn.sortValue(a), activeColumn.sortValue(b), sort.direction));
    }
    return rows;
  }, [brokers, debouncedSearch, factoringFilter, activeFilter, sort, activeColumn]);

  const openAdd = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (broker: Broker) => { setEditing(broker); setDialogOpen(true); };
  const invalidate = () => { void qc.invalidateQueries({ queryKey: BROKERS_QUERY_KEY }); };

  const addButton = (
    <Button onClick={openAdd} className="gap-1.5 bg-gold text-surface-dark hover:bg-gold-light">
      <Plus className="h-4 w-4" />
      Add Broker
    </Button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold text-foreground">Brokers</h1>
        {addButton}
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2.5">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search company or MC number…"
            className="pl-9"
          />
        </div>
        <Select value={factoringFilter} onValueChange={setFactoringFilter}>
          <SelectTrigger className="sm:w-48"><SelectValue placeholder="All Factoring" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Factoring Statuses</SelectItem>
            {FACTORING_STATUSES.map(s => (
              <SelectItem key={s} value={s}>{FACTORING_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={activeFilter} onValueChange={setActiveFilter}>
          <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <ColumnVisibilityMenu
          columns={BROKER_COLUMN_TOGGLES}
          visible={visibleColumns}
          onChange={setVisibleColumns}
          onReset={reset}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/8 p-4 text-sm text-destructive flex items-center justify-between gap-3">
          <span>Could not load brokers.</span>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      )}

      {isLoading && !error && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      )}

      {!isLoading && !error && (brokers ?? []).length === 0 && (
        <div className="rounded-lg border border-border bg-card px-6 py-14 text-center">
          <Handshake className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="mt-3 text-sm font-semibold text-foreground">No brokers yet</p>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            Brokers you add here are available on every load, with factoring status and payment terms
            carried forward automatically.
          </p>
          <div className="mt-4 flex justify-center">{addButton}</div>
        </div>
      )}

      {!isLoading && !error && (brokers ?? []).length > 0 && filtered.length === 0 && (
        <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
          <p className="text-sm font-semibold text-foreground">No brokers match the current filters</p>
          <Button
            size="sm" variant="outline" className="mt-4"
            onClick={() => { setSearch(''); setFactoringFilter('all'); setActiveFilter('all'); }}
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
                {filtered.map(b => (
                  <TableRow key={b.id} onClick={() => openEdit(b)} className="cursor-pointer">
                    {columns.map(col => (
                      <TableCell key={col.key} className={col.cellClassName}>{col.render(b)}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="px-4 py-2.5 border-t border-border bg-muted/20 text-xs text-muted-foreground">
              Showing {filtered.length} of {(brokers ?? []).length} broker
              {(brokers ?? []).length !== 1 ? 's' : ''}
            </div>
          </div>

          <div className="md:hidden space-y-2.5">
            {filtered.map(b => (
              <button
                key={b.id}
                onClick={() => openEdit(b)}
                className="w-full text-left rounded-lg border border-border bg-card p-3 active:bg-muted/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm text-foreground truncate">{b.company_name}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0">{b.load_count} loads</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[b.mc_number ? `MC ${b.mc_number}` : 'No MC', [b.city, b.state].filter(Boolean).join(', ')]
                    .filter(Boolean).join(' · ')}
                </p>
              </button>
            ))}
          </div>
        </>
      )}

      <BrokerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        broker={editing}
        loadCount={editing?.load_count ?? 0}
        canDelete={isManagement}
        onSaved={invalidate}
        onCreated={invalidate}
        onDeleted={invalidate}
      />
    </div>
  );
}
