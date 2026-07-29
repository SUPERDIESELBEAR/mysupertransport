import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { AlertTriangle, BookOpen, Loader2, Printer } from 'lucide-react';
import { CLOCK_RED, currentQuarterKey } from '@/lib/eld/constants';
import { renderDutyStatusGrid } from '@/lib/eld/renderDutyStatusGrid';
import { useEldMalfunction } from '@/hooks/useEldMalfunction';
import ELDMalfunctionWizard from './ELDMalfunctionWizard';
import ELDMalfunctionDashboard from './ELDMalfunctionDashboard';

export default function ELDMalfunctionView({
  operatorId,
  driverName,
  unitNumber,
}: {
  operatorId: string;
  driverName: string;
  unitNumber: string | null;
}) {
  const { activeEvent, loading, refresh } = useEldMalfunction(operatorId);
  const [reporting, setReporting] = useState(false);
  const [ackChecked, setAckChecked] = useState(false);
  const [ackSaving, setAckSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const quarterKey = currentQuarterKey();

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('blank_log_acknowledgments')
        .select('id')
        .eq('operator_id', operatorId)
        .eq('quarter_key', quarterKey)
        .limit(1);
      setAckChecked((data?.length ?? 0) > 0);
    })();
  }, [operatorId, quarterKey]);

  async function printBlankLogs() {
    setPrinting(true);
    try {
      const blob = await renderDutyStatusGrid({ pages: 8 });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setPrinting(false);
    }
  }

  async function acknowledgeSheets(next: boolean) {
    if (!next) return;
    setAckSaving(true);
    const { error } = await supabase
      .from('blank_log_acknowledgments')
      .upsert({ operator_id: operatorId, quarter_key: quarterKey, sheets_confirmed: true }, { onConflict: 'operator_id,quarter_key' });
    setAckSaving(false);
    if (error) { toast.error(error.message); return; }
    setAckChecked(true);
    toast.success('Thanks — logged for this quarter.');
  }

  if (loading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (reporting) {
    return (
      <ELDMalfunctionWizard
        operatorId={operatorId}
        driverName={driverName}
        unitNumber={unitNumber}
        onCancel={() => setReporting(false)}
        onSubmitted={() => { setReporting(false); void refresh(); }}
      />
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-6 w-6" style={{ color: CLOCK_RED }} />
        <div>
          <h2 className="text-lg font-bold text-foreground">ELD Malfunction</h2>
          <p className="text-sm text-muted-foreground">
            What to do when the logging device in your truck stops working
          </p>
        </div>
      </div>

      {activeEvent ? (
        <ELDMalfunctionDashboard event={activeEvent} onRefresh={refresh} />
      ) : (
        <>
          <div className="rounded-lg border border-border p-4 space-y-3">
            <p className="text-sm text-foreground">
              If your ELD malfunctions, federal rules give you 24 hours to give the carrier written notice, and the
              carrier 8 days to repair or replace it. Report it here and the notice is filed for you.
            </p>
            <Button onClick={() => setReporting(true)} className="w-full sm:w-auto">
              <AlertTriangle className="mr-2 h-4 w-4" /> Report a malfunction
            </Button>
          </div>

          <div className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Printer className="h-4 w-4" /> Blank log sheets
            </div>
            <p className="text-xs text-muted-foreground">
              Keep at least 8 days of blank paper log sheets in your truck at all times.
            </p>
            <Button variant="outline" size="sm" onClick={printBlankLogs} disabled={printing}>
              {printing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
              Print 8 blank sheets
            </Button>
            <label className="flex items-start gap-2 pt-2 text-xs text-foreground">
              <Checkbox checked={ackChecked} disabled={ackChecked || ackSaving} onCheckedChange={(v) => acknowledgeSheets(v === true)} />
              <span>
                I confirm I have at least 8 days of blank log sheets in my truck.
                {ackChecked && <span className="text-muted-foreground"> (Confirmed for {quarterKey})</span>}
              </span>
            </label>
          </div>

          <div className="rounded-lg border border-border p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <BookOpen className="h-4 w-4" /> What to do if your ELD fails
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
              <li>Note the date, time, and where you were when you noticed it.</li>
              <li>Report it here — this sends the written notice to the carrier within 24 hours.</li>
              <li>Start keeping paper logs immediately if hours are no longer recording.</li>
              <li>Reconstruct the current day plus the past 7 days on paper.</li>
              <li>Keep paper logs until the device is repaired or replaced.</li>
            </ol>
          </div>
        </>
      )}
    </div>
  );
}