import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { CalendarClock, FileText, Loader2, Send } from 'lucide-react';
import {
  EXTENSION_REQUEST_SELECT, EXTENSION_STATUS_LABEL, carrierSetupMessage,
  generateAndStoreExtensionPdf, missingCarrierFields, openExtensionRequestPdf,
  type CarrierProfileRow, type ExtensionRequestRow,
} from '@/lib/eld/extensionRequest';

type EventSnapshot = {
  id: string;
  operator_id: string;
  discovered_at: string;
  created_at: string;
  discovered_location: string;
  malfunction_code: string;
  malfunction_description: string;
  repair_deadline: string;
  device_provider: string | null;
  device_make: string | null;
  device_model: string | null;
  device_serial: string | null;
  eld_registration_id: string | null;
};

const EVENT_SELECT = `id, operator_id, discovered_at, created_at, discovered_location,
  malfunction_code, malfunction_description, repair_deadline,
  device_provider, device_make, device_model, device_serial, eld_registration_id`;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function ELDExtensionRequests({
  eventId, driverName, unitNumber,
}: {
  eventId: string;
  driverName: string;
  unitNumber: string | null;
}) {
  const [rows, setRows] = useState<ExtensionRequestRow[]>([]);
  const [carrier, setCarrier] = useState<CarrierProfileRow | null>(null);
  const [event, setEvent] = useState<EventSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [responseTarget, setResponseTarget] = useState<ExtensionRequestRow | null>(null);

  // Draft form
  const [filerName, setFilerName] = useState('');
  const [filerTitle, setFilerTitle] = useState('Safety & Compliance');
  const [filerPhone, setFilerPhone] = useState('');
  const [filerEmail, setFilerEmail] = useState('');
  const [cdlNumber, setCdlNumber] = useState('');
  const [cdlState, setCdlState] = useState('');
  const [vin, setVin] = useState('');
  const [actions, setActions] = useState('');
  const [why, setWhy] = useState('');
  const [through, setThrough] = useState('');

  // Response form
  const [respOutcome, setRespOutcome] = useState<'granted' | 'denied'>('granted');
  const [respDate, setRespDate] = useState('');
  const [respRef, setRespRef] = useState('');
  const [respNotes, setRespNotes] = useState('');
  const [respThrough, setRespThrough] = useState('');

  const load = useCallback(async () => {
    const [{ data: reqs }, { data: prof }, { data: ev }] = await Promise.all([
      supabase.from('eld_extension_requests').select(EXTENSION_REQUEST_SELECT)
        .eq('event_id', eventId).order('created_at', { ascending: false }),
      supabase.from('carrier_profile')
        .select('legal_name, usdot_number, mc_number, main_office_address, fmcsa_division_state')
        .limit(1).maybeSingle(),
      supabase.from('eld_malfunction_events').select(EVENT_SELECT).eq('id', eventId).maybeSingle(),
    ]);
    setRows((reqs as unknown as ExtensionRequestRow[]) ?? []);
    setCarrier((prof as CarrierProfileRow) ?? null);
    setEvent((ev as unknown as EventSnapshot) ?? null);
  }, [eventId]);

  useEffect(() => { void load(); }, [load]);

  const missing = useMemo(() => missingCarrierFields(carrier), [carrier]);
  const openRequest = rows.find((r) => r.status === 'draft' || r.status === 'submitted') ?? null;

  async function startDraft() {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (uid) {
      const { data: p } = await supabase.from('profiles')
        .select('first_name, last_name, phone').eq('user_id', uid).maybeSingle();
      setFilerName([p?.first_name, p?.last_name].filter(Boolean).join(' ') || '');
      setFilerPhone(p?.phone ?? '');
    }
    setFilerEmail(userRes.user?.email ?? '');
    if (event) setThrough(addDays(event.repair_deadline, 7));
    setDraftOpen(true);
  }

  async function saveDraft() {
    if (!event) return;
    if (!filerName.trim() || !filerTitle.trim() || !filerPhone.trim() || !filerEmail.trim()) {
      toast.error('395.34(d)(2)(i) needs the filing representative’s name, title, phone and email.');
      return;
    }
    if (!actions.trim()) { toast.error('395.34(d)(2)(iv) needs what the carrier has done to correct the failure.'); return; }
    if (!why.trim()) { toast.error('Say why more than eight days are needed.'); return; }
    if (!through || through <= event.repair_deadline) {
      toast.error('The requested date must fall after the 8-day repair deadline.');
      return;
    }
    setBusy(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { data: inserted, error } = await supabase
      .from('eld_extension_requests')
      .insert({
        event_id: event.id,
        operator_id: event.operator_id,
        filer_name: filerName.trim(),
        filer_title: filerTitle.trim(),
        filer_phone: filerPhone.trim(),
        filer_email: filerEmail.trim(),
        carrier_legal_name: carrier?.legal_name ?? '',
        carrier_usdot: carrier?.usdot_number ?? '',
        carrier_mc: carrier?.mc_number ?? null,
        carrier_main_office_address: carrier?.main_office_address ?? '',
        fmcsa_division_state: carrier?.fmcsa_division_state ?? '',
        device_provider: event.device_provider,
        device_make: event.device_make,
        device_model: event.device_model,
        device_serial: event.device_serial,
        eld_registration_id: event.eld_registration_id,
        driver_name: driverName,
        driver_license_number: cdlNumber.trim() || null,
        driver_license_state: cdlState.trim() || null,
        vehicle_unit_number: unitNumber,
        vehicle_vin: vin.trim() || null,
        malfunction_code: event.malfunction_code,
        malfunction_description: event.malfunction_description,
        discovered_at: event.discovered_at,
        reported_at: event.created_at,
        discovered_location: event.discovered_location,
        repair_deadline: event.repair_deadline,
        actions_taken: actions.trim(),
        why_extension_needed: why.trim(),
        requested_through: through,
        created_by: userRes.user?.id ?? null,
      })
      .select(EXTENSION_REQUEST_SELECT)
      .maybeSingle();
    if (error || !inserted) {
      setBusy(false);
      toast.error(error?.message ?? 'Could not start the request.');
      return;
    }
    const result = await generateAndStoreExtensionPdf(inserted as unknown as ExtensionRequestRow);
    setBusy(false);
    if ('error' in result) { toast.error(result.error); return; }
    setDraftOpen(false);
    setActions(''); setWhy(''); setVin(''); setCdlNumber(''); setCdlState('');
    toast.success('Draft request generated. Review the PDF, then file it with FMCSA.');
    void load();
  }

  async function viewPdf(row: ExtensionRequestRow) {
    if (!row.pdf_path) { toast.info('This request has no PDF yet.'); return; }
    setBusy(true);
    const url = await openExtensionRequestPdf(row.pdf_path);
    setBusy(false);
    if (!url) { toast.error('Could not open the request PDF right now.'); return; }
    window.open(url, '_blank', 'noopener');
  }

  async function markFiled(row: ExtensionRequestRow) {
    setBusy(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase.from('eld_extension_requests')
      .update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        submitted_by: userRes.user?.id ?? null,
      })
      .eq('id', row.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Filed. The driver can now see the request on their dashboard.');
    void load();
  }

  async function withdraw(row: ExtensionRequestRow) {
    setBusy(true);
    const { error } = await supabase.from('eld_extension_requests')
      .update({ status: 'withdrawn' }).eq('id', row.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Withdrawn.');
    void load();
  }

  async function recordResponse() {
    if (!responseTarget) return;
    if (!respDate) { toast.error('Enter the date FMCSA answered.'); return; }
    if (!respNotes.trim()) { toast.error('Record what FMCSA said.'); return; }
    if (respOutcome === 'granted' && !respThrough) {
      toast.error('A granted extension must name the date the relief runs through.');
      return;
    }
    setBusy(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase.from('eld_extension_requests')
      .update({
        status: respOutcome,
        response_date: respDate,
        response_reference: respRef.trim() || null,
        response_notes: respNotes.trim(),
        granted_through: respOutcome === 'granted' ? respThrough : null,
        responded_by: userRes.user?.id ?? null,
      })
      .eq('id', responseTarget.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setResponseTarget(null);
    setRespDate(''); setRespRef(''); setRespNotes(''); setRespThrough('');
    toast.success(
      respOutcome === 'granted'
        ? 'Grant recorded. The day-9 blocking notice stops while the relief is in force.'
        : 'Denial recorded. The repair clock is unchanged.',
    );
    void load();
  }

  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">
          <CalendarClock className="mr-1 inline h-3.5 w-3.5" /> FMCSA repair extension — 395.34(d)(2)
        </p>
        {!openRequest && missing.length === 0 && (
          <Button size="sm" variant="outline" onClick={startDraft} disabled={busy || !event}>
            Open extension request
          </Button>
        )}
      </div>

      {missing.length > 0 && (
        <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
          {carrierSetupMessage(missing)}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        The carrier has five days from the driver&apos;s report to file with the FMCSA Division
        Administrator. Only a grant recorded here stops the day-9 blocking notice.
      </p>

      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground">No extension has been requested for this malfunction.</p>
      )}

      {rows.map((r) => (
        <div key={r.id} className="rounded-md border border-border p-2 text-xs space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{EXTENSION_STATUS_LABEL[r.status]}</Badge>
            <span className="text-muted-foreground">
              Requested through {new Date(`${r.requested_through}T12:00:00`).toLocaleDateString()}
            </span>
            {r.status === 'granted' && r.granted_through && (
              <span className="text-muted-foreground">
                · relief through {new Date(`${r.granted_through}T12:00:00`).toLocaleDateString()}
              </span>
            )}
          </div>
          {r.response_notes && <p className="text-muted-foreground">FMCSA: {r.response_notes}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => viewPdf(r)}>
              <FileText className="mr-1 h-3 w-3" /> View request PDF
            </Button>
            {r.status === 'draft' && (
              <Button size="sm" disabled={busy} onClick={() => markFiled(r)}>
                <Send className="mr-1 h-3 w-3" /> Mark filed with FMCSA
              </Button>
            )}
            {r.status === 'submitted' && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setResponseTarget(r)}>
                Record FMCSA response
              </Button>
            )}
            {(r.status === 'draft' || r.status === 'submitted') && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => withdraw(r)}>
                Withdraw
              </Button>
            )}
          </div>
        </div>
      ))}

      <Dialog open={draftOpen} onOpenChange={(o) => !o && setDraftOpen(false)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Extension request — 49 CFR 395.34(d)</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">
            Carrier and device details are frozen onto the filing as they stand right now. The PDF
            always reproduces what was filed.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="ext-filer">Representative filing</Label>
              <Input id="ext-filer" value={filerName} onChange={(e) => setFilerName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ext-title">Title</Label>
              <Input id="ext-title" value={filerTitle} onChange={(e) => setFilerTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ext-phone">Telephone</Label>
              <Input id="ext-phone" value={filerPhone} onChange={(e) => setFilerPhone(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ext-email">Email</Label>
              <Input id="ext-email" value={filerEmail} onChange={(e) => setFilerEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ext-cdl">Driver CDL number</Label>
              <Input id="ext-cdl" value={cdlNumber} onChange={(e) => setCdlNumber(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ext-cdl-state">CDL state</Label>
              <Input id="ext-cdl-state" value={cdlState} onChange={(e) => setCdlState(e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="ext-vin">Vehicle VIN</Label>
              <Input id="ext-vin" value={vin} onChange={(e) => setVin(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ext-actions">Actions taken to correct the failure (required)</Label>
            <Textarea id="ext-actions" rows={3} value={actions} onChange={(e) => setActions(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ext-why">Why more than eight days are needed (required)</Label>
            <Textarea id="ext-why" rows={3} value={why} onChange={(e) => setWhy(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ext-through">Extension requested through</Label>
            <Input
              id="ext-through" type="date" value={through}
              min={event ? addDays(event.repair_deadline, 1) : undefined}
              onChange={(e) => setThrough(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraftOpen(false)}>Cancel</Button>
            <Button onClick={saveDraft} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null} Generate request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!responseTarget} onOpenChange={(o) => !o && setResponseTarget(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Record the FMCSA response</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">
            A response is written once and cannot be revised afterwards. File a new request if the
            situation changes.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm" variant={respOutcome === 'granted' ? 'default' : 'outline'}
              onClick={() => setRespOutcome('granted')}
            >
              Granted
            </Button>
            <Button
              size="sm" variant={respOutcome === 'denied' ? 'default' : 'outline'}
              onClick={() => setRespOutcome('denied')}
            >
              Denied
            </Button>
          </div>
          <div className="space-y-1">
            <Label htmlFor="resp-date">Date FMCSA answered</Label>
            <Input id="resp-date" type="date" value={respDate} onChange={(e) => setRespDate(e.target.value)} />
          </div>
          {respOutcome === 'granted' && (
            <div className="space-y-1">
              <Label htmlFor="resp-through">Relief granted through</Label>
              <Input
                id="resp-through" type="date" value={respThrough}
                min={responseTarget ? addDays(responseTarget.repair_deadline, 1) : undefined}
                onChange={(e) => setRespThrough(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="resp-ref">FMCSA reference (optional)</Label>
            <Input id="resp-ref" value={respRef} onChange={(e) => setRespRef(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="resp-notes">What FMCSA said (required)</Label>
            <Textarea id="resp-notes" rows={3} value={respNotes} onChange={(e) => setRespNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResponseTarget(null)}>Cancel</Button>
            <Button onClick={recordResponse} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null} Record response
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}