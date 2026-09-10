import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Timer } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  DEFAULT_PEI_CADENCE,
  validateCadence,
  type PEICadenceSettings,
} from '@/lib/pei/peiCadence';

/**
 * Company-wide automatic follow-up settings for previous-employer checks.
 * Read by any staff member; only management/owner may save, and every save
 * goes through the protected writer so it is attributed and audited.
 */
export function PEICadenceSettingsCard() {
  const { isManagement } = useAuth();
  const [settings, setSettings] = useState<PEICadenceSettings>(DEFAULT_PEI_CADENCE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any)
        .from('pei_cadence_settings')
        .select('auto_follow_ups_enabled, follow_up_interval_days, gfe_after_days')
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        toast.error(`Could not load follow-up settings: ${error.message}`);
      } else if (data) {
        setSettings(data as PEICadenceSettings);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  async function save() {
    const problem = validateCadence(settings.follow_up_interval_days, settings.gfe_after_days);
    if (problem) { toast.error(problem); return; }
    if (!note.trim()) { toast.error('Add a short reason for the change.'); return; }
    setSaving(true);
    const { error } = await (supabase as any).rpc('set_pei_cadence_settings', {
      p_enabled: settings.auto_follow_ups_enabled,
      p_interval_days: settings.follow_up_interval_days,
      p_gfe_after_days: settings.gfe_after_days,
      p_note: note.trim(),
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setNote('');
    toast.success('Follow-up settings saved. They apply from the next run.');
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-gold" />
          <div>
            <p className="text-sm font-semibold">Automatic follow-ups</p>
            <p className="text-xs text-muted-foreground">
              Reminders to previous employers, and the Good Faith Effort filed when nobody answers.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="pei-auto" className="text-xs">
            {settings.auto_follow_ups_enabled ? 'On' : 'Off'}
          </Label>
          <Switch
            id="pei-auto"
            checked={settings.auto_follow_ups_enabled}
            disabled={!isManagement || loading}
            onCheckedChange={(v) => setSettings((s) => ({ ...s, auto_follow_ups_enabled: v }))}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="pei-interval" className="text-xs">Follow up every (days)</Label>
          <Input
            id="pei-interval"
            type="number"
            min={1}
            max={15}
            value={settings.follow_up_interval_days}
            disabled={!isManagement || loading}
            onChange={(e) => setSettings((s) => ({ ...s, follow_up_interval_days: Number(e.target.value) }))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pei-gfe" className="text-xs">File Good Faith Effort after (days)</Label>
          <Input
            id="pei-gfe"
            type="number"
            min={7}
            max={60}
            value={settings.gfe_after_days}
            disabled={!isManagement || loading}
            onChange={(e) => setSettings((s) => ({ ...s, gfe_after_days: Number(e.target.value) }))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pei-note" className="text-xs">Reason for the change</Label>
          <Input
            id="pei-note"
            value={note}
            placeholder="Why this change"
            disabled={!isManagement || loading}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>

      {isManagement ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={saving || loading}>
            {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Save settings
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Only management can change these settings.</p>
      )}
    </Card>
  );
}
