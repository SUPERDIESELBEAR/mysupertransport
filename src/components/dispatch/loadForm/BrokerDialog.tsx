import { useEffect, useState } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { normalizeImportedName, normalizePhone, formatPhone } from '@/lib/textNormalize';
import { findDuplicateBrokers, type BrokerDuplicate } from '@/lib/brokerDuplicates';
import BrokerCandidateRow from './BrokerCandidateRow';

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

export default function BrokerDialog({ open, onOpenChange, initial, onCreated, onUseExisting }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<BrokerDialogValues>(empty);
  const [duplicates, setDuplicates] = useState<BrokerDuplicate[]>([]);
  const [overrideReason, setOverrideReason] = useState('');

  const { data: existingBrokers } = useQuery({
    queryKey: ['broker-dialog-existing'],
    queryFn: async (): Promise<BrokerDuplicate[]> => {
      const { data, error } = await supabase
        .from('brokers')
        .select('id, company_name, mc_number, city, state, primary_contact_name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      setDuplicates([]);
      setOverrideReason('');
      return;
    }
    setForm({
      company_name: normalizeImportedName(initial?.company_name ?? ''),
      mc_number: (initial?.mc_number ?? '').trim(),
      primary_contact_name: normalizeImportedName(initial?.primary_contact_name ?? ''),
      primary_contact_phone: normalizePhone(initial?.primary_contact_phone ?? ''),
      primary_contact_email: (initial?.primary_contact_email ?? '').trim(),
    });
    setDuplicates([]);
    setOverrideReason('');
  }, [open, initial]);

  useEffect(() => {
    if (!open || !existingBrokers?.length) return;
    const found = findDuplicateBrokers(
      { company_name: form.company_name, mc_number: form.mc_number || null },
      existingBrokers,
    );
    setDuplicates(found);
  }, [open, form.company_name, form.mc_number, existingBrokers]);

  const set = <K extends keyof BrokerDialogValues>(key: K, value: BrokerDialogValues[K]) => {
    setForm(f => ({ ...f, [key]: value }));
  };

  const insertBroker = async (reason?: string) => {
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

    if (reason && duplicates.length) {
      await supabase.from('audit_log').insert({
        action: 'broker_duplicate_override',
        entity_type: 'broker',
        entity_id: data.id,
        entity_label: data.company_name,
        metadata: {
          reason,
          matched_broker_ids: duplicates.map(d => d.id),
          matched_broker_names: duplicates.map(d => d.company_name),
          new_broker: { company_name: data.company_name, mc_number: form.mc_number.trim() || null },
        },
      });
    }

    await qc.invalidateQueries({ queryKey: ['load-form-brokers'] });
    onCreated?.(data.id);
    onOpenChange(false);
    toast({ description: `${data.company_name} added.` });
  };

  const save = async () => {
    if (duplicates.length && !overrideReason.trim()) {
      toast({ variant: 'destructive', description: 'A matching broker was found. Choose an existing broker or enter a reason to create anyway.' });
      return;
    }
    await insertBroker(overrideReason.trim() || undefined);
  };

  const useExisting = (id: string, name: string) => {
    onUseExisting?.(id);
    onOpenChange(false);
    toast({ description: `Using existing broker ${name}.` });
  };

  const hasConflict = duplicates.length > 0;

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

          {hasConflict && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 space-y-2">
              <div className="flex items-start gap-2 text-sm font-semibold text-foreground">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                Possible duplicate broker{duplicates.length > 1 ? 's' : ''} found
              </div>
              <p className="text-xs text-muted-foreground">
                Review the matching record{duplicates.length > 1 ? 's' : ''} below. Use an existing one unless you are certain this is a different company.
              </p>
              <div className="space-y-1.5">
                {duplicates.map(d => (
                  <BrokerCandidateRow
                    key={d.id}
                    candidate={{ ...d, matchedOn: d.matchReason, score: d.matchReason === 'mc' ? 1 : 0.75, dot_number: null }}
                    onSelect={() => useExisting(d.id, d.company_name)}
                    actionLabel="Use this broker"
                    showBadge
                  />
                ))}
              </div>
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="broker-override-reason">Reason for creating anyway</Label>
                <Textarea
                  id="broker-override-reason"
                  value={overrideReason}
                  onChange={e => setOverrideReason(e.target.value)}
                  placeholder="e.g., different authority, unrelated company with a similar name"
                  rows={2}
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {saving ? 'Saving…' : hasConflict ? 'Create anyway' : 'Add broker'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
