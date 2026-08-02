import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { FileText, Loader2, MessageSquareWarning, RefreshCw } from 'lucide-react';
import RoadsideDayRender from '@/components/eld/RoadsideDayRender';
import type { RodsDay, RodsEvent } from '@/lib/eld/rodsTypes';
import {
  CORRECTION_STATUS_LABEL, fetchCorrectionRequests, raiseCorrectionRequest,
  type CorrectionRequest,
} from '@/lib/eld/correctionRequests';

interface OperatorRow { id: string; driver_name: string | null; unit_number: string | null }

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
  const [events, setEvents] = useState<RodsEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [issue, setIssue] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('operators')
        .select('id, driver_name, unit_number')
        .order('driver_name');
      setOperators((data ?? []) as OperatorRow[]);
    })();
  }, []);

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

  /** Current versions first; a superseded version sits under its replacement. */
  const grouped = useMemo(() => {
    const supersededBy = new Map<string, RodsDay>();
    for (const d of days) if (d.supersedes_day_id) supersededBy.set(d.supersedes_day_id, d);
    const current = days.filter((d) => d.status !== 'superseded');
    return current.map((d) => ({
      day: d,
      priorVersions: days.filter((p) => p.status === 'superseded' && supersededBy.get(p.id)?.id === d.id),
      openRequest: requests.find((r) => r.log_date === d.log_date && r.status === 'open') ?? null,
    }));
  }, [days, requests]);

  const dayRequests = selected
    ? requests.filter((r) => r.log_date === selected.log_date)
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
    if (!result.ok) { toast.error(result.message); return; }
    toast.success('Correction request sent to the driver.');
    setRaiseOpen(false);
    setIssue('');
    await load();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Driver logs (read-only)
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => { void load(); }} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Select value={operatorId} onValueChange={(v) => { setOperatorId(v); setSelectedId(null); }}>
            <SelectTrigger><SelectValue placeholder="Choose a driver" /></SelectTrigger>
            <SelectContent>
              {operators.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.driver_name || 'Driver'}{o.unit_number ? ` — Unit ${o.unit_number}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="lg:max-h-[70dvh] lg:overflow-y-auto">
          <CardContent className="space-y-2 p-3">
            {!operatorId && <p className="p-3 text-sm text-muted-foreground">Choose a driver to read their logs.</p>}
            {operatorId && !loading && grouped.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">No logs on file for this range.</p>
            )}
            {grouped.map(({ day, priorVersions, openRequest }) => (
              <div key={day.id} className="space-y-1">
                <button
                  type="button"
                  onClick={() => setSelectedId(day.id)}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    selectedId === day.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{day.log_date}</span>
                    <Badge variant={day.status === 'certified' ? 'default' : 'outline'} className="shrink-0 whitespace-nowrap">
                      {day.status}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {day.certified_at
                      ? `Certified ${new Date(day.certified_at).toLocaleString('en-US', { timeZone: 'America/Chicago' })}`
                      : 'Not certified'}
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
                {priorVersions.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={`ml-4 w-[calc(100%-1rem)] rounded-lg border border-dashed p-2 text-left text-xs ${
                      selectedId === p.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    Superseded version — certified{' '}
                    {p.certified_at ? new Date(p.certified_at).toLocaleDateString('en-US') : '—'}
                  </button>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {!selected && (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">Select a log to read it.</CardContent></Card>
          )}

          {selected && (
            <>
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                  <CardTitle className="text-base">{driverName} — {selected.log_date}</CardTitle>
                  {selected.status === 'certified' ? (
                    <Button size="sm" variant="outline" onClick={() => setRaiseOpen(true)}>
                      <MessageSquareWarning className="mr-2 h-4 w-4" /> Raise correction request
                    </Button>
                  ) : selected.status === 'superseded' && currentForDate ? (
                    <Button size="sm" variant="ghost" onClick={() => setSelectedId(currentForDate.id)}>
                      Go to the current version
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <RoadsideDayRender day={selected} events={events} driverName={driverName} />
                </CardContent>
              </Card>

              <Card>
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
                          onClick={() => setSelectedId(r.resolved_by_day_id)}
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
            </>
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
