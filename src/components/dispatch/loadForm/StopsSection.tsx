import { useState } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Info, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Textarea } from '@/components/ui/textarea';
import {
  FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import StateSelect from '@/components/shared/StateSelect';
import FacilitySelect from '@/components/dispatch/loadForm/FacilitySelect';
import FacilityDialog, { type FacilityDraft } from '@/components/facilities/FacilityDialog';
import { FACILITIES_QUERY_KEY, useFacilities } from '@/hooks/useFacilities';
import type { Facility } from '@/lib/facilities';
import { facilitySummary } from '@/lib/facilityMatch';
import { STOP_TYPES, STOP_TYPE_LABELS } from '@/lib/loadRateMath';
import {
  formatPhone, normalizePhone, normalizeWhitespace, normalizeZip, toTitleCase,
} from '@/lib/textNormalize';
import { getDbErrorMessage, logDbError } from '@/lib/dbError';
import { emptyStop, type LoadFormValues, type StopFormValues } from '@/pages/dispatch/loadFormSchema';

/** Fields that are auto-filled from a saved facility and can drift from it. */
const LINKED_FIELDS = [
  'facility_name', 'address_line1', 'address_line2', 'city', 'state', 'zip',
  'contact_name', 'contact_phone',
] as const;

const facilityValue = (f: Facility, key: (typeof LINKED_FIELDS)[number]) => (f[key] ?? '') as string;

/** Prefill for creating a facility from the values currently typed on a stop. */
const draftFromStop = (stop: Partial<StopFormValues>): Partial<FacilityDraft> => ({
  facility_name: normalizeWhitespace(stop.facility_name ?? ''),
  address_line1: stop.address_line1 ?? '',
  address_line2: stop.address_line2 ?? '',
  city: stop.city ?? '',
  state: stop.state ?? '',
  zip: stop.zip ?? '',
  contact_name: stop.contact_name ?? '',
  contact_phone: stop.contact_phone ?? '',
});

interface Props {
  /** Directory matches for parsed stops, keyed by stop index. Suggestions only. */
  facilitySuggestions?: Record<number, Facility[]>;
  /** Edit mode on a billed load — stop-off amounts cannot be changed. */
  financialLocked?: boolean;
}

export default function StopsSection({ facilitySuggestions, financialLocked }: Props = {}) {
  const form = useFormContext<LoadFormValues>();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: facilities } = useFacilities();
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: 'stops' });
  const stops = form.watch('stops');

  const [dismissed, setDismissed] = useState<Record<number, boolean>>({});
  const [addForIndex, setAddForIndex] = useState<number | null>(null);
  const [removeIndex, setRemoveIndex] = useState<number | null>(null);
  const [keepCharge, setKeepCharge] = useState(true);

  /** Removal is only confirmed when it destroys something: driver data or a charge. */
  const removalRisk = (index: number) => {
    const s = (stops?.[index] ?? {}) as Partial<StopFormValues>;
    return {
      hasDriverData: !!s.has_driver_data,
      chargeAmount: Number(s.stopoff_charge_amount) || 0,
    };
  };

  const requestRemove = (index: number) => {
    const risk = removalRisk(index);
    if (!risk.hasDriverData && risk.chargeAmount <= 0) {
      remove(index);
      return;
    }
    setKeepCharge(true);
    setRemoveIndex(index);
  };

  const confirmRemove = () => {
    const index = removeIndex;
    if (index === null) return;
    const { chargeAmount } = removalRisk(index);
    if (chargeAmount > 0 && keepCharge) {
      // The charge survives the stop as a load-level line so the total stays right.
      const existing = form.getValues('charges') ?? [];
      form.setValue('charges', [...existing, {
        charge_type: 'stopoff',
        description: `Stop-off charge (removed stop ${index + 1})`,
        amount: String(chargeAmount),
        source: 'manual',
      }], { shouldDirty: true });
    }
    remove(index);
    setRemoveIndex(null);
  };


  const facilityFor = (id?: string) => (id ? (facilities ?? []).find(f => f.id === id) ?? null : null);

  const applyFacility = (index: number, f: Facility) => {
    form.setValue(`stops.${index}.facility_id`, f.id, { shouldDirty: true });
    LINKED_FIELDS.forEach(key => {
      form.setValue(`stops.${index}.${key}` as const, facilityValue(f, key), { shouldDirty: true });
    });
  };

  const updateSavedFacility = async (index: number, f: Facility) => {
    const stop = form.getValues(`stops.${index}`);
    const payload = {
      facility_name: normalizeWhitespace(stop.facility_name) || f.facility_name,
      address_line1: stop.address_line1 || null,
      address_line2: stop.address_line2 || null,
      city: stop.city || null,
      state: stop.state || null,
      zip: stop.zip || null,
      contact_name: stop.contact_name || null,
      contact_phone: normalizePhone(stop.contact_phone) || null,
    };
    const { error } = await supabase.from('facilities').update(payload).eq('id', f.id);
    if (error) {
      logDbError('facilities update from stop', error, payload);
      toast({
        variant: 'destructive',
        title: 'Facility not updated',
        description: getDbErrorMessage(error, 'Could not update the saved facility.'),
      });
      return;
    }
    await qc.invalidateQueries({ queryKey: FACILITIES_QUERY_KEY });
    toast({ description: `${payload.facility_name} updated.` });
  };

  return (
    <div className="space-y-4">
      {fields.map((field, index) => {
        const isMiddle = index > 0 && index < fields.length - 1;
        const stop = (stops?.[index] ?? {}) as Partial<StopFormValues>;
        const linked = facilityFor(stop.facility_id);
        const suggestions = (!linked && !dismissed[index] ? facilitySuggestions?.[index] : null) ?? [];
        const differs = !!linked && LINKED_FIELDS.some(key => {
          const current = key === 'contact_phone'
            ? normalizePhone((stop[key] as string) ?? '')
            : normalizeWhitespace((stop[key] as string) ?? '');
          const saved = key === 'contact_phone'
            ? normalizePhone(facilityValue(linked, key))
            : normalizeWhitespace(facilityValue(linked, key));
          return current !== saved;
        });

        return (
          <div key={field.id} className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">Stop {index + 1}</span>
              {isMiddle && (
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Stop-off charge eligible
                </span>
              )}
              <div className="ml-auto flex items-center gap-1">
                <Button
                  type="button" variant="ghost" size="icon" className="h-8 w-8"
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                  aria-label={`Move stop ${index + 1} up`}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button" variant="ghost" size="icon" className="h-8 w-8"
                  disabled={index === fields.length - 1}
                  onClick={() => move(index, index + 1)}
                  aria-label={`Move stop ${index + 1} down`}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button" variant="ghost" size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  disabled={fields.length <= 2}
                  onClick={() => requestRemove(index)}
                  aria-label={`Remove stop ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <FormField
                control={form.control}
                name={`stops.${index}.stop_type`}
                render={({ field: f }) => (
                  <FormItem>
                    <FormLabel>Stop type</FormLabel>
                    <Select value={f.value} onValueChange={f.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {STOP_TYPES.map(t => (
                          <SelectItem key={t} value={t}>{STOP_TYPE_LABELS[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`stops.${index}.facility_name`}
                render={({ field: f }) => (
                  <FormItem className="lg:col-span-2">
                    <FormLabel>Facility</FormLabel>
                    <FacilitySelect
                      facilityId={stop.facility_id ?? ''}
                      facilityName={f.value ?? ''}
                      newFacilityDraft={draftFromStop(stop)}
                      onNameChange={value => {
                        f.onChange(value);
                        form.setValue(`stops.${index}.facility_name`, value, { shouldDirty: true });
                      }}
                      onSelectFacility={facility => applyFacility(index, facility)}
                      onClearFacility={() => form.setValue(`stops.${index}.facility_id`, '', { shouldDirty: true })}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!linked && suggestions.length === 0 && !!normalizeWhitespace(stop.facility_name ?? '') && (
                <div className="sm:col-span-2 lg:col-span-3 -mt-1 flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                  <Info className="h-3.5 w-3.5 text-gold shrink-0" />
                  <span>This facility isn&rsquo;t in your directory.</span>
                  <button
                    type="button"
                    onClick={() => setAddForIndex(index)}
                    className="underline underline-offset-2 text-gold hover:text-gold-light"
                  >
                    Save to facilities
                  </button>
                </div>
              )}


              {suggestions.length > 0 && (
                <div className="sm:col-span-2 lg:col-span-3 -mt-1 rounded-md border border-gold/40 bg-gold/5 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-gold shrink-0 mt-0.5" />
                    <p className="text-xs text-foreground">
                      {suggestions.length === 1
                        ? 'This address matches a facility already in the directory.'
                        : `This address matches ${suggestions.length} facilities in the directory.`}
                    </p>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    On the rate confirmation:{' '}
                    <span className="text-foreground">{stop.facility_name || '(no name printed)'}</span>
                  </p>
                  <div className="space-y-2">
                    {suggestions.map(f => (
                      <div key={f.id} className="flex items-start gap-2 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-muted-foreground">
                            In our directory:{' '}
                            <span className="text-foreground font-medium">{f.facility_name}</span>
                          </p>
                          <p className="text-[11px] text-muted-foreground">{facilitySummary(f)}</p>
                        </div>
                        <Button
                          type="button" size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => {
                            applyFacility(index, f);
                            setDismissed(prev => ({ ...prev, [index]: true }));
                          }}
                        >
                          Use saved facility
                        </Button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDismissed(prev => ({ ...prev, [index]: true }))}
                    className="text-[11px] underline underline-offset-2 text-muted-foreground hover:text-foreground"
                  >
                    Keep as printed
                  </button>
                </div>
              )}

              {linked && differs && (
                <div className="sm:col-span-2 lg:col-span-3 -mt-1 flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                  <Info className="h-3.5 w-3.5 text-gold shrink-0" />
                  <span>This stop differs from the saved facility &ldquo;{linked.facility_name}&rdquo;.</span>
                  <button
                    type="button"
                    onClick={() => void updateSavedFacility(index, linked)}
                    className="underline underline-offset-2 text-gold hover:text-gold-light"
                  >
                    Update saved facility
                  </button>
                </div>
              )}

              <FormField
                control={form.control}
                name={`stops.${index}.address_line1`}
                render={({ field: f }) => (
                  <FormItem>
                    <FormLabel>Address line 1</FormLabel>
                    <FormControl>
                      <Input {...f} onBlur={e => f.onChange(toTitleCase(e.target.value))} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`stops.${index}.address_line2`}
                render={({ field: f }) => (
                  <FormItem>
                    <FormLabel>Address line 2</FormLabel>
                    <FormControl>
                      <Input {...f} onBlur={e => f.onChange(toTitleCase(e.target.value))} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`stops.${index}.city`}
                render={({ field: f }) => (
                  <FormItem>
                    <FormLabel>City *</FormLabel>
                    <FormControl>
                      <Input {...f} onBlur={e => f.onChange(toTitleCase(e.target.value))} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`stops.${index}.state`}
                render={({ field: f }) => (
                  <FormItem>
                    <FormLabel>State *</FormLabel>
                    <StateSelect value={f.value ?? ''} onChange={f.onChange} />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`stops.${index}.zip`}
                render={({ field: f }) => (
                  <FormItem>
                    <FormLabel>ZIP</FormLabel>
                    <FormControl>
                      <Input
                        {...f}
                        inputMode="numeric"
                        maxLength={10}
                        onChange={e => f.onChange(normalizeZip(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`stops.${index}.contact_name`}
                render={({ field: f }) => (
                  <FormItem>
                    <FormLabel>Contact name</FormLabel>
                    <FormControl>
                      <Input {...f} onBlur={e => f.onChange(toTitleCase(e.target.value))} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`stops.${index}.contact_phone`}
                render={({ field: f }) => (
                  <FormItem>
                    <FormLabel>Contact phone</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="tel"
                        value={formatPhone(f.value ?? '')}
                        onChange={e => f.onChange(normalizePhone(e.target.value))}
                        onBlur={f.onBlur}
                        name={f.name}
                        ref={f.ref}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`stops.${index}.appointment_start`}
                render={({ field: f }) => (
                  <FormItem>
                    <FormLabel>Appointment start</FormLabel>
                    <FormControl><Input type="datetime-local" {...f} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`stops.${index}.appointment_end`}
                render={({ field: f }) => (
                  <FormItem>
                    <FormLabel>Appointment end</FormLabel>
                    <FormControl><Input type="datetime-local" {...f} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`stops.${index}.reference_number`}
                render={({ field: f }) => (
                  <FormItem>
                    <FormLabel>Reference number</FormLabel>
                    <FormControl><Input {...f} className="font-mono" maxLength={60} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`stops.${index}.reference_label`}
                render={({ field: f }) => (
                  <FormItem>
                    <FormLabel>Reference label</FormLabel>
                    <FormControl><Input {...f} placeholder="PU #, Delivery #, BOL #…" maxLength={60} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {isMiddle && (
              <FormField
                control={form.control}
                name={`stops.${index}.stopoff_charge_amount`}
                render={({ field: f }) => (
                  <FormItem>
                    <FormLabel>Stop-off charge</FormLabel>
                    <FormControl><CurrencyInput disabled={financialLocked} {...f} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              )}
              <FormField
                control={form.control}
                name={`stops.${index}.stop_notes`}
                render={({ field: f }) => (
                  <FormItem className="sm:col-span-2 lg:col-span-3">
                    <FormLabel>Stop notes</FormLabel>
                    <FormControl><Textarea rows={2} {...f} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        );
      })}

      <Button type="button" variant="outline" className="gap-1.5" onClick={() => append(emptyStop('delivery'))}>
        <Plus className="h-4 w-4" />
        Add Stop
      </Button>

      <FacilityDialog
        open={addForIndex !== null}
        onOpenChange={open => { if (!open) setAddForIndex(null); }}
        initial={addForIndex !== null ? draftFromStop((stops?.[addForIndex] ?? {}) as Partial<StopFormValues>) : undefined}
        onSaved={async facility => {
          const target = addForIndex;
          await qc.invalidateQueries({ queryKey: FACILITIES_QUERY_KEY });
          if (target !== null) applyFacility(target, facility);
          setAddForIndex(null);
        }}
      />

      <AlertDialog open={removeIndex !== null} onOpenChange={open => { if (!open) setRemoveIndex(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove stop {(removeIndex ?? 0) + 1}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {removeIndex !== null && removalRisk(removeIndex).hasDriverData && (
                  <p className="text-destructive">
                    The driver has already checked in or out at this stop. Removing it deletes
                    the recorded arrival and departure times and their GPS coordinates. That
                    record cannot be restored.
                  </p>
                )}
                {removeIndex !== null && removalRisk(removeIndex).chargeAmount > 0 && (
                  <p>
                    This stop carries a stop-off charge of $
                    {removalRisk(removeIndex).chargeAmount.toFixed(2)}.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {removeIndex !== null && removalRisk(removeIndex).chargeAmount > 0 && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio" className="mt-1" checked={keepCharge}
                  onChange={() => setKeepCharge(true)}
                />
                <span>
                  <span className="font-medium">Keep the charge on the load</span>
                  <span className="block text-xs text-muted-foreground">
                    It becomes a load-level charge, so Total Load Value does not change.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio" className="mt-1" checked={!keepCharge}
                  onChange={() => setKeepCharge(false)}
                />
                <span>
                  <span className="font-medium">Remove the charge too</span>
                  <span className="block text-xs text-muted-foreground">
                    Total Load Value drops by the charge amount.
                  </span>
                </span>
              </label>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove stop
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
