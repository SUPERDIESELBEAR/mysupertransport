import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, LogOut, Undo2 } from 'lucide-react';
import {
  departingActionLabel, formatDepartingDate, type DepartingEvent,
} from '@/lib/departing';

export interface DepartingFields {
  is_departing: boolean;
  departing_note: string | null;
  departing_expected_date: string | null;
  departing_at: string | null;
}

interface Props {
  operatorId: string;
  operatorName: string;
  value: DepartingFields;
  onChanged: (next: DepartingFields) => void;
  /** Dispatch, management or owner. */
  canEdit: boolean;
}

/**
 * The departing flag. Set it early, clear it without ceremony — "may be
 * leaving" is a suspicion and drivers change their minds. Clearing closes the
 * episode; the events below stay on file forever.
 *
 * The driver never sees this. It is not a lease termination and writes no row
 * there.
 */
export default function DepartingControl({
  operatorId, operatorName, value, onChanged, canEdit,
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [events, setEvents] = useState<DepartingEvent[]>([]);

  const loadEvents = useCallback(async () => {
    const { data } = await supabase
      .from('operator_departing_events')
      .select('id, action, note, expected_date, changed_at, changed_by')
      .eq('operator_id', operatorId)
      .order('changed_at', { ascending: false });
    setEvents((data ?? []) as unknown as DepartingEvent[]);
  }, [operatorId]);

  useEffect(() => { loadEvents(); }, [loadEvents]);
  useEffect(() => { if (open) { setNote(''); setExpectedDate(''); } }, [open]);

  const flag = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc('set_operator_departing', {
        _operator_id: operatorId,
        _note: note.trim() || null,
        _expected_date: expectedDate || null,
      } as never);
      if (error) throw error;
      onChanged({
        is_departing: true,
        departing_note: note.trim() || null,
        departing_expected_date: expectedDate || null,
        departing_at: new Date().toISOString(),
      });
      setOpen(false);
      await loadEvents();
      toast({
        title: `${operatorName} flagged as departing`,
        description: 'Still active and dispatchable. Not visible to the driver.',
      });
    } catch (err: any) {
      toast({ title: 'Could not flag driver', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc('clear_operator_departing', {
        _operator_id: operatorId,
        _note: null,
      } as never);
      if (error) throw error;
      onChanged({
        is_departing: false,
        departing_note: null,
        departing_expected_date: null,
        departing_at: null,
      });
      await loadEvents();
      toast({ title: `${operatorName} is no longer flagged as departing` });
    } catch (err: any) {
      toast({ title: 'Could not clear the flag', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3" data-testid="departing-control">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Departing (may be leaving)</p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            A heads-up, not a decision. The driver stays active, dispatchable and settling — this only
            changes how their settlement is handled. Clear it any time. The driver never sees it, and
            this is not a lease termination.
          </p>
        </div>
        {value.is_departing ? (
          <Button
            size="sm" variant="outline" className="gap-1.5 shrink-0"
            disabled={!canEdit || saving} onClick={clear}
            data-testid="departing-clear"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
            Not leaving after all
          </Button>
        ) : (
          <Button
            size="sm" variant="outline" className="gap-1.5 shrink-0"
            disabled={!canEdit} onClick={() => setOpen(true)}
            data-testid="departing-flag"
          >
            <LogOut className="h-3.5 w-3.5" />
            Flag as Departing
          </Button>
        )}
      </div>

      {value.is_departing && (
        <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs text-foreground">
          <span className="font-medium">
            {formatDepartingDate(value.departing_expected_date)
              ? `Expected to leave ${formatDepartingDate(value.departing_expected_date)}`
              : 'No expected date'}
          </span>
          {value.departing_note ? <div className="mt-1 text-muted-foreground">{value.departing_note}</div> : null}
        </div>
      )}

      {events.length > 0 && (
        <div className="space-y-1" data-testid="departing-events">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">History</p>
          <ul className="space-y-1">
            {events.map(e => (
              <li key={e.id} className="text-[11px] text-muted-foreground flex flex-wrap gap-x-2">
                <span className="font-medium text-foreground">{departingActionLabel(e.action)}</span>
                <span>{new Date(e.changed_at).toLocaleString('en-US')}</span>
                {e.expected_date ? <span>· expected {formatDepartingDate(e.expected_date)}</span> : null}
                {e.note ? <span>· {e.note}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => (saving ? null : setOpen(v))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Flag {operatorName} as departing</DialogTitle>
            <DialogDescription>
              Records that this driver may be leaving. Nothing changes for them — they stay active,
              keep their equipment and keep settling. Reversible at any time.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Expected last day <span className="normal-case">(leave blank if unknown)</span>
              </Label>
              <Input
                type="date"
                data-testid="departing-expected-date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Note <span className="normal-case">(optional)</span>
              </Label>
              <Textarea
                data-testid="departing-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. mentioned he is looking at going back to company driving"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={saving} onClick={flag} data-testid="departing-confirm">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Flag as Departing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
