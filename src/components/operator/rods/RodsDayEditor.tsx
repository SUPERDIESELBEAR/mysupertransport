import { useMemo, useRef, useState } from 'react';
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
import { isHandledFlushError, newLocalId, useRodsDay, type DraftSegment } from '@/hooks/useRodsDay';
import { buildAmendmentDraft } from '@/lib/eld/buildAmendmentDraft';
import { diffAmendment, type AmendmentChange } from '@/lib/eld/amendmentDiff';
import { assertPersistedMatches, isPreflightMismatch } from '@/lib/eld/certifyPreflight';
import { assertRowsAffected, isRowNotWritable, markDayStale } from '@/lib/eld/rodsWrite';
import RodsGrid from './RodsGrid';
import DutyStatusTimeline from './DutyStatusTimeline';
import CertifyDayModal from './CertifyDayModal';
import CertifyMismatchDialog from './CertifyMismatchDialog';
import UploadEldLogModal from './UploadEldLogModal';

const OFFLINE_SAVE_MESSAGE =
  'You are offline, so these edits have not reached the office copy yet. '
  + 'They are still here — save again once you have a signal.';

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
    day, segments, setSegments, loading, saving, reload, patchHeader, flushPendingHeader, saveSegments,
  } = useRodsDay({ operatorId, logDate, defaults, autoCreate: true, isReconstruction });

  const [activeLocalId, setActiveLocalId] = useState<string | null>(null);
  const [legalName, setLegalName] = useState(driverName);
  const [certifyOpen, setCertifyOpen] = useState(false);
  const [amendmentReason, setAmendmentReason] = useState('');
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mismatch, setMismatch] = useState<AmendmentChange[] | null>(null);
  /**
   * One token per certification attempt, held across retries. Regenerating it
   * on a retry turns a timed-out-but-committed certification into a P0014 the
   * driver cannot get past; the same token replays as a server-side no-op.
   */
  const certifyToken = useRef<string | null>(null);

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
    try {
      if ((await flushPendingHeader()) === 'offline') { toast.error(OFFLINE_SAVE_MESSAGE); return; }
      const ok = await saveSegments(segments);
      const totals = validation!.totals;
      if (!ok) return;
      const res = await supabase.from('rods_days').update({
        total_off_duty_minutes: totals.off,
        total_sleeper_minutes: totals.sleeper,
        total_driving_minutes: totals.driving,
        total_on_duty_minutes: totals.onDuty,
      }).eq('id', day!.id).select('id');
      assertRowsAffected(res, {
        table: 'rods_days', operation: 'totals update', dayId: day!.id, logDate,
      });
      toast.success('Saved.');
      onChanged();
    } catch (err) {
      if (isHandledFlushError(err)) {
        // The hook has already told the driver and re-pulled the row.
      } else if (isRowNotWritable(err)) {
        await markDayStale(logDate);
        toast.error(err.message);
        await reload();
      } else {
        toast.error(err instanceof Error ? err.message : 'Could not save this log.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function certify(signatureDataUrl: string) {
    setBusy(true);
    try {
      // Header edits still inside the debounce window have to reach the row
      // before anything else: the change record below is computed from what is
      // on screen, and the row locks the instant certify_rods_day returns.
      if ((await flushPendingHeader()) === 'offline') {
        toast.error('You are offline. This log cannot be certified until your edits reach the office copy.');
        return;
      }
      const saved = await saveSegments(segments);
      if (!saved) return;

      // Structural guard. Everything past this point locks the row, so the last
      // thing we do before signing is re-read what is actually persisted and
      // prove it matches the screen. A dropped write is otherwise silent.
      await assertPersistedMatches({
        dayId: day!.id,
        logDate,
        onScreen: {
          day: day!,
          events: segments.map((s) => ({
            start_minute: s.start_minute, end_minute: s.end_minute,
            duty_status: s.duty_status, city: s.city, state: s.state,
            remarks: s.remarks || null,
          })) as never,
        },
      });

      const stamp = Date.now();
      const sigPath = `${operatorId}/${logDate}/signature-${stamp}.png`;
      const sigBlob = await (await fetch(signatureDataUrl)).blob();
      const { error: sigErr } = await supabase.storage
        .from(RODS_BUCKET).upload(sigPath, sigBlob, { upsert: true, contentType: 'image/png' });
      if (sigErr) throw new Error(sigErr.message);

      let originalCertifiedAt: string | null = null;
      let originalDay: RodsDay | null = null;
      let originalEvents: Array<Record<string, unknown>> = [];
      if (day!.supersedes_day_id) {
        const { data: orig } = await supabase
          .from('rods_days').select('*').eq('id', day!.supersedes_day_id).maybeSingle();
        originalDay = (orig as RodsDay | null) ?? null;
        originalCertifiedAt = originalDay?.certified_at ?? null;
        const { data: origEvents } = await supabase
          .from('rods_events').select('*').eq('rods_day_id', day!.supersedes_day_id);
        originalEvents = (origEvents ?? []) as Array<Record<string, unknown>>;

        // The reason has to land on the row before certification, because the
        // row is locked the instant certify_rods_day returns.
        const reasoned = await supabase.from('rods_days')
          .update({ amendment_reason: amendmentReason.trim() })
          .eq('id', day!.id).select('id');
        assertRowsAffected(reasoned, {
          table: 'rods_days', operation: 'amendment reason', dayId: day!.id, logDate,
        });
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

      // Carrier policy: a correction carries a field-level record of what
      // changed. Computed BEFORE the RPC and passed into it, so the change
      // rows land in the same transaction as the certification. Filing them
      // afterwards left a window — one the offline queue hit every time —
      // where a log could be certified, locked and permanently without a
      // change record.
      const changes = originalDay
        ? diffAmendment(
            { day: originalDay, events: originalEvents as never },
            {
              day: { ...day!, amendment_reason: amendmentReason.trim() },
              events: segments.map((s) => ({
                start_minute: s.start_minute, end_minute: s.end_minute,
                duty_status: s.duty_status, city: s.city, state: s.state,
                remarks: s.remarks || null,
              })) as never,
            },
          )
        : [];

      const { error } = await supabase.rpc('certify_rods_day', {
        _day_id: day!.id,
        _legal_name: legalName.trim(),
        _signature_path: sigPath,
        _pdf_path: pdfPath,
        _device_info: navigator.userAgent.slice(0, 240),
        // Every certification carries a token, online path included, so a
        // retry can never double-apply. The server returns the existing row
        // as a no-op when the same token replays.
        p_certification_token: (certifyToken.current ??= crypto.randomUUID()),
        p_changes: changes as never,
      });
      if (error) throw new Error(error.message);

      toast.success('Log certified.');
      certifyToken.current = null;
      setCertifyOpen(false);
      onChanged();
      await reload();
    } catch (err) {
      if (isPreflightMismatch(err)) {
        setCertifyOpen(false);
        setMismatch(err.differences);
      } else if (!isHandledFlushError(err)) {
        toast.error(err instanceof Error ? err.message : 'Could not certify this log.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function amend() {
    setBusy(true);
    // Copy the whole row, reset only what must differ. See buildAmendmentDraft:
    setBusy(true);
    // Copy the whole row, reset only what must differ. See buildAmendmentDraft:
    // enumerating what to copy is what made amendments lose newly added header
    // columns and become uncertifiable.
    const { data, error } = await supabase.from('rods_days')
      .insert(buildAmendmentDraft(day!) as never).select('id').single();
    if (error || !data) { setBusy(false); toast.error(error?.message ?? 'Could not start the amendment.'); return; }

    // Clone the segments into the draft. The original stays certified until the
    // amendment itself is certified — supersession happens then, not now.
    const { data: evs } = await supabase.from('rods_events').select('*').eq('rods_day_id', day!.id);
    const rows = (evs ?? []) as Array<Record<string, unknown>>;
    if (rows.length) {
      const cloned = await supabase.from('rods_events').insert(rows.map((r) => ({
        rods_day_id: (data as { id: string }).id,
        start_minute: r.start_minute, end_minute: r.end_minute, duty_status: r.duty_status,
        city: r.city, state: r.state, remarks: r.remarks, is_short_period: r.is_short_period,
      })) as never).select('id');
      try {
        assertRowsAffected(cloned, {
          table: 'rods_events', operation: 'amendment segment clone',
          dayId: (data as { id: string }).id, logDate,
        });
      } catch (err) {
        setBusy(false);
        toast.error(err instanceof Error ? err.message : 'Could not copy the entries.');
        await reload();
        return;
      }
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
          amendmentReason={amendmentReason}
          onAmendmentReasonChange={setAmendmentReason}
          onConfirm={certify}
          busy={busy}
        />
      )}

      {!!mismatch && (
        <CertifyMismatchDialog
          open
          onOpenChange={(v) => { if (!v) setMismatch(null); }}
          differences={mismatch}
          busy={busy || saving}
          onRetry={retrySave}
          onUseSaved={useSavedVersion}
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