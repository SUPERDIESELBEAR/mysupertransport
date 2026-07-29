import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { AlertTriangle, BellOff, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import {
  MALFUNCTION_CODE_LABEL, MAX_SUPPRESSION_DAYS, NOTICE_DELIVERY_COPY, REPAIR_WINDOW_DAYS,
  elapsedRepairDay, getNoticeDeliveryState, repairClockColor,
} from '@/lib/eld/constants';
import ELDDeviceDataQuality from './ELDDeviceDataQuality';
import CarrierNotificationRecipients from './CarrierNotificationRecipients';

type Row = {
  id: string;
  operator_id: string;
  discovered_at: string;
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
  notice_uploaded_at: string | null;
  notice_sent_at: string | null;
  notice_send_attempts: number;
  notice_last_send_error: string | null;
  escalations_suppressed_reason: string | null;
  escalations_suppressed_until: string | null;
  operators?: { unit_number: string | null; profiles?: { first_name: string | null; last_name: string | null } | null } | null;
};

const SELECT = `id, operator_id, discovered_at, discovered_location, malfunction_code, malfunction_description,
  driver_notes, hinders_hos_recording, repair_deadline, status, resolution_notes, carrier_acknowledged_at,
  device_provider, device_model, device_serial, notice_uploaded_at, notice_sent_at, notice_send_attempts,
  notice_last_send_error, escalations_suppressed_reason, escalations_suppressed_until,
  operators!inner(unit_number, profiles(first_name, last_name))`;

export default function ELDMalfunctionsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resolveTarget, setResolveTarget] = useState<Row | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');
  const [suppressTarget, setSuppressTarget] = useState<Row | null>(null);
  const [suppressReason, setSuppressReason] = useState('');
  const [suppressUntil, setSuppressUntil] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('eld_malfunction_events')
      .select(SELECT)
      .order('discovered_at', { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as unknown as Row[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const maxSuppressDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + MAX_SUPPRESSION_DAYS);
    return d.toISOString().slice(0, 10);
  }, []);

  const driverName = (r: Row) => {
    const p = r.operators?.profiles;
    return [p?.first_name, p?.last_name].filter(Boolean).join(' ') || 'Driver';
  };

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

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
          No malfunctions reported.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const day = elapsedRepairDay(row.discovered_at);
            const open = row.status === 'open';
            const delivery = getNoticeDeliveryState(row);
            const suppressed = !!row.escalations_suppressed_until
              && new Date(`${row.escalations_suppressed_until}T23:59:59`) >= new Date();
            return (
              <div key={row.id} className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{driverName(row)}</span>
                  <span className="text-xs text-muted-foreground">Unit {row.operators?.unit_number || '—'}</span>
                  {open ? (
                    <Badge style={{ backgroundColor: repairClockColor(day), color: '#fff' }}>
                      Day {day} of {REPAIR_WINDOW_DAYS}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">{row.status}</Badge>
                  )}
                  <Badge variant="outline">{NOTICE_DELIVERY_COPY[delivery]}</Badge>
                  {row.carrier_acknowledged_at
                    ? <Badge variant="outline"><CheckCircle2 className="mr-1 h-3 w-3" /> Acknowledged</Badge>
                    : <Badge variant="outline"><AlertTriangle className="mr-1 h-3 w-3" /> Not acknowledged</Badge>}
                  {suppressed && (
                    <Badge variant="destructive">
                      <BellOff className="mr-1 h-3 w-3" /> Escalations paused until {row.escalations_suppressed_until}
                    </Badge>
                  )}
                </div>

                {suppressed && row.escalations_suppressed_reason && (
                  <p className="text-xs text-muted-foreground">Pause reason: {row.escalations_suppressed_reason}</p>
                )}

                <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Malfunction</dt>
                  <dd>{row.malfunction_code} — {MALFUNCTION_CODE_LABEL[row.malfunction_code]}</dd>
                  <dt className="text-muted-foreground">Discovered</dt>
                  <dd>{new Date(row.discovered_at).toLocaleString()} · {row.discovered_location}</dd>
                  <dt className="text-muted-foreground">Device</dt>
                  <dd>{[row.device_provider, row.device_model, row.device_serial].filter(Boolean).join(' · ') || '—'}</dd>
                  <dt className="text-muted-foreground">Repair deadline</dt><dd>{row.repair_deadline}</dd>
                  <dt className="text-muted-foreground">Driver notes</dt><dd>{row.driver_notes || '—'}</dd>
                  {row.notice_last_send_error && (<>
                    <dt className="text-muted-foreground">Last send error</dt>
                    <dd>{row.notice_last_send_error} ({row.notice_send_attempts} attempts)</dd>
                  </>)}
                </dl>

                {open && (
                  <div className="flex flex-wrap gap-2">
                    {!row.carrier_acknowledged_at && (
                      <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => acknowledge(row)}>
                        {busyId === row.id ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null} Acknowledge
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => { setResolveTarget(row); setResolveNotes(''); }}>
                      Resolve
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setSuppressTarget(row); setSuppressReason(''); setSuppressUntil(''); }}>
                      <BellOff className="mr-2 h-3 w-3" /> Pause escalations
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
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