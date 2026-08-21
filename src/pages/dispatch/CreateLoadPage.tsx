import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
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
import { buildLoadSavePayload } from '@/lib/loadSavePayload';
import { EQUIPMENT_TYPES, formatCurrency, formatEnumLabel } from '@/lib/loadFormat';
import {
  HANDLING_TYPES, HANDLING_TYPE_LABELS, LOAD_TYPES, LOAD_TYPE_LABELS,
  RATE_TYPES, RATE_TYPE_LABELS, calcTotalLoadValue,
} from '@/lib/loadRateMath';
import { loadFormDefaults, loadFormSchema, type LoadFormValues } from './loadFormSchema';
import { getDbErrorMessage, logDbError } from '@/lib/dbError';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { fetchLoadForEdit, updateLoadWithStops } from '@/lib/loadDetail';
import { loadToFormValues, financialChanges, removedStops } from '@/lib/loadEdit';
import { financialEditTier } from '@/lib/loadStatusFlow';
import type { LoadStatus } from '@/lib/loadFormat';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Lock } from 'lucide-react';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import DuplicateBrokerRefDialog from '@/components/dispatch/loadForm/DuplicateBrokerRefDialog';
import {
  checkForDuplicateBrokerReference, recordDuplicateOverride, type DuplicateMatch,
} from '@/lib/duplicateBrokerRef';
import { stashRateConForLoad } from '@/lib/rateConHandoff';
import type { ParsedRateConfirmation } from '@/lib/rateConfirmation';
import { UnsavedChangesDialog } from '@/components/shared/UnsavedChangesDialog';



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
  const [parsedRateCon, setParsedRateCon] = useState<ParsedRateConfirmation | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  /** True when the warning interrupted a save rather than firing at parse time. */
  const [duplicateAtSave, setDuplicateAtSave] = useState(false);
  // Set once the dispatcher has chosen to create anyway: {existingLoadId, reason}.
  const duplicateOverride = useRef<{ existingLoadId: string; reason: string } | null>(null);
  // References already cleared this session, so the backstop does not re-ask.
  const duplicateCleared = useRef<Set<string>>(new Set());
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

  const leaveNow = () => (onCancel
    ? onCancel()
    : navigate(isEdit ? `/dispatch/loads/${loadId}` : '/dispatch/loads'));

  // Routed through the unsaved-changes guard below; safe to reference before
  // the hook call because it only runs on click.
  const goBack = () => unsaved.guard(leaveNow);


  const scrollToFirstError = () => {
    window.requestAnimationFrame(() => {
      const el = formRef.current?.querySelector('[aria-invalid="true"], [data-error="true"]');
      if (el) (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const performSave = async (
    v: LoadFormValues, reasonText: string | null = null, unlockText: string | null = null,
  ) => {
    setSubmitting(true);
    let loadPayloadForLog: unknown = null;
    let stopsPayloadForLog: unknown = null;
    try {
      const {
        load: loadPayload, stops: stopsPayload, charges: chargesPayload,
      } = buildLoadSavePayload(v, { isEdit });

      loadPayloadForLog = loadPayload;
      stopsPayloadForLog = stopsPayload;


      let savedId: string;

      if (isEdit) {
        const before = initialValues.current;
        const dropped = before ? removedStops(before, v) : [];
        savedId = await updateLoadWithStops({
          loadId: loadId as string,
          load: loadPayload,
          stops: stopsPayload,
          charges: chargesPayload,
          reason: reasonText,
          unlockReason: financialUnlocked ? unlockText : null,
          // The removal dialog is the acknowledgement; only send it when one applies.
          acknowledgeStopDataLoss: dropped.some(s => s.hasDriverData),
        });
      } else {
        const { data, error } = await supabase.rpc('create_load_with_stops', {
          p_load: loadPayload as never,
          p_stops: stopsPayload as never,
          p_charges: chargesPayload as never,
        });
        if (error) throw error;
        savedId = data as unknown as string;
      }

      const newId = savedId;

      // A duplicate created knowingly is recorded on BOTH loads, so either one
      // explains the relationship later. A failure here must not lose the load.
      const override = duplicateOverride.current;
      if (!isEdit && override) {
        try {
          await recordDuplicateOverride({
            newLoadId: newId,
            existingLoadId: override.existingLoadId,
            reason: override.reason,
          });
          await queryClient.invalidateQueries({
            queryKey: ['load-change-history', override.existingLoadId],
          });
        } catch (overrideError) {
          logDbError('record_duplicate_broker_reference', overrideError, { loadId: newId });
          toast({
            variant: 'destructive',
            title: 'Duplicate note not recorded',
            description: 'The load was created, but the duplicate reason was not written to the change history.',
          });
        }
        duplicateOverride.current = null;
      }

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
            description: 'The load was saved, but the file did not upload. Add it from the load page.',
          });
        }
      }

      // Disarm the unsaved-changes guard before navigating: the work is
      // persisted, so neither beforeunload nor guard() should interrupt.
      form.reset(v);
      setSourceFile(null);

      if (isEdit) {
        await queryClient.invalidateQueries({ queryKey: ['load-detail', newId] });
        await queryClient.invalidateQueries({ queryKey: ['load-change-history', newId] });
        await queryClient.invalidateQueries({ queryKey: ['load-edit', newId] });
        toast({ description: `Load ${v.load_number} updated.` });
        if (onSaved) onSaved(newId);
        else navigate(`/dispatch/loads/${newId}`);
      } else {
        toast({ description: `Load ${v.load_number} created.` });
        if (onCreated) onCreated(newId);
        else navigate(`/dispatch/loads/${newId}`);
      }
      return true;
    } catch (e) {
      logDbError(isEdit ? 'update_load_with_stops' : 'create_load_with_stops', e, {
        p_load: loadPayloadForLog, p_stops: stopsPayloadForLog,
      });
      toast({
        variant: 'destructive',
        title: 'Load not saved',
        description: getDbErrorMessage(e, isEdit ? 'Could not update the load.' : 'Could not create the load.'),
      });
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Looks for an existing, non-cancelled load with the same broker and the same
   * broker reference. Warn-only: it never blocks, it just surfaces the match.
   */
  const runDuplicateCheck = async (
    reference: string, brokerId: string,
  ): Promise<DuplicateMatch[]> => {
    const key = `${brokerId}|${reference.trim().toUpperCase()}`;
    if (duplicateCleared.current.has(key)) return [];
    try {
      const matches = await checkForDuplicateBrokerReference({
        reference,
        brokerId,
        extractedBrokerName: extractedBroker,
      });
      if (matches.length === 0) return [];
      setDuplicates(matches);
      setDuplicateOpen(true);
      return matches;
    } catch (e) {
      // A failed check never stands between a dispatcher and a load.
      logDbError('duplicate broker reference check', e, { reference });
      return [];
    }
  };

  /** Fires as soon as a reference is extracted, before any other effort is spent. */
  const onParsedRateCon = async (result: ParsedRateConfirmation | null) => {
    setParsedRateCon(result);
    if (!result) return;
    const reference = (form.getValues('broker_reference_number') ?? '').trim();
    if (!reference) return;
    setDuplicateAtSave(false);
    await runDuplicateCheck(reference, form.getValues('broker_id') ?? '');
  };

  /** Financial edits need a written reason before the save is allowed to run. */
  const onSubmit = async (v: LoadFormValues): Promise<boolean> => {
    if (!isEdit) {
      // Backstop: the reference may have been typed or edited after the parse.
      const reference = (v.broker_reference_number ?? '').trim();
      if (reference && !duplicateOverride.current) {
        const matches = await runDuplicateCheck(reference, v.broker_id ?? '');
        if (matches.length > 0) {
          pendingValues.current = v;
          setDuplicateAtSave(true);
          return false;
        }
      }
      return performSave(v);
    }
    const before = initialValues.current;
    const changed = before ? financialChanges(before, v) : [];
    if (changed.length > 0 && !reason.trim()) {
      pendingValues.current = v;
      setReasonOpen(true);
      return false;
    }
    return performSave(v, reason.trim() || null, unlockReason.trim() || null);
  };

  // ── Unsaved-changes guard ────────────────────────────────────────────────
  // Dirty covers both modes. In create mode the rate-confirmation parser writes
  // every extracted field with shouldDirty, so a parsed-but-unsaved load counts
  // as dirty; the attached source file lives outside the form, so it is ORed in.
  const isDirty = form.formState.isDirty || !!sourceFile;

  const guardedSave = async () => {
    let saved = false;
    await form.handleSubmit(async (v) => { saved = await onSubmit(v); }, scrollToFirstError)();
    // Throwing keeps the dialog open and surfaces the error state instead of
    // silently navigating away with the work unsaved.
    if (!saved) throw new Error('Load not saved');
  };

  const unsaved = useUnsavedChanges({
    dirty: isDirty,
    onSave: guardedSave,
    onDiscard: () => {
      form.reset(initialValues.current ?? loadFormDefaults());
      setSourceFile(null);
    },
  });

  const dismissDuplicates = () => {
    setDuplicateOpen(false);
    const v = pendingValues.current;
    const reference = (v?.broker_reference_number ?? form.getValues('broker_reference_number') ?? '').trim();
    const brokerId = v?.broker_id ?? form.getValues('broker_id') ?? '';
    if (reference) duplicateCleared.current.add(`${brokerId}|${reference.toUpperCase()}`);
    pendingValues.current = null;
  };

  const goToExistingLoad = (existingLoadId: string) => {
    setDuplicateOpen(false);
    unsaved.guard(() => (onCreated
      ? onCreated(existingLoadId)
      : navigate(`/dispatch/loads/${existingLoadId}`)));
  };

  /** Carries the uploaded file over so the revision flow does not ask for it twice. */
  const reviseExistingLoad = (existingLoadId: string) => {
    if (sourceFile) stashRateConForLoad(existingLoadId, sourceFile, parsedRateCon);
    goToExistingLoad(existingLoadId);
  };

  const createDespiteDuplicate = (existingLoadId: string, reason: string) => {
    duplicateOverride.current = { existingLoadId, reason };
    setDuplicateOpen(false);
    const v = pendingValues.current;
    pendingValues.current = null;
    // Parse-time warnings have nothing pending: the dispatcher keeps filling the
    // form and the recorded override rides along with the eventual save.
    if (v) void performSave(v);
    else toast({ description: 'Noted — the duplicate reason will be saved with this load.' });
  };

  const confirmReasonAndSave = () => {
    const v = pendingValues.current;
    if (!v || !reason.trim()) return;
    setReasonOpen(false);
    void performSave(v, reason.trim(), unlockReason.trim() || null);
  };

  if (isEdit && editLoading) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading load…
      </div>
    );
  }

  if (isEdit && (editError || (!editLoading && !editData))) {
    return (
      <div className="space-y-4 max-w-2xl">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={goBack}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Alert variant="destructive">
          <AlertTitle>Load unavailable</AlertTitle>
          <AlertDescription>
            {editError ? getDbErrorMessage(editError, 'Could not load this record.') : 'This load no longer exists.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <UnsavedChangesDialog
        pending={unsaved.pendingExit}
        title={isEdit ? 'You have unsaved changes' : 'Discard this load?'}
        description={isEdit
          ? 'Save your changes before leaving, or discard them and continue.'
          : 'This load has not been created yet. Save it now, or discard it and continue — nothing is stored until it is saved.'}
      />

      {!isEdit && (
        <DuplicateBrokerRefDialog
          open={duplicateOpen}
          matches={duplicates}
          reference={(values.broker_reference_number ?? '').trim()}
          canRevise={!!sourceFile}
          onOpenChange={o => { if (!o) dismissDuplicates(); }}
          onViewExisting={goToExistingLoad}
          onUpdateExisting={reviseExistingLoad}
          onCreateAnyway={createDespiteDuplicate}
          createLabel={duplicateAtSave ? 'Create anyway' : 'Create anyway when I save'}
        />
      )}

      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={goBack}>
        <ArrowLeft className="h-4 w-4" />
        {isEdit ? 'Back to Load' : 'Back to Loads'}
      </Button>

      <h1 className="text-xl font-semibold text-foreground">
        {isEdit ? `Edit Load ${values.load_number || ''}`.trim() : 'Create Load'}
      </h1>

      {isEdit && tier === 'warn' && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>This load is close to invoicing</AlertTitle>
          <AlertDescription>
            Rates and charges can still be changed, but the load is already at
            “{formatEnumLabel(loadStatus)}”. Any financial change requires a written reason
            and will be recorded in the load's change history.
          </AlertDescription>
        </Alert>
      )}

      {isEdit && tier === 'locked' && (
        <Alert variant={financialUnlocked ? 'default' : 'destructive'}>
          <Lock className="h-4 w-4" />
          <AlertTitle>Financial fields are locked</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              This load is “{formatEnumLabel(loadStatus)}” — it has been billed out, so rates
              and charges cannot be edited. Operational details can still be corrected.
            </p>
            {isOwner && !financialUnlocked && (
              <Button
                type="button" size="sm" variant="outline"
                onClick={() => setFinancialUnlocked(true)}
              >
                Unlock financial fields (owner override)
              </Button>
            )}
            {financialUnlocked && (
              <div className="space-y-1.5">
                <Label htmlFor="unlock-reason">Owner override reason (required)</Label>
                <Textarea
                  id="unlock-reason"
                  value={unlockReason}
                  onChange={e => setUnlockReason(e.target.value)}
                  placeholder="Why is a billed load being changed?"
                  rows={2}
                />
              </div>
            )}
            {!isOwner && <p className="text-xs">Only the owner can override this.</p>}
          </AlertDescription>
        </Alert>
      )}

      <FormProvider {...form}>
        <Form {...form}>
          <form
            ref={formRef}
            onSubmit={form.handleSubmit(onSubmit, scrollToFirstError)}
            className="space-y-4"
          >
            {!isEdit && (
              <RateConfirmationParser
                onParsed={result => void onParsedRateCon(result)}
                onSourceFileChange={setSourceFile}
                onExtractedBroker={setExtractedBroker}
                onFacilitySuggestions={setFacilitySuggestions}
              />
            )}


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
                        {!isEdit && (
                          <Button
                            type="button" variant="outline" size="icon"
                            onClick={generateNumber} disabled={numberLoading}
                            aria-label="Regenerate load number"
                          >
                            <RefreshCw className={`h-4 w-4 ${numberLoading ? 'animate-spin' : ''}`} />
                          </Button>
                        )}
                      </div>
                      <FormDescription>
                        {isEdit
                          ? 'The load number cannot be changed after creation.'
                          : 'The number format is configurable in settings.'}
                      </FormDescription>

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
                <fieldset disabled={financialLocked} className="space-y-4 disabled:opacity-70">
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
                      <FormControl><CurrencyInput {...field} /></FormControl>
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
                      <FormControl><CurrencyInput {...field} /></FormControl>
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
                      <FormControl><CurrencyInput {...field} /></FormControl>
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
                </fieldset>


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
              <StopsSection
                facilitySuggestions={facilitySuggestions}
                financialLocked={financialLocked}
              />

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
                disabled={submitting || (financialUnlocked && !unlockReason.trim())}
                className="gap-1.5 bg-gold text-surface-dark hover:bg-gold-light"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isEdit ? 'Save Changes' : 'Create Load'}
              </Button>
            </div>
          </form>
        </Form>
      </FormProvider>

      <Dialog open={reasonOpen} onOpenChange={setReasonOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Why is the money changing?</DialogTitle>
            <DialogDescription>
              This edit changes what the broker is billed
              {pendingValues.current && initialValues.current
                ? `: ${financialChanges(initialValues.current, pendingValues.current).join(', ')}.`
                : '.'}{' '}
              A written reason is required and is stored in the load's change history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="financial-reason">Reason (required)</Label>
            <Textarea
              id="financial-reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="Revised rate confirmation received — linehaul increased by $150."
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReasonOpen(false)}>Cancel</Button>
            <Button
              type="button"
              disabled={reason.trim().length < 5}
              onClick={confirmReasonAndSave}
              className="bg-gold text-surface-dark hover:bg-gold-light"
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

}
