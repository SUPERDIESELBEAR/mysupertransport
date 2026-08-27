import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { getDbErrorMessage, logDbError } from '@/lib/dbError';
import {
  fromLocalInputValue,
  saveStopTimes,
  toLocalInputValue,
  validateStopTimes,
} from '@/lib/stopTimes';

interface StopTimeEntryProps {
  stopId: string;
  arrival: string | null;
  departure: string | null;
  onSaved?: () => void;
}

/**
 * Dispatcher entry for a stop's arrival and departure.
 *
 * Nothing is pre-filled — not the appointment time, not "now". A default that
 * looks like a record is worse than an empty one. Capture source and actor are
 * stamped by the database from the writer's role, so this control sends only
 * the two timestamps.
 */
export default function StopTimeEntry({ stopId, arrival, departure, onSaved }: StopTimeEntryProps) {
  const { toast } = useToast();
  const [arrivalValue, setArrivalValue] = useState(() => toLocalInputValue(arrival));
  const [departureValue, setDepartureValue] = useState(() => toLocalInputValue(departure));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty =
    arrivalValue !== toLocalInputValue(arrival) || departureValue !== toLocalInputValue(departure);

  const handleSave = async () => {
    const nextArrival = fromLocalInputValue(arrivalValue);
    const nextDeparture = fromLocalInputValue(departureValue);
    const message = validateStopTimes(nextArrival, nextDeparture);
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await saveStopTimes(stopId, {
        actual_arrival_at: nextArrival,
        actual_departure_at: nextDeparture,
      });
      toast({ title: 'Stop times saved' });
      onSaved?.();
    } catch (err) {
      logDbError('[StopTimeEntry] save failed', err, { stopId });
      toast({
        title: 'Could not save stop times',
        description: getDbErrorMessage(err, 'The update was rejected.'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-md border border-border bg-muted/40 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`arrival-${stopId}`} className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Record arrival
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id={`arrival-${stopId}`}
              type="datetime-local"
              value={arrivalValue}
              onChange={e => { setArrivalValue(e.target.value); setError(null); }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Clear arrival"
              disabled={!arrivalValue}
              onClick={() => { setArrivalValue(''); setError(null); }}
            >
              Clear
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor={`departure-${stopId}`} className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Record departure
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id={`departure-${stopId}`}
              type="datetime-local"
              value={departureValue}
              onChange={e => { setDepartureValue(e.target.value); setError(null); }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Clear departure"
              disabled={!departureValue}
              onClick={() => { setDepartureValue(''); setError(null); }}
            >
              Clear
            </Button>
          </div>
        </div>
      </div>

      {error ? <p role="alert" className="mt-2 text-sm text-destructive">{error}</p> : null}

      <div className="mt-3 flex justify-end">
        <Button type="button" size="sm" disabled={!dirty || saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save times'}
        </Button>
      </div>
    </div>
  );
}
