import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { FormField, AppInput, AppSelect, AppTextarea, RadioGroup, CheckboxGroup } from '@/components/application/FormField';
import Step3Employment from '@/components/application/Step3Employment';
import { Loader2, Send, X, Lock, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { US_STATES, type ApplicationFormData, type EmployerRecord, defaultFormData } from '@/components/application/types';
import { computeApplicationDiff, type DiffEntry } from '@/lib/applicationDiff';
import { formatValue } from '@/lib/applicationCorrections';
import { cn } from '@/lib/utils';
import { useScrollIntoViewOnOpen } from '@/hooks/useScrollIntoViewOnOpen';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  application: Record<string, unknown> & {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    email: string;
  };
  onSent: () => void;
}

const ENDORSEMENTS = ['H', 'N', 'P', 'S', 'T', 'X'];
const EQUIPMENT = ['Dry Van', 'Reefer', 'Flatbed', 'Tanker', 'Step Deck', 'Lowboy', 'Container', 'Auto Hauler', 'Other'];

/** Build an editable ApplicationFormData object from a raw application row. */
function hydrateDraft(app: Record<string, unknown>): ApplicationFormData {
  const get = <T,>(k: string, fallback: T): T => {
    const v = app[k];
    return v === undefined || v === null ? fallback : (v as T);
  };
  /**
   * Normalize a stored yes/no field into the 'yes' | 'no' | '' strings the
   * form controls expect. Applications historically stored these as booleans
   * in Postgres, but the RadioGroup options are string-valued, so a raw
   * boolean would render as neither selected and later diff as `Yes → Yes`.
   */
  const yn = (k: string): '' | 'yes' | 'no' => {
    const v = app[k];
    if (v === true || v === 'yes' || v === 'true' || v === 1 || v === '1') return 'yes';
    if (v === false || v === 'no' || v === 'false' || v === 0 || v === '0') return 'no';
    return '';
  };
  return {
    ...defaultFormData,
    first_name: get('first_name', ''),
    last_name: get('last_name', ''),
    dob: get('dob', ''),
    phone: get('phone', ''),
    email: get('email', ''),
    address_street: get('address_street', ''),
    address_line2: get('address_line2', ''),
    address_city: get('address_city', ''),
    address_state: get('address_state', ''),
    address_zip: get('address_zip', ''),
    address_duration: get('address_duration', ''),
    prev_address_street: get('prev_address_street', ''),
    prev_address_line2: get('prev_address_line2', ''),
    prev_address_city: get('prev_address_city', ''),
    prev_address_state: get('prev_address_state', ''),
    prev_address_zip: get('prev_address_zip', ''),
    cdl_state: get('cdl_state', ''),
    cdl_number: get('cdl_number', ''),
    cdl_class: get('cdl_class', ''),
    cdl_expiration: get('cdl_expiration', ''),
    endorsements: Array.isArray(app.endorsements) ? (app.endorsements as string[]) : [],
    cdl_10_years: yn('cdl_10_years'),
    referral_source: get('referral_source', ''),
    employers: (Array.isArray(app.employers) && app.employers.length > 0
      ? (app.employers as EmployerRecord[])
      : []) as EmployerRecord[],
    employment_gaps: yn('employment_gaps'),
    employment_gaps_explanation: get('employment_gaps_explanation', ''),
    years_experience: get('years_experience', ''),
    equipment_operated: Array.isArray(app.equipment_operated) ? (app.equipment_operated as string[]) : [],
    dot_accidents: yn('dot_accidents'),
    dot_accidents_description: get('dot_accidents_description', ''),
    moving_violations: yn('moving_violations'),
    moving_violations_description: get('moving_violations_description', ''),
    sap_process: yn('sap_process'),
    dot_positive_test_past_2yr: yn('dot_positive_test_past_2yr'),
    dot_return_to_duty_docs: yn('dot_return_to_duty_docs'),
  };
}

