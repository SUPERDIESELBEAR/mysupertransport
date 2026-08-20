import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import BrokerSelect from '@/components/dispatch/loadForm/BrokerSelect';
import StopsSection from '@/components/dispatch/loadForm/StopsSection';
import type { Facility } from '@/lib/facilities';
import RateConfirmationParser from '@/components/dispatch/loadForm/RateConfirmationParser';
import { uploadLoadDocument } from '@/lib/loadDocuments';
import { EQUIPMENT_TYPES, formatCurrency, formatEnumLabel } from '@/lib/loadFormat';
import {
  HANDLING_TYPES, HANDLING_TYPE_LABELS, LOAD_TYPES, LOAD_TYPE_LABELS,
  RATE_TYPES, RATE_TYPE_LABELS, calcTotalLoadValue,
} from '@/lib/loadRateMath';
import { loadFormDefaults, loadFormSchema, type LoadFormValues } from './loadFormSchema';
import { getDbErrorMessage, logDbError } from '@/lib/dbError';

const toIso = (v?: string) => (v ? new Date(v).toISOString() : '');

function Section({ title, description, children }: {
  title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {children}
    </section>
  );
}

interface CreateLoadPageProps {
  /** Host-supplied navigation for the Management Portal (state-driven views). */
  onCreated?: (loadId: string) => void;
  onCancel?: () => void;
  /** Present in edit mode — the load being edited. */
  loadId?: string | null;
  onSaved?: (loadId: string) => void;
}

