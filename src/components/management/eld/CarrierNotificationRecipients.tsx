import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Loader2, Mail, Plus, Trash2 } from 'lucide-react';

type Recipient = { id: string; email: string; label: string | null; is_active: boolean };

/** Configurable carrier safety recipients for ELD malfunction notices. */
export default function CarrierNotificationRecipients() {
  const [rows, setRows] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [label, setLabel] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('carrier_notification_settings')
      .select('id, email, label, is_active')
      .order('created_at');
    if (error) toast.error(error.message);
    setRows((data as Recipient[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function add() {
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error('Enter a valid email address.');
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from('carrier_notification_settings')
      .insert({ email: trimmed, label: label.trim() || null, is_active: true });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setEmail(''); setLabel('');
    toast.success('Recipient added.');
    void load();
  }

  async function toggle(row: Recipient, next: boolean) {
    const { error } = await supabase
      .from('carrier_notification_settings')
      .update({ is_active: next })
      .eq('id', row.id);
    if (error) { toast.error(error.message); return; }
    void load();
  }

  async function remove(row: Recipient) {
    const { error } = await supabase.from('carrier_notification_settings').delete().eq('id', row.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Recipient removed.');
    void load();
  }

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Mail className="h-4 w-4" /> Malfunction notice recipients
      </div>
      <p className="text-xs text-muted-foreground">
        Every driver-submitted malfunction notice is emailed to these addresses.
      </p>

      {loading ? (
        <div className="py-6 text-center text-xs text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="py-4 text-center text-xs text-muted-foreground">
          No recipients yet — notices will have nowhere to go.
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 rounded-md border border-border p-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-foreground">{row.email}</div>
                {row.label && <div className="truncate text-[11px] text-muted-foreground">{row.label}</div>}
              </div>
              <Switch checked={row.is_active} onCheckedChange={(v) => toggle(row, v)} />
              <Button size="icon" variant="ghost" onClick={() => remove(row)} aria-label="Remove recipient">
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Input placeholder="safety@carrier.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Button onClick={add} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Add
        </Button>
      </div>
    </div>
  );
}