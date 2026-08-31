import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Truck, HelpCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import LoadStatusBadge from '@/components/dispatch/LoadStatusBadge';
import LoadClaimIndicator from '@/components/dispatch/LoadClaimIndicator';
import ParkedBadge from '@/components/drivers/ParkedBadge';
import DepartingBadge from '@/components/drivers/DepartingBadge';
import TerminationBadge from '@/components/drivers/TerminationBadge';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useViewPreferences } from '@/hooks/useViewPreferences';
import {
  assembleBoard, filterRowsByDispatcher, type BoardDriverInput, type BoardLoadInput,
  type ChainLoad, type DriverChain,
} from '@/lib/dispatchBoard';
import { summarizeActiveClaims, type ActiveClaimSummary } from '@/lib/loadClaims';
import {
  type ClaimLevel,
  type ClaimType,
} from '@/components/dispatch/loadDetail/claimConstants';
import type { PaperworkDocumentInput, PaperworkExceptionInput } from '@/lib/loadPaperwork';
import { CARRIER_TIMEZONE } from '@/lib/carrierTimezone';

interface DispatchBoardPageProps {
  /** Provided by the Management portal so a board row can open its own load-detail view. */
  onSelectLoad?: (loadId: string) => void;
}

/** Same treatment Driver Status uses, so the two pages read as one system. */
const DISPATCH_STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  not_dispatched: { label: 'Not Dispatched', badgeClass: 'status-neutral border' },
  dispatched:     { label: 'Dispatched',     badgeClass: 'status-complete border' },
  home:           { label: 'Home',           badgeClass: 'status-progress border' },
  truck_down:     { label: 'Truck Down',     badgeClass: 'status-action border' },
};

function DispatchStatusBadge({ status }: { status: string | null }) {
  const cfg = DISPATCH_STATUS_CONFIG[status ?? 'not_dispatched'] ?? DISPATCH_STATUS_CONFIG.not_dispatched;
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', cfg.badgeClass)}>
      {cfg.label}
    </span>
  );
}

const getOne = (val: unknown) => (Array.isArray(val) ? val[0] : val) ?? null;

interface BoardData {
  drivers: BoardDriverInput[];
  /** Dispatcher/management users, for the scoping select. Same resolution Driver Status uses. */
  dispatcherNames: Record<string, string>;
  loads: BoardLoadInput[];
  documentsByLoad: Record<string, PaperworkDocumentInput[]>;
  exceptionsByLoad: Record<string, PaperworkExceptionInput[]>;
  /** Active claim summary keyed by load id, if the load has at least one active claim. */
  activeClaimsByLoad: Record<string, ActiveClaimSummary>;
}

