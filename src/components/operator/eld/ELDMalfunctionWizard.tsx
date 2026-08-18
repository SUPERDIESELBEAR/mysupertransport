import { useEffect, useMemo, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import {
  CLOCK_RED,
  MALFUNCTION_CODES, MALFUNCTION_CODE_LABEL, MAX_BACKDATE_HOURS, REPAIR_WINDOW_DAYS,
} from '@/lib/eld/constants';
import {
  CARRIER_CACHE_MISSING_MESSAGE, malfunctionCarrierSnapshot, readCachedCarrier,
  requireCachedCarrier, type CachedCarrier,
} from '@/lib/eld/carrierIdentity';
import { carrierTimeZoneLabel } from '@/lib/eld/rodsHeaderFields';
import { renderMalfunctionNoticeBlob } from '@/lib/eld/renderMalfunctionNotice';
import { blobToBase64, flushPendingNotices, savePendingNotice } from '@/lib/eld/pendingNotice';

type DeviceModel = {
  id: string;
  provider_name: string;
  device_make: string;
  device_model: string;
  fmcsa_registration_id: string | null;
};

type Device = {
  id: string;
  truck_number: string | null;
  serial_number: string | null;
  eld_device_model_id: string | null;
};

type Props = {
  operatorId: string;
  driverName: string;
  unitNumber: string | null;
  onCancel: () => void;
  onSubmitted: () => void;
};

const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function ELDMalfunctionWizard({ operatorId, driverName, unitNumber, onCancel, onSubmitted }: Props) {
  const [saving, setSaving] = useState(false);

  const [discoveredAt, setDiscoveredAt] = useState(toLocalInput(new Date()));
  const [location, setLocation] = useState('');
  const [backdateReason, setBackdateReason] = useState('');

  const [models, setModels] = useState<DeviceModel[]>([]);
  const [device, setDevice] = useState<Device | null>(null);
  const [modelId, setModelId] = useState<string>('');
  const [serial, setSerial] = useState('');
  const [truckNumber, setTruckNumber] = useState(unitNumber ?? '');

  const [code, setCode] = useState<string>('');
  const [description, setDescription] = useState('');
  const [hinders, setHinders] = useState<'yes' | 'no' | ''>('');

  const sigRef = useRef<SignatureCanvas | null>(null);
  const sigHostRef = useRef<HTMLDivElement | null>(null);
  const [sigWidth, setSigWidth] = useState(280);
  const [cachedCarrier, setCachedCarrier] = useState<CachedCarrier | null>(null);

  // Read once, from the device cache only. Shown on the review step so the
  // driver signs against the identity that will be frozen onto the record.
  useEffect(() => { void readCachedCarrier().then(setCachedCarrier); }, []);

  useEffect(() => {
    void (async () => {
      const [{ data: modelRows }, { data: deviceRows }] = await Promise.all([
        supabase.from('eld_device_models').select('id, provider_name, device_make, device_model, fmcsa_registration_id')
          .eq('is_active', true).order('provider_name'),
        supabase.from('eld_devices').select('id, truck_number, serial_number, eld_device_model_id')
          .eq('operator_id', operatorId).eq('is_active', true).limit(1),
      ]);
      setModels((modelRows as DeviceModel[]) ?? []);
      const d = (deviceRows?.[0] as Device) ?? null;
      setDevice(d);
      if (d) {
        setModelId(d.eld_device_model_id ?? '');
        setSerial(d.serial_number ?? '');
        if (d.truck_number) setTruckNumber(d.truck_number);
      }
    })();
  }, [operatorId]);

  useEffect(() => {
    const measure = () => {
      const w = sigHostRef.current?.getBoundingClientRect().width ?? 0;
      if (w > 0) setSigWidth(Math.floor(w));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const selectedModel = useMemo(() => models.find((m) => m.id === modelId) ?? null, [models, modelId]);

  const discoveredDate = useMemo(() => new Date(discoveredAt), [discoveredAt]);
  const backdatedHours = useMemo(
    () => Math.max(0, (Date.now() - discoveredDate.getTime()) / 3600000),
    [discoveredDate],
  );
  const repairDeadline = useMemo(() => {
    const d = new Date(discoveredDate);
    d.setDate(d.getDate() + REPAIR_WINDOW_DAYS);
    return d;
  }, [discoveredDate]);

  // One screen, so validity is one list. Each entry is the sentence shown under
  // the submit button when it is missing — a driver reporting a malfunction is
  // usually on the shoulder, and "Submit is greyed out" with no reason is the
  // worst thing this screen could do.
  const missing: string[] = [];
  if (!discoveredAt) missing.push('when you discovered it');
  if (backdatedHours > MAX_BACKDATE_HOURS) {
    missing.push(`a discovery time within the last ${MAX_BACKDATE_HOURS} hours`);
  }
  if (backdatedHours > 24 && backdatedHours <= MAX_BACKDATE_HOURS && !backdateReason.trim()) {
    missing.push('why it is being reported late');
  }
  if (!location.trim()) missing.push('where you were');
  if (!modelId) missing.push('which device is in your truck');
  if (!code) missing.push('what went wrong');
  if (!description.trim()) missing.push('a description of what you saw');
  if (hinders === '') missing.push('whether it can still record your hours');

  async function submit(withSignature: boolean) {
    if (saving) return;
    setSaving(true);
    try {
      const signatureDataUrl = withSignature && sigRef.current && !sigRef.current.isEmpty()
        ? sigRef.current.getCanvas().toDataURL('image/png')
        : null;

      if (withSignature && !signatureDataUrl) {
        toast.error('Please sign the notice before submitting.');
        setSaving(false);
        return;
      }

      const nowIso = new Date().toISOString();
      // Carrier identity is snapshotted from the device cache. A malfunction is
      // reported precisely when things are going wrong, often with no signal,
      // so a live carrier read here would fail exactly when it matters.
      const carrier = await requireCachedCarrier();
      const { data: inserted, error } = await supabase
        .from('eld_malfunction_events')
        .insert({
          operator_id: operatorId,
          eld_device_id: device?.id ?? null,
          discovered_at: discoveredDate.toISOString(),
          discovered_location: location.trim(),
          malfunction_code: code,
          malfunction_description: description.trim(),
          hinders_hos_recording: hinders === 'yes',
          backdate_reason: backdateReason.trim() || null,
          repair_deadline: repairDeadline.toISOString().slice(0, 10),
          device_provider: selectedModel?.provider_name ?? null,
          device_make: selectedModel?.device_make ?? null,
          device_model: selectedModel?.device_model ?? null,
          device_serial: serial.trim() || null,
          eld_registration_id: selectedModel?.fmcsa_registration_id ?? null,
          ...malfunctionCarrierSnapshot(carrier),
          notice_generated_at: nowIso,
        })
        // is_demo is stamped by the insert trigger; read it back rather than
        // looking the operator up, so the notice and the row can never disagree.
        .select('id, is_demo')
        .single();

      if (error) throw error;
      const eventId = inserted.id as string;

      const pdfBlob = await renderMalfunctionNoticeBlob({
        driverName,
        driverId: operatorId,
        truckNumber: truckNumber || null,
        discoveredAtDisplay: `${discoveredDate.toLocaleString('en-US')} — ${carrierTimeZoneLabel(
          carrier.home_terminal_timezone,
          discoveredDate.toISOString().slice(0, 10),
        )}`,
        discoveredLocation: location.trim(),
        deviceProvider: selectedModel?.provider_name ?? null,
        deviceMake: selectedModel?.device_make ?? null,
        deviceModel: selectedModel?.device_model ?? null,
        deviceSerial: serial.trim() || null,
        eldRegistrationId: selectedModel?.fmcsa_registration_id ?? null,
        malfunctionCode: code,
        malfunctionCodeLabel: MALFUNCTION_CODE_LABEL[code] ?? 'Other',
        malfunctionDescription: description.trim(),
        hindersHosRecording: hinders === 'yes',
        repairDeadlineDisplay: repairDeadline.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        submittedAtDisplay: `${new Date().toLocaleString('en-US')} — ${carrierTimeZoneLabel(
          carrier.home_terminal_timezone,
          nowIso.slice(0, 10),
        )}`,
        carrierLegalName: carrier.legal_name,
        carrierUsdot: carrier.usdot_number,
        carrierMc: carrier.mc_number,
        carrierMainOfficeAddress: carrier.main_office_address,
        signatureDataUrl,
        isDemo: (inserted as { is_demo?: boolean }).is_demo === true,
      });

      savePendingNotice({
        eventId,
        operatorId,
        pdfBase64: await blobToBase64(pdfBlob),
        signatureBase64: signatureDataUrl ? signatureDataUrl.split(',')[1] : null,
        savedAt: nowIso,
      });

      const delivered = await flushPendingNotices();
      toast.success(
        delivered > 0
          ? 'Notice received by SUPERDRIVE — delivering to carrier'
          : 'Notice saved on this device — will send when you have signal',
      );
      onSubmitted();
    } catch (err) {
      console.error('[eld] submit failed', err);
      toast.error(err instanceof Error ? err.message : 'Could not file the malfunction report.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onCancel} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      </div>

      <div className="rounded-lg border p-4" style={{ borderColor: CLOCK_RED }}>
        <div className="flex items-center gap-2 font-semibold" style={{ color: CLOCK_RED }}>
          <AlertTriangle className="h-5 w-5" /> Report an ELD malfunction
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          This files the written notice your carrier must receive within 24 hours (49 CFR 395.34). It is one screen —
          fill it in, sign at the bottom and send.
        </p>
      </div>

      {/* When and where */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="eld-discovered">When did you discover it?</Label>
          <Input id="eld-discovered" type="datetime-local" value={discoveredAt} onChange={(e) => setDiscoveredAt(e.target.value)} className="text-base" />
          {backdatedHours > MAX_BACKDATE_HOURS && (
            <p className="text-xs" style={{ color: CLOCK_RED }}>
              You can only back-date up to {MAX_BACKDATE_HOURS} hours. Contact your onboarding staff for anything older.
            </p>
          )}
        </div>

        {backdatedHours > 24 && backdatedHours <= MAX_BACKDATE_HOURS && (
          <div className="space-y-2">
            <Label htmlFor="eld-backdate">Why is this being reported late?</Label>
            <Textarea id="eld-backdate" value={backdateReason} onChange={(e) => setBackdateReason(e.target.value)} className="text-base" rows={3} />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="eld-location">Where were you? (city and state)</Label>
          <Input id="eld-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Joplin, MO" className="text-base" />
        </div>
      </div>

      {/* The device */}
      <div className="space-y-4 rounded-lg border border-border p-3">
        <p className="text-xs text-muted-foreground">
          {device ? 'Confirm these details about the device in your truck.' : 'Tell us which device is in your truck.'}
        </p>
        <div className="space-y-2">
          <Label>Device</Label>
          <Select value={modelId} onValueChange={setModelId}>
            <SelectTrigger className="text-base"><SelectValue placeholder="Select your device" /></SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.provider_name} — {m.device_model}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="eld-serial">Serial number</Label>
            <Input id="eld-serial" value={serial} onChange={(e) => setSerial(e.target.value)} className="text-base" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="eld-truck">Truck / unit number</Label>
            <Input id="eld-truck" value={truckNumber} onChange={(e) => setTruckNumber(e.target.value)} className="text-base" />
          </div>
        </div>
      </div>

      {/* What happened */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>What went wrong?</Label>
          <div className="grid gap-2">
            {MALFUNCTION_CODES.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => setCode(c.code)}
                className={`rounded-lg border p-3 text-left transition ${code === c.code ? 'border-primary bg-primary/5' : 'border-border'}`}
              >
                <div className="text-sm font-semibold text-foreground">{c.code} — {c.label}</div>
                <div className="text-xs text-muted-foreground">{c.hint}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="eld-desc">Describe what you saw</Label>
          <Textarea id="eld-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="text-base" />
        </div>

        <div className="space-y-2">
          <Label>Can the device still record your hours accurately?</Label>
          <RadioGroup value={hinders} onValueChange={(v) => setHinders(v as 'yes' | 'no')} className="gap-2">
            <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
              <RadioGroupItem value="yes" id="hinders-yes" />
              No — I cannot rely on it (I will keep paper logs)
            </label>
            <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
              <RadioGroupItem value="no" id="hinders-no" />
              Yes — hours are still recording correctly
            </label>
          </RadioGroup>
        </div>
      </div>

      {/* What you are signing */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm space-y-2">
        <div className="font-semibold text-foreground">{cachedCarrier?.legal_name ?? '—'}</div>
        <div className="text-xs text-muted-foreground">
          USDOT {cachedCarrier?.usdot_number ?? '—'} · MC {cachedCarrier?.mc_number ?? '—'}
        </div>
        <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 pt-2 text-xs">
          <dt className="text-muted-foreground">Driver</dt><dd>{driverName}</dd>
          <dt className="text-muted-foreground">Truck</dt><dd>{truckNumber || '—'}</dd>
          <dt className="text-muted-foreground">Discovered</dt>
          <dd>{discoveredAt ? discoveredDate.toLocaleString() : '—'}</dd>
          <dt className="text-muted-foreground">Location</dt><dd>{location || '—'}</dd>
          <dt className="text-muted-foreground">Device</dt>
          <dd>{selectedModel ? `${selectedModel.provider_name} ${selectedModel.device_model}` : '—'}{serial ? ` · ${serial}` : ''}</dd>
          <dt className="text-muted-foreground">Malfunction</dt>
          <dd>{code ? `${code} — ${MALFUNCTION_CODE_LABEL[code]}` : '—'}</dd>
          <dt className="text-muted-foreground">Repair deadline</dt><dd>{repairDeadline.toLocaleDateString()}</dd>
        </dl>
        <p className="pt-2 text-xs text-muted-foreground">
          I am giving {cachedCarrier?.legal_name ?? 'my motor carrier'} written notice of this ELD malfunction
          within 24 hours of discovering it, as required by 49 CFR 395.34(a)(1).
        </p>
      </div>

      {!cachedCarrier && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          {CARRIER_CACHE_MISSING_MESSAGE}
        </p>
      )}

      <div className="space-y-2">
        <Label>Sign below</Label>
        <div ref={sigHostRef} className="rounded-lg border border-border bg-background">
          <SignatureCanvas
            ref={(r) => { sigRef.current = r; }}
            penColor="#0D0D0D"
            canvasProps={{ width: sigWidth, height: 144, className: 'rounded-lg touch-none' }}
          />
        </div>
        <button type="button" className="text-xs text-muted-foreground underline" onClick={() => sigRef.current?.clear()}>
          Clear signature
        </button>
      </div>

      <div className="space-y-2">
        <Button
          className="w-full"
          onClick={() => submit(true)}
          disabled={saving || !cachedCarrier || missing.length > 0}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit notice'}
        </Button>
        {missing.length > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            Still needed: {missing.join(', ')}.
          </p>
        )}
      </div>
    </div>
  );
}
