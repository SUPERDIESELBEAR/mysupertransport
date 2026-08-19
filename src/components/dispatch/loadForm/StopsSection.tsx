import { useFieldArray, useFormContext } from 'react-hook-form';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { STOP_TYPES, STOP_TYPE_LABELS } from '@/lib/loadRateMath';
import { emptyStop, type LoadFormValues } from '@/pages/dispatch/loadFormSchema';

export default function StopsSection() {
  const form = useFormContext<LoadFormValues>();
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: 'stops' });

  return (
    <div className="space-y-4">
      {fields.map((field, index) => {
        const isMiddle = index > 0 && index < fields.length - 1;
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
                    <FormLabel>Facility name</FormLabel>
                    <FormControl><Input {...f} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`stops.${index}.address_line1`}
                render={({ field: f }) => (
                  <FormItem>
                    <FormLabel>Address line 1</FormLabel>
                    <FormControl><Input {...f} /></FormControl>
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
                    <FormControl><Input {...f} /></FormControl>
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
                    <FormControl><Input {...f} /></FormControl>
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
                    <FormControl><Input {...f} maxLength={40} /></FormControl>
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
                    <FormControl><Input {...f} maxLength={12} /></FormControl>
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
                    <FormControl><Input {...f} /></FormControl>
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
                    <FormControl><Input {...f} maxLength={30} /></FormControl>
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
