import { useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ArrowLeft, Camera, FileText, Loader2, Lock, PencilLine, Save } from 'lucide-react';
import { formatMinutes, MINUTES_PER_DAY, STATUS_SHORT } from '@/lib/eld/rodsGridGeometry';
import { renderRodsDay } from '@/lib/eld/renderRodsDay';
import { isShortPeriod, validateRodsDay } from '@/lib/eld/rodsValidation';
import {
  RODS_BUCKET, formatLogDate, rodsChip, showsDerivedTotals, type RodsDay,
} from '@/lib/eld/rodsTypes';
import {
  isHandledFlushError, LOCAL_CERTIFIED_MESSAGE, useRodsDay, type DraftSegment,
} from '@/hooks/useRodsDay';
import { buildAmendmentDraft } from '@/lib/eld/buildAmendmentDraft';
import { diffAmendment, type AmendmentChange } from '@/lib/eld/amendmentDiff';
import { assertPersistedMatches, isPreflightMismatch } from '@/lib/eld/certifyPreflight';
import { assertRowsAffected, isRowNotWritable, markDayStale } from '@/lib/eld/rodsWrite';
import { commitCertification } from '@/lib/eld/offline/commitCertification';
import { getCachedDay } from '@/lib/eld/offline/cache';
import {
  validateSignatureImage, SIGNATURE_INVALID_MESSAGE,
} from '@/lib/eld/signatureIntegrity';
import RodsGrid from './RodsGrid';
import TapLogEntry from './TapLogEntry';
import CertifyDayModal from './CertifyDayModal';
import CertifyMismatchDialog from './CertifyMismatchDialog';
import LogSyncBanner from './LogSyncBanner';
import CorrectionRequestBanner from './CorrectionRequestBanner';
import BolPhotoCard from './BolPhotoCard';
import type { TownOption } from './LocationPicker';

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
    day, segments, setSegments, loading, saving, reload, localCertifiedAt, syncState,
    patchHeader, flushPendingHeader, saveSegments,
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

  const chip = rodsChip({
    ...day,
    local_certified_at: localCertifiedAt,
    sync_rejected: syncState.sync_rejected,
    sync_stalled: syncState.sync_stalled,
  });
  const locked = day.locked || !!localCertifiedAt;
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
      if ((await flushPendingHeader()) === 'locked') { toast.error(LOCAL_CERTIFIED_MESSAGE); return; }
      const ok = await saveSegments(segments);
      if (!ok) return;
      const totals = validation!.totals;
      // Totals go through the same single writer as every other header field.
      // A direct row update here would be a second writer racing the queue.
      patchHeader({
        total_off_duty_minutes: totals.off,
        total_sleeper_minutes: totals.sleeper,
        total_driving_minutes: totals.driving,
        total_on_duty_minutes: totals.onDuty,
      });
      await flushPendingHeader();
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
      // Header edits still inside the debounce window have to be committed
      // before anything else: the change record below is computed from what is
      // on screen, and the day locks the instant this commits.
      if ((await flushPendingHeader()) === 'locked') { toast.error(LOCAL_CERTIFIED_MESSAGE); return; }
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
      let originalCertifiedAt: string | null = null;
      let originalDay: RodsDay | null = null;
      let originalEvents: Array<Record<string, unknown>> = [];
      if (day!.supersedes_day_id) {
        const { data: orig } = await supabase
          .from('rods_days').select('*').eq('id', day!.supersedes_day_id).maybeSingle();
        originalDay = (orig as RodsDay | null) ?? null;
        if (!originalDay) {
          throw new Error(
            'The original log this correction replaces could not be read. '
            + 'Corrections need a connection so the record of what changed is accurate.',
          );
        }
        originalCertifiedAt = originalDay?.certified_at ?? null;
        const { data: origEvents } = await supabase
          .from('rods_events').select('*').eq('rods_day_id', day!.supersedes_day_id);
        originalEvents = (origEvents ?? []) as Array<Record<string, unknown>>;

        // The reason rides with the draft through the same single writer, so
        // it is part of the row the queue replays before the certification.
        patchHeader({ amendment_reason: amendmentReason.trim() });
        await flushPendingHeader();
      }

      // Resolved ONCE, after the reason flush, and used everywhere below.
      // `day` is the render-time value: it predates the flush, so from here on
      // it is stale for any field the flush wrote (the amendment reason above).
      // commitCertification no longer takes a day at all — it reads this same
      // cache row itself — so these two uses are the only ones left.
      const certifiedDay = (await getCachedDay(logDate))?.day ?? day!;

      const signedEvents = segments.map((s) => ({
        id: s.localId, rods_day_id: certifiedDay.id,
        start_minute: s.start_minute, end_minute: s.end_minute,
        duty_status: s.duty_status, city: s.city, state: s.state,
        remarks: s.remarks || null,
        is_short_period: isShortPeriod(s.start_minute, s.end_minute),
      }));

      // The signature is checked ONCE, here, before anything is rendered or
      // written. renderRodsDay embeds whatever it is given and quietly draws a
      // blank signature line for bytes it cannot use — a §395.8 record that
      // looks certified and isn't. commitCertification re-checks this result
      // by digest, so the pixel pass does not run twice.
      const signatureValidation = await validateSignatureImage(signatureDataUrl);
      if (!signatureValidation.ok) {
        toast.error(SIGNATURE_INVALID_MESSAGE);
        return;
      }

      // ORDERING, load-bearing: the render must precede the byte write in
      // commitCertification. Playwright case (k) proved five malformed
      // signatures left zero orphan rows in IndexedDB precisely because a
      // render failure throws before the transaction opens. Moving the render
      // after the write re-creates the orphaned-bytes defect it was guarding.
      const pdf = await renderRodsDay({
        day: {
          ...certifiedDay,
          certification_legal_name: legalName,
          certified_at: new Date().toISOString(),
        },
        events: signedEvents,
        driverName,
        originalCertifiedAt,
        signatureDataUrl,
      });
      const pdfPath = `${operatorId}/${logDate}/log-${stamp}.pdf`;

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
              day: certifiedDay,
              events: segments.map((s) => ({
                start_minute: s.start_minute, end_minute: s.end_minute,
                duty_status: s.duty_status, city: s.city, state: s.state,
                remarks: s.remarks || null,
              })) as never,
            },
          )
        : [];

      // One transaction: bytes, local lock, queue chain, roadside manifest.
      // Nothing here needs a signal — the queue carries it to the office when
      // there is one, and the officer-facing packet is true immediately.
      await commitCertification({
        operatorId,
        logDate,
        events: signedEvents as never,
        legalName,
        signatureDataUrl,
        signatureValidation,
        pdfBytes: await pdf.arrayBuffer(),
        signaturePath: sigPath,
        pdfPath,
        deviceInfo: navigator.userAgent.slice(0, 240),
        // One token per signing attempt, so a replay is a server-side no-op.
        token: (certifyToken.current ??= crypto.randomUUID()),
        changes,
      });
      // The queue is the sole writer. Online and offline are the same path;
      // they differ only in how fast the queue drains. The chip will read
      // "Signed on this device, syncing" until the office confirms it.
      toast.success('Log signed and locked on this device. It will reach the office when you have a signal.');
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

  /**
   * Mismatch resolution. Neither branch certifies anything and neither one
   * silently picks a winner: the driver saves again, or takes the office copy
   * and loses the listed edits knowingly.
   */
  async function retrySave() {
    setMismatch(null);
    await save();
  }

  async function useSavedVersion() {
    setMismatch(null);
    await markDayStale(logDate);
    await reload();
    toast.info('Reloaded the saved version of this log. Check it over before you certify.');
  }

  async function amend() {
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

      <LogSyncBanner
        operatorId={operatorId}
        logDate={logDate}
        onUnlocked={() => { void reload(); onChanged(); }}
      />

      <CorrectionRequestBanner
        operatorId={operatorId}
        logDate={logDate}
        canAmend={locked && !isDocument}
        onAmend={() => { void amend(); }}
        onChanged={onChanged}
      />

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