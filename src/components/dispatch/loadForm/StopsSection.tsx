import { useFieldArray, useFormContext } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Info, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import StateSelect from '@/components/shared/StateSelect';
import FacilitySelect from '@/components/dispatch/loadForm/FacilitySelect';
import { FACILITIES_QUERY_KEY, useFacilities } from '@/hooks/useFacilities';
import type { Facility } from '@/lib/facilities';
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

export default function StopsSection() {
  const form = useFormContext<LoadFormValues>();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: facilities } = useFacilities();
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: 'stops' });
  const stops = form.watch('stops');

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
                  onClick={() => remove(index)}
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
    </div>
  );
}
