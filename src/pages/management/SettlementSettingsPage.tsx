import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Settings2 } from 'lucide-react';
import {
  DOW_NAMES, dowLabel, SETTLEMENT_SETTINGS_DEFAULTS, SETTLEMENT_SETTING_HELP,
  SETTLEMENT_SETTING_KEYS, SETTLEMENT_SETTING_LABELS, type SettlementSettings,
} from '@/lib/settlementConfig';

interface HistoryRow {
  id: string;
  field: string;
  previous_value: string | null;
  new_value: string | null;
  changed_at: string;
  changed_by: string | null;
}

/**
 * Every settlement rule lives here, and nowhere else. The constants in
 * settlementConfig.ts are fallbacks for an unread row, never the rule.
 */
export default function SettlementSettingsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<SettlementSettings>(SETTLEMENT_SETTINGS_DEFAULTS);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [actors, setActors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: row, error }, { data: hist }] = await Promise.all([
      supabase.from('settlement_settings').select('*').maybeSingle(),
      supabase.from('settlement_settings_history')
        .select('id, field, previous_value, new_value, changed_at, changed_by')
        .order('changed_at', { ascending: false })
        .limit(25),
    ]);
    setLoading(false);
    if (error) {
      toast({ title: 'Could not load settlement settings', description: error.message, variant: 'destructive' });
      return;
    }
    if (row) {
      setValues({
        minimum_net_pay_threshold: Number(row.minimum_net_pay_threshold),
        hold_buffer: Number(row.hold_buffer),
        equipment_value_per_driver: Number(row.equipment_value_per_driver),
        rm_deposit_target: Number(row.rm_deposit_target),
        rm_weekly_deduction: Number(row.rm_weekly_deduction),
        work_week_start_dow: Number(row.work_week_start_dow),
      });
    }
    const rows = (hist ?? []) as unknown as HistoryRow[];
    setHistory(rows);
    const ids = [...new Set(rows.map(r => r.changed_by).filter(Boolean) as string[])];
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, first_name, last_name').in('id', ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => {
        map[p.id] = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unknown';
      });
      setActors(map);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('settlement_settings')
      .update({
        minimum_net_pay_threshold: values.minimum_net_pay_threshold,
        hold_buffer: values.hold_buffer,
        equipment_value_per_driver: values.equipment_value_per_driver,
        rm_deposit_target: values.rm_deposit_target,
        rm_weekly_deduction: values.rm_weekly_deduction,
        work_week_start_dow: values.work_week_start_dow,
      })
      .eq('singleton', true);
    setSaving(false);
    if (error) {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Settlement settings saved', description: 'Every change is recorded with your name.' });
    load();
  };

  return (
    <div className="space-y-5 animate-fade-in" data-testid="settlement-settings">
      <div className="flex items-center gap-3">
        <Settings2 className="h-6 w-6 text-gold" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Settlement Settings</h1>
          <p className="text-sm text-muted-foreground">
            The rules the settlement engine reads. Nothing here is hardcoded — changes take effect on the
            next run and are recorded with who made them.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading settings…</div>
      ) : (
        <Card className="p-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {SETTLEMENT_SETTING_KEYS.filter(k => k !== 'work_week_start_dow').map(key => (
              <div key={key} className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground" htmlFor={`setting-${key}`}>
                  {SETTLEMENT_SETTING_LABELS[key]}
                </Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input
                    id={`setting-${key}`}
                    data-testid={`setting-${key}`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={String(values[key])}
                    onChange={(e) => setValues(v => ({ ...v, [key]: Number(e.target.value) }))}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">{SETTLEMENT_SETTING_HELP[key]}</p>
              </div>
            ))}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">
                {SETTLEMENT_SETTING_LABELS.work_week_start_dow}
              </Label>
              <Select
                value={String(values.work_week_start_dow)}
                onValueChange={(v) => setValues(s => ({ ...s, work_week_start_dow: Number(v) }))}
              >
                <SelectTrigger data-testid="setting-work_week_start_dow">
                  <SelectValue placeholder="Choose a day…" />
                </SelectTrigger>
                <SelectContent>
                  {DOW_NAMES.map((name, i) => (
                    <SelectItem key={name} value={String(i)}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {SETTLEMENT_SETTING_HELP.work_week_start_dow} Currently {dowLabel(values.work_week_start_dow)} 00:00
                through the following {dowLabel((values.work_week_start_dow + 6) % 7)} 23:59.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving} className="gap-1.5" data-testid="settlement-settings-save">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Settings
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-4 space-y-2">
        <p className="text-sm font-semibold text-foreground">Change history</p>
        {history.length === 0 ? (
          <p className="text-xs text-muted-foreground">No changes recorded yet.</p>
        ) : (
          <ul className="space-y-1">
            {history.map(h => (
              <li key={h.id} className="text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">
                  {SETTLEMENT_SETTING_LABELS[h.field as keyof typeof SETTLEMENT_SETTING_LABELS] ?? h.field}
                </span>
                {' '}changed from {h.previous_value ?? '—'} to {h.new_value ?? '—'}
                {' · '}{new Date(h.changed_at).toLocaleString('en-US')}
                {h.changed_by ? ` · ${actors[h.changed_by] ?? 'Unknown'}` : ''}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
