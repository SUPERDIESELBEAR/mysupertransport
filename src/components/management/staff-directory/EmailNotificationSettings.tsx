import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Send, Users } from 'lucide-react';
import {
  EMAIL_CATEGORIES, EMAIL_ROLES,
  type EmailCategoryKey, type EmailRoleKey,
} from '@/lib/emailCategories';
import type { StaffMember } from './types';

type OverrideState = 'default' | 'on' | 'off';

interface Props {
  staff: StaffMember[];
}

export default function EmailNotificationSettings({ staff }: Props) {
  const { user, session } = useAuth();
  const { toast } = useToast();

  const [defaults, setDefaults] = useState<Record<string, boolean>>({});
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<EmailCategoryKey | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: def }, { data: ovr }] = await Promise.all([
      supabase.from('notification_role_defaults').select('role, category, email_enabled'),
      supabase.from('staff_email_overrides').select('user_id, category, email_enabled'),
    ]);
    const d: Record<string, boolean> = {};
    (def ?? []).forEach(r => { d[`${r.role}:${r.category}`] = r.email_enabled; });
    const o: Record<string, boolean> = {};
    (ovr ?? []).forEach(r => { o[`${r.user_id}:${r.category}`] = r.email_enabled; });
    setDefaults(d);
    setOverrides(o);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const logChange = async (action: string, label: string, metadata: Record<string, unknown>) => {
    await supabase.from('audit_log').insert({
      actor_id: user?.id ?? null,
      action,
      entity_type: 'email_notification_settings',
      entity_label: label,
      metadata,
    });
  };

  const toggleDefault = async (role: EmailRoleKey, category: EmailCategoryKey, next: boolean) => {
    const key = `${role}:${category}`;
    setSaving(key);
    setDefaults(prev => ({ ...prev, [key]: next }));
    const { error } = await supabase
      .from('notification_role_defaults')
      .upsert({ role, category, email_enabled: next, updated_at: new Date().toISOString() },
        { onConflict: 'role,category' });
    setSaving(null);
    if (error) {
      setDefaults(prev => ({ ...prev, [key]: !next }));
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
      return;
    }
    void logChange('email_role_default_changed', `${role} · ${category}`, { role, category, email_enabled: next });
  };

  const setOverride = async (userId: string, category: EmailCategoryKey, state: OverrideState) => {
    const key = `${userId}:${category}`;
    setSaving(key);
    if (state === 'default') {
      const { error } = await supabase
        .from('staff_email_overrides')
        .delete()
        .eq('user_id', userId)
        .eq('category', category);
      setSaving(null);
      if (error) {
        toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
        return;
      }
      setOverrides(prev => { const n = { ...prev }; delete n[key]; return n; });
    } else {
      const enabled = state === 'on';
      const { error } = await supabase
        .from('staff_email_overrides')
        .upsert({ user_id: userId, category, email_enabled: enabled, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,category' });
      setSaving(null);
      if (error) {
        toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
        return;
      }
      setOverrides(prev => ({ ...prev, [key]: enabled }));
    }
    void logChange('email_staff_override_changed', category, { user_id: userId, category, state });
  };

  /** Who currently receives a given category. */
  const receivers = useMemo(() => {
    const map: Record<string, StaffMember[]> = {};
    for (const cat of EMAIL_CATEGORIES) {
      map[cat.key] = staff.filter(m => {
        const ov = overrides[`${m.user_id}:${cat.key}`];
        if (ov !== undefined) return ov;
        return (m.roles ?? []).some(r => defaults[`${r}:${cat.key}`]);
      });
    }
    return map;
  }, [staff, defaults, overrides]);

  const sendTest = async (category: EmailCategoryKey, label: string) => {
    setTesting(category);
    try {
      const { data, error } = await supabase.functions.invoke('send-test-category-email', {
        body: { category, category_label: label },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: 'Test email sent', description: 'Check your inbox — only you received it.' });
    } catch (err) {
      toast({
        title: 'Test send failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setTesting(null);
    }
  };

  const overrideState = (userId: string, category: EmailCategoryKey): OverrideState => {
    const v = overrides[`${userId}:${category}`];
    if (v === undefined) return 'default';
    return v ? 'on' : 'off';
  };

  if (loading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Loading email settings…</div>;
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-border rounded-xl p-4">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Mail className="h-4 w-4 text-gold" /> Role defaults
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Baseline for who receives each category of email. Individual staff can be overridden below each row.
        </p>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="text-left px-5 py-3 font-semibold">Email category</th>
                {EMAIL_ROLES.map(r => (
                  <th key={r.key} className="px-3 py-3 font-semibold text-center whitespace-nowrap">{r.label}</th>
                ))}
                <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Test</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {EMAIL_CATEGORIES.map(cat => {
                const list = receivers[cat.key] ?? [];
                const isOpen = expanded === cat.key;
                return (
                  <>
                    <tr key={cat.key} className="align-top hover:bg-secondary/20">
                      <td className="px-5 py-4 max-w-sm">
                        <p className="font-semibold text-foreground">{cat.label}</p>
                        <p className="text-xs text-muted-foreground mt-1">{cat.description}</p>
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : cat.key)}
                          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-gold hover:underline"
                        >
                          <Users className="h-3.5 w-3.5" />
                          {list.length} currently receiving
                        </button>
                      </td>
                      {EMAIL_ROLES.map(role => {
                        const key = `${role.key}:${cat.key}`;
                        return (
                          <td key={role.key} className="px-3 py-4 text-center">
                            <Switch
                              checked={!!defaults[key]}
                              disabled={saving === key}
                              onCheckedChange={v => toggleDefault(role.key, cat.key, v)}
                            />
                          </td>
                        );
                      })}
                      <td className="px-3 py-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={testing === cat.key}
                          onClick={() => sendTest(cat.key, cat.label)}
                        >
                          <Send className="h-3.5 w-3.5" />
                          {testing === cat.key ? 'Sending…' : 'Test'}
                        </Button>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr key={`${cat.key}-detail`} className="bg-secondary/20">
                        <td colSpan={EMAIL_ROLES.length + 2} className="px-5 py-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                            Per-staff overrides — {cat.label}
                          </p>
                          <div className="space-y-2">
                            {staff.map(m => {
                              const name = [m.first_name, m.last_name].filter(Boolean).join(' ') || m.email || 'Unknown';
                              const state = overrideState(m.user_id, cat.key);
                              const receiving = list.some(x => x.user_id === m.user_id);
                              return (
                                <div key={m.user_id} className="flex items-center justify-between gap-3 bg-white border border-border rounded-lg px-3 py-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">{name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <Badge className={`text-xs border ${receiving ? 'bg-status-complete/15 text-status-complete border-status-complete/30' : 'bg-secondary text-muted-foreground border-border'}`}>
                                      {receiving ? 'Receiving' : 'Not receiving'}
                                    </Badge>
                                    <div className="flex rounded-lg border border-border overflow-hidden">
                                      {(['default', 'on', 'off'] as OverrideState[]).map(s => (
                                        <button
                                          key={s}
                                          type="button"
                                          disabled={saving === `${m.user_id}:${cat.key}`}
                                          onClick={() => setOverride(m.user_id, cat.key, s)}
                                          className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                                            state === s
                                              ? 'bg-surface-dark text-surface-dark-foreground'
                                              : 'bg-white text-muted-foreground hover:bg-secondary/50'
                                          }`}
                                        >
                                          {s === 'default' ? 'Default' : s === 'on' ? 'Always on' : 'Always off'}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
