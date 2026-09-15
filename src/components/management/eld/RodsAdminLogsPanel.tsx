import PageHeading from '@/components/shared/PageHeading';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import DriverCombobox from '@/components/shared/DriverCombobox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { FileText, Loader2, MessageSquareWarning, Printer, RefreshCw } from 'lucide-react';
import RoadsideDayRender from '@/components/eld/RoadsideDayRender';
import type { RodsDay, RodsEvent } from '@/lib/eld/rodsTypes';
import { fetchProfileNames, formatProfileName } from '@/lib/profileNames';
import { fetchOperatorUnits, resolveOperatorUnit } from '@/lib/fuel/operatorUnit';
import { isoToNaive } from '@/lib/carrierTimezone';
import { orderVersionsByDate } from '../../../../supabase/functions/_shared/eld/amendmentChain';
import {
  CORRECTION_STATUS_LABEL, fetchCorrectionRequests, raiseCorrectionRequest,
  type CorrectionRequest,
} from '@/lib/eld/correctionRequests';

interface OperatorRow {
  id: string;
  user_id: string | null;
  unit_number: string | null;
  driver_name: string;
  is_active: boolean;
}

/** Today's date in the carrier's operating timezone, not the browser's. */
function carrierToday(): string {
  return isoToNaive(new Date().toISOString()).slice(0, 10);
}

function carrierDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return isoToNaive(d.toISOString()).slice(0, 10);
}

