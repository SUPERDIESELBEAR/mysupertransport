import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Loader2, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const ROLES: { key: 'owner' | 'management' | 'onboarding_staff' | 'dispatcher'; label: string }[] = [
  { key: 'owner', label: 'Owner' },
  { key: 'management', label: 'Management' },
  { key: 'onboarding_staff', label: 'Onboarding Staff' },
  { key: 'dispatcher', label: 'Dispatcher' },
];

type Defaults = Record<string, boolean>;

export function RevertCourtesyDefaultsCard() {
  const { user, roles } = useAuth();
  const canEdit = roles.includes('management') || roles.includes('owner');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [original, setOriginal] = useState<Defaults>({});
  const [values, setValues] = useState<Defaults>({});

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('revert_courtesy_email_defaults')
        .select('role, send_by_default');
      if (error) {
        toast.error('Failed to load defaults');
        setLoading(false);
        return;
      }
      const map: Defaults = {};
      for (const r of ROLES) map[r.key] = false;
      for (const row of data ?? []) map[(row as any).role] = !!(row as any).send_by_default;
      setOriginal(map);
      setValues(map);
      setLoading(false);
    })();
  }, []);

  const dirty = ROLES.some(r => original[r.key] !== values[r.key]);

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const rows = ROLES.map(r => ({
        role: r.key,
        send_by_default: !!values[r.key],
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      }));
      const { error } = await supabase
        .from('revert_courtesy_email_defaults')
        .upsert(rows, { onConflict: 'role' });
      if (error) throw error;

      const before: Defaults = {};
      const after: Defaults = {};
      for (const r of ROLES) {
        before[r.key] = original[r.key];
        after[r.key] = values[r.key];
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', user?.id ?? '')
        .maybeSingle();
      const actorName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || null;
      await supabase.from('audit_log').insert({
        actor_id: user?.id ?? null,
        actor_name: actorName,
        action: 'revert_courtesy_defaults_updated',
        entity_type: 'settings',
        entity_label: 'Revert Courtesy Email Defaults',
        metadata: { before, after },
      });

      setOriginal(values);
      toast.success('Defaults updated');
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <RotateCcw className="h-4 w-4 text-status-progress" />
          Revert "Request Revisions" — Courtesy Email Defaults
        </CardTitle>
        <CardDescription className="text-xs">
          When a staff member undoes a "revisions requested" email, should the "send a please-disregard email" box
          be checked by default? Each role can have its own default. Staff can still override per-revert.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="divide-y divide-border border border-border rounded-md">
              {ROLES.map(r => (
                <div key={r.key} className="flex items-center justify-between px-3 py-2.5">
                  <div className="text-sm font-medium text-foreground">{r.label}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-7 text-right">
                      {values[r.key] ? 'ON' : 'OFF'}
                    </span>
                    <Switch
                      checked={!!values[r.key]}
                      onCheckedChange={(v) => setValues(prev => ({ ...prev, [r.key]: v }))}
                      disabled={!canEdit || saving}
                    />
                  </div>
                </div>
              ))}
            </div>
            {!canEdit && (
              <p className="text-xs text-muted-foreground">Only Management or Owner can change these defaults.</p>
            )}
            {canEdit && (
              <div className="flex justify-end">
                <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
                  {saving ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Saving…</> : 'Save'}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default RevertCourtesyDefaultsCard;