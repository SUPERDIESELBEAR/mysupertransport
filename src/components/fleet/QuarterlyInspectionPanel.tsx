import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  CalendarClock, Upload, AlertTriangle, CheckCircle2, Clock, Loader2, ShieldAlert,
} from 'lucide-react';
import {
  inspectionGroup, nextCycleOnOrAfter, cycleStatus, cycleLabel, daysUntilDeadline,
  cycleDeadline, CYCLE_STATUS_LABELS, GROUP_MONTHS, MONTH_NAMES,
  type CycleStatus, type CycleRef,
} from '@/lib/inspectionProgram';

// The program tables land when this draft is accepted; the generated types do
// not know them yet, so these reads are cast.
const db = supabase as any;

interface CycleRow {
  id: string;
  cycle_year: number;
  cycle_month: number;
  assigned_group: 'A' | 'B';
  status: CycleStatus;
  inspection_date: string | null;
  facility: string | null;
  inspection_fee: number | null;
  report_file_path: string | null;
  invoice_file_path: string | null;
  defects_identified: boolean;
  defects_repaired: boolean;
  defect_notes: string | null;
  grace_until: string | null;
  grace_reason: string | null;
  grace_is_override: boolean;
  grace_request_status: 'pending' | 'approved' | 'declined' | null;
  grace_request_days: number | null;
  grace_request_reason: string | null;
  submitted_at: string | null;
  closed_at: string | null;
}

interface Props {
  operatorId: string;
  unitNumber: string | null | undefined;
  readOnly?: boolean;
}

const STATUS_STYLE: Record<CycleStatus, string> = {
  upcoming: 'bg-slate-100 text-slate-700 border-slate-300',
  due: 'bg-amber-50 text-amber-800 border-amber-300',
  grace: 'bg-orange-50 text-orange-800 border-orange-300',
  submitted: 'bg-blue-50 text-blue-800 border-blue-300',
  closed: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  overdue: 'bg-destructive/10 text-destructive border-destructive/40',
};