const RANGE_PRESETS: Array<{ label: string; days: number | null }> = [
  { label: 'Last 8 days', days: 8 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 6 months', days: 183 },
  { label: 'All', days: null },
];

interface FleetItem {
  operatorId: string;
  logDate: string;
  kind: 'uncertified' | 'open_request';
}

/**
 * Management's read-only view of a driver's records of duty status.
 *
 * Management has SELECT on rods_days and rods_events and nothing else — the
 * only write this screen makes is raising a correction request, which lands in
 * its own table. The day itself is drawn with RoadsideDayRender, the same
 * component the roadside packet and the PDF use, so what the office reads is
 * what an officer would read.
 */
export default function RodsAdminLogsPanel({
  operatorId: initialOperatorId,
  logDate: initialLogDate,
}: { operatorId?: string | null; logDate?: string | null }) {
  const [operators, setOperators] = useState<OperatorRow[]>([]);
  const [operatorId, setOperatorId] = useState<string>(initialOperatorId ?? '');
  const [days, setDays] = useState<RodsDay[]>([]);
  const [requests, setRequests] = useState<CorrectionRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** A date with correction requests but no log record on file. */
  const [selectedOrphanDate, setSelectedOrphanDate] = useState<string | null>(null);
  const [events, setEvents] = useState<RodsEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(() => carrierDaysAgo(30));
  const [to, setTo] = useState(() => carrierToday());
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [issue, setIssue] = useState('');
  const [busy, setBusy] = useState(false);
  const [fleet, setFleet] = useState<FleetItem[]>([]);

  useEffect(() => {
    void (async () => {
      // `operators` has no name column and no FK into `profiles`, so the name
      // is a second read keyed on user_id. See src/lib/profileNames.ts.
      //
      // DELIBERATELY UNFILTERED. A record of duty status is a federal record
      // kept for six months whether or not the driver still leases here — the
      // list used to be `is_active = true`, which made every former driver's
      // logs unreachable from this screen. The picker's own "show inactive"
      // toggle keeps them out of the way without hiding them.
      const { data } = await supabase
        .from('operators')
        .select('id, user_id, unit_number, is_active');
      const rows = (data ?? []) as Array<{
        id: string; user_id: string | null; unit_number: string | null; is_active: boolean | null;
      }>;
      // The unit is RESOLVED, not read. `operators.unit_number` is null for
      // every active driver today; the number lives on the onboarding record,
      // so the picker's unit search would match nothing without the shared
      // resolver. Same rule as the fuel screens.
      const [names, units] = await Promise.all([
        fetchProfileNames(rows.map((r) => r.user_id)),
        fetchOperatorUnits(rows.map((r) => r.id)),
      ]);
      setOperators(
        rows
          .map((r) => ({
            ...r,
            is_active: r.is_active !== false,
            unit_number: resolveOperatorUnit(units.get(r.id) ?? null),
            driver_name: formatProfileName(names.get(r.user_id ?? '')),
          }))
          .sort((a, b) =>
            Number(b.is_active) - Number(a.is_active)
            || a.driver_name.localeCompare(b.driver_name)),
      );
    })();
  }, []);

  const operatorName = useCallback(
    (id: string) => operators.find((o) => o.id === id)?.driver_name || 'Driver',
    [operators],
  );

  /**
   * Fleet-level attention list, so the office does not have to pick a driver to
   * find out whether anything needs looking at. Read-only, same tables.
   */
  const loadFleet = useCallback(async () => {
    const since = carrierDaysAgo(8);
    const [{ data: draftDays }, { data: openReqs }] = await Promise.all([
      supabase
        .from('rods_days')
        .select('operator_id, log_date, status')
        .neq('status', 'superseded')
        .neq('status', 'certified')
        .gte('log_date', since)
        .lte('log_date', carrierToday()),
      supabase
        .from('rods_correction_requests')
        .select('operator_id, log_date, status')
        .eq('status', 'open'),
    ]);
    const items: FleetItem[] = [
      ...((draftDays ?? []) as Array<{ operator_id: string; log_date: string }>).map((d) => ({
        operatorId: d.operator_id, logDate: d.log_date, kind: 'uncertified' as const,
      })),
      ...((openReqs ?? []) as Array<{ operator_id: string; log_date: string }>).map((r) => ({
        operatorId: r.operator_id, logDate: r.log_date, kind: 'open_request' as const,
      })),
    ];
    setFleet(items.sort((a, b) => b.logDate.localeCompare(a.logDate)));
  }, []);

  useEffect(() => { void loadFleet(); }, [loadFleet]);

  const load = useCallback(async () => {
    if (!operatorId) { setDays([]); setRequests([]); return; }
    setLoading(true);
    const [{ data: dayRows }, reqs] = await Promise.all([
      supabase
        .from('rods_days')
        .select('*')
        .eq('operator_id', operatorId)
        .gte('log_date', from)
        .lte('log_date', to)
        .order('log_date', { ascending: false }),
      fetchCorrectionRequests(operatorId),
    ]);
    setDays((dayRows ?? []) as unknown as RodsDay[]);
    setRequests(reqs);
    setLoading(false);
  }, [operatorId, from, to]);

  useEffect(() => { void load(); }, [load]);

  // Deep link: open the named date once its days have loaded.
  useEffect(() => {
    if (!initialLogDate || selectedId) return;
    const match = days.find((d) => d.log_date === initialLogDate && d.status !== 'superseded');
    if (match) setSelectedId(match.id);
  }, [initialLogDate, days, selectedId]);

  useEffect(() => {
    if (!selectedId) { setEvents([]); return; }
    void (async () => {
      const { data } = await supabase
        .from('rods_events')
        .select('*')
        .eq('rods_day_id', selectedId)
        .order('start_minute');
      setEvents((data ?? []) as unknown as RodsEvent[]);
    })();
  }, [selectedId]);

  const operator = operators.find((o) => o.id === operatorId) ?? null;
  const driverName = operator?.driver_name || 'Driver';
  const selected = days.find((d) => d.id === selectedId) ?? null;

  function applyPreset(days: number | null) {
    // A day left open from the previous range must not stay on screen — it
    // would read as though it belonged to the range now shown.
    setSelectedId(null);
    setSelectedOrphanDate(null);
    setTo(carrierToday());
    setFrom(days === null ? '2020-01-01' : carrierDaysAgo(days));
  }

  function openFleetItem(item: FleetItem) {
    setSelectedId(null);
    setSelectedOrphanDate(null);
    setOperatorId(item.operatorId);
    // Widen the range far enough that the named date is certain to be in it.
    if (item.logDate < from) setFrom(item.logDate);
    if (item.logDate > to) setTo(item.logDate);
  }

  /**
   * Current version first, every earlier version beneath it in supersession
   * order. This used to be a one-level reverse map of `supersedes_day_id`,
   * which on original <- A1 <- A2 attributed the original to A2 and dropped
   * A1 entirely — staff read an incomplete chain of a federal record. It reads
   * the shared `orderVersionsByDate` now, the same helper the retention export
   * and the demo purge use, so what the office sees and what an auditor is
   * handed cannot diverge.
   *
   * Dates that carry correction requests but NO log record are listed too. They
   * used to be invisible here — the list was keyed on days — so an open request
   * against a day the driver never filed could never be seen by the office.
   */
  const grouped = useMemo(() => {
    let byDate: Array<{ log_date: string; versions: RodsDay[] }>;
    try {
      byDate = orderVersionsByDate(days);
    } catch {
      // A cycle is a data fault, not a reason to show a blank list.
      byDate = [...new Set(days.map((d) => d.log_date))].sort().map((log_date) => ({
        log_date,
        versions: days.filter((d) => d.log_date === log_date),
      }));
    }
    const withDays = byDate
      .map(({ log_date, versions }) => ({
        log_date,
        // Newest version last out of the chain walk; that is the current one.
        day: versions[versions.length - 1] ?? null,
        // Original first, so the list reads the way the record was amended.
        priorVersions: versions.slice(0, -1),
        openRequest: requests.find((r) => r.log_date === log_date && r.status === 'open') ?? null,
        requestCount: requests.filter((r) => r.log_date === log_date).length,
      }))
      .filter((g) => Boolean(g.day));

    const datesWithDays = new Set(withDays.map((g) => g.log_date));
    const orphanDates = [...new Set(requests.map((r) => r.log_date))]
      .filter((d) => !datesWithDays.has(d))
      .map((log_date) => ({
        log_date,
        day: null as RodsDay | null,
        priorVersions: [] as RodsDay[],
        openRequest: requests.find((r) => r.log_date === log_date && r.status === 'open') ?? null,
        requestCount: requests.filter((r) => r.log_date === log_date).length,
      }));

    return [...withDays, ...orphanDates]
      .sort((a, b) => b.log_date.localeCompare(a.log_date));
  }, [days, requests]);

  const activeDate = selected?.log_date ?? selectedOrphanDate;
  const dayRequests = activeDate
    ? requests.filter((r) => r.log_date === activeDate)
    : [];
  const currentForDate = selected
    ? days.find((d) => d.log_date === selected.log_date && d.status === 'certified') ?? null
    : null;

  async function raise() {
    if (!selected || !issue.trim()) return;
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) { setBusy(false); toast.error('Your session expired. Sign in again.'); return; }
    const { data: profile } = await supabase
      .from('profiles').select('first_name, last_name').eq('user_id', uid).maybeSingle();
    const result = await raiseCorrectionRequest({
      rodsDayId: selected.id,
      operatorId: selected.operator_id,
      logDate: selected.log_date,
      issue,
      requestedBy: uid,
      requestedByName: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || null,
    });
    setBusy(false);
    if (!result.ok) { toast.error(result.message ?? 'Could not raise the request.'); return; }
    toast.success('Correction request sent to the driver.');
    setRaiseOpen(false);
    setIssue('');
    await load();
    await loadFleet();
  }

  return (
    <div className="space-y-4">
      {/*
        Print the log the office is reading, using the same render an officer is
        handed. Everything else on the page is hidden for the print only.
      */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #rods-print-area, #rods-print-area * { visibility: visible !important; }
          #rods-print-area { position: absolute; inset: 0 auto auto 0; width: 100%; }
          .rods-no-print { display: none !important; }
        }
      `}</style>

      <PageHeading
        title="Paper Logs (RODS)"
        description="Read a driver's records of duty status and raise a correction request."
        icon={<FileText className="h-6 w-6 text-gold shrink-0" />}
      />

      <Card className="rods-no-print">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Needs attention</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {fleet.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No uncertified days in the last 8 days and no open correction requests.
            </p>
          )}
          {fleet.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {fleet.map((item) => (
                <button
                  key={`${item.kind}-${item.operatorId}-${item.logDate}`}
                  type="button"
                  onClick={() => openFleetItem(item)}
                  className="rounded-full border border-border px-3 py-1 text-xs transition hover:bg-muted/50"
                >
                  <span className="font-semibold text-foreground">{operatorName(item.operatorId)}</span>
                  <span className="text-muted-foreground">
                    {' · '}{item.logDate}{' · '}
                    {item.kind === 'uncertified' ? 'not certified' : 'correction open'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rods-no-print">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Driver logs (read-only)
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => { void load(); void loadFleet(); }} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {/*
              Full roster, so the shared searchable picker. Deliberately
              UNFILTERED — paper logs are a compliance record and must be
              readable for any driver who ever recorded duty status.
            */}
            <DriverCombobox
              operators={operators.map((o) => ({
                userId: o.id,
                name: o.driver_name || 'Driver',
                unitNumber: o.unit_number,
                isActive: o.is_active,
              }))}
              value={operatorId}
              onChange={(v) => { setOperatorId(v); setSelectedId(null); setSelectedOrphanDate(null); }}
              placeholder="Choose a driver"
              triggerClassName="w-full"
            />
            <Input
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setSelectedId(null); setSelectedOrphanDate(null); }}
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setSelectedId(null); setSelectedOrphanDate(null); }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {RANGE_PRESETS.map((p) => (
              <Button key={p.label} type="button" variant="outline" size="sm" onClick={() => applyPreset(p.days)}>
                {p.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="rods-no-print lg:max-h-[70dvh] lg:overflow-y-auto">
          <CardContent className="space-y-2 p-3">
            {!operatorId && <p className="p-3 text-sm text-muted-foreground">Choose a driver to read their logs.</p>}
            {operatorId && !loading && grouped.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">No logs on file for this range.</p>
            )}
            {grouped.map(({ log_date, day, priorVersions, openRequest, requestCount }) => (
              <div key={day?.id ?? `orphan-${log_date}`} className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    if (day) { setSelectedId(day.id); setSelectedOrphanDate(null); }
                    else { setSelectedId(null); setSelectedOrphanDate(log_date); }
                  }}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    (day ? selectedId === day.id : selectedOrphanDate === log_date)
                      ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{log_date}</span>
                    <Badge
                      variant={day?.status === 'certified' ? 'default' : 'outline'}
                      className="shrink-0 whitespace-nowrap"
                    >
                      {day ? day.status : 'no log on file'}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {day
                      ? (day.certified_at
                        ? `Certified ${new Date(day.certified_at).toLocaleString('en-US', { timeZone: 'America/Chicago' })}`
                        : 'Not certified')
                      : `${requestCount} correction request${requestCount === 1 ? '' : 's'}`}
                    {priorVersions.length > 0 && (
                      <Badge variant="secondary" className="shrink-0 whitespace-nowrap">
                        {priorVersions.length} prior version{priorVersions.length === 1 ? '' : 's'}
                      </Badge>
                    )}
                    {openRequest && (
                      <Badge variant="destructive" className="shrink-0 whitespace-nowrap">Correction open</Badge>
                    )}
                  </div>
                </button>
                {priorVersions.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setSelectedId(p.id); setSelectedOrphanDate(null); }}
                    className={`ml-4 w-[calc(100%-1rem)] rounded-lg border border-dashed p-2 text-left text-xs ${
                      selectedId === p.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    Version {i + 1} of {priorVersions.length + 1} (superseded) — certified{' '}
                    {p.certified_at ? new Date(p.certified_at).toLocaleDateString('en-US') : '—'}
                  </button>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {!selected && !selectedOrphanDate && (
            <Card className="rods-no-print">
              <CardContent className="p-6 text-sm text-muted-foreground">Select a log to read it.</CardContent>
            </Card>
          )}

          {selectedOrphanDate && !selected && (
            <Card className="rods-no-print">
              <CardHeader><CardTitle className="text-base">{driverName} — {selectedOrphanDate}</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                No record of duty status is on file for this date. The correction requests below were raised against it.
              </CardContent>
            </Card>
          )}

          {selected && (
            <Card id="rods-print-area">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">{driverName} — {selected.log_date}</CardTitle>
                <div className="rods-no-print flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => window.print()}>
                    <Printer className="mr-2 h-4 w-4" /> Print
                  </Button>
                  {selected.status === 'certified' ? (
                    <Button size="sm" variant="outline" onClick={() => setRaiseOpen(true)}>
                      <MessageSquareWarning className="mr-2 h-4 w-4" /> Raise correction request
                    </Button>
                  ) : selected.status === 'superseded' && currentForDate ? (
                    <Button size="sm" variant="ghost" onClick={() => setSelectedId(currentForDate.id)}>
                      Go to the current version
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {events.length === 0 && (
                  <p className="mb-3 text-sm text-muted-foreground">
                    No duty status recorded on this day — the grid below is empty because nothing was entered.
                  </p>
                )}
                <RoadsideDayRender day={selected} events={events} driverName={driverName} />
              </CardContent>
            </Card>
          )}

          {(selected || selectedOrphanDate) && (
            <Card className="rods-no-print">
              <CardHeader><CardTitle className="text-base">Correction requests for this date</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {dayRequests.length === 0 && (
                  <p className="text-sm text-muted-foreground">None raised.</p>
                )}
                {dayRequests.map((r) => (
                  <div key={r.id} className="space-y-1.5 rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={r.status === 'open' ? 'destructive' : r.status === 'actioned' ? 'default' : 'secondary'}
                        className="shrink-0 whitespace-nowrap"
                      >
                        {CORRECTION_STATUS_LABEL[r.status]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {r.requested_by_name || 'Office'} ·{' '}
                        {new Date(r.requested_at).toLocaleString('en-US', { timeZone: 'America/Chicago' })}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-foreground">{r.issue}</p>
                    {r.status === 'actioned' && r.resolved_by_day_id && (
                      <button
                        type="button"
                        className="text-xs font-semibold text-primary underline"
                        onClick={() => { setSelectedId(r.resolved_by_day_id); setSelectedOrphanDate(null); }}
                      >
                        Answered by amendment — open the certified version
                      </button>
                    )}
                    {r.driver_response && (
                      <p className="whitespace-pre-wrap rounded bg-muted/50 p-2 text-sm text-foreground">
                        Driver: {r.driver_response}
                      </p>
                    )}
                    {r.resolved_at && (
                      <p className="text-xs text-muted-foreground">
                        Resolved {new Date(r.resolved_at).toLocaleString('en-US', { timeZone: 'America/Chicago' })}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={raiseOpen} onOpenChange={setRaiseOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Raise a correction request</DialogTitle>
            <DialogDescription>
              Describe what needs looking at on {selected?.log_date}. The driver either amends the log — which closes
              this request on its own — or declines with a written response.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={issue}
            onChange={(e) => setIssue(e.target.value)}
            rows={5}
            placeholder="What looks wrong on this log…"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRaiseOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={() => { void raise(); }} disabled={busy || !issue.trim()}>Send to driver</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