export default function CreateLoadPage({
  onCreated, onCancel, loadId, onSaved,
}: CreateLoadPageProps = {}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isOwner } = useAuth();
  const queryClient = useQueryClient();
  const isEdit = !!loadId;
  const [submitting, setSubmitting] = useState(false);
  const [numberLoading, setNumberLoading] = useState(false);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [extractedBroker, setExtractedBroker] = useState<string | null>(null);
  const [facilitySuggestions, setFacilitySuggestions] = useState<Record<number, Facility[]>>({});
  const [financialUnlocked, setFinancialUnlocked] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [unlockReason, setUnlockReason] = useState('');
  const pendingValues = useRef<LoadFormValues | null>(null);
  const initialValues = useRef<LoadFormValues | null>(null);
  const hydrated = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const form = useForm<LoadFormValues>({
    resolver: zodResolver(loadFormSchema),
    defaultValues: loadFormDefaults(),
    mode: 'onSubmit',
  });

  const { data: editData, isLoading: editLoading, error: editError } = useQuery({
    queryKey: ['load-edit', loadId],
    enabled: isEdit,
    queryFn: () => fetchLoadForEdit(loadId as string),
  });

  useEffect(() => {
    if (!editData || hydrated.current) return;
    const v = loadToFormValues(editData);
    initialValues.current = v;
    form.reset(v);
    hydrated.current = true;
  }, [editData, form]);

  const loadStatus = (editData?.load.status ?? 'available') as LoadStatus;
  const tier = isEdit ? financialEditTier(loadStatus) : 'open';
  const financialLocked = tier === 'locked' && !financialUnlocked;

  const values = form.watch();
  const isLoadout = values.load_type === 'loadout';
  const isPerTonBulk = values.load_type === 'per_ton';
  const isReefer = values.equipment_type === 'reefer';
  const handlingLocked = values.equipment_type === 'flatbed' || values.equipment_type === 'hopper_bottom';

  const generateNumber = async () => {
    setNumberLoading(true);
    const { data, error } = await supabase.rpc('generate_load_number');
    setNumberLoading(false);
    if (error || !data) {
      toast({ variant: 'destructive', description: error?.message ?? 'Could not generate a load number.' });
      return;
    }
    form.setValue('load_number', data as string, { shouldValidate: true });
  };

  useEffect(() => {
    if (isEdit) return;
    void generateNumber();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit]);


  // Per-Ton Bulk forces the rate type; flatbed/hopper force live load-unload.
  useEffect(() => {
    if (isPerTonBulk && values.rate_type !== 'per_ton') form.setValue('rate_type', 'per_ton');
  }, [isPerTonBulk, values.rate_type, form]);

  useEffect(() => {
    if (handlingLocked && values.handling_type !== 'live_load_unload') {
      form.setValue('handling_type', 'live_load_unload');
    }
  }, [handlingLocked, values.handling_type, form]);

  const totalValue = useMemo(() => calcTotalLoadValue({
    loadType: values.load_type,
    rateType: values.rate_type,
    linehaulRate: values.linehaul_rate,
    ratePerMile: values.rate_per_mile,
    ratePerTon: values.rate_per_ton,
    estimatedTons: values.estimated_tons,
    loadedMiles: values.loaded_miles,
    fscBundled: values.fsc_bundled_into_linehaul,
    fscAmount: values.fsc_amount,
    relocationFee: values.loadout_relocation_fee,
    stopoffCharges: (values.stops ?? []).map(s => s?.stopoff_charge_amount),
    additionalCharges: (values.charges ?? []).map(c => c?.amount),

  }), [values]);

  const goBack = () => (onCancel ? onCancel() : navigate('/dispatch/loads'));

  const scrollToFirstError = () => {
    window.requestAnimationFrame(() => {
      const el = formRef.current?.querySelector('[aria-invalid="true"], [data-error="true"]');
      if (el) (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const onSubmit = async (v: LoadFormValues) => {
    setSubmitting(true);
    let loadPayloadForLog: unknown = null;
    let stopsPayloadForLog: unknown = null;
    try {
      const loadPayload: Record<string, unknown> = {
        load_number: v.load_number,
        load_type: v.load_type,
        broker_id: v.broker_id || '',
        broker_reference_number: v.broker_reference_number ?? '',
        equipment_type: v.equipment_type,
        handling_type: v.handling_type,
        commodity: v.commodity ?? '',
        weight_lbs: isLoadout ? '' : (v.weight_lbs ?? ''),
        bol_number: v.bol_number ?? '',
        po_number: v.po_number ?? '',
        rate_type: isLoadout ? 'flat' : v.rate_type,
        linehaul_rate: isLoadout ? '' : (v.linehaul_rate ?? ''),
        rate_per_mile: isLoadout ? '' : (v.rate_per_mile ?? ''),
        rate_per_ton: isLoadout ? '' : (v.rate_per_ton ?? ''),
        estimated_tons: isLoadout ? '' : (v.estimated_tons ?? ''),
        fsc_bundled_into_linehaul: v.fsc_bundled_into_linehaul,
        fsc_amount: v.fsc_bundled_into_linehaul ? '' : (v.fsc_amount ?? ''),
        loaded_miles: v.loaded_miles ?? '',
        deadhead_miles: v.deadhead_miles ?? '',
        total_load_value: totalValue ? String(totalValue) : '',
        reefer_temp_f: isReefer ? (v.reefer_temp_f ?? '') : '',
        reefer_temp_min_f: isReefer ? (v.reefer_temp_min_f ?? '') : '',
        reefer_temp_max_f: isReefer ? (v.reefer_temp_max_f ?? '') : '',
        reefer_precool_required: isReefer ? v.reefer_precool_required : false,
        reefer_continuous_run: isReefer ? v.reefer_continuous_run : false,
        reefer_notes: isReefer ? (v.reefer_notes ?? '') : '',
        loadout_trailer_owner_company: isLoadout ? (v.loadout_trailer_owner_company ?? '') : '',
        loadout_trailer_owner_contact: isLoadout ? (v.loadout_trailer_owner_contact ?? '') : '',
        loadout_trailer_number: isLoadout ? (v.loadout_trailer_number ?? '') : '',
        loadout_trailer_vin: isLoadout ? (v.loadout_trailer_vin ?? '') : '',
        loadout_trailer_type: isLoadout ? (v.loadout_trailer_type ?? '') : '',
        loadout_relocation_fee: isLoadout ? (v.loadout_relocation_fee ?? '') : '',
        loadout_use_period_days: isLoadout ? (v.loadout_use_period_days ?? '') : '',
        internal_notes: v.internal_notes ?? '',
        driver_facing_notes: v.driver_facing_notes ?? '',
        special_instructions: v.special_instructions ?? '',
        is_team_load: v.is_team_load,
        co_driver_name: v.is_team_load ? (v.co_driver_name ?? '') : '',
        is_hazmat: v.is_hazmat,
        permit_required: v.permit_required,
        permit_cost: v.permit_required ? (v.permit_cost ?? '') : '',
        permit_recovery_method: v.permit_required ? (v.permit_recovery_method ?? '') : '',
      };

      const stopsPayload = v.stops.map(s => ({
        stop_type: s.stop_type,
        facility_id: s.facility_id ?? '',
        facility_name: s.facility_name ?? '',
        address_line1: s.address_line1 ?? '',
        address_line2: s.address_line2 ?? '',
        city: s.city,
        state: s.state,
        zip: s.zip ?? '',
        contact_name: s.contact_name ?? '',
        contact_phone: s.contact_phone ?? '',
        appointment_start: toIso(s.appointment_start),
        appointment_end: toIso(s.appointment_end),
        reference_number: s.reference_number ?? '',
        reference_label: s.reference_label ?? '',
        stopoff_charge_amount: s.stopoff_charge_amount ?? '',
        stop_notes: s.stop_notes ?? '',
      }));

      // load_charges is the authoritative record of every charge on the load.
      // A stop-attached charge also mirrors into load_stops.stopoff_charge_amount
      // for display; the total counts it once, from this list only.
      const chargesPayload = [
        ...v.stops
          .map((s, i) => ({ s, i }))
          .filter(({ s, i }) => i > 0 && i < v.stops.length - 1 && Number(s.stopoff_charge_amount) > 0)
          .map(({ s, i }) => ({
            stop_index: String(i),
            charge_type: 'stopoff',
            description: 'Stop-off charge',
            amount: String(s.stopoff_charge_amount),
            source: 'manual',
          })),
        ...(v.charges ?? [])
          .filter(c => Number(c.amount) > 0)
          .map(c => ({
            stop_index: '',
            charge_type: c.charge_type || 'other',
            description: c.description || '',
            amount: String(c.amount),
            source: 'parsed_rate_confirmation',
          })),
      ];

      loadPayloadForLog = loadPayload;
      stopsPayloadForLog = stopsPayload;

      const { data, error } = await supabase.rpc('create_load_with_stops', {
        p_load: loadPayload as never,
        p_stops: stopsPayload as never,
        p_charges: chargesPayload as never,
      });
      if (error) throw error;

      const newId = data as unknown as string;

      // The parsed rate confirmation becomes the load's source document.
      if (sourceFile) {
        try {
          await uploadLoadDocument({
            loadId: newId,
            documentType: 'rate_confirmation',
            file: sourceFile,
          });
        } catch (uploadError) {
          logDbError('rate confirmation attach', uploadError, { loadId: newId });
          toast({
            variant: 'destructive',
            title: 'Rate confirmation not attached',
            description: 'The load was created, but the file did not upload. Add it from the load page.',
          });
        }
      }

      toast({ description: `Load ${v.load_number} created.` });
      if (onCreated) onCreated(newId);
      else navigate(`/dispatch/loads/${newId}`);
    } catch (e) {
      logDbError('create_load_with_stops', e, { p_load: loadPayloadForLog, p_stops: stopsPayloadForLog });
      toast({
        variant: 'destructive',
        title: 'Load not saved',
        description: getDbErrorMessage(e, 'Could not create the load.'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={goBack}>
        <ArrowLeft className="h-4 w-4" />
        Back to Loads
      </Button>

      <h1 className="text-xl font-semibold text-foreground">Create Load</h1>

      <FormProvider {...form}>
        <Form {...form}>
          <form
            ref={formRef}
            onSubmit={form.handleSubmit(onSubmit, scrollToFirstError)}
            className="space-y-4"
          >
            <RateConfirmationParser
              onSourceFileChange={setSourceFile}
              onExtractedBroker={setExtractedBroker}
              onFacilitySuggestions={setFacilitySuggestions}
            />

            {/* 1 — Load type */}
            <Section title="Load Type">
              <FormField
                control={form.control}
                name="load_type"
                render={({ field }) => (
                  <FormItem>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {LOAD_TYPES.map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => field.onChange(t)}
                          className={`rounded-lg border px-4 py-3 text-sm font-medium text-left transition-colors ${
                            field.value === t
                              ? 'border-gold bg-gold/10 text-foreground'
                              : 'border-border bg-background text-muted-foreground hover:border-gold/50'
                          }`}
                        >
                          {LOAD_TYPE_LABELS[t]}
                        </button>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Section>

            {/* 2 — Load details */}
            <Section title="Load Details">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <FormField
                  control={form.control}
                  name="load_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Load Number *</FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input {...field} readOnly className="font-mono bg-muted/40" />
                        </FormControl>
                        <Button
                          type="button" variant="outline" size="icon"
                          onClick={generateNumber} disabled={numberLoading}
                          aria-label="Regenerate load number"
                        >
                          <RefreshCw className={`h-4 w-4 ${numberLoading ? 'animate-spin' : ''}`} />
                        </Button>
                      </div>
                      <FormDescription>The number format is configurable in settings.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="broker_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isLoadout ? 'Broker (optional)' : 'Broker'}</FormLabel>
                      <BrokerSelect
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        optional={isLoadout}
                        provisionalName={extractedBroker}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="broker_reference_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Broker's Load #</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bol_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>BOL Number</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="po_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>PO Number</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="equipment_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Equipment Type *</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {EQUIPMENT_TYPES.map(t => (
                            <SelectItem key={t} value={t}>{formatEnumLabel(t)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {!handlingLocked && (
                  <FormField
                    control={form.control}
                    name="handling_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Handling Type</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            {HANDLING_TYPES.map(t => (
                              <SelectItem key={t} value={t}>{HANDLING_TYPE_LABELS[t]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={form.control}
                  name="commodity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Commodity</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {!isLoadout && (
                  <FormField
                    control={form.control}
                    name="weight_lbs"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Weight (lbs)</FormLabel>
                        <FormControl><Input inputMode="decimal" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </Section>

            {/* 3 — Reefer */}
            {isReefer && (
              <Section title="Reefer Requirements">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="reefer_temp_f"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Required temperature (°F) *</FormLabel>
                        <FormControl><Input inputMode="decimal" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="reefer_temp_min_f"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Min temp (°F)</FormLabel>
                        <FormControl><Input inputMode="decimal" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="reefer_temp_max_f"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max temp (°F)</FormLabel>
                        <FormControl><Input inputMode="decimal" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="reefer_precool_required"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0 pt-6">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={v => field.onChange(!!v)} />
                        </FormControl>
                        <FormLabel className="font-normal">Pre-cool required</FormLabel>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="reefer_continuous_run"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0 pt-6">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={v => field.onChange(!!v)} />
                        </FormControl>
                        <FormLabel className="font-normal">Continuous run required</FormLabel>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="reefer_notes"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2 lg:col-span-3">
                        <FormLabel>Reefer notes</FormLabel>
                        <FormControl><Textarea rows={2} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </Section>
            )}

            {/* 4 — Loadout */}
            {isLoadout && (
              <Section
                title="Trailer Relocation Details"
                description="Photos taken at pickup and delivery serve as proof of delivery for this load type."
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {([
                    ['loadout_trailer_owner_company', 'Trailer owner company'],
                    ['loadout_trailer_owner_contact', 'Trailer owner contact'],
                    ['loadout_trailer_number', 'Trailer number'],
                    ['loadout_trailer_vin', 'Trailer VIN'],
                    ['loadout_trailer_type', 'Trailer type'],
                  ] as const).map(([name, label]) => (
                    <FormField
                      key={name}
                      control={form.control}
                      name={name}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{label}</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                  <FormField
                    control={form.control}
                    name="loadout_relocation_fee"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Relocation fee *</FormLabel>
                        <FormControl><Input inputMode="decimal" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="loadout_use_period_days"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Trailer use period (days)</FormLabel>
                        <FormControl><Input inputMode="numeric" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </Section>
            )}

            {/* 5 — Rate */}
            {!isLoadout && (
              <Section title="Rate">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="rate_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rate Type</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange} disabled={isPerTonBulk}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            {RATE_TYPES.map(t => (
                              <SelectItem key={t} value={t}>{RATE_TYPE_LABELS[t]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {isPerTonBulk && <FormDescription>Per-Ton Bulk loads always bill per ton.</FormDescription>}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {(values.rate_type === 'flat' || values.rate_type === 'percentage_of_load') && (
                    <FormField
                      control={form.control}
                      name="linehaul_rate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Linehaul Rate *</FormLabel>
                          <FormControl><Input inputMode="decimal" {...field} /></FormControl>
                          {values.rate_type === 'percentage_of_load' && (
                            <FormDescription>Enter the agreed load value the percentage applies to.</FormDescription>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {values.rate_type === 'per_mile' && (
                    <FormField
                      control={form.control}
                      name="rate_per_mile"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Rate Per Mile *</FormLabel>
                          <FormControl><Input inputMode="decimal" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {values.rate_type === 'per_ton' && (
                    <>
                      <FormField
                        control={form.control}
                        name="rate_per_ton"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Rate Per Ton *</FormLabel>
                            <FormControl><Input inputMode="decimal" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="estimated_tons"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Estimated Tons</FormLabel>
                            <FormControl><Input inputMode="decimal" {...field} /></FormControl>
                            <FormDescription>Confirmed tonnage comes from the scale ticket after pickup.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}

                  <FormField
                    control={form.control}
                    name="fsc_bundled_into_linehaul"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-3 space-y-0 pt-6">
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <FormLabel className="font-normal">FSC bundled into linehaul</FormLabel>
                      </FormItem>
                    )}
                  />
                  {!values.fsc_bundled_into_linehaul && (
                    <FormField
                      control={form.control}
                      name="fsc_amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>FSC Amount</FormLabel>
                          <FormControl><Input inputMode="decimal" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <FormField
                    control={form.control}
                    name="loaded_miles"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Loaded Miles</FormLabel>
                        <FormControl><Input inputMode="decimal" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="deadhead_miles"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Deadhead Miles</FormLabel>
                        <FormControl><Input inputMode="decimal" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {(values.charges ?? []).length > 0 && (
                  <div className="rounded-md border border-border bg-background p-3 space-y-2">
                    <p className="text-sm font-semibold text-foreground">Additional charges on this load</p>
                    <p className="text-xs text-muted-foreground">
                      Not attached to a stop. Each one is included in Total Load Value.
                    </p>
                    {(values.charges ?? []).map((c, i) => (
                      <div key={`${c.description}-${i}`} className="flex items-center gap-2 text-sm">
                        <span className="text-foreground">{c.description || 'Charge'}</span>
                        <span className="font-semibold text-foreground">{formatCurrency(Number(c.amount) || 0)}</span>
                        <Button
                          type="button" variant="ghost" size="sm" className="ml-auto h-7 px-2 text-xs"
                          onClick={() => form.setValue(
                            'charges',
                            (form.getValues('charges') ?? []).filter((_, idx) => idx !== i),
                            { shouldDirty: true },
                          )}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded-md border border-gold/40 bg-gold/5 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total Load Value</span>
                  <span className="text-lg font-semibold text-foreground">{formatCurrency(totalValue)}</span>
                </div>
              </Section>
            )}

            {isLoadout && (
              <div className="rounded-md border border-gold/40 bg-gold/5 px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Load Value</span>
                <span className="text-lg font-semibold text-foreground">{formatCurrency(totalValue)}</span>
              </div>
            )}

            {/* 6 — Stops */}
            <Section
              title="Stops"
              description="Stops save in the order shown. Any stop between the first and last is marked stop-off charge eligible."
            >
              <StopsSection facilitySuggestions={facilitySuggestions} />
              {form.formState.errors.stops?.message && (
                <p className="text-sm font-medium text-destructive">
                  {form.formState.errors.stops.message as string}
                </p>
              )}
            </Section>

            {/* 7 — Notes and flags */}
            <Section title="Notes and Flags">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="internal_notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Internal Notes</FormLabel>
                      <FormControl><Textarea rows={3} {...field} /></FormControl>
                      <FormDescription>Staff only — never shown to the driver.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="driver_facing_notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Driver-Facing Notes</FormLabel>
                      <FormControl><Textarea rows={3} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="special_instructions"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Special Instructions</FormLabel>
                      <FormControl><Textarea rows={2} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex flex-wrap gap-6 pt-1">
                <FormField
                  control={form.control}
                  name="is_team_load"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={v => field.onChange(!!v)} />
                      </FormControl>
                      <FormLabel className="font-normal">Team Load</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="is_hazmat"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={v => field.onChange(!!v)} />
                      </FormControl>
                      <FormLabel className="font-normal">Hazmat</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="permit_required"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={v => field.onChange(!!v)} />
                      </FormControl>
                      <FormLabel className="font-normal">Permit Required</FormLabel>
                    </FormItem>
                  )}
                />
              </div>

              {(values.is_team_load || values.permit_required) && (
                <div className="grid gap-3 sm:grid-cols-3">
                  {values.is_team_load && (
                    <FormField
                      control={form.control}
                      name="co_driver_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Co-Driver Name</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  {values.permit_required && (
                    <>
                      <FormField
                        control={form.control}
                        name="permit_cost"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Permit Cost</FormLabel>
                            <FormControl><Input inputMode="decimal" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="permit_recovery_method"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Permit Recovery Method</FormLabel>
                            <Select value={field.value || ''} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="bill_to_broker">Bill to Broker</SelectItem>
                                <SelectItem value="charge_to_driver">Charge to Driver</SelectItem>
                                <SelectItem value="absorb">Absorb</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}
                </div>
              )}
            </Section>

            <div className="flex items-center justify-end gap-2 pb-8">
              <Button type="button" variant="outline" onClick={goBack} disabled={submitting}>Cancel</Button>
              <Button
                type="submit"
                disabled={submitting}
                className="gap-1.5 bg-gold text-surface-dark hover:bg-gold-light"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Load
              </Button>
            </div>
          </form>
        </Form>
      </FormProvider>
    </div>
  );
}
