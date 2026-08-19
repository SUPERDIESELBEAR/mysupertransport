import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StateSelect from '@/components/shared/StateSelect';
import { FACILITY_SELECT, FACILITY_TYPES, FACILITY_TYPE_LABELS, type Facility } from '@/lib/facilities';
import { getDbErrorMessage, logDbError } from '@/lib/dbError';
import {
  formatPhone, normalizePhone, normalizeWhitespace, normalizeZip, toTitleCase,
} from '@/lib/textNormalize';

export interface FacilityDraft {
  facility_name: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  facility_type: string;
  default_appointment_required: boolean;
  hours_notes: string;
  access_notes: string;
  notes: string;
  is_active: boolean;
}

const emptyDraft = (): FacilityDraft => ({
  facility_name: '', address_line1: '', address_line2: '', city: '', state: '', zip: '',
  contact_name: '', contact_phone: '', contact_email: '', facility_type: '',
  default_appointment_required: false, hours_notes: '', access_notes: '', notes: '', is_active: true,
});

const draftFrom = (f: Facility): FacilityDraft => ({
  facility_name: f.facility_name ?? '',
  address_line1: f.address_line1 ?? '',
  address_line2: f.address_line2 ?? '',
  city: f.city ?? '',
  state: f.state ?? '',
  zip: f.zip ?? '',
  contact_name: f.contact_name ?? '',
  contact_phone: f.contact_phone ?? '',
  contact_email: f.contact_email ?? '',
  facility_type: f.facility_type ?? '',
  default_appointment_required: f.default_appointment_required ?? false,
  hours_notes: f.hours_notes ?? '',
  access_notes: f.access_notes ?? '',
  notes: f.notes ?? '',
  is_active: f.is_active ?? true,
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing an existing facility when provided. */
  facility?: Facility | null;
  /** Prefill for a brand new facility (e.g. what the user typed on a stop). */
  initial?: Partial<FacilityDraft>;
  /** Show the active toggle (management page only). */
  allowDeactivate?: boolean;
  onSaved?: (facility: Facility) => void;
}

export default function FacilityDialog({
  open, onOpenChange, facility, initial, allowDeactivate, onSaved,
}: Props) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<FacilityDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(facility ? draftFrom(facility) : { ...emptyDraft(), ...initial });
  }, [open, facility, initial]);

  const set = <K extends keyof FacilityDraft>(key: K, value: FacilityDraft[K]) =>
    setDraft(d => ({ ...d, [key]: value }));

  const save = async () => {
    const name = normalizeWhitespace(draft.facility_name);
    if (!name) {
      toast({ variant: 'destructive', description: 'Facility name is required.' });
      return;
    }
    const payload = {
      facility_name: name,
      address_line1: toTitleCase(draft.address_line1) || null,
      address_line2: toTitleCase(draft.address_line2) || null,
      city: toTitleCase(draft.city) || null,
      state: draft.state || null,
      zip: normalizeZip(draft.zip) || null,
      contact_name: toTitleCase(draft.contact_name) || null,
      contact_phone: normalizePhone(draft.contact_phone) || null,
      contact_email: normalizeWhitespace(draft.contact_email).toLowerCase() || null,
      facility_type: draft.facility_type || null,
      default_appointment_required: draft.default_appointment_required,
      hours_notes: normalizeWhitespace(draft.hours_notes) || null,
      access_notes: normalizeWhitespace(draft.access_notes) || null,
      notes: normalizeWhitespace(draft.notes) || null,
      is_active: draft.is_active,
    };

    setSaving(true);
    const query = facility
      ? supabase.from('facilities').update(payload).eq('id', facility.id).select(FACILITY_SELECT).single()
      : supabase.from('facilities').insert(payload).select(FACILITY_SELECT).single();
    const { data, error } = await query;
    setSaving(false);

    if (error || !data) {
      logDbError('facilities save', error, payload);
      toast({
        variant: 'destructive',
        title: 'Facility not saved',
        description: getDbErrorMessage(error, 'Could not save the facility.'),
      });
      return;
    }
    toast({ description: `${name} saved.` });
    onSaved?.(data as Facility);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{facility ? 'Edit facility' : 'Add facility'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="fac-name">Facility name *</Label>
            <Input
              id="fac-name"
              value={draft.facility_name}
              onChange={e => set('facility_name', e.target.value)}
              onBlur={e => set('facility_name', normalizeWhitespace(e.target.value))}
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fac-addr1">Address line 1</Label>
            <Input
              id="fac-addr1"
              value={draft.address_line1}
              onChange={e => set('address_line1', e.target.value)}
              onBlur={e => set('address_line1', toTitleCase(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fac-addr2">Address line 2</Label>
            <Input
              id="fac-addr2"
              value={draft.address_line2}
              onChange={e => set('address_line2', e.target.value)}
              onBlur={e => set('address_line2', toTitleCase(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fac-city">City</Label>
            <Input
              id="fac-city"
              value={draft.city}
              onChange={e => set('city', e.target.value)}
              onBlur={e => set('city', toTitleCase(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>State</Label>
            <StateSelect value={draft.state} onChange={v => set('state', v)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fac-zip">ZIP</Label>
            <Input
              id="fac-zip"
              inputMode="numeric"
              maxLength={10}
              value={draft.zip}
              onChange={e => set('zip', normalizeZip(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fac-type">Facility type</Label>
            <Select value={draft.facility_type || undefined} onValueChange={v => set('facility_type', v)}>
              <SelectTrigger id="fac-type"><SelectValue placeholder="Select type…" /></SelectTrigger>
              <SelectContent>
                {FACILITY_TYPES.map(t => (
                  <SelectItem key={t} value={t}>{FACILITY_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fac-contact">Contact name</Label>
            <Input
              id="fac-contact"
              value={draft.contact_name}
              onChange={e => set('contact_name', e.target.value)}
              onBlur={e => set('contact_name', toTitleCase(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fac-phone">Contact phone</Label>
            <Input
              id="fac-phone"
              inputMode="tel"
              value={formatPhone(draft.contact_phone)}
              onChange={e => set('contact_phone', normalizePhone(e.target.value))}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="fac-email">Contact email</Label>
            <Input
              id="fac-email"
              type="email"
              value={draft.contact_email}
              onChange={e => set('contact_email', e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="fac-hours">Hours notes</Label>
            <Input
              id="fac-hours"
              placeholder="Receiving 6am-2pm M-F"
              value={draft.hours_notes}
              onChange={e => set('hours_notes', e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="fac-access">Access notes</Label>
            <Textarea
              id="fac-access"
              rows={2}
              placeholder="Check in at guard shack, dock 12"
              value={draft.access_notes}
              onChange={e => set('access_notes', e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="fac-notes">Notes</Label>
            <Textarea id="fac-notes" rows={2} value={draft.notes} onChange={e => set('notes', e.target.value)} />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Switch
              id="fac-appt"
              checked={draft.default_appointment_required}
              onCheckedChange={v => set('default_appointment_required', v)}
            />
            <Label htmlFor="fac-appt" className="font-normal">Appointment required by default</Label>
          </div>
          {allowDeactivate && (
            <div className="flex items-center gap-2 sm:col-span-2">
              <Switch id="fac-active" checked={draft.is_active} onCheckedChange={v => set('is_active', v)} />
              <Label htmlFor="fac-active" className="font-normal">Active</Label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : facility ? 'Save changes' : 'Add facility'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