async function fetchBoard(): Promise<BoardData> {
  const { data: operators, error: opErr } = await supabase
    .from('operators')
    .select(`
      id, user_id, unit_number, is_active, excluded_from_dispatch, excluded_from_dispatch_reason,
      is_parked, parked_reason, parked_expected_return,
      is_departing, departing_expected_date,
      onboarding_status (fully_onboarded, unit_number),
      active_dispatch (dispatch_status, assigned_dispatcher)
    `)
    .neq('is_active', false);
  if (opErr) throw opErr;

  const opRows = (operators ?? []) as unknown as Record<string, any>[];

  // Lease terminations on file — the write now has a visible consequence on the board.
  // A VOIDED row is not a termination — it never reaches the board.
  const terminationByOperator: Record<string, { effective_date: string | null; reason: string | null }> = {};
  const { data: terminationRows } = await supabase
    .from('lease_terminations')
    .select('operator_id, effective_date, reason, voided_at')
    .is('voided_at', null)
    .order('effective_date', { ascending: false });
  ((terminationRows ?? []) as any[]).forEach(t => {
    if (t.operator_id && !terminationByOperator[t.operator_id]) {
      terminationByOperator[t.operator_id] = { effective_date: t.effective_date ?? null, reason: t.reason ?? null };
    }
  });
  const userIds = opRows.map(o => o.user_id).filter(Boolean);
  const nameByUser: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('user_id, first_name, last_name')
      .in('user_id', userIds);
    if (profErr) throw profErr;
    (profiles ?? []).forEach(p => {
      const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
      if (p.user_id && name) nameByUser[p.user_id] = name;
    });
  }

  const drivers: BoardDriverInput[] = opRows
    .filter(o => getOne(o.onboarding_status)?.fully_onboarded)
    .map(o => {
      const os = getOne(o.onboarding_status) ?? {};
      const d = getOne(o.active_dispatch) ?? {};
      return {
        operator_id: o.id as string,
        name: (o.user_id ? nameByUser[o.user_id] : null) ?? 'Unnamed driver',
        unit_number: os.unit_number ?? o.unit_number ?? null,
        dispatch_status: d.dispatch_status ?? 'not_dispatched',
        dispatchable: o.excluded_from_dispatch !== true && o.is_active !== false,
        assigned_dispatcher: d.assigned_dispatcher ?? null,
        excluded_reason: o.excluded_from_dispatch_reason ?? null,
        is_parked: o.is_parked === true,
        is_departing: o.is_departing === true,
        departing_expected_date: o.departing_expected_date ?? null,
        parked_reason: o.parked_reason ?? null,
        parked_expected_return: o.parked_expected_return ?? null,
        termination: terminationByOperator[o.id as string] ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const dispatcherNames: Record<string, string> = {};
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('user_id, role')
    .in('role', ['dispatcher', 'management', 'owner']);
  const roleUserIds = [...new Set(((roleData ?? []) as any[]).map(r => r.user_id).filter(Boolean))];
  if (roleUserIds.length > 0) {
    const { data: roleProfiles } = await supabase
      .from('profiles')
      .select('user_id, first_name, last_name')
      .in('user_id', roleUserIds);
    (roleProfiles ?? []).forEach((p: any) => {
      dispatcherNames[p.user_id] = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown';
    });
  }

  const { data: loadRows, error: loadErr } = await supabase
    .from('loads')
    .select(
      'id, load_number, status, load_type, operator_id, created_at, ' +
      'load_stops(stop_sequence, stop_type, city, state, appointment_start)',
    );
  if (loadErr) throw loadErr;

  const loads: BoardLoadInput[] = ((loadRows ?? []) as unknown as Record<string, any>[]).map(r => ({
    id: r.id,
    load_number: r.load_number,
    status: r.status,
    load_type: r.load_type ?? null,
    operator_id: r.operator_id ?? null,
    created_at: r.created_at,
    stops: (r.load_stops ?? []) as BoardLoadInput['stops'],
  }));

  const loadIds = loads.map(l => l.id);
  const documentsByLoad: Record<string, PaperworkDocumentInput[]> = {};
  const exceptionsByLoad: Record<string, PaperworkExceptionInput[]> = {};
  const activeClaimsByLoad: Record<string, ActiveClaimSummary> = {};

  if (loadIds.length > 0) {
    const { data: docs, error: docErr } = await supabase
      .from('load_documents')
      .select('load_id, document_type, photo_label')
      .in('load_id', loadIds);
    if (docErr) throw docErr;
    (docs ?? []).forEach((d: any) => {
      (documentsByLoad[d.load_id] ||= []).push({ document_type: d.document_type, photo_label: d.photo_label });
    });

    const { data: excs, error: excErr } = await supabase
      .from('document_exceptions')
      .select('load_id, document_type, status')
      .in('load_id', loadIds);
    if (excErr) throw excErr;
    (excs ?? []).forEach((e: any) => {
      (exceptionsByLoad[e.load_id] ||= []).push({ document_type: e.document_type, status: e.status });
    });

    const { data: claimRows, error: claimErr } = await supabase
      .from('claim_flags')
      .select('load_id, flag_level, claim_type')
      .in('load_id', loadIds)
      .eq('is_active', true);
    if (claimErr) throw claimErr;
    const grouped = new Map<string, { flag_level: ClaimLevel; claim_type: ClaimType }[]>();
    (claimRows ?? []).forEach(c => {
      const list = grouped.get(c.load_id) ?? [];
      list.push({ flag_level: c.flag_level, claim_type: c.claim_type });
      grouped.set(c.load_id, list);
    });
    grouped.forEach((claims, loadId) => {
      const summary = summarizeActiveClaims(claims);
      if (summary) activeClaimsByLoad[loadId] = summary;
    });
  }

  return { drivers, dispatcherNames, loads, documentsByLoad, exceptionsByLoad, activeClaimsByLoad };
}

function formatDeliveryDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: CARRIER_TIMEZONE,
  });
}

function lane(load: ChainLoad): string {
  const from = [load.originCity, load.originState].filter(Boolean).join(', ');
  const to = [load.destinationCity, load.destinationState].filter(Boolean).join(', ');
  if (!from && !to) return '—';
  return `${from || '—'} → ${to || '—'}`;
}

