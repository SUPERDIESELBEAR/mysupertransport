import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Truck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import LoadStatusBadge from '@/components/dispatch/LoadStatusBadge';
import { cn } from '@/lib/utils';
import {
  assembleBoard, type BoardDriverInput, type BoardLoadInput, type ChainLoad, type DriverChain,
} from '@/lib/dispatchBoard';
import type { PaperworkDocumentInput, PaperworkExceptionInput } from '@/lib/loadPaperwork';

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
  loads: BoardLoadInput[];
  documentsByLoad: Record<string, PaperworkDocumentInput[]>;
  exceptionsByLoad: Record<string, PaperworkExceptionInput[]>;
}

async function fetchBoard(): Promise<BoardData> {
  const { data: operators, error: opErr } = await supabase
    .from('operators')
    .select(`
      id, user_id, unit_number, is_active, excluded_from_dispatch, excluded_from_dispatch_reason,
      onboarding_status (fully_onboarded, unit_number),
      active_dispatch (dispatch_status)
    `)
    .neq('is_active', false);
  if (opErr) throw opErr;

  const opRows = (operators ?? []) as unknown as Record<string, any>[];
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
        excluded_reason: o.excluded_from_dispatch_reason ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

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
  }

  return { drivers, loads, documentsByLoad, exceptionsByLoad };
}

function formatDeliveryDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago',
  });
}

function lane(load: ChainLoad): string {
  const from = [load.originCity, load.originState].filter(Boolean).join(', ');
  const to = [load.destinationCity, load.destinationState].filter(Boolean).join(', ');
  if (!from && !to) return '—';
  return `${from || '—'} → ${to || '—'}`;
}

function LoadLine({ load, queued, onOpen }: { load: ChainLoad; queued?: boolean; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(load.id)}
      className={cn(
        'w-full text-left flex flex-wrap items-center gap-x-2 gap-y-1 rounded px-1.5 py-1 hover:bg-muted/60 transition-colors',
        queued ? 'text-xs text-muted-foreground' : 'text-sm text-foreground',
      )}
    >
      <span className="font-medium">{load.load_number}</span>
      <LoadStatusBadge status={load.status as never} />
      <span className="truncate">{lane(load)}</span>
      <span className={cn('ml-auto tabular-nums', queued ? '' : 'text-muted-foreground')}>
        {formatDeliveryDate(load.deliveryTime)}
      </span>
    </button>
  );
}

function DriverRow({ row, onOpen }: { row: DriverChain; onOpen: (id: string) => void }) {
  const [current, ...queue] = row.chain;
  return (
    <TableRow className="align-top">
      <TableCell className="py-3">
        <div className="text-sm font-medium text-foreground">{row.driver.name}</div>
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
            <LoadLine load={current} onOpen={onOpen} />
            {queue.length > 0 && (
              <div className="pl-3 border-l border-border space-y-0.5">
                {queue.map(l => <LoadLine key={l.id} load={l} queued onOpen={onOpen} />)}
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

  const anyEmpty = board.rows.some(r => r.state === 'no_chain');
  const noDriverCount = board.faults.noDriver.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground">Dispatch Board</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Every driver, the load they are on, and what is booked behind it.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn('h-4 w-4 mr-2', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {anyEmpty && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Loads are only shown if they exist in SUPERDRIVE. Drivers dispatched in Alvys appear with no load.
        </div>
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
      ) : board.rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-4 py-12 flex flex-col items-center justify-center text-center gap-3">
          <Truck className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No dispatchable drivers.</p>
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
              {board.rows.map(r => <DriverRow key={r.driver.operator_id} row={r} onOpen={openLoad} />)}
            </TableBody>
          </Table>
        </div>
      )}

      {board.offDispatchRows.length > 0 && (
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
                {board.offDispatchRows.map(r => (
                  <DriverRow key={r.driver.operator_id} row={r} onOpen={openLoad} />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
