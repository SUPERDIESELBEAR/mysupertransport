import { useState } from 'react';
import { Clock, MapPin, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getDbErrorMessage, logDbError } from '@/lib/dbError';
import {
  CHECK_IN_OFFSETS, bestEffortCoords, formatCheckInTime, fromCarrierNaive,
  minutesAgoIso, recordStopTime, toCarrierNaive, type StopTimeKind,
} from '@/lib/stopCheckIn';

/**
 * Arrival and departure, as the driver records them.
 *
 * Two independent actions per stop, in any order. There is no wizard and no
 * sequence: departure without a prior arrival is allowed, because sometimes
 * that is simply what happened.
 */

export interface CheckInStop {
  id: string;
  stop_sequence: number | null;
  stop_type: string | null;
  facility_name: string | null;
  city: string | null;
  state: string | null;
  actual_arrival_at: string | null;
  actual_departure_at: string | null;
  arrival_source?: string | null;
  departure_source?: string | null;
}

const OFFSET_LABEL = (m: number) => (m === 0 ? 'Just now' : `${m} minutes ago`);

function TimeSheet({
  open, kind, existing, onClose, onSave,
}: {
  open: boolean;
  kind: StopTimeKind;
  existing: string | null;
  onClose: () => void;
  onSave: (iso: string) => Promise<void>;
}) {
  const [manual, setManual] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verb = kind === 'arrival' ? 'arrive' : 'leave';

  const commit = async (iso: string) => {
    setSaving(true);
    setError(null);
    try {
      await onSave(iso);
      setManual('');
      onClose();
    } catch (err) {
      setError(getDbErrorMessage(err, 'That could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !saving) { setManual(''); setError(null); onClose(); } }}>
      <DialogContent className="max-w-sm max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">When did you {verb}?</DialogTitle>
          <DialogDescription className="text-xs">
            Pick the time it actually happened, not the time you are tapping.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {CHECK_IN_OFFSETS.map(m => (
            <Button
              key={m}
              type="button"
              variant={m === 0 ? 'default' : 'outline'}
              disabled={saving}
              className="h-12"
              onClick={() => commit(minutesAgoIso(m))}
            >
              {OFFSET_LABEL(m)}
            </Button>
          ))}
        </div>

        <div className="space-y-1.5 pt-1">
          <label htmlFor={`manual-${kind}`} className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Another time
          </label>
          <Input
            id={`manual-${kind}`}
            type="datetime-local"
            value={manual || toCarrierNaive(existing)}
            onChange={e => { setManual(e.target.value); setError(null); }}
          />
          <p className="text-[11px] text-muted-foreground">Entered in the carrier's time zone.</p>
        </div>

        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

        <Button
          type="button"
          className="h-11"
          disabled={saving}
          onClick={() => {
            const iso = fromCarrierNaive(manual || toCarrierNaive(existing));
            if (!iso) { setError('Enter a date and a time.'); return; }
            void commit(iso);
          }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save this time'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function TimeRow({
  label, kind, stop, onSaved,
}: {
  label: string;
  kind: StopTimeKind;
  stop: CheckInStop;
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const recorded = kind === 'arrival' ? stop.actual_arrival_at : stop.actual_departure_at;
  const source = kind === 'arrival' ? stop.arrival_source : stop.departure_source;

  const save = async (iso: string) => {
    try {
      const coords = await bestEffortCoords();
      await recordStopTime(stop.id, kind, iso, coords);
      toast({ title: `${label} recorded`, description: formatCheckInTime(iso) });
      onSaved?.();
    } catch (err) {
      logDbError('[StopCheckIn] write failed', err, { stopId: stop.id, kind });
      throw err;
    }
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        {recorded ? (
          <>
            <p className="text-sm font-semibold text-foreground leading-snug">{formatCheckInTime(recorded)}</p>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {source === 'driver_app' ? 'Driver check-in' : source === 'dispatcher_entry' ? 'Entered by dispatch' : ''}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground leading-snug">Not recorded</p>
        )}
      </div>
      <Button
        type="button"
        size="sm"
        variant={recorded ? 'outline' : 'default'}
        className="shrink-0"
        onClick={() => setOpen(true)}
      >
        <Clock className="h-3.5 w-3.5 mr-1.5" />
        {recorded ? 'Change' : `Record ${label.toLowerCase()}`}
      </Button>

      <TimeSheet
        open={open}
        kind={kind}
        existing={recorded}
        onClose={() => setOpen(false)}
        onSave={save}
      />
    </div>
  );
}

export function StopCheckIn({ stops, onSaved }: { stops: CheckInStop[]; onSaved?: () => void }) {
  if (!stops.length) return null;
  const ordered = stops.slice().sort((a, b) => (a.stop_sequence ?? 0) - (b.stop_sequence ?? 0));
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-foreground">At the facility</p>
      {ordered.map(stop => (
        <div key={stop.id} className="rounded-xl border border-border bg-muted/20 px-4 py-3 space-y-3">
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground leading-snug">
                {stop.stop_type === 'delivery' ? 'Delivery' : stop.stop_type === 'drop_and_hook' ? 'Drop & hook' : 'Pickup'}
                {stop.facility_name ? ` — ${stop.facility_name}` : ''}
              </p>
              <p className="text-xs text-muted-foreground leading-snug">
                {[stop.city, stop.state].filter(Boolean).join(', ') || 'Location to be confirmed'}
              </p>
            </div>
          </div>
          <TimeRow label="Arrival" kind="arrival" stop={stop} onSaved={onSaved} />
          <TimeRow label="Departure" kind="departure" stop={stop} onSaved={onSaved} />
        </div>
      ))}
    </div>
  );
}
