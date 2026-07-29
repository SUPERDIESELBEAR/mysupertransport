import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Upload } from 'lucide-react';
import { formatLogDate, isComplete, rodsChip, type RodsDay } from '@/lib/eld/rodsTypes';
import RodsDayEditor from './RodsDayEditor';
import UploadEldLogModal from './UploadEldLogModal';

/**
 * Reverse-chronological reconstruction of the current day plus the previous 7,
 * required by 49 CFR 395.34(a)(2) when the ELD fails.
 *
 * "Copy yesterday" is deliberately unavailable in here — see RodsDayEditor.
 */
export default function ReconstructionWizard({
  operatorId,
  driverName,
  dates,
  byDate,
  defaults,
  onExit,
  onChanged,
}: {
  operatorId: string;
  driverName: string;
  dates: string[];
  byDate: Map<string, RodsDay>;
  defaults?: Partial<RodsDay>;
  onExit: () => void;
  onChanged: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [uploadFor, setUploadFor] = useState<string | null>(null);

  const completeCount = useMemo(
    () => dates.filter((d) => isComplete(byDate.get(d))).length,
    [dates, byDate],
  );

  if (selected) {
    return (
      <RodsDayEditor
        operatorId={operatorId}
        driverName={driverName}
        logDate={selected}
        defaults={defaults}
        isReconstruction
        onBack={() => setSelected(null)}
        onChanged={onChanged}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onExit}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-foreground">Reconstruct your logs</h3>
          <p className="text-xs text-muted-foreground">
            Today plus the previous 7 days, most recent first.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Progress value={(completeCount / dates.length) * 100} />
        <p className="text-xs text-muted-foreground">{completeCount} of {dates.length} days complete</p>
      </div>

      <div className="space-y-2">
        {dates.map((d, idx) => {
          const day = byDate.get(d);
          const chip = rodsChip(day);
          return (
            <div key={d} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-3">
                <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: chip.color }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {idx === 0 ? 'Today' : formatLogDate(d)}
                  </div>
                  <div className="text-xs font-semibold" style={{ color: chip.color }}>{chip.label}</div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setSelected(d)}>
                  {chip.state === 'complete' ? 'View' : chip.state === 'in_progress' ? 'Continue' : 'Fill in this day'}
                </Button>
                {!day && (
                  <Button size="sm" variant="ghost" onClick={() => setUploadFor(d)}>
                    <Upload className="mr-2 h-4 w-4" /> Upload ELD log
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {uploadFor && (
        <UploadEldLogModal
          open
          onOpenChange={(v) => { if (!v) setUploadFor(null); }}
          operatorId={operatorId}
          logDate={uploadFor}
          onDone={() => { setUploadFor(null); onChanged(); }}
        />
      )}
    </div>
  );
}