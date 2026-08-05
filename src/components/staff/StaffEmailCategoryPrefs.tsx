import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { EMAIL_CATEGORIES, type EmailCategoryKey } from '@/lib/emailCategories';

type OverrideState = 'default' | 'on' | 'off';

/** Per-staff email category overrides (self-service view). */
export default function StaffEmailCategoryPrefs() {
  const { session, roles } = useAuth();
  const { toast } = useToast();
  const userId = session?.user?.id;

  const [defaults, setDefaults] = useState<Record<string, boolean>>({});
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [{ data: def }, { data: ovr }] = await Promise.all([
      supabase.from('notification_role_defaults').select('role, category, email_enabled'),
      supabase.from('staff_email_overrides').select('category, email_enabled').eq('user_id', userId),
    ]);
    const d: Record<string, boolean> = {};
    (def ?? []).forEach(r => { d[`${r.role}:${r.category}`] = r.email_enabled; });
    const o: Record<string, boolean> = {};
    (ovr ?? []).forEach(r => { o[r.category] = r.email_enabled; });
    setDefaults(d);
    setOverrides(o);
    setLoading(false);
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const roleDefault = (category: EmailCategoryKey) =>
    (roles ?? []).some(r => defaults[`${r}:${category}`]);

  const state = (category: EmailCategoryKey): OverrideState => {
    const v = overrides[category];
    if (v === undefined) return 'default';
    return v ? 'on' : 'off';
  };

  const setState = async (category: EmailCategoryKey, next: OverrideState) => {
    if (!userId) return;
    setSaving(category);
    if (next === 'default') {
      const { error } = await supabase
        .from('staff_email_overrides')
        .delete()
        .eq('user_id', userId)
        .eq('category', category);
      setSaving(null);
      if (error) return toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      setOverrides(prev => { const n = { ...prev }; delete n[category]; return n; });
    } else {
      const enabled = next === 'on';
      const { error } = await supabase
        .from('staff_email_overrides')
        .upsert({ user_id: userId, category, email_enabled: enabled, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,category' });
      setSaving(null);
      if (error) return toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      setOverrides(prev => ({ ...prev, [category]: enabled }));
    }
  };

  if (loading) {
    return (
      <div className="px-6 py-6 border-b border-border flex justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="px-6 py-4 border-b border-border shrink-0">
      <p className="text-sm font-medium text-foreground">Email categories</p>
      <p className="text-xs text-muted-foreground mb-3">
        "Default" follows the setting your role has been given by management.
      </p>
      <div className="space-y-2">
        {EMAIL_CATEGORIES.map(cat => {
          const s = state(cat.key);
          const effective = s === 'default' ? roleDefault(cat.key) : s === 'on';
          return (
            <div key={cat.key} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-foreground truncate">{cat.label}</p>
                <p className="text-[11px] text-muted-foreground">
                  {effective ? 'You receive these emails' : 'You do not receive these emails'}
                </p>
              </div>
              <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
                {(['default', 'on', 'off'] as OverrideState[]).map(opt => (
                  <button
                    key={opt}
                    type="button"
                    disabled={saving === cat.key}
                    onClick={() => setState(cat.key, opt)}
                    className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      s === opt
                        ? 'bg-surface-dark text-surface-dark-foreground'
                        : 'bg-background text-muted-foreground hover:bg-muted/50'
                    }`}
                  >
                    {opt === 'default' ? `Default (${roleDefault(cat.key) ? 'on' : 'off'})` : opt === 'on' ? 'On' : 'Off'}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