/** Section wrapper with collapsible header — keeps long form scannable. */
function Section({ title, count, defaultOpen = true, children }: { title: string; count?: number; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const sectionRef = useScrollIntoViewOnOpen<HTMLElement>(open);
  return (
    <section ref={sectionRef} className="border border-border rounded-xl bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
          {typeof count === 'number' && count > 0 && (
            <Badge variant="secondary" className="text-[10px] bg-gold/15 text-foreground border-gold/30">
              {count} edit{count === 1 ? '' : 's'}
            </Badge>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4 pt-1 space-y-4">{children}</div>}
    </section>
  );
}

function LockedBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 border border-border rounded-md px-3 py-2">
      <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function ProposeChangesDrawer({ open, onOpenChange, application, onSent }: Props) {
  const snapshot = useMemo(() => hydrateDraft(application), [application]);
  const [draft, setDraft] = useState<ApplicationFormData>(snapshot);
  const [reason, setReason] = useState('');
  const [courtesy, setCourtesy] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showChangesPanel, setShowChangesPanel] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(snapshot);
      setReason('');
      setCourtesy('');
      setShowChangesPanel(false);
    }
  }, [open, snapshot]);

  const update = (k: keyof ApplicationFormData, v: unknown) =>
    setDraft((prev) => ({ ...prev, [k]: v as never }));

  const diff = useMemo<DiffEntry[]>(
    () => computeApplicationDiff(snapshot as unknown as Record<string, unknown>, draft as unknown as Record<string, unknown>),
    [snapshot, draft],
  );

  const diffByPath = useMemo(() => new Map(diff.map((d) => [d.field_path, d])), [diff]);
  const sectionCount = (paths: string[]) => paths.filter((p) => diffByPath.has(p)).length;

  const changedClass = (path: string) =>
    diffByPath.has(path) ? 'ring-2 ring-gold/60 rounded-lg -m-1 p-1 bg-gold/5' : '';

  const fullName = [application.first_name, application.last_name].filter(Boolean).join(' ') || application.email;

  const handleSubmit = async () => {
    if (reason.trim().length < 5) {
      toast.error('Please enter a reason (at least 5 characters).');
      return;
    }
    if (diff.length === 0) {
      toast.error('No changes to send — edit at least one field first.');
      return;
    }

    const payload = diff.map((d) => ({
      field_path: d.field_path,
      field_label: d.field_label,
      old_value: d.old_value ?? null,
      new_value: d.new_value ?? null,
    }));

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('submit_application_correction', {
        p_application_id: application.id,
        p_reason: reason.trim(),
        p_courtesy_message: courtesy.trim() || null,
        p_fields: payload as unknown as never,
      });
      if (error) throw error;
      const requestId = (data as { request_id: string }[])?.[0]?.request_id;
      if (requestId) {
        const { error: emailErr } = await supabase.functions.invoke('send-application-correction-email', {
          body: { requestId },
        });
        if (emailErr) {
          console.warn('email send failed', emailErr);
          toast.warning(`Proposed changes saved, but email failed to send. Notify ${application.email} manually.`);
        } else {
          toast.success(`Sent ${diff.length} proposed change${diff.length === 1 ? '' : 's'} to ${application.email} for approval.`);
        }
      }
      onSent();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      const msg = (err as { message?: string })?.message || 'Failed to submit proposed changes';
      toast.error(
        msg.includes('pending_request_exists')
          ? 'There is already a pending proposal for this applicant. Cancel it first.'
          : msg,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-3xl p-0 flex flex-col gap-0 max-h-[100dvh]"
      >
        <SheetHeader className="px-5 py-4 border-b border-border space-y-1 shrink-0">
          <SheetTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-gold" />
            Propose changes — {fullName}
          </SheetTitle>
          <SheetDescription className="text-xs">
            Edit the applicant's entries directly. Every change is highlighted in gold and will be sent to the
            applicant to approve or deny with an e-signature.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4 bg-secondary/30">
          {/* Personal */}
          <Section title="Personal" count={sectionCount(['first_name','last_name','dob','phone','email'])}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className={changedClass('first_name')}>
                <FormField label="First name">
                  <AppInput value={draft.first_name} onChange={(e) => update('first_name', e.target.value)} />
                </FormField>
              </div>
              <div className={changedClass('last_name')}>
                <FormField label="Last name">
                  <AppInput value={draft.last_name} onChange={(e) => update('last_name', e.target.value)} />
                </FormField>
              </div>
              <div className={changedClass('dob')}>
                <FormField label="Date of birth">
                  <AppInput type="date" value={draft.dob} onChange={(e) => update('dob', e.target.value)} />
                </FormField>
              </div>
              <div className={changedClass('phone')}>
                <FormField label="Phone">
                  <AppInput value={draft.phone} onChange={(e) => update('phone', e.target.value)} />
                </FormField>
              </div>
              <div className={cn('sm:col-span-2', changedClass('email'))}>
                <FormField label="Email">
                  <AppInput type="email" value={draft.email} onChange={(e) => update('email', e.target.value)} />
                </FormField>
              </div>
            </div>
          </Section>

          {/* Address */}
          <Section
            title="Address"
            count={sectionCount(['address_street','address_line2','address_city','address_state','address_zip','prev_address_street','prev_address_city','prev_address_state','prev_address_zip'])}
            defaultOpen={false}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className={cn('sm:col-span-2', changedClass('address_street'))}>
                <FormField label="Street"><AppInput value={draft.address_street} onChange={(e) => update('address_street', e.target.value)} /></FormField>
              </div>
              <div className={cn('sm:col-span-2', changedClass('address_line2'))}>
                <FormField label="Line 2"><AppInput value={draft.address_line2} onChange={(e) => update('address_line2', e.target.value)} /></FormField>
              </div>
              <div className={changedClass('address_city')}>
                <FormField label="City"><AppInput value={draft.address_city} onChange={(e) => update('address_city', e.target.value)} /></FormField>
              </div>
              <div className={changedClass('address_state')}>
                <FormField label="State">
                  <AppSelect value={draft.address_state} onChange={(e) => update('address_state', e.target.value)}>
                    <option value="">Select…</option>
                    {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </AppSelect>
                </FormField>
              </div>
              <div className={changedClass('address_zip')}>
                <FormField label="ZIP"><AppInput value={draft.address_zip} onChange={(e) => update('address_zip', e.target.value)} /></FormField>
              </div>
            </div>
            <div className="border-t border-border pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className={cn('sm:col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide')}>Previous address</div>
              <div className={cn('sm:col-span-2', changedClass('prev_address_street'))}>
                <FormField label="Street"><AppInput value={draft.prev_address_street} onChange={(e) => update('prev_address_street', e.target.value)} /></FormField>
              </div>
              <div className={changedClass('prev_address_city')}>
                <FormField label="City"><AppInput value={draft.prev_address_city} onChange={(e) => update('prev_address_city', e.target.value)} /></FormField>
              </div>
              <div className={changedClass('prev_address_state')}>
                <FormField label="State">
                  <AppSelect value={draft.prev_address_state} onChange={(e) => update('prev_address_state', e.target.value)}>
                    <option value="">Select…</option>
                    {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </AppSelect>
                </FormField>
              </div>
              <div className={changedClass('prev_address_zip')}>
                <FormField label="ZIP"><AppInput value={draft.prev_address_zip} onChange={(e) => update('prev_address_zip', e.target.value)} /></FormField>
              </div>
            </div>
          </Section>

          {/* CDL */}
          <Section title="CDL" count={sectionCount(['cdl_state','cdl_number','cdl_class','cdl_expiration','endorsements','cdl_10_years','referral_source'])} defaultOpen={false}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className={changedClass('cdl_state')}>
                <FormField label="CDL state">
                  <AppSelect value={draft.cdl_state} onChange={(e) => update('cdl_state', e.target.value)}>
                    <option value="">Select…</option>
                    {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </AppSelect>
                </FormField>
              </div>
              <div className={changedClass('cdl_number')}>
                <FormField label="CDL number"><AppInput value={draft.cdl_number} onChange={(e) => update('cdl_number', e.target.value)} /></FormField>
              </div>
              <div className={changedClass('cdl_class')}>
                <FormField label="CDL class">
                  <AppSelect value={draft.cdl_class} onChange={(e) => update('cdl_class', e.target.value)}>
                    <option value="">Select…</option>
                    {['CDL-A','CDL-B','CDL-C'].map((c) => <option key={c} value={c}>{c}</option>)}
                  </AppSelect>
                </FormField>
              </div>
              <div className={changedClass('cdl_expiration')}>
                <FormField label="CDL expiration"><AppInput type="date" value={draft.cdl_expiration} onChange={(e) => update('cdl_expiration', e.target.value)} /></FormField>
              </div>
              <div className={cn('sm:col-span-2', changedClass('endorsements'))}>
                <FormField label="Endorsements">
                  <CheckboxGroup
                    values={draft.endorsements}
                    onChange={(v) => update('endorsements', v)}
                    options={ENDORSEMENTS.map((e) => ({ label: e, value: e }))}
                  />
                </FormField>
              </div>
              <div className={changedClass('cdl_10_years')}>
                <FormField label="Held CDL for 10+ years">
                  <RadioGroup name="cdl_10_years" value={draft.cdl_10_years} onChange={(v) => update('cdl_10_years', v)} options={[{label:'Yes',value:'yes'},{label:'No',value:'no'}]} />
                </FormField>
              </div>
              <div className={changedClass('referral_source')}>
                <FormField label="Referral source"><AppInput value={draft.referral_source} onChange={(e) => update('referral_source', e.target.value)} /></FormField>
              </div>
            </div>
          </Section>

          {/* Employment — reuse Step3Employment verbatim */}
          <Section
            title="Employment history"
            count={sectionCount(['employers','employment_gaps','employment_gaps_explanation'])}
            defaultOpen
          >
            <div className={cn(diffByPath.has('employers') ? 'ring-2 ring-gold/60 rounded-xl p-2 bg-gold/5' : '')}>
              <Step3Employment
                data={draft}
                onChange={(field, value) => update(field as keyof ApplicationFormData, value)}
                errors={{}}
              />
            </div>
          </Section>

          {/* Driving */}
          <Section title="Driving experience" count={sectionCount(['years_experience','equipment_operated'])} defaultOpen={false}>
            <div className={changedClass('years_experience')}>
              <FormField label="Years of experience">
                <AppInput value={draft.years_experience} onChange={(e) => update('years_experience', e.target.value)} />
              </FormField>
            </div>
            <div className={changedClass('equipment_operated')}>
              <FormField label="Equipment operated">
                <CheckboxGroup
                  values={draft.equipment_operated}
                  onChange={(v) => update('equipment_operated', v)}
                  options={EQUIPMENT.map((e) => ({ label: e, value: e }))}
                />
              </FormField>
            </div>
          </Section>

          {/* Safety */}
          <Section title="Accidents & violations" count={sectionCount(['dot_accidents','dot_accidents_description','moving_violations','moving_violations_description'])} defaultOpen={false}>
            <div className={changedClass('dot_accidents')}>
              <FormField label="DOT accidents (past)">
                <RadioGroup name="dot_accidents" value={draft.dot_accidents} onChange={(v) => update('dot_accidents', v)} options={[{label:'Yes',value:'yes'},{label:'No',value:'no'}]} />
              </FormField>
            </div>
            {draft.dot_accidents === 'yes' && (
              <div className={changedClass('dot_accidents_description')}>
                <FormField label="DOT accidents — description">
                  <AppTextarea rows={3} value={draft.dot_accidents_description} onChange={(e) => update('dot_accidents_description', e.target.value)} />
                </FormField>
              </div>
            )}
            <div className={changedClass('moving_violations')}>
              <FormField label="Moving violations (past)">
                <RadioGroup name="moving_violations" value={draft.moving_violations} onChange={(v) => update('moving_violations', v)} options={[{label:'Yes',value:'yes'},{label:'No',value:'no'}]} />
              </FormField>
            </div>
            {draft.moving_violations === 'yes' && (
              <div className={changedClass('moving_violations_description')}>
                <FormField label="Moving violations — description">
                  <AppTextarea rows={3} value={draft.moving_violations_description} onChange={(e) => update('moving_violations_description', e.target.value)} />
                </FormField>
              </div>
            )}
          </Section>

          {/* Drug & Alcohol */}
          <Section title="Drug & Alcohol" count={sectionCount(['sap_process','dot_positive_test_past_2yr','dot_return_to_duty_docs'])} defaultOpen={false}>
            <div className={changedClass('sap_process')}>
              <FormField label="In SAP process">
                <RadioGroup name="sap_process" value={draft.sap_process} onChange={(v) => update('sap_process', v)} options={[{label:'Yes',value:'yes'},{label:'No',value:'no'}]} />
              </FormField>
            </div>
            <div className={changedClass('dot_positive_test_past_2yr')}>
              <FormField label="DOT positive test (past 2 yr)">
                <RadioGroup name="dot_positive_test_past_2yr" value={draft.dot_positive_test_past_2yr} onChange={(v) => update('dot_positive_test_past_2yr', v)} options={[{label:'Yes',value:'yes'},{label:'No',value:'no'}]} />
              </FormField>
            </div>
            <div className={changedClass('dot_return_to_duty_docs')}>
              <FormField label="DOT return-to-duty docs available">
                <RadioGroup name="dot_return_to_duty_docs" value={draft.dot_return_to_duty_docs} onChange={(v) => update('dot_return_to_duty_docs', v)} options={[{label:'Yes',value:'yes'},{label:'No',value:'no'}]} />
              </FormField>
            </div>
          </Section>

          <Section title="Locked sections" defaultOpen={false}>
            <LockedBanner>
              SSN, signature, consent checkboxes, and uploaded photo IDs / medical certificates can only be
              updated by the applicant themselves. Use "Send back to applicant for corrections" if any of
              those need to change.
            </LockedBanner>
          </Section>

          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-semibold text-foreground mb-1.5 block">
                Reason for changes <span className="text-destructive">*</span>
                <span className="font-normal text-muted-foreground"> (shown to the applicant)</span>
              </label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="e.g. Spelling correction on city name and added missing 2018–2019 employment based on phone conversation"
                maxLength={1000}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground mb-1.5 block">
                Courtesy note <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Textarea
                value={courtesy}
                onChange={(e) => setCourtesy(e.target.value)}
                rows={2}
                placeholder="Optional friendly note shown above the proposed changes"
                maxLength={500}
              />
            </div>
          </div>
        </div>

        {/* Sticky changes bar */}
        <div className="border-t border-border bg-background px-5 py-3 shrink-0 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowChangesPanel((v) => !v)}
            disabled={diff.length === 0}
            className="font-semibold"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5 text-gold" />
            {diff.length === 0 ? 'No changes yet' : `Review ${diff.length} change${diff.length === 1 ? '' : 's'}`}
          </Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || diff.length === 0 || reason.trim().length < 5}
            className="bg-gold text-foreground hover:bg-gold/90"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</>
            ) : (
              <><Send className="h-4 w-4 mr-2" /> Send for approval</>
            )}
          </Button>
        </div>

        {/* Changes review side panel */}
        {showChangesPanel && (
          <div
            className="absolute inset-0 bg-background/95 backdrop-blur-sm overflow-y-auto z-10"
            role="dialog"
            aria-label="Proposed changes review"
          >
            <div className="sticky top-0 border-b border-border bg-background px-5 py-3 flex items-center justify-between">
              <h3 className="text-sm font-bold">Proposed changes ({diff.length})</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowChangesPanel(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-5 space-y-3 max-w-2xl mx-auto">
              {diff.map((d) => (
                <div key={d.field_path} className="border border-gold/40 bg-gold/5 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <span className="text-sm font-semibold text-foreground">{d.field_label}</span>
                    <Badge variant="secondary" className="text-[10px] bg-gold/15 border-gold/30">edited</Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Was</div>
                      <div className="bg-muted/40 border border-border rounded px-2 py-1.5 line-through text-muted-foreground break-words">
                        {formatValue(d.old_value, d.kind)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Will become</div>
                      <div className="bg-white border border-gold rounded px-2 py-1.5 font-semibold text-foreground break-words">
                        {formatValue(d.new_value, d.kind)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}