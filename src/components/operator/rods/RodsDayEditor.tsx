import { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ArrowLeft, Copy, FileText, Loader2, Lock, PencilLine, Save, Upload } from 'lucide-react';
import { formatMinutes, MINUTES_PER_DAY, STATUS_SHORT } from '@/lib/eld/rodsGridGeometry';
import { renderRodsDay } from '@/lib/eld/renderRodsDay';
import { isShortPeriod, validateRodsDay } from '@/lib/eld/rodsValidation';
import {
  RODS_BUCKET, formatLogDate, rodsChip, showsDerivedTotals, type RodsDay,
} from '@/lib/eld/rodsTypes';
import { newLocalId, useRodsDay, type DraftSegment } from '@/hooks/useRodsDay';
import RodsGrid from './RodsGrid';
import DutyStatusTimeline from './DutyStatusTimeline';
import CertifyDayModal from './CertifyDayModal';
import UploadEldLogModal from './UploadEldLogModal';

export default function RodsDayEditor({
  operatorId,
  driverName,
  logDate,
  defaults,
  isReconstruction,
  previousDaySegments,
  onBack,
  onChanged,
}: {
  operatorId: string;
  driverName: string;
  logDate: string;
  defaults?: Partial<RodsDay>;
  isReconstruction?: boolean;
  /** Segments from the day before, for "Copy yesterday" outside reconstruction. */
  previousDaySegments?: DraftSegment[] | null;
  onBack: () => void;
  onChanged: () => void;
}) {
  const {
    day, segments, setSegments, loading, saving, reload, patchHeader, saveSegments,
  } = useRodsDay({ operatorId, logDate, defaults, autoCreate: true, isReconstruction });

  const [activeLocalId, setActiveLocalId] = useState<string | null>(null);
  const [legalName, setLegalName] = useState(driverName);
  const [certifyOpen, setCertifyOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const validation = useMemo(
    () => (day
      ? validateRodsDay(
        day,
        segments.map((s) => ({
          ...s,
          id: s.localId,
          rods_day_id: day.id,
          is_short_period: isShortPeriod(s.start_minute, s.end_minute),
        })) as never,
        legalName,
      )
      : null),
    [day, segments, legalName],
  );

  if (loading || !day || !validation) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>;
  }

  const chip = rodsChip(day);
  const locked = day.locked;
  const isDocument = day.record_source === 'eld_document';

  function copyYesterday() {
    // Deliberately unavailable inside the reconstruction wizard — copying one
    // day across seven and certifying is fabrication of a federal record.
    if (isReconstruction || !previousDaySegments?.length) return;
    setSegments(previousDaySegments.map((s) => ({
      localId: newLocalId(),
      start_minute: s.start_minute,
      end_minute: s.end_minute,
      duty_status: s.duty_status,
      // Boundaries and statuses only. Everything place-specific is cleared so
      // the driver has to enter it for this day.
      city: '', state: '', remarks: '',
    })));
    patchHeader({
      from_location: null, to_location: null, shipping_document_no: null,
      total_miles_driving_today: null, total_mileage_today: null,
    });
    toast.info('Times copied. Enter the locations, miles and remarks for this day.');
  }

  async function save() {
    setBusy(true);
    const ok = await saveSegments(segments);
    const totals = validation!.totals;
    if (ok) {
      await supabase.from('rods_days').update({
        total_off_duty_minutes: totals.off,
        total_sleeper_minutes: totals.sleeper,
        total_driving_minutes: totals.driving,
        total_on_duty_minutes: totals.onDuty,
      }).eq('id', day!.id);
      toast.success('Saved.');
      onChanged();
    }
    setBusy(false);
  }

  async function certify(signatureDataUrl: string) {
    setBusy(true);
    try {
      const saved = await saveSegments(segments);
      if (!saved) return;

      const stamp = Date.now();
      const sigPath = `${operatorId}/${logDate}/signature-${stamp}.png`;
      const sigBlob = await (await fetch(signatureDataUrl)).blob();
      const { error: sigErr } = await supabase.storage
        .from(RODS_BUCKET).upload(sigPath, sigBlob, { upsert: true, contentType: 'image/png' });
      if (sigErr) throw new Error(sigErr.message);

      let originalCertifiedAt: string | null = null;
      if (day!.supersedes_day_id) {
        const { data: orig } = await supabase
          .from('rods_days').select('certified_at').eq('id', day!.supersedes_day_id).maybeSingle();
        originalCertifiedAt = (orig as { certified_at: string | null } | null)?.certified_at ?? null;
      }

      const pdf = await renderRodsDay({
        day: { ...day!, certification_legal_name: legalName, certified_at: new Date().toISOString() },
        events: segments.map((s) => ({
          id: s.localId, rods_day_id: day!.id,
          start_minute: s.start_minute, end_minute: s.end_minute,
          duty_status: s.duty_status, city: s.city, state: s.state,
          remarks: s.remarks || null,
          is_short_period: isShortPeriod(s.start_minute, s.end_minute),
        })),
        driverName,
        originalCertifiedAt,
        signatureDataUrl,
      });
      const pdfPath = `${operatorId}/${logDate}/log-${stamp}.pdf`;
      const { error: pdfErr } = await supabase.storage
        .from(RODS_BUCKET).upload(pdfPath, pdf, { upsert: true, contentType: 'application/pdf' });
      if (pdfErr) throw new Error(pdfErr.message);

      const { error } = await supabase.rpc('certify_rods_day', {
        _day_id: day!.id,
        _legal_name: legalName.trim(),
        _signature_path: sigPath,
        _pdf_path: pdfPath,
        _device_info: navigator.userAgent.slice(0, 240),
      });
      if (error) throw new Error(error.message);

      toast.success('Log certified.');
      setCertifyOpen(false);
      onChanged();
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not certify this log.');
    } finally {
      setBusy(false);
    }
  }

  async function amend() {
    setBusy(true);
    const { data, error } = await supabase.from('rods_days').insert({
      operator_id: operatorId,
      log_date: logDate,
      record_source: 'keyed',
      status: 'draft',
      supersedes_day_id: day!.id,
      is_reconstructed: day!.is_reconstructed,
      carrier_name: day!.carrier_name, carrier_usdot: day!.carrier_usdot, carrier_mc: day!.carrier_mc,
      home_terminal_address: day!.home_terminal_address,
      truck_number: day!.truck_number, trailer_numbers: day!.trailer_numbers,
      co_driver_name: day!.co_driver_name, shipping_document_no: day!.shipping_document_no,
      from_location: day!.from_location, to_location: day!.to_location,
      total_miles_driving_today: day!.total_miles_driving_today,
      total_mileage_today: day!.total_mileage_today,
    } as never).select('id').single();
    if (error || !data) { setBusy(false); toast.error(error?.message ?? 'Could not start the amendment.'); return; }

    // Clone the segments into the draft. The original stays certified until the
    // amendment itself is certified — supersession happens then, not now.
    const { data: evs } = await supabase.from('rods_events').select('*').eq('rods_day_id', day!.id);
    const rows = (evs ?? []) as Array<Record<string, unknown>>;
    if (rows.length) {
      await supabase.from('rods_events').insert(rows.map((r) => ({
        rods_day_id: (data as { id: string }).id,
        start_minute: r.start_minute, end_minute: r.end_minute, duty_status: r.duty_status,
        city: r.city, state: r.state, remarks: r.remarks, is_short_period: r.is_short_period,
      })) as never);
    }
    setBusy(false);
    toast.success('Amendment started. The original log stays certified until you certify this one.');
    onChanged();
    await reload();
  }

  async function discardAmendment() {
    setBusy(true);
    const { error } = await supabase.rpc('discard_rods_amendment', { _day_id: day!.id });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Amendment discarded. The original log is untouched.');
    onChanged();
    onBack();
  }

  async function openFile(path: string | null) {
    if (!path) return;
    const { data } = await supabase.storage.from(RODS_BUCKET).createSignedUrl(path, 600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
  }

  const remaining = MINUTES_PER_DAY - validation.totalMinutes;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold text-foreground">{formatLogDate(logDate)}</h3>
          <span className="text-xs font-semibold" style={{ color: chip.color }}>{chip.label}</span>
        </div>
        {locked && <Lock className="h-4 w-4 text-muted-foreground" />}
      </div>

      {day.supersedes_day_id && day.status === 'draft' && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-foreground">
          This is an amendment. The original log stays certified and on file. Certifying this one replaces it going
          forward; discarding leaves the original untouched.
        </div>
      )}

      {isDocument ? (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <p className="text-sm text-foreground">
            This day is covered by a log produced by your ELD. It was certified on the device, so there is nothing to
            key in or sign here.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => openFile(day.source_document_path)}>
              <FileText className="mr-2 h-4 w-4" /> Open document
            </Button>
            <Button variant="outline" size="sm" onClick={() => setReplaceOpen(true)}>
              <Upload className="mr-2 h-4 w-4" /> Replace document
            </Button>
          </div>
        </div>
      ) : (
        <>
          <RodsGrid
            segments={segments}
            activeLocalId={activeLocalId}
            showGaps={validation.incompleteIds.length === 0 && segments.length > 0}
          />

          {validation.gaps.length > 0 && (
            <p className="rounded-lg bg-destructive/10 p-2 text-center text-xs text-destructive">
              {validation.gaps.length === 1 ? 'One stretch of the day has no entry.' : `${validation.gaps.length} stretches of the day have no entry.`}
              {' '}Add an entry for each — SUPERDRIVE will not fill them in.
            </p>
          )}

          {showsDerivedTotals(day) && (
            <div className="grid grid-cols-4 gap-2 text-center">
              {([validation.totals.off, validation.totals.sleeper, validation.totals.driving, validation.totals.onDuty]).map((m, i) => (
                <div key={STATUS_SHORT[i]} className="rounded-lg border border-border p-2">
                  <div className="text-[10px] text-muted-foreground">{STATUS_SHORT[i]}</div>
                  <div className="text-sm font-bold text-foreground">{formatMinutes(m)}</div>
                </div>
              ))}
            </div>
          )}
          <p className={`text-center text-xs ${remaining === 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
            {remaining === 0
              ? 'The full 24 hours is accounted for.'
              : `${formatMinutes(validation.totalMinutes)} of 24:00 accounted for.`}
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Truck / tractor number</Label>
              <Input className="text-base" disabled={locked} value={day.truck_number ?? ''}
                onChange={(e) => patchHeader({ truck_number: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Trailer number(s)</Label>
              <Input className="text-base" disabled={locked} value={day.trailer_numbers ?? ''}
                onChange={(e) => patchHeader({ trailer_numbers: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input className="text-base" disabled={locked} value={day.from_location ?? ''}
                onChange={(e) => patchHeader({ from_location: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input className="text-base" disabled={locked} value={day.to_location ?? ''}
                onChange={(e) => patchHeader({ to_location: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Home terminal address</Label>
              <Input className="text-base" disabled={locked} value={day.home_terminal_address ?? ''}
                onChange={(e) => patchHeader({ home_terminal_address: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Shipping document no.</Label>
              <Input className="text-base" disabled={locked} value={day.shipping_document_no ?? ''}
                onChange={(e) => patchHeader({ shipping_document_no: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Total miles driving today</Label>
              <Input type="number" inputMode="numeric" className="text-base" disabled={locked}
                value={day.total_miles_driving_today ?? ''}
                onChange={(e) => patchHeader({ total_miles_driving_today: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Co-driver</Label>
              <Input className="text-base" disabled={locked} value={day.co_driver_name ?? ''}
                onChange={(e) => patchHeader({ co_driver_name: e.target.value })} />
            </div>
          </div>

          <DutyStatusTimeline
            segments={segments}
            onChange={setSegments}
            disabled={locked}
            activeLocalId={activeLocalId}
            onFocusSegment={setActiveLocalId}
          />

          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="text-xs font-semibold text-foreground">RECAP — hours worked</div>
            <p className="text-[11px] text-muted-foreground">
              Enter these yourself. SUPERDRIVE does not calculate hours of service or check any limit.
            </p>
            {([
              ['recap_on_duty_today', 'A. On duty today (lines 3 + 4)'],
              ['recap_last_7_days', 'B. On duty last 7 days including today'],
              ['recap_available_tomorrow', 'C. Available tomorrow (70 hr / 8 day)'],
              ['recap_last_8_days', 'D. On duty last 8 days including today'],
            ] as Array<[keyof RodsDay, string]>).map(([key, label]) => (
              <div key={key} className="grid grid-cols-[1fr_84px] items-center gap-2">
                <Label className="text-[11px]">{label}</Label>
                <Input className="text-base" disabled={locked} placeholder="0:00"
                  value={(day[key] as string | null) ?? ''}
                  onChange={(e) => patchHeader({ [key]: e.target.value } as Partial<RodsDay>)} />
              </div>
            ))}
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        {!locked && !isDocument && (
          <>
            <Button variant="outline" onClick={save} disabled={busy || saving}>
              {busy || saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save draft
            </Button>
            {!isReconstruction && !!previousDaySegments?.length && (
              <Button variant="outline" onClick={copyYesterday} disabled={busy}>
                <Copy className="mr-2 h-4 w-4" /> Copy yesterday's times
              </Button>
            )}
            <Button onClick={() => setCertifyOpen(true)} disabled={busy}>Certify</Button>
          </>
        )}
        {day.supersedes_day_id && day.status === 'draft' && (
          <Button variant="ghost" className="text-destructive" onClick={discardAmendment} disabled={busy}>
            Discard amendment
          </Button>
        )}
        {locked && !isDocument && (
          <>
            <Button variant="outline" onClick={() => openFile(day.pdf_path)} disabled={!day.pdf_path}>
              <FileText className="mr-2 h-4 w-4" /> Open certified log
            </Button>
            <Button variant="outline" onClick={amend} disabled={busy}>
              <PencilLine className="mr-2 h-4 w-4" /> Amend this log
            </Button>
          </>
        )}
      </div>

      {certifyOpen && (
        <CertifyDayModal
          open={certifyOpen}
          onOpenChange={setCertifyOpen}
          day={day}
          validation={validation}
          legalName={legalName}
          onLegalNameChange={setLegalName}
          onConfirm={certify}
          busy={busy}
        />
      )}

      <UploadEldLogModal
        open={replaceOpen}
        onOpenChange={setReplaceOpen}
        operatorId={operatorId}
        logDate={logDate}
        existing={day}
        onDone={() => { onChanged(); void reload(); }}
      />
    </div>
  );
}