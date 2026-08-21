import { useEffect, useMemo, useState } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StateSelect from '@/components/shared/StateSelect';
import {
  normalizeImportedName, normalizePhone, formatPhone, normalizeMultiline, normalizeWhitespace,
  normalizeZip, toTitleCase,
} from '@/lib/textNormalize';
import { getDbErrorMessage, logDbError } from '@/lib/dbError';
import { findDuplicateBrokers, type BrokerDuplicate } from '@/lib/brokerDuplicates';
import {
  FACTORING_STATUSES, FACTORING_STATUS_LABELS, type Broker, type FactoringStatus,
} from '@/lib/brokers';
import BrokerCandidateRow from './BrokerCandidateRow';

export interface BrokerDialogValues {
  company_name: string;
  mc_number: string;
  dot_number: string;
  primary_contact_name: string;
  primary_contact_phone: string;
  primary_contact_email: string;
  billing_email: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip: string;
  payment_terms: string;
  notes: string;
  is_active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Initial values, e.g. parsed from a rate confirmation. Name is normalized on open. */
  initial?: Partial<BrokerDialogValues>;
  /**
   * When the initial address came from a parsed document, the block it was read from
   * (e.g. "Bill To block"). Shown above the address fields; the provenance itself is
   * persisted in the notes by the caller.
   */
  addressSourceLabel?: string | null;
  /** When provided the dialog edits this record instead of creating a new one. */
  broker?: Broker | null;
  /** Loads referencing the broker being edited. Delete is offered only at zero. */
  loadCount?: number;
  /** Management/owner only — gates the orphan delete action. */
  canDelete?: boolean;
  onCreated?: (id: string) => void;
  /** Called when the user chooses an existing broker instead of creating a new one. */
  onUseExisting?: (id: string) => void;
  onSaved?: () => void;
  onDeleted?: () => void;
}

const empty: BrokerDialogValues = {
  company_name: '',
  mc_number: '',
  dot_number: '',
  primary_contact_name: '',
  primary_contact_phone: '',
  primary_contact_email: '',
  billing_email: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  zip: '',
  payment_terms: '',
  notes: '',
  is_active: true,
};

const valuesFrom = (b: Broker): BrokerDialogValues => ({
  company_name: b.company_name ?? '',
  mc_number: b.mc_number ?? '',
  dot_number: b.dot_number ?? '',
  primary_contact_name: b.primary_contact_name ?? '',
  primary_contact_phone: b.primary_contact_phone ?? '',
  primary_contact_email: b.primary_contact_email ?? '',
  billing_email: b.billing_email ?? '',
  address_line1: b.address_line1 ?? '',
  address_line2: b.address_line2 ?? '',
  city: b.city ?? '',
  state: b.state ?? '',
  zip: b.zip ?? '',
  payment_terms: b.payment_terms ?? '',
  notes: b.notes ?? '',
  is_active: b.is_active ?? true,
});

