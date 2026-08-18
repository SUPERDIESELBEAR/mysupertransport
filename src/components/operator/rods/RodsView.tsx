import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ClipboardList, Info, Printer } from 'lucide-react';
import { readCachedCarrier, rodsDayCarrierSnapshot, type CachedCarrier } from '@/lib/eld/carrierIdentity';
import { renderDutyStatusGrid } from '@/lib/eld/renderDutyStatusGrid';
import { useEldMalfunction } from '@/hooks/useEldMalfunction';
import { useIsDemoOperator } from '@/hooks/useIsDemoOperator';
import { useRodsDays } from '@/hooks/useRodsDays';
import { acknowledgeDivergence, openDivergenceDates } from '@/lib/eld/offline/divergence';
import { enqueueDivergenceAck } from '@/lib/eld/offline/queue/divergenceSync';
import { raiseSyncAlert } from '@/lib/eld/offline/queue/alerts';
import type { DraftSegment } from '@/hooks/useRodsDay';
import type { RodsDay, RodsEvent } from '@/lib/eld/rodsTypes';
import RodsDayStrip from './RodsDayStrip';
import RodsDayEditor from './RodsDayEditor';
import LogSyncBanner from './LogSyncBanner';
import { syncNoticeDates } from '@/lib/eld/offline/cache';

/**
 * Paper logs module. Only reachable while an ELD malfunction is open — outside
 * of that the driver's ELD is the record and nothing should be keyed here.
 */