const FALLBACK_SOURCE_NOTE: Record<string, string> = {
  first_stop: 'No delivery appointment — ordered by the first stop appointment',
  created_at: 'No delivery appointment — ordered by load creation date',
};

function DeliveryDate({ load }: { load: ChainLoad }) {
  const note = FALLBACK_SOURCE_NOTE[load.deliveryTimeSource];
  return (
    <span className="inline-flex items-center gap-1">
      {formatDeliveryDate(load.deliveryTime)}
      {note && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="img"
                aria-label={note}
                className="inline-flex text-muted-foreground/70"
              >
                <HelpCircle className="h-3 w-3" />
              </span>
            </TooltipTrigger>
            <TooltipContent>{note}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </span>
  );
}

/** Exported for display tests. Not a route component. */
export function LoadLine({
  load, queued, muted, onOpen, activeClaim,
}: {
  load: ChainLoad;
  queued?: boolean;
  muted?: boolean;
  onOpen: (id: string) => void;
  activeClaim?: ActiveClaimSummary | null;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(load.id)}
      className={cn(
        'w-full text-left flex flex-wrap items-center gap-x-2 gap-y-1 rounded px-1.5 py-1 hover:bg-muted/60 transition-colors',
        queued || muted ? 'text-xs text-muted-foreground' : 'text-sm text-foreground',
        muted && 'opacity-80',
      )}
    >
      <span className="font-medium">{load.load_number}</span>
      <LoadStatusBadge status={load.status as never} />
      {activeClaim && (
        <LoadClaimIndicator
          level={activeClaim.level}
          claimType={activeClaim.claimType}
          title={activeClaim.title}
        />
      )}
      <span className="truncate">{lane(load)}</span>
      <span className={cn('ml-auto tabular-nums', queued || muted ? '' : 'text-muted-foreground')}>
        <DeliveryDate load={load} />
      </span>
    </button>
  );
}

