import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Settings2 } from 'lucide-react';

interface FleetReminderIntervalDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

const INTERVALS = [
  { value: 90, label: '90 Days' },
  { value: 180, label: '180 Days' },
  { value: 270, label: '270 Days' },
  { value: 360, label: '360 Days' },
];

export default function FleetReminderIntervalDialog({ open, onClose, onSaved }: FleetReminderIntervalDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [interval, setInterval] = useState<number>(360);
  const [applyToAll, setApplyToAll] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setApplyToAll(false);
    supabase
      .from('fleet_settings')
      .select('id, default_dot_reminder_interval_days')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSettingsId(data.id);
          setInterval(data.default_dot_reminder_interval_days);
        }
        setLoading(false);
      });
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. Upsert fleet setting
      if (settingsId) {
        const { error } = await supabase
          .from('fleet_settings')
          .update({ default_dot_reminder_interval_days: interval, updated_by: user?.id ?? null })
          .eq('id', settingsId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('fleet_settings')
          .insert({ default_dot_reminder_interval_days: interval, updated_by: user?.id ?? null })
          .select('id')
          .single();
        if (error) throw error;
        setSettingsId(data.id);
      }

      // 2. Optional: bulk-apply to latest DOT inspection per operator
      let updatedCount = 0;
      if (applyToAll) {
        // Fetch all DOT inspections, ordered so the latest per operator comes first
        const { data: rows, error: fetchErr } = await supabase
          .from('truck_dot_inspections')
          .select('id, operator_id, inspection_date')
          .order('operator_id', { ascending: true })
          .order('inspection_date', { ascending: false });
        if (fetchErr) throw fetchErr;

        // Pick the latest record per operator
        const latestIds: string[] = [];
        const seen = new Set<string>();
        (rows ?? []).forEach((r: any) => {
          if (!seen.has(r.operator_id)) {
            seen.add(r.operator_id);
            latestIds.push(r.id);
          }
        });

        if (latestIds.length > 0) {
          const { error: updateErr } = await supabase
            .from('truck_dot_inspections')
            .update({ reminder_interval: interval })
            .in('id', latestIds);
          if (updateErr) throw updateErr;
          updatedCount = latestIds.length;
        }
      }

      toast({
        title: 'Fleet default saved',
        description: applyToAll
          ? `New default: ${interval} days · applied to ${updatedCount} truck${updatedCount !== 1 ? 's' : ''}.`
          : `New default: ${interval} days. Applies to new inspections going forward.`,
      });
      onSaved?.();
      onClose();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            Fleet DOT Reminder Interval
          </DialogTitle>
          <DialogDescription className="text-xs">
            Sets the default reminder interval pre-selected when adding a new DOT inspection,
            and the implicit interval for inspections uploaded directly by operators.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 mx-auto animate-spin" />
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-xs mb-2 block">Default Reminder Interval</Label>
              <RadioGroup value={String(interval)} onValueChange={v => setInterval(parseInt(v))} className="grid grid-cols-2 gap-2">
                {INTERVALS.map(i => (
                  <label key={i.value} className="flex items-center gap-2 text-xs cursor-pointer border border-border rounded-lg px-3 py-2 hover:bg-muted/30 transition-colors">
                    <RadioGroupItem value={String(i.value)} />
                    {i.label}
                  </label>
                ))}
              </RadioGroup>
            </div>

            <label className="flex items-start gap-2.5 text-xs cursor-pointer border border-border rounded-lg px-3 py-2.5 hover:bg-muted/30 transition-colors">
              <Checkbox
                checked={applyToAll}
                onCheckedChange={c => setApplyToAll(!!c)}
                className="mt-0.5"
              />
              <span className="leading-snug">
                <span className="font-medium text-foreground">Apply to every truck's most recent DOT inspection</span>
                <span className="block text-muted-foreground mt-0.5">
                  Recomputes the next due date for the latest record on every operator using this interval.
                </span>
              </span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