export default function QuarterlyInspectionPanel({ operatorId, unitNumber, readOnly = false }: Props) {
  const { session, isManagement, isOwner } = useAuth();
  const [rows, setRows] = useState<CycleRow[]>([]);
  const [graceUsed, setGraceUsed] = useState<number | null>(null);
  const [graceLimit, setGraceLimit] = useState(2);
  const [maxGraceDays, setMaxGraceDays] = useState(15);
  const [feeCap, setFeeCap] = useState(150);
  const [loading, setLoading] = useState(true);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [graceOpen, setGraceOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const reviewRequest = useCallback(async (row: CycleRow, approve: boolean, declineReason?: string) => {
    setSaving(true);
    const { error } = await db.rpc('review_inspection_grace_request', {
      _cycle_id: row.id,
      _approve: approve,
      _decline_reason: declineReason ?? null,
      _override: false,
    });
    setSaving(false);
    if (error) {
      toast({
        title: approve ? 'Could not approve the request' : 'Could not decline the request',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    toast({ title: approve ? 'Extension approved' : 'Request declined' });
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const group = useMemo(() => inspectionGroup(unitNumber), [unitNumber]);

  const load = useCallback(async () => {
    setLoading(true);
    const [cyclesRes, settingsRes, usedRes] = await Promise.all([
      db.from('inspection_cycles').select('*').eq('operator_id', operatorId)
        .order('cycle_year', { ascending: false }).order('cycle_month', { ascending: false }),
      db.from('inspection_program_settings').select('*').limit(1).maybeSingle(),
      db.rpc('inspection_grace_used', { _operator_id: operatorId }),
    ]);
    setRows((cyclesRes.data as CycleRow[]) ?? []);
    if (settingsRes.data) {
      setGraceLimit(settingsRes.data.max_grace_per_12_months ?? 2);
      setMaxGraceDays(settingsRes.data.max_grace_days ?? 15);
      setFeeCap(Number(settingsRes.data.reimbursement_cap ?? 150));
    }
    setGraceUsed(typeof usedRes.data === 'number' ? usedRes.data : null);
    setLoading(false);
  }, [operatorId]);

  useEffect(() => { load(); }, [load]);

  const currentRef: CycleRef | null = useMemo(
    () => (group ? nextCycleOnOrAfter(group, new Date()) : null),
    [group],
  );

  const currentRow = useMemo(
    () => rows.find(r => currentRef && r.cycle_year === currentRef.year && r.cycle_month === currentRef.month) ?? null,
    [rows, currentRef],
  );

  const openRow = useMemo(
    () => rows.find(r => !r.closed_at) ?? null,
    [rows],
  );

  const status: CycleStatus | null = useMemo(() => {
    if (!currentRef) return null;
    const r = currentRow;
    return cycleStatus({
      cycle: currentRef,
      submittedAt: r?.submitted_at,
      closedAt: r?.closed_at,
      defectsIdentified: r?.defects_identified,
      defectsRepaired: r?.defects_repaired,
      graceUntil: r?.grace_until,
    });
  }, [currentRef, currentRow]);

  const daysLeft = currentRef ? daysUntilDeadline(currentRef, currentRow?.grace_until) : null;

  if (!group) {
    return (
      <div className="bg-white border border-border rounded-xl shadow-sm p-5">
        <div className="flex items-center gap-2 mb-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Quarterly Inspection Program</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          This truck has no unit number yet. The inspection month is set from the last digit of the
          unit number, so add one to put this truck on the schedule.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-border rounded-xl shadow-sm p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <div>
            <h3 className="font-semibold text-sm text-foreground">Quarterly Inspection Program</h3>
            <p className="text-[11px] text-muted-foreground">
              Unit {unitNumber} · Group {group} · {GROUP_MONTHS[group].map(m => MONTH_NAMES[m - 1].slice(0, 3)).join(' · ')}
            </p>
          </div>
        </div>
        {status && (
          <Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[status]}`}>
            {CYCLE_STATUS_LABELS[status]}
          </Badge>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading schedule…
        </div>
      ) : (
        <>
          {currentRef && (
            <div className={`rounded-lg border p-4 ${STATUS_STYLE[status ?? 'upcoming']}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] opacity-80">Assigned month</p>
                  <p className="text-lg font-bold">{cycleLabel(currentRef)}</p>
                  <p className="text-[11px] opacity-80 mt-1">
                    Due by {cycleDeadline(currentRef, currentRow?.grace_until).toLocaleDateString()}
                    {currentRow?.grace_until ? ' (grace period)' : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">{daysLeft !== null ? Math.abs(daysLeft) : '—'}</p>
                  <p className="text-[11px] opacity-80">
                    {daysLeft !== null && daysLeft < 0 ? 'days overdue' : 'days left'}
                  </p>
                </div>
              </div>

              {status === 'overdue' && (
                <p className="mt-3 flex items-start gap-1.5 text-[11px] font-medium">
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-px" />
                  Not dispatch eligible until a current inspection is on file.
                </p>
              )}
              {currentRow?.defects_identified && !currentRow.defects_repaired && (
                <p className="mt-3 flex items-start gap-1.5 text-[11px] font-medium">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                  Defects were noted on the report and repair documentation is still outstanding.
                </p>
              )}
            </div>
          )}

          {openRow?.grace_request_status === 'pending' && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
              <p className="text-xs font-medium text-amber-900">
                Driver requested a {openRow.grace_request_days ?? '—'}-day extension
              </p>
              <p className="text-[11px] text-amber-800 italic">“{openRow.grace_request_reason}”</p>
              {!readOnly && (
                <div className="flex gap-2">
                  <Button size="sm" className="text-xs gap-1.5" disabled={saving}
                    onClick={() => reviewRequest(openRow, true)}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs" disabled={saving}
                    onClick={() => setDeclineOpen(true)}>
                    Decline
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {!readOnly && (
              <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => setSubmitOpen(true)}>
                <Upload className="h-3.5 w-3.5" /> Record inspection
              </Button>
            )}
            {!readOnly && openRow && (
              <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => setGraceOpen(true)}>
                <Clock className="h-3.5 w-3.5" /> Grant grace period
              </Button>
            )}
            {graceUsed !== null && (
              <span className={`text-[11px] ${graceUsed >= graceLimit ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                Grace used: {graceUsed} of {graceLimit} in the last 12 months
                {graceUsed >= graceLimit ? ' — a further extension needs management approval' : ''}
              </span>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            SUPERTRANSPORT covers the inspection fee up to ${feeCap}. Repairs, reinspection and any
            related costs stay with the contractor.
          </p>

          {/* History */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">Cycle history</p>
            {rows.length === 0 ? (
              <p className="text-xs text-muted-foreground">No cycles recorded yet.</p>
            ) : rows.map(r => {
              const st = cycleStatus({
                cycle: { year: r.cycle_year, month: r.cycle_month },
                submittedAt: r.submitted_at, closedAt: r.closed_at,
                defectsIdentified: r.defects_identified, defectsRepaired: r.defects_repaired,
                graceUntil: r.grace_until,
              });
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                  <div>
                    <p className="text-xs font-medium">{cycleLabel({ year: r.cycle_year, month: r.cycle_month })}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {r.inspection_date ? new Date(`${r.inspection_date}T12:00:00`).toLocaleDateString() : 'Not yet submitted'}
                      {r.facility ? ` · ${r.facility}` : ''}
                      {r.inspection_fee != null ? ` · $${Number(r.inspection_fee).toFixed(2)}` : ''}
                    </p>
                    {r.grace_until && (
                      <p className="text-[11px] text-orange-700">
                        Grace to {new Date(`${r.grace_until}T12:00:00`).toLocaleDateString()}
                        {r.grace_is_override ? ' (management override)' : ''}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${STATUS_STYLE[st]}`}>
                    {st === 'closed' ? <CheckCircle2 className="h-3 w-3 mr-1" /> : null}
                    {CYCLE_STATUS_LABELS[st]}
                  </Badge>
                </div>
              );
            })}
          </div>
        </>
      )}

      {submitOpen && currentRef && (
        <SubmitCycleDialog
          operatorId={operatorId}
          unitNumber={unitNumber ?? ''}
          group={group}
          cycle={currentRef}
          existing={currentRow}
          feeCap={feeCap}
          userId={session?.user?.id ?? null}
          saving={saving}
          setSaving={setSaving}
          onClose={() => setSubmitOpen(false)}
          onSaved={() => { setSubmitOpen(false); load(); }}
        />
      )}

      {graceOpen && openRow && (
        <GraceDialog
          cycleId={openRow.id}
          maxDays={maxGraceDays}
          overLimit={(graceUsed ?? 0) >= graceLimit}
          canOverride={!!(isManagement || isOwner)}
          onClose={() => setGraceOpen(false)}
          onSaved={() => { setGraceOpen(false); load(); }}
        />
      )}

      {declineOpen && openRow && (
        <DeclineRequestDialog
          saving={saving}
          onClose={() => setDeclineOpen(false)}
          onDecline={async (reason) => {
            await reviewRequest(openRow, false, reason);
            setDeclineOpen(false);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------- decline request */

function DeclineRequestDialog({
  saving, onClose, onDecline,
}: {
  saving: boolean;
  onClose: () => void;
  onDecline: (reason: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="text-base">Decline the extension request</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="decline-reason" className="text-xs">Reason (shared with the driver)</Label>
          <Textarea
            id="decline-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why the extension can't be granted"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={saving || !reason.trim()}
            onClick={() => onDecline(reason.trim())}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Decline request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ submit */

function SubmitCycleDialog({
  operatorId, unitNumber, group, cycle, existing, feeCap, userId, saving, setSaving, onClose, onSaved,
}: {
  operatorId: string;
  unitNumber: string;
  group: 'A' | 'B';
  cycle: CycleRef;
  existing: CycleRow | null;
  feeCap: number;
  userId: string | null;
  saving: boolean;
  setSaving: (v: boolean) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(existing?.inspection_date ?? '');
  const [facility, setFacility] = useState(existing?.facility ?? '');
  const [fee, setFee] = useState(existing?.inspection_fee != null ? String(existing.inspection_fee) : '');
  const [defects, setDefects] = useState(existing?.defects_identified ?? false);
  const [repaired, setRepaired] = useState(existing?.defects_repaired ?? false);
  const [notes, setNotes] = useState(existing?.defect_notes ?? '');
  const reportRef = useRef<HTMLInputElement>(null);
  const invoiceRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File, kind: string) => {
    const path = `inspection-cycles/${operatorId}/${cycle.year}-${cycle.month}-${kind}-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('fleet-documents').upload(path, file, { upsert: true });
    if (error) throw new Error(error.message);
    return { path, name: file.name };
  };

  const save = async () => {
    if (!date) { toast({ title: 'Add the inspection date', variant: 'destructive' }); return; }
    const reportFile = reportRef.current?.files?.[0];
    const invoiceFile = invoiceRef.current?.files?.[0];
    if (!existing?.report_file_path && !reportFile) {
      toast({ title: 'The inspection report is required', variant: 'destructive' }); return;
    }
    if (!existing?.invoice_file_path && !invoiceFile) {
      toast({ title: 'The itemised invoice is required', variant: 'destructive' }); return;
    }

    setSaving(true);
    try {
      const report = reportFile ? await upload(reportFile, 'report') : null;
      const invoice = invoiceFile ? await upload(invoiceFile, 'invoice') : null;

      const payload: Record<string, unknown> = {
        operator_id: operatorId,
        unit_number: unitNumber || null,
        assigned_group: group,
        cycle_year: cycle.year,
        cycle_month: cycle.month,
        inspection_date: date,
        facility: facility || null,
        inspection_fee: fee ? Number(fee) : null,
        defects_identified: defects,
        defects_repaired: defects ? repaired : false,
        defect_notes: notes || null,
        submitted_at: new Date().toISOString(),
        status: defects && !repaired ? 'submitted' : 'closed',
        closed_at: defects && !repaired ? null : new Date().toISOString(),
        updated_by: userId,
      };
      if (report) { payload.report_file_path = report.path; payload.report_file_name = report.name; }
      if (invoice) { payload.invoice_file_path = invoice.path; payload.invoice_file_name = invoice.name; }
      if (!existing) payload.created_by = userId;

      const { data: saved, error } = existing
        ? await db.from('inspection_cycles').update(payload).eq('id', existing.id).select('id').single()
        : await db.from('inspection_cycles').insert(payload).select('id').single();
      if (error) throw new Error(error.message);

      // Reimbursement goes to the review queue, capped, never auto-paid.
      const amount = Math.min(fee ? Number(fee) : 0, feeCap);
      if (amount > 0) {
        const { error: payErr } = await db.from('inspection_program_payments').upsert({
          kind: 'inspection_reimbursement',
          cycle_id: saved.id,
          operator_id: operatorId,
          amount,
          description: `Quarterly inspection ${cycleLabel(cycle)} — unit ${unitNumber}`,
          status: 'pending',
          created_by: userId,
        }, { onConflict: 'cycle_id' });
        if (payErr) throw new Error(payErr.message);
      }

      toast({ title: 'Inspection recorded' });
      onSaved();
    } catch (e: any) {
      toast({ title: 'Could not save', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-base">Record {cycleLabel(cycle)} inspection</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Inspection date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Facility</Label>
            <Input value={facility} onChange={e => setFacility(e.target.value)} placeholder="Shop or service centre" className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Inspection fee</Label>
            <Input type="number" step="0.01" value={fee} onChange={e => setFee(e.target.value)} className="h-9 text-sm" />
            <p className="text-[11px] text-muted-foreground mt-1">Reimbursed up to ${feeCap} after review.</p>
          </div>
          <div>
            <Label className="text-xs">Inspection report {existing?.report_file_path ? '(on file)' : ''}</Label>
            <Input ref={reportRef} type="file" accept="application/pdf,image/*" className="h-9 text-xs" />
          </div>
          <div>
            <Label className="text-xs">Itemised invoice {existing?.invoice_file_path ? '(on file)' : ''}</Label>
            <Input ref={invoiceRef} type="file" accept="application/pdf,image/*" className="h-9 text-xs" />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={defects} onCheckedChange={v => setDefects(!!v)} /> Defects were identified
          </label>
          {defects && (
            <>
              <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={repaired} onCheckedChange={v => setRepaired(!!v)} /> All defects have been repaired
              </label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="What was found and what was repaired" className="text-sm" />
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------- grace */

function GraceDialog({
  cycleId, maxDays, overLimit, canOverride, onClose, onSaved,
}: {
  cycleId: string;
  maxDays: number;
  overLimit: boolean;
  canOverride: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [days, setDays] = useState(String(maxDays));
  const [reason, setReason] = useState('');
  const [override, setOverride] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    const { error } = await db.rpc('grant_inspection_grace', {
      _cycle_id: cycleId,
      _days: Number(days),
      _reason: reason || null,
      _override: override,
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Grace period refused', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Grace period granted' });
    onSaved();
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-base">Grant a grace period</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {overLimit && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              This driver has already used the allowed extensions in the last 12 months.
              {canOverride
                ? ' A management override with a written reason is required.'
                : ' Only management can approve a further extension.'}
            </div>
          )}
          <div>
            <Label className="text-xs">Days into the following month (max {maxDays})</Label>
            <Input type="number" min={1} max={maxDays} value={days} onChange={e => setDays(e.target.value)} className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Reason</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} className="text-sm"
              placeholder="Why the extension is being granted" />
          </div>
          {overLimit && canOverride && (
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={override} onCheckedChange={v => setOverride(!!v)} />
              Approve as a management override
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving || (overLimit && !override)}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Grant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
