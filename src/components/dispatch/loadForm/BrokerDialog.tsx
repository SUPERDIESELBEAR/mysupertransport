import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { normalizeImportedName, normalizePhone, formatPhone } from '@/lib/textNormalize';

export interface BrokerDialogValues {
  company_name: string;
  mc_number: string;
  primary_contact_name: string;
  primary_contact_phone: string;
  primary_contact_email: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Initial values, e.g. parsed from a rate confirmation. Name is normalized on open. */
  initial?: Partial<BrokerDialogValues>;
  onCreated?: (id: string) => void;
}

const empty: BrokerDialogValues = {
  company_name: '',
  mc_number: '',
  primary_contact_name: '',
  primary_contact_phone: '',
  primary_contact_email: '',
};

export default function BrokerDialog({ open, onOpenChange, initial, onCreated }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<BrokerDialogValues>(empty);

  useEffect(() => {
    if (!open) return;
    setForm({
      company_name: normalizeImportedName(initial?.company_name ?? ''),
      mc_number: (initial?.mc_number ?? '').trim(),
      primary_contact_name: normalizeImportedName(initial?.primary_contact_name ?? ''),
      primary_contact_phone: normalizePhone(initial?.primary_contact_phone ?? ''),
      primary_contact_email: (initial?.primary_contact_email ?? '').trim(),
    });
  }, [open, initial]);

  const set = <K extends keyof BrokerDialogValues>(key: K, value: BrokerDialogValues[K]) => {
    setForm(f => ({ ...f, [key]: value }));
  };

  const save = async () => {
    const name = form.company_name.trim();
    if (!name) {
      toast({ variant: 'destructive', description: 'Company name is required.' });
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from('brokers')
      .insert({
        company_name: name,
        mc_number: form.mc_number.trim() || null,
        primary_contact_name: form.primary_contact_name.trim() || null,
        primary_contact_phone: form.primary_contact_phone.trim() || null,
        primary_contact_email: form.primary_contact_email.trim() || null,
      })
      .select('id, company_name')
      .single();
    setSaving(false);
    if (error || !data) {
      toast({ variant: 'destructive', description: error?.message ?? 'Could not add the broker.' });
      return;
    }
    await qc.invalidateQueries({ queryKey: ['load-form-brokers'] });
    onCreated?.(data.id);
    onOpenChange(false);
    toast({ description: `${data.company_name} added.` });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add new broker</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="broker-dialog-name">Company name *</Label>
            <Input
              id="broker-dialog-name"
              value={form.company_name}
              onChange={e => set('company_name', e.target.value)}
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="broker-dialog-mc">MC number</Label>
            <Input
              id="broker-dialog-mc"
              value={form.mc_number}
              onChange={e => set('mc_number', e.target.value)}
              maxLength={40}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="broker-dialog-contact">Primary contact</Label>
            <Input
              id="broker-dialog-contact"
              value={form.primary_contact_name}
              onChange={e => set('primary_contact_name', e.target.value)}
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="broker-dialog-phone">Contact phone</Label>
            <Input
              id="broker-dialog-phone"
              type="tel"
              inputMode="tel"
              value={formatPhone(form.primary_contact_phone)}
              onChange={e => set('primary_contact_phone', normalizePhone(e.target.value))}
              maxLength={14}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="broker-dialog-email">Contact email</Label>
            <Input
              id="broker-dialog-email"
              type="email"
              value={form.primary_contact_email}
              onChange={e => set('primary_contact_email', e.target.value)}
              maxLength={200}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {saving ? 'Saving…' : 'Add broker'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