/** Exported for display tests. Not a route component. */
export function DriverRow({
  row, onOpen, activeClaimsByLoad,
}: {
  row: DriverChain;
  onOpen: (id: string) => void;
  activeClaimsByLoad: Record<string, ActiveClaimSummary>;
}) {
  return (
    <TableRow className="align-top">
      <TableCell className="py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">{row.driver.name}</span>
          <ParkedBadge operator={row.driver} />
          <DepartingBadge operator={row.driver} />
          <TerminationBadge termination={row.driver.termination} />
        </div>
        <div className="text-xs text-muted-foreground">
          {row.driver.unit_number ? `Unit ${row.driver.unit_number}` : '—'}
        </div>
        {row.driver.dispatchable ? null : (
          <div className="text-xs text-muted-foreground mt-1">
            {row.driver.excluded_reason || 'No reason recorded'}
          </div>
        )}
      </TableCell>
      <TableCell className="py-3">
        <DispatchStatusBadge status={row.dispatch_status} />
      </TableCell>
      <TableCell className="py-3">
        {row.state === 'no_chain' ? (
          <span className="text-sm text-muted-foreground">No load recorded in SUPERDRIVE</span>
        ) : (
          <div className="space-y-1">
            {row.current ? (
              <LoadLine load={row.current} onOpen={onOpen} activeClaim={activeClaimsByLoad[row.current.id]} />
            ) : (
              <span className="text-sm text-muted-foreground">No load recorded in SUPERDRIVE</span>
            )}
            {row.queued.length > 0 && (
              <div className="pl-3 border-l border-border space-y-0.5">
                {row.queued.map(l => (
                  <LoadLine key={l.id} load={l} queued onOpen={onOpen} activeClaim={activeClaimsByLoad[l.id]} />
                ))}
              </div>
            )}
            {row.paperworkTail.length > 0 && (
              <div className="pt-1.5 mt-1 border-t border-dashed border-border space-y-0.5">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                  Awaiting paperwork
                </div>
                {row.paperworkTail.map(l => (
                  <LoadLine key={l.id} load={l} muted onOpen={onOpen} activeClaim={activeClaimsByLoad[l.id]} />
                ))}
              </div>
            )}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

export default function DispatchBoardPage({ onSelectLoad }: DispatchBoardPageProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { filters, setFilters } = useViewPreferences({
    viewKey: 'dispatch_board',
    defaultVisibleColumns: [],
    // Everyone starts on the whole fleet. Two of six dispatchers are managers
    // with one or two drivers, and nothing in the data identifies them.
    defaultFilters: { dispatcher: 'all' },
  });
  const dispatcherFilter = (filters?.dispatcher as string) ?? 'all';
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['dispatch-board'],
    queryFn: fetchBoard,
  });

  const board = useMemo(
    () => assembleBoard({
      drivers: data?.drivers ?? [],
      loads: data?.loads ?? [],
      documentsByLoad: data?.documentsByLoad ?? {},
      exceptionsByLoad: data?.exceptionsByLoad ?? {},
    }),
    [data],
  );

  const openLoad = (id: string) => {
    if (onSelectLoad) onSelectLoad(id);
    else navigate(`/dispatch/loads/${id}`);
  };

  const dispatcherNames = data?.dispatcherNames ?? {};
  const visibleRows = useMemo(
    () => filterRowsByDispatcher(board.rows, dispatcherFilter, user?.id),
    [board.rows, dispatcherFilter, user?.id],
  );
  const visibleOffDispatchRows = useMemo(
    () => filterRowsByDispatcher(board.offDispatchRows, dispatcherFilter, user?.id),
    [board.offDispatchRows, dispatcherFilter, user?.id],
  );

  const anyEmpty = board.rows.some(r => r.state === 'no_chain');
  // Fleet-wide by design: an orientation signal about cutover, not a work list.
  const withLoads = board.rows.filter(r => r.state === 'driving' || r.state === 'paperwork_only').length;
  const noDriverCount = board.faults.noDriver.length;
  const filterActive = dispatcherFilter !== 'all';
  const filterName = dispatcherFilter === 'me'
    ? (user?.id ? dispatcherNames[user.id] ?? 'me' : 'me')
    : dispatcherNames[dispatcherFilter] ?? 'this dispatcher';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground">Dispatch Board</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Every driver, the load they are on, and what is booked behind it.
          </p>
        </div>
        <div className="flex items-center gap-2">
        <Select
          value={dispatcherFilter}
          onValueChange={v => setFilters({ ...(filters ?? {}), dispatcher: v })}
        >
          <SelectTrigger className="h-8 text-xs w-full sm:w-44 shrink-0">
            <SelectValue placeholder="Filter by dispatcher" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="me">Assigned to me</SelectItem>
            <SelectItem value="all">All drivers</SelectItem>
            {Object.entries(dispatcherNames).map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn('h-4 w-4 mr-2', isFetching && 'animate-spin')} />
          Refresh
        </Button>
        </div>
      </div>

      {anyEmpty && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Loads are only shown if they exist in SUPERDRIVE. Drivers dispatched in Alvys appear with no load.
        </div>
      )}

      {filterActive && (
        <p className="text-xs font-medium text-foreground">
          Showing {visibleRows.length} of {board.rows.length} drivers — assigned to {filterName}.
        </p>
      )}

      {board.rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {withLoads} of {board.rows.length} drivers on the board have loads in SUPERDRIVE.
        </p>
      )}

      {noDriverCount > 0 && (
        <button
          type="button"
          onClick={() => navigate('/dispatch/loads')}
          className="block text-xs text-info underline underline-offset-2"
        >
          {noDriverCount} load{noDriverCount === 1 ? ' has' : 's have'} a status past Available but no driver assigned.
        </button>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-4 py-12 flex flex-col items-center justify-center text-center gap-3">
          <Truck className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {filterActive ? 'No drivers match this dispatcher filter.' : 'No dispatchable drivers.'}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[220px]">Driver</TableHead>
                <TableHead className="w-[140px]">Driver Status</TableHead>
                <TableHead>Loads (delivery order)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map(r => (
                <DriverRow
                  key={r.driver.operator_id}
                  row={r}
                  onOpen={openLoad}
                  activeClaimsByLoad={data?.activeClaimsByLoad ?? {}}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {visibleOffDispatchRows.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Not on dispatch — holds an assigned load</h2>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[220px]">Driver</TableHead>
                  <TableHead className="w-[140px]">Driver Status</TableHead>
                  <TableHead>Loads (delivery order)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleOffDispatchRows.map(r => (
                  <DriverRow
                    key={r.driver.operator_id}
                    row={r}
                    onOpen={openLoad}
                    activeClaimsByLoad={data?.activeClaimsByLoad ?? {}}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
