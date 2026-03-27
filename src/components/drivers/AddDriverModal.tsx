import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, Loader2 } from 'lucide-react';
import DemoLockIcon from '@/components/DemoLockIcon';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
  'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

interface AddDriverModalProps {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}

const formatPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits.length ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

export default function AddDriverModal({ open, onClose, onAdded }: AddDriverModalProps) {
  const { session } = useAuth();
  const { toast } = useToast();
  const { guardDemo } = useDemoMode();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    unit_number: '',
    cdl_number: '',
    cdl_state: '',
    cdl_expiration: '',
    medical_cert_expiration: '',
  });

  const set = (key: keyof typeof form, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSubmit = async () => {
    if (guardDemo()) return;
    if (!form.first_name || !form.last_name || !form.email) {
      toast({ title: 'Missing fields', description: 'First name, last name, and email are required.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      // Check for existing non-draft application with same email
      const { data: existing } = await supabase
        .from('applications')
        .select('id')
        .eq('email', form.email.trim().toLowerCase())
        .eq('is_draft', false)
        .maybeSingle();

      if (existing) {
        toast({
          title: 'Email already in use',
          description: 'A driver with this email address already exists. Please use a different email.',
          variant: 'destructive',
        });
        setSaving(false);
        return;
      }

      // 1. Create a minimal application record
      const { data: app, error: appErr } = await supabase
        .from('applications')
        .insert({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim() || null,
          cdl_number: form.cdl_number.trim() || null,
          cdl_state: form.cdl_state || null,
          cdl_expiration: form.cdl_expiration || null,
          medical_cert_expiration: form.medical_cert_expiration || null,
          review_status: 'approved',
          is_draft: false,
        })
        .select('id')
        .single();

      if (appErr || !app) throw new Error(appErr?.message ?? 'Failed to create application record');

      // 2. Invite the user via the existing edge function
      const { data: inviteData, error: inviteErr } = await supabase.functions.invoke('invite-operator', {
        body: { application_id: app.id, reviewer_notes: 'Manually added as active driver' },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (inviteErr || inviteData?.error) {
        // Clean up the orphaned application so the user can retry
        await supabase.from('applications').delete().eq('id', app.id);
        throw new Error(inviteErr?.message || inviteData?.error);
      }

      // 3. Find the newly-created operator and mark as fully_onboarded
      const { data: operator } = await supabase
        .from('operators')
        .select('id')
        .eq('application_id', app.id)
        .maybeSingle();

      if (operator?.id) {
        // Set unit number and fully_onboarded flag
        await supabase
          .from('onboarding_status')
          .update({
            fully_onboarded: true,
            unit_number: form.unit_number.trim() || null,
          })
          .eq('operator_id', operator.id);

        // Ensure active_dispatch row exists
        const { data: existingDispatch } = await supabase
          .from('active_dispatch')
          .select('id')
          .eq('operator_id', operator.id)
          .maybeSingle();

        if (!existingDispatch) {
          await supabase
            .from('active_dispatch')
            .insert({ operator_id: operator.id, dispatch_status: 'not_dispatched', updated_by: session?.user?.id ?? null });
        }
      }

      toast({
        title: 'Driver added ✓',
        description: `${form.first_name} ${form.last_name} has been added and will receive a portal invite.`,
      });

      // Reset form
      setForm({ first_name: '', last_name: '', email: '', phone: '', unit_number: '', cdl_number: '', cdl_state: '', cdl_expiration: '', medical_cert_expiration: '' });
      onAdded();
      onClose();
    } catch (err: unknown) {
      toast({
        title: 'Failed to add driver',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Add Active Driver
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Manually register an active driver. They'll receive a portal invitation and appear immediately in the Driver Hub.
          </p>

          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-first-name">First Name <span className="text-destructive">*</span></Label>
              <Input id="add-first-name" value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="Jane" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-last-name">Last Name <span className="text-destructive">*</span></Label>
              <Input id="add-last-name" value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Smith" />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="add-email">Email Address <span className="text-destructive">*</span></Label>
            <Input id="add-email" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane@example.com" />
          </div>

          {/* Phone + Unit row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-phone">Phone</Label>
              <Input id="add-phone" type="tel" value={form.phone} onChange={e => set('phone', formatPhone(e.target.value))} placeholder="(555) 000-0000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-unit">Unit #</Label>
              <Input id="add-unit" value={form.unit_number} onChange={e => set('unit_number', e.target.value)} placeholder="e.g. 1042" />
            </div>
          </div>

          <hr className="border-border" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">CDL &amp; Compliance</p>

          {/* CDL */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-cdl">CDL Number</Label>
              <Input id="add-cdl" value={form.cdl_number} onChange={e => set('cdl_number', e.target.value)} placeholder="CDL#" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-cdl-state">CDL State</Label>
              <Select value={form.cdl_state} onValueChange={v => set('cdl_state', v)}>
                <SelectTrigger id="add-cdl-state">
                  <SelectValue placeholder="State" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Expiry dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-cdl-exp">CDL Expiration</Label>
              <Input id="add-cdl-exp" type="date" value={form.cdl_expiration} onChange={e => set('cdl_expiration', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-med-exp">Med Cert Expiration</Label>
              <Input id="add-med-exp" type="date" value={form.medical_cert_expiration} onChange={e => set('medical_cert_expiration', e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            <DemoLockIcon />
            Add Driver
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