export default function BrokerDialog({
  open, onOpenChange, initial, broker, loadCount = 0, canDelete = false,
  onCreated, onUseExisting, onSaved, onDeleted,
}: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEdit = !!broker;
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState<BrokerDialogValues>(empty);
  const [duplicates, setDuplicates] = useState<BrokerDuplicate[]>([]);
  const [overrideReason, setOverrideReason] = useState('');
  const [factoringStatus, setFactoringStatus] = useState<FactoringStatus | ''>('');
  const [factoringReason, setFactoringReason] = useState('');

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
    setForm(broker ? valuesFrom(broker) : {
      ...empty,
      ...initial,
      company_name: normalizeImportedName(initial?.company_name ?? ''),
      mc_number: (initial?.mc_number ?? '').trim(),
      primary_contact_name: normalizeImportedName(initial?.primary_contact_name ?? ''),
      primary_contact_phone: normalizePhone(initial?.primary_contact_phone ?? ''),
      primary_contact_email: (initial?.primary_contact_email ?? '').trim(),
    });
    setFactoringStatus(broker?.factoring_status ?? '');
    setFactoringReason('');
    setDuplicates([]);
    setOverrideReason('');
  }, [open, initial, broker]);

  useEffect(() => {
    if (!open || !existingBrokers?.length) return;
    const found = findDuplicateBrokers(
      { company_name: form.company_name, mc_number: form.mc_number || null },
      existingBrokers,
      broker?.id ?? null,
    );
    setDuplicates(found);
  }, [open, form.company_name, form.mc_number, existingBrokers, broker?.id]);

  const set = <K extends keyof BrokerDialogValues>(key: K, value: BrokerDialogValues[K]) => {
    setForm(f => ({ ...f, [key]: value }));
  };

  const factoringChanged = useMemo(
    () => isEdit && factoringStatus !== '' && factoringStatus !== (broker?.factoring_status ?? ''),
    [isEdit, factoringStatus, broker?.factoring_status],
  );

  const buildPayload = () => ({
    company_name: normalizeWhitespace(form.company_name),
    mc_number: form.mc_number.trim() || null,
    dot_number: form.dot_number.trim() || null,
    primary_contact_name: toTitleCase(form.primary_contact_name) || null,
    primary_contact_phone: normalizePhone(form.primary_contact_phone) || null,
    primary_contact_email: normalizeWhitespace(form.primary_contact_email).toLowerCase() || null,
    billing_email: normalizeWhitespace(form.billing_email).toLowerCase() || null,
    address_line1: toTitleCase(form.address_line1) || null,
    address_line2: toTitleCase(form.address_line2) || null,
    city: toTitleCase(form.city) || null,
    state: form.state || null,
    zip: normalizeZip(form.zip) || null,
    payment_terms: normalizeWhitespace(form.payment_terms) || null,
    notes: normalizeMultiline(form.notes) || null,
    is_active: form.is_active,
  });

  const logOverride = async (id: string, name: string, reason: string) => {
    await supabase.from('audit_log').insert({
      action: isEdit ? 'broker_duplicate_override_edit' : 'broker_duplicate_override',
      entity_type: 'broker',
      entity_id: id,
      entity_label: name,
      metadata: {
        reason,
        matched_broker_ids: duplicates.map(d => d.id),
        matched_broker_names: duplicates.map(d => d.company_name),
        broker: { company_name: name, mc_number: form.mc_number.trim() || null },
      },
    });
  };

  const persist = async (reason?: string) => {
    const payload = buildPayload();
    if (!payload.company_name) {
      toast({ variant: 'destructive', description: 'Company name is required.' });
      return;
    }
    if (factoringChanged && !factoringReason.trim()) {
      toast({ variant: 'destructive', description: 'A reason is required when changing factoring status.' });
      return;
    }

    const writePayload = factoringChanged
      ? {
        ...payload,
        factoring_status: factoringStatus as FactoringStatus,
        factoring_status_reason: factoringReason.trim(),
      }
      : payload;

    setSaving(true);
    const query = broker
      ? supabase.from('brokers').update(writePayload).eq('id', broker.id).select('id, company_name').single()
      : supabase.from('brokers').insert(writePayload).select('id, company_name').single();
    const { data, error } = await query;
    setSaving(false);

    if (error || !data) {
      logDbError('brokers save', error, writePayload);
      toast({
        variant: 'destructive',
        title: 'Broker not saved',
        description: getDbErrorMessage(error, 'Could not save the broker.'),
      });
      return;
    }

    if (reason && duplicates.length) {
      await logOverride(data.id, data.company_name, reason);
    }

    await qc.invalidateQueries({ queryKey: ['load-form-brokers'] });
    await qc.invalidateQueries({ queryKey: ['brokers'] });
    await qc.invalidateQueries({ queryKey: ['broker-dialog-existing'] });
    if (isEdit) onSaved?.(); else onCreated?.(data.id);
    onOpenChange(false);
    toast({ description: `${data.company_name} ${isEdit ? 'updated' : 'added'}.` });
  };

  const save = async () => {
    if (duplicates.length && !overrideReason.trim()) {
      toast({
        variant: 'destructive',
        description: isEdit
          ? 'This name or MC number matches another broker. Enter a reason to save anyway.'
          : 'A matching broker was found. Choose an existing broker or enter a reason to create anyway.',
      });
      return;
    }
    await persist(overrideReason.trim() || undefined);
  };

  const useExisting = (id: string, name: string) => {
    onUseExisting?.(id);
    onOpenChange(false);
    toast({ description: `Using existing broker ${name}.` });
  };

  const remove = async () => {
    if (!broker) return;
    setDeleting(true);
    const { error } = await supabase.from('brokers').delete().eq('id', broker.id);
    setDeleting(false);
    setConfirmDelete(false);
    if (error) {
      logDbError('brokers delete', error, { id: broker.id });
      const fkViolation = (error as { code?: string }).code === '23503';
      toast({
        variant: 'destructive',
        title: 'Broker not deleted',
        description: fkViolation
          ? 'This broker still has loads referencing it and cannot be deleted. Mark it inactive instead.'
          : getDbErrorMessage(error, 'Could not delete the broker.'),
      });
      return;
    }
    await qc.invalidateQueries({ queryKey: ['brokers'] });
    await qc.invalidateQueries({ queryKey: ['load-form-brokers'] });
    await qc.invalidateQueries({ queryKey: ['broker-dialog-existing'] });
    onDeleted?.();
    onOpenChange(false);
    toast({ description: `${broker.company_name} deleted.` });
  };

  const hasConflict = duplicates.length > 0;
  const showDelete = isEdit && canDelete && loadCount === 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={isEdit ? 'sm:max-w-2xl max-h-[90dvh] overflow-y-auto' : 'sm:max-w-md'}>
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit broker' : 'Add new broker'}</DialogTitle>
          </DialogHeader>

          <div className={isEdit ? 'grid gap-3 sm:grid-cols-2' : 'space-y-3'}>
            <div className={isEdit ? 'space-y-1.5 sm:col-span-2' : 'space-y-1.5'}>
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
            {isEdit && (
              <div className="space-y-1.5">
                <Label htmlFor="broker-dialog-dot">DOT number</Label>
                <Input
                  id="broker-dialog-dot"
                  value={form.dot_number}
                  onChange={e => set('dot_number', e.target.value)}
                  maxLength={40}
                />
              </div>
            )}
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

            {isEdit && (
              <div className="space-y-1.5">
                <Label htmlFor="broker-dialog-billing">Billing email</Label>
                <Input
                  id="broker-dialog-billing"
                  type="email"
                  value={form.billing_email}
                  onChange={e => set('billing_email', e.target.value)}
                  maxLength={200}
                />
              </div>
            )}

            {showAddress && (
              <>
                {!isEdit && addressSourceLabel && (
                  <p className="sm:col-span-2 text-xs text-muted-foreground">
                    Address read from the document&rsquo;s {addressSourceLabel}. A note recording
                    that is saved with this broker — edit or remove it below if it is wrong.
                  </p>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="broker-dialog-addr1">Address line 1</Label>
                  <Input
                    id="broker-dialog-addr1"
                    value={form.address_line1}
                    onChange={e => set('address_line1', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="broker-dialog-addr2">Address line 2</Label>
                  <Input
                    id="broker-dialog-addr2"
                    value={form.address_line2}
                    onChange={e => set('address_line2', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="broker-dialog-city">City</Label>
                  <Input
                    id="broker-dialog-city"
                    value={form.city}
                    onChange={e => set('city', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>State</Label>
                  <StateSelect value={form.state} onChange={v => set('state', v)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="broker-dialog-zip">ZIP</Label>
                  <Input
                    id="broker-dialog-zip"
                    inputMode="numeric"
                    maxLength={10}
                    value={form.zip}
                    onChange={e => set('zip', normalizeZip(e.target.value))}
                  />
                </div>
              </>
            )}

            {isEdit && (
              <div className="space-y-1.5">
                <Label htmlFor="broker-dialog-terms">Payment terms</Label>
                <Input
                  id="broker-dialog-terms"
                  placeholder="Net 30"
                  value={form.payment_terms}
                  onChange={e => set('payment_terms', e.target.value)}
                  maxLength={80}
                />
              </div>
            )}

            {showAddress && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="broker-dialog-notes">Notes</Label>
                <Textarea
                  id="broker-dialog-notes"
                  rows={2}
                  value={form.notes}
                  onChange={e => set('notes', e.target.value)}
                />
              </div>
            )}

            {isEdit && (
              <>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Switch
                    id="broker-dialog-active"
                    checked={form.is_active}
                    onCheckedChange={v => set('is_active', v)}
                  />
                  <Label htmlFor="broker-dialog-active" className="cursor-pointer">
                    Active — available when building a load
                  </Label>
                </div>


                <div className="sm:col-span-2 rounded-md border border-border bg-muted/30 p-3 space-y-2">
                  <p className="text-sm font-semibold text-foreground">Change factoring status</p>
                  <p className="text-xs text-muted-foreground">
                    Every change is recorded in the broker's factoring history, so a reason is required.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="broker-dialog-factoring">Status</Label>
                      <Select
                        value={factoringStatus || undefined}
                        onValueChange={v => setFactoringStatus(v as FactoringStatus)}
                      >
                        <SelectTrigger id="broker-dialog-factoring">
                          <SelectValue placeholder="Select status…" />
                        </SelectTrigger>
                        <SelectContent>
                          {FACTORING_STATUSES.map(s => (
                            <SelectItem key={s} value={s}>{FACTORING_STATUS_LABELS[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="broker-dialog-factoring-reason">
                        Reason {factoringChanged ? '*' : ''}
                      </Label>
                      <Input
                        id="broker-dialog-factoring-reason"
                        value={factoringReason}
                        onChange={e => setFactoringReason(e.target.value)}
                        disabled={!factoringChanged}
                        placeholder={factoringChanged ? 'Why the status changed' : 'Change the status first'}
                        maxLength={300}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {hasConflict && (
              <div className={`rounded-md border border-warning/40 bg-warning/10 p-3 space-y-2 ${isEdit ? 'sm:col-span-2' : ''}`}>
                <div className="flex items-start gap-2 text-sm font-semibold text-foreground">
                  <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                  Possible duplicate broker{duplicates.length > 1 ? 's' : ''} found
                </div>
                <p className="text-xs text-muted-foreground">
                  Review the matching record{duplicates.length > 1 ? 's' : ''} below.
                  {isEdit
                    ? ' Another broker already uses this name or MC number.'
                    : ' Use an existing one unless you are certain this is a different company.'}
                </p>
                <div className="space-y-1.5">
                  {duplicates.map(d => (
                    <BrokerCandidateRow
                      key={d.id}
                      candidate={{
                        ...d,
                        matchedOn: d.matchReason ?? 'name',
                        score: d.matchReason === 'mc' ? 1 : 0.75,
                        dot_number: null,
                      }}
                      onSelect={isEdit ? undefined : () => useExisting(d.id, d.company_name)}
                      actionLabel="Use this broker"
                      showBadge

                    />
                  ))}
                </div>
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="broker-override-reason">
                    Reason for {isEdit ? 'saving' : 'creating'} anyway
                  </Label>
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

          <DialogFooter className="gap-2 sm:justify-between">
            {showDelete ? (
              <Button
                type="button"
                variant="outline"
                className="text-destructive hover:text-destructive gap-1.5"
                onClick={() => setConfirmDelete(true)}
                disabled={saving || deleting}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void save()} disabled={saving}>
                {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {saving ? 'Saving…' : isEdit ? (hasConflict ? 'Save anyway' : 'Save broker') : (hasConflict ? 'Create anyway' : 'Add broker')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {broker?.company_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {broker?.company_name} has no loads referencing it, so deleting is safe. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => { e.preventDefault(); void remove(); }}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete broker'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  );
}