export default function RodsView({
  operatorId,
  driverName,
  unitNumber,
  homeTerminalAddress,
}: {
  operatorId: string;
  driverName: string;
  unitNumber: string | null;
  homeTerminalAddress?: string | null;
}) {
  const { activeEvent, loading: eventLoading } = useEldMalfunction(operatorId);
  const isDemo = useIsDemoOperator(operatorId);
  const { dates, byDate, loading, refresh } = useRodsDays(operatorId);
  const [selected, setSelected] = useState<string | null>(null);
  const [prevSegments, setPrevSegments] = useState<DraftSegment[] | null>(null);
  const [carrier, setCarrier] = useState<CachedCarrier | null>(null);
  const [diverged, setDiverged] = useState<Set<string>>(new Set());
  const [pendingDismissDate, setPendingDismissDate] = useState<string | null>(null);
  /** Days signed on this device whose sync chain went terminal. */
  const [stalledDates, setStalledDates] = useState<string[]>([]);

  useEffect(() => {
    void openDivergenceDates().then(setDiverged);
  }, [loading]);

  useEffect(() => {
    void syncNoticeDates().then(setStalledDates);
  }, [loading]);

  const refreshStalled = async () => {
    setStalledDates(await syncNoticeDates());
    await refresh();
  };

  /**
   * A driver may clear the warning here. The dismissal is applied locally
   * first and queued to the office, so it works offline: until the queue
   * drains the local acknowledgement is authoritative and hydration will not
   * put the chip back.
   */
  async function confirmDismissDivergence() {
    if (!pendingDismissDate) return;
    const logDate = pendingDismissDate;
    const reason = `Driver ${driverName} cleared the divergence warning on the device.`;
    await acknowledgeDivergence(logDate, {
      source: 'driver',
      actor: driverName,
      reason,
    });
    void enqueueDivergenceAck({ operatorId, logDate, reason }).catch(() => undefined);
    void raiseSyncAlert({
      kind: 'certified_day_divergence',
      operator_id: operatorId,
      log_date: logDate,
      detail: `Driver ${driverName} cleared the divergence warning for ${logDate} on the device.`,
    });
    setPendingDismissDate(null);
    setDiverged(await openDivergenceDates());
  }

  // Carrier identity for new drafts comes from the device cache written at the
  // last authenticated load — never a live read, never a constant.
  useEffect(() => {
    void readCachedCarrier().then(setCarrier);
  }, []);

  const defaults = useMemo<Partial<RodsDay>>(() => ({
    ...(carrier ? rodsDayCarrierSnapshot(carrier) : {}),
    truck_number: unitNumber ?? null,
    // An operator-specific terminal wins over the carrier default when set.
    home_terminal_address: homeTerminalAddress ?? carrier?.home_terminal_address ?? null,
  }), [unitNumber, homeTerminalAddress, carrier]);

  // Segments from the day before the one being edited, for "Copy yesterday".
  useEffect(() => {
    void (async () => {
      if (!selected) { setPrevSegments(null); return; }
      const prevDate = new Date(`${selected}T12:00:00`);
      prevDate.setDate(prevDate.getDate() - 1);
      const iso = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;
      const prev = byDate.get(iso);
      if (!prev || prev.record_source !== 'keyed') { setPrevSegments(null); return; }
      const { data } = await supabase.from('rods_events').select('*').eq('rods_day_id', prev.id).order('start_minute');
      setPrevSegments(((data ?? []) as unknown as RodsEvent[]).map((e) => ({
        localId: e.id, start_minute: e.start_minute, end_minute: e.end_minute,
        duty_status: e.duty_status, city: e.city, state: e.state, remarks: e.remarks ?? '',
      })));
    })();
  }, [selected, byDate]);

  async function printBlankLogs() {
    const blob = await renderDutyStatusGrid({ pages: 8, isDemo });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  if (eventLoading || loading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (!activeEvent) {
    return (
      <div className="space-y-4 animate-fade-in">
        <h2 className="text-lg font-bold text-foreground">Paper Logs</h2>
        <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          Your ELD is working, so it is your record of duty status. Paper logs open up here automatically if you
          report a malfunction.
        </div>
        <Button variant="outline" onClick={printBlankLogs}>
          <Printer className="mr-2 h-4 w-4" /> Print 8 blank sheets
        </Button>
      </div>
    );
  }

  if (reconstructing) {
    return (
      <ReconstructionWizard
        operatorId={operatorId}
        driverName={driverName}
        dates={dates}
        byDate={byDate}
        defaults={defaults}
        onExit={() => { setReconstructing(false); void refresh(); }}
        onChanged={refresh}
      />
    );
  }

  if (selected) {
    return (
      <RodsDayEditor
        operatorId={operatorId}
        driverName={driverName}
        logDate={selected}
        defaults={defaults}
        previousDaySegments={prevSegments}
        onBack={() => { setSelected(null); void refresh(); }}
        onChanged={refresh}
      />
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <ClipboardList className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-lg font-bold text-foreground">Paper Logs</h2>
          <p className="text-sm text-muted-foreground">Your record of duty status while the ELD is down</p>
        </div>
      </div>

      {!reconstructionComplete && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertTriangle className="h-4 w-4" /> Reconstruction incomplete
          </div>
          <p className="text-xs text-muted-foreground">
            {dates.length - completeCount} of {dates.length} days still need a log — today plus the previous 7.
          </p>
          <Button size="sm" onClick={() => setReconstructing(true)}>Reconstruct my logs</Button>
        </div>
      )}

      {stalledDates.map((date) => (
        <LogSyncBanner
          key={date}
          operatorId={operatorId}
          logDate={date}
          compact
          showDate
          onUnlocked={() => { void refreshStalled(); }}
        />
      ))}

      <RodsDayStrip
        dates={dates}
        byDate={byDate}
        onSelect={setSelected}
        divergedDates={diverged}
        onDismissDivergence={(d) => setPendingDismissDate(d)}
      />

      <Button variant="outline" onClick={printBlankLogs}>
        <Printer className="mr-2 h-4 w-4" /> Print 8 blank sheets
      </Button>

      <p className="text-[11px] text-muted-foreground">
        SUPERDRIVE keeps these records the way a paper log book does. It does not track your location, does not
        calculate hours of service, and does not check any limit for you.
      </p>

      <AlertDialog open={!!pendingDismissDate} onOpenChange={(open) => { if (!open) setPendingDismissDate(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear this warning?</AlertDialogTitle>
            <AlertDialogDescription>
              This only clears the warning on this device. Other devices will still show it, and this does not resolve
              the mismatch — the office copy of this log still differs from the one on this phone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDismissDate(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void confirmDismissDivergence(); }}>Clear on this device</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}