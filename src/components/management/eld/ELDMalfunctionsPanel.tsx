import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  AlertTriangle, BellOff, BellRing, CalendarClock, CheckCircle2, Loader2, ShieldAlert,
} from 'lucide-react';
import {
  MALFUNCTION_CODE_LABEL, MAX_SUPPRESSION_DAYS, REPAIR_WINDOW_DAYS, repairClockColor,
} from '@/lib/eld/constants';
import { repairDayInZone } from '@/lib/eld/repairClock';
import {
  CONSOLE_DELIVERY_COPY, CONSOLE_DELIVERY_TONE, getConsoleDeliveryState,
} from '@/lib/eld/noticeDelivery';
import ELDDeviceDataQuality from './ELDDeviceDataQuality';
import CarrierNotificationRecipients from './CarrierNotificationRecipients';
import ELDEscalationJobHealth from './ELDEscalationJobHealth';
import ClocksStrip from './ClocksStrip';
import EscalationTimeline from './EscalationTimeline';

type Row = {
  id: string;
  operator_id: string;
  discovered_at: string;
  created_at: string;
  discovered_location: string;
  malfunction_code: string;
  malfunction_description: string;
  driver_notes: string | null;
  hinders_hos_recording: boolean;
  repair_deadline: string;
  status: string;
  resolution_notes: string | null;
  carrier_acknowledged_at: string | null;
  device_provider: string | null;
  device_model: string | null;
  device_serial: string | null;
  notice_generated_at: string | null;
  notice_uploaded_at: string | null;
  notice_sent_at: string | null;
  notice_send_attempts: number;
  notice_last_send_error: string | null;
  escalations_suppressed_at: string | null;
  escalations_suppressed_reason: string | null;
  escalations_suppressed_until: string | null;
  extension_granted_at: string | null;
  extension_expires_on: string | null;
  extension_notes: string | null;
  operators?: { unit_number: string | null; user_id: string | null } | null;
  /** Joined in a second read — operators has no FK to profiles, so PostgREST cannot embed it. */
  driver?: { first_name: string | null; last_name: string | null } | null;
};

const SELECT = `id, operator_id, discovered_at, created_at, discovered_location, malfunction_code, malfunction_description,
  driver_notes, hinders_hos_recording, repair_deadline, status, resolution_notes, carrier_acknowledged_at,
  device_provider, device_model, device_serial, notice_generated_at, notice_uploaded_at, notice_sent_at,
  notice_send_attempts, notice_last_send_error, escalations_suppressed_at,
  escalations_suppressed_reason, escalations_suppressed_until,
  extension_granted_at, extension_expires_on, extension_notes,
  operators!inner(unit_number, user_id)`;

type PauseState = 'none' | 'paused_active' | 'paused_lapsed';

function pauseState(r: Row): PauseState {
  if (!r.escalations_suppressed_until) return 'none';
  const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  return r.escalations_suppressed_until >= todayKey ? 'paused_active' : 'paused_lapsed';
}

type Filter = 'open' | 'paused_active' | 'paused_lapsed' | 'unacknowledged' | 'failing' | 'resolved';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'open', label: 'Open' },
  { key: 'unacknowledged', label: 'Awaiting acknowledgment' },
  { key: 'failing', label: 'Delivery failing' },
  { key: 'paused_active', label: 'Paused' },
  { key: 'paused_lapsed', label: 'Pause lapsed' },
  { key: 'resolved', label: 'Resolved' },
];

export default function ELDMalfunctionsPanel({ focusEventId }: { focusEventId?: string | null }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('open');
  const [selectedId, setSelectedId] = useState<string | null>(focusEventId ?? null);
  // A deep link may name a resolved event, which the default 'open' filter
  // hides — the row would silently fall back to whatever sorts first. Widening
  // to 'all' once, only when the link names an event the open list lacks,
  // keeps the escalation notice landing on the event it is about.
  const [focusHandled, setFocusHandled] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<Row | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');
  const [suppressTarget, setSuppressTarget] = useState<Row | null>(null);
  const [suppressReason, setSuppressReason] = useState('');
  const [suppressUntil, setSuppressUntil] = useState('');
  const [extTarget, setExtTarget] = useState<Row | null>(null);
  const [extNotes, setExtNotes] = useState('');
  const [extExpires, setExtExpires] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('eld_malfunction_events')
      .select(SELECT)
      .order('discovered_at', { ascending: false });
    if (error) toast.error(error.message);
    const list = (data as unknown as Row[]) ?? [];
    const userIds = Array.from(
      new Set(list.map((r) => r.operators?.user_id).filter((v): v is string => !!v)),
    );
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name')
        .in('user_id', userIds);
      const byUser = new Map((profs ?? []).map((p) => [p.user_id, p]));
      for (const r of list) {
        const p = r.operators?.user_id ? byUser.get(r.operators.user_id) : undefined;
        r.driver = p ? { first_name: p.first_name, last_name: p.last_name } : null;
      }
    }
    setRows(list);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const maxSuppressDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + MAX_SUPPRESSION_DAYS);
    return d.toISOString().slice(0, 10);
  }, []);

  const driverName = (r: Row) => {
    const p = r.driver;
    return [p?.first_name, p?.last_name].filter(Boolean).join(' ') || 'Driver';
  };

  const filtered = useMemo(() => {
    const list = rows.filter((r) => {
      const open = r.status === 'open';
      switch (filter) {
        case 'open': return open;
        case 'resolved': return !open;
        case 'unacknowledged': return open && !r.carrier_acknowledged_at;
        case 'failing': return getConsoleDeliveryState(r) === 'failing';
        case 'paused_active': return open && pauseState(r) === 'paused_active';
        case 'paused_lapsed': return open && pauseState(r) === 'paused_lapsed';
        default: return true;
      }
    });
    return list.sort(
      (a, b) => repairDayInZone(b.discovered_at) - repairDayInZone(a.discovered_at),
    );
  }, [rows, filter]);

  useEffect(() => {
    if (focusEventId && !focusHandled && rows.length > 0) {
      const target = rows.find((r) => r.id === focusEventId);
      if (target) {
        if (!filtered.some((r) => r.id === focusEventId)) {
          setFilter(target.status === 'open' ? 'open' : 'resolved');
        }
        setSelectedId(focusEventId);
      }
      setFocusHandled(true);
      return;
    }
    if (filtered.length === 0) { setSelectedId(null); return; }
    if (!filtered.some((r) => r.id === selectedId)) setSelectedId(filtered[0].id);
  }, [filtered, selectedId, rows, focusEventId, focusHandled]);

  const selected = filtered.find((r) => r.id === selectedId) ?? null;

  async function acknowledge(row: Row) {
    setBusyId(row.id);
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('eld_malfunction_events')
      .update({ carrier_acknowledged_at: new Date().toISOString(), carrier_acknowledged_by: userRes.user?.id ?? null })
      .eq('id', row.id);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Acknowledged.');
    void load();
  }

  async function liftPause(row: Row) {
    setBusyId(row.id);
    // Do NOT null the column. `pauseJustLapsed` keys on
    // `calendarDaysBetween(until, today) === 1`, so a cleared pause leaves both
    // `isPaused` and `pauseJustLapsed` false and the very next run fires a rung
    // with no lapse notice — the same "resume that also escalates" the
    // automatic path exists to prevent, arriving through the button instead.
    // Instead we END the pause: set expiry to yesterday where the trigger
    // allows it (P0065 forbids an expiry before `escalations_suppressed_at`),
    // otherwise to today, which lapses tomorrow. Either way the ladder emits
    // `pause_lapsed` on its own run and skips the rung.
    const dayMs = 86400000;
    const key = (d: Date) => d.toISOString().slice(0, 10);
    const yesterday = key(new Date(Date.now() - dayMs));
    const pausedOn = row.escalations_suppressed_at
      ? key(new Date(row.escalations_suppressed_at))
      : yesterday;
    const endsOn = yesterday >= pausedOn ? yesterday : pausedOn;
    const { error } = await supabase
      .from('eld_malfunction_events')
      .update({ escalations_suppressed_until: endsOn })
      .eq('id', row.id);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success(
      endsOn === yesterday
        ? 'Pause ended. The lapse is announced on the next run; rungs resume after that.'
        : 'Pause ends today. The lapse is announced tomorrow; rungs resume after that.',
    );
    void load();
  }

  async function grantExtension() {
    if (!extTarget) return;
    if (!extNotes.trim()) { toast.error('Record why the extension was granted.'); return; }
    if (!extExpires) { toast.error('Pick the extended repair date.'); return; }
    setBusyId(extTarget.id);
    const { data: userRes } = await supabase.auth.getUser();
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from('eld_malfunction_events')
      .update({
        extension_requested_at: nowIso,
        extension_granted_at: nowIso,
        extension_granted_by: userRes.user?.id ?? null,
        extension_expires_on: extExpires,
        extension_notes: extNotes.trim(),
      })
      .eq('id', extTarget.id);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    setExtTarget(null); setExtNotes(''); setExtExpires('');
    toast.success('Extension recorded — the filing prompt stops on the next run.');
    void load();
  }

  async function resolve() {
    if (!resolveTarget) return;
    if (!resolveNotes.trim()) { toast.error('Add a resolution note.'); return; }
    setBusyId(resolveTarget.id);
    const { error } = await supabase
      .from('eld_malfunction_events')
      .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolution_notes: resolveNotes.trim() })
      .eq('id', resolveTarget.id);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    setResolveTarget(null);
    setResolveNotes('');
    toast.success('Malfunction resolved.');
    void load();
  }

  async function suppress() {
    if (!suppressTarget) return;
    if (!suppressReason.trim()) { toast.error('A written reason is required to pause escalations.'); return; }
    if (!suppressUntil) { toast.error('Pick an expiry date — a pause cannot be open-ended.'); return; }
    setBusyId(suppressTarget.id);
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('eld_malfunction_events')
      .update({
        escalations_suppressed_at: new Date().toISOString(),
        escalations_suppressed_by: userRes.user?.id ?? null,
        escalations_suppressed_reason: suppressReason.trim(),
        escalations_suppressed_until: suppressUntil,
      })
      .eq('id', suppressTarget.id);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    setSuppressTarget(null);
    setSuppressReason('');
    setSuppressUntil('');
    toast.success('Escalations paused — they resume automatically on the expiry date.');
    void load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">ELD Malfunctions</h1>
          <p className="text-sm text-muted-foreground">Driver-reported logging device failures and the 8-day repair clock</p>
        </div>
      </div>

      <ELDEscalationJobHealth />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? 'default' : 'outline'}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            <span className="ml-2 text-xs opacity-70">
              {rows.filter((r) => {
                const open = r.status === 'open';
                if (f.key === 'open') return open;
                if (f.key === 'resolved') return !open;
                if (f.key === 'unacknowledged') return open && !r.carrier_acknowledged_at;
                if (f.key === 'failing') return getConsoleDeliveryState(r) === 'failing';
                return open && pauseState(r) === f.key;
              }).length}
            </span>
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
          Nothing in this view.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <ul className="space-y-2">
            {filtered.map((row) => {
              const day = repairDayInZone(row.discovered_at);
              const delivery = getConsoleDeliveryState(row);
              const pause = pauseState(row);
              const active = row.id === selectedId;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      active ? 'border-primary bg-muted/60' : 'border-border hover:bg-muted/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-foreground">{driverName(row)}</span>
                      {row.status === 'open' ? (
                        <Badge style={{ backgroundColor: repairClockColor(day), color: '#fff' }}>
                          Day {day} of {REPAIR_WINDOW_DAYS}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">{row.status}</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Unit {row.operators?.unit_number || '—'} · {row.malfunction_code} —{' '}
                      {MALFUNCTION_CODE_LABEL[row.malfunction_code]}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant="outline" style={{ color: CONSOLE_DELIVERY_TONE[delivery] }}>
                        {CONSOLE_DELIVERY_COPY[delivery]}
                      </Badge>
                      {!row.carrier_acknowledged_at && row.status === 'open' && (
                        <Badge variant="outline">
                          <AlertTriangle className="mr-1 h-3 w-3" /> Not acknowledged
                        </Badge>
                      )}
                      {pause === 'paused_active' && (
                        <Badge variant="secondary">
                          <BellOff className="mr-1 h-3 w-3" /> Paused
                        </Badge>
                      )}
                      {pause === 'paused_lapsed' && (
                        <Badge variant="outline">
                          <BellRing className="mr-1 h-3 w-3" /> Pause lapsed
                        </Badge>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {selected && (
            <DetailPane
              row={selected}
              driverName={driverName(selected)}
              busy={busyId === selected.id}
              onAcknowledge={() => acknowledge(selected)}
              onLiftPause={() => liftPause(selected)}
              onResolve={() => { setResolveTarget(selected); setResolveNotes(''); }}
              onPause={() => { setSuppressTarget(selected); setSuppressReason(''); setSuppressUntil(''); }}
              onExtend={() => {
                setExtTarget(selected);
                setExtNotes('');
                setExtExpires(selected.extension_expires_on ?? '');
              }}
            />
          )}
        </div>
      )}

      <ELDDeviceDataQuality />
      <CarrierNotificationRecipients />

      <Dialog open={!!resolveTarget} onOpenChange={(o) => !o && setResolveTarget(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Resolve malfunction</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="resolve-notes">Resolution note (required)</Label>
            <Textarea id="resolve-notes" rows={4} value={resolveNotes} onChange={(e) => setResolveNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveTarget(null)}>Cancel</Button>
            <Button onClick={resolve}>Resolve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!extTarget} onOpenChange={(o) => !o && setExtTarget(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Record a repair extension</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">
            49 CFR 395.34(d)(2) — the carrier has five days from the driver's report to
            file. Recording it here stops the filing prompt and ends acknowledgment
            escalation for this event.
          </p>
          <div className="space-y-2">
            <Label htmlFor="ext-notes">What was filed and with whom (required)</Label>
            <Textarea id="ext-notes" rows={3} value={extNotes} onChange={(e) => setExtNotes(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ext-expires">Extended repair date</Label>
            <Input
              id="ext-expires" type="date" value={extExpires}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setExtExpires(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtTarget(null)}>Cancel</Button>
            <Button onClick={grantExtension}>Record extension</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!suppressTarget} onOpenChange={(o) => !o && setSuppressTarget(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Pause escalations</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">
            This only pauses repeat escalations. The driver still sees the blocking notice, and overdue
            acknowledgment alerts keep firing. Maximum {MAX_SUPPRESSION_DAYS} days.
          </p>
          <div className="space-y-2">
            <Label htmlFor="suppress-reason">Written reason (required)</Label>
            <Textarea id="suppress-reason" rows={3} value={suppressReason} onChange={(e) => setSuppressReason(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="suppress-until">Resume escalations on</Label>
            <Input
              id="suppress-until" type="date" value={suppressUntil} max={maxSuppressDate}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setSuppressUntil(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuppressTarget(null)}>Cancel</Button>
            <Button onClick={suppress}>Pause</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailPane({
  row, driverName, busy, onAcknowledge, onLiftPause, onResolve, onPause, onExtend,
}: {
  row: Row;
  driverName: string;
  busy: boolean;
  onAcknowledge: () => void;
  onLiftPause: () => void;
  onResolve: () => void;
  onPause: () => void;
  onExtend: () => void;
}) {
  const open = row.status === 'open';
  const pause = pauseState(row);
  const delivery = getConsoleDeliveryState(row);
  const resumesIn = row.escalations_suppressed_until
    ? Math.max(0, Math.ceil(
      (new Date(`${row.escalations_suppressed_until}T23:59:59`).getTime() - Date.now()) / 86400000,
    ))
    : 0;

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-semibold text-foreground">{driverName}</span>
        <span className="text-xs text-muted-foreground">Unit {row.operators?.unit_number || '—'}</span>
        {row.carrier_acknowledged_at
          ? <Badge variant="outline"><CheckCircle2 className="mr-1 h-3 w-3" /> Acknowledged</Badge>
          : <Badge variant="outline"><AlertTriangle className="mr-1 h-3 w-3" /> Not acknowledged</Badge>}
      </div>

      <ClocksStrip
        discoveredAt={row.discovered_at}
        createdAt={row.created_at}
        repairDeadline={row.repair_deadline}
        extensionGrantedAt={row.extension_granted_at}
        extensionExpiresOn={row.extension_expires_on}
      />

      {pause === 'paused_active' && (
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
          <p className="font-semibold text-foreground">
            <BellOff className="mr-1 inline h-3 w-3" />
            Escalations paused — resume {row.escalations_suppressed_until} ({resumesIn} day
            {resumesIn === 1 ? '' : 's'})
          </p>
          <p className="text-muted-foreground">Reason: {row.escalations_suppressed_reason}</p>
          <Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={onLiftPause}>
            {busy ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null} Lift pause
          </Button>
        </div>
      )}
      {pause === 'paused_lapsed' && (
        <p className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
          <BellRing className="mr-1 inline h-3 w-3" />
          Pause ended {row.escalations_suppressed_until}. The ladder announced the lapse on
          its own run and resumes escalating from the following day.
        </p>
      )}

      <div className="rounded-lg border border-border p-3 text-xs">
        <p className="font-semibold" style={{ color: CONSOLE_DELIVERY_TONE[delivery] }}>
          {CONSOLE_DELIVERY_COPY[delivery]}
        </p>
        {delivery === 'failing' && (
          <p className="mt-1 text-muted-foreground">
            {row.notice_send_attempts} attempt{row.notice_send_attempts === 1 ? '' : 's'} —{' '}
            {row.notice_last_send_error || 'no reason recorded'}
          </p>
        )}
      </div>

      <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Malfunction</dt>
        <dd>{row.malfunction_code} — {MALFUNCTION_CODE_LABEL[row.malfunction_code]}</dd>
        <dt className="text-muted-foreground">Discovered</dt>
        <dd>{new Date(row.discovered_at).toLocaleString()} · {row.discovered_location}</dd>
        <dt className="text-muted-foreground">Reported</dt>
        <dd>{new Date(row.created_at).toLocaleString()}</dd>
        <dt className="text-muted-foreground">Device</dt>
        <dd>{[row.device_provider, row.device_model, row.device_serial].filter(Boolean).join(' · ') || '—'}</dd>
        <dt className="text-muted-foreground">Driver notes</dt><dd>{row.driver_notes || '—'}</dd>
        {row.extension_notes && (<>
          <dt className="text-muted-foreground">Extension</dt><dd>{row.extension_notes}</dd>
        </>)}
        {!open && row.resolution_notes && (<>
          <dt className="text-muted-foreground">Resolution</dt><dd>{row.resolution_notes}</dd>
        </>)}
      </dl>

      <EscalationTimeline eventId={row.id} />

      {open && (
        <div className="flex flex-wrap gap-2">
          {!row.carrier_acknowledged_at && (
            <Button size="sm" variant="outline" disabled={busy} onClick={onAcknowledge}>
              {busy ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null} Acknowledge
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onResolve}>Resolve</Button>
          {!row.extension_granted_at && (
            <Button size="sm" variant="outline" onClick={onExtend}>
              <CalendarClock className="mr-2 h-3 w-3" /> Record extension
            </Button>
          )}
          {pause !== 'paused_active' && (
            <Button size="sm" variant="ghost" onClick={onPause}>
              <BellOff className="mr-2 h-3 w-3" /> Pause escalations
            </Button>
          )}
        </div>
      )}
    </div>
  );
}