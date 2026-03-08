import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Save, FileCheck, Truck, Shield, CheckCircle2, AlertTriangle, Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface OperatorDetailPanelProps {
  operatorId: string;
  onBack: () => void;
}

type OnboardingStatus = {
  id: string;
  mvr_status: string;
  ch_status: string;
  mvr_ch_approval: string;
  pe_screening: string;
  pe_screening_result: string;
  registration_status: string | null;
  form_2290: string;
  truck_title: string;
  truck_photos: string;
  truck_inspection: string;
  ica_status: string;
  mo_docs_submitted: string;
  mo_expected_approval_date: string | null;
  mo_reg_received: string;
  decal_method: string | null;
  decal_applied: string;
  eld_method: string | null;
  eld_installed: string;
  fuel_card_issued: string;
  insurance_added_date: string | null;
  unit_number: string | null;
  fully_onboarded: boolean | null;
};

export default function OperatorDetailPanel({ operatorId, onBack }: OperatorDetailPanelProps) {
  const { toast } = useToast();
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [operatorName, setOperatorName] = useState('');
  const [operatorEmail, setOperatorEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<Partial<OnboardingStatus>>({});
  const [statusId, setStatusId] = useState<string | null>(null);
  // Track the last-saved values of milestone fields to detect transitions
  const savedMilestones = useRef<{
    ica_status: string;
    mvr_ch_approval: string;
    pe_screening_result: string;
    insurance_added_date: string | null;
    form_2290: string;
    truck_title: string;
    truck_photos: string;
    truck_inspection: string;
    decal_applied: string;
    eld_installed: string;
    fuel_card_issued: string;
    mo_reg_received: string;
  }>({
    ica_status: '', mvr_ch_approval: '', pe_screening_result: '', insurance_added_date: null,
    form_2290: '', truck_title: '', truck_photos: '', truck_inspection: '',
    decal_applied: '', eld_installed: '', fuel_card_issued: '', mo_reg_received: '',
  });

  useEffect(() => {
    fetchOperatorDetail();
  }, [operatorId]);

  const fetchOperatorDetail = async () => {
    setLoading(true);

    // Step 1: fetch operator core data
    const { data: op } = await supabase
      .from('operators')
      .select(`id, user_id, notes, onboarding_status (*), applications (email)`)
      .eq('id', operatorId)
      .single();

    if (op) {
      // Step 2: fetch profile separately to avoid FK hint issues
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('user_id', (op as any).user_id)
        .maybeSingle();

      setOperatorName(
        profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'Unknown Operator' : 'Unknown Operator'
      );
      const app = (op as any).applications;
      setOperatorEmail(app?.email ?? '');
      setNotes((op as any).notes ?? '');
      const os = (op as any).onboarding_status?.[0];
      if (os) {
        setStatus(os);
      setStatusId(os.id);
        // Snapshot current milestone values as baseline
        savedMilestones.current = {
          ica_status: os.ica_status ?? '',
          mvr_ch_approval: os.mvr_ch_approval ?? '',
          pe_screening_result: os.pe_screening_result ?? '',
          insurance_added_date: os.insurance_added_date ?? null,
          form_2290: os.form_2290 ?? '',
          truck_title: os.truck_title ?? '',
          truck_photos: os.truck_photos ?? '',
          truck_inspection: os.truck_inspection ?? '',
          decal_applied: os.decal_applied ?? '',
          eld_installed: os.eld_installed ?? '',
          fuel_card_issued: os.fuel_card_issued ?? '',
          mo_reg_received: os.mo_reg_received ?? '',
        };
      }
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);

    // ── Detect milestone transitions before saving ──────────────────────
    const prev = savedMilestones.current;
    const isNewlyFullyOnboarded =
      !prev.insurance_added_date && !!status.insurance_added_date;

    // Check if all docs are now received (all four fields = 'received')
    const allDocsReceived =
      status.form_2290 === 'received' &&
      status.truck_title === 'received' &&
      status.truck_photos === 'received' &&
      status.truck_inspection === 'received';
    const wasAllDocsReceived =
      prev.form_2290 === 'received' &&
      prev.truck_title === 'received' &&
      prev.truck_photos === 'received' &&
      prev.truck_inspection === 'received';

    // Check if any doc transitioned to 'requested' (first time)
    const anyDocJustRequested =
      (prev.form_2290 !== 'requested' && status.form_2290 === 'requested') ||
      (prev.truck_title !== 'requested' && status.truck_title === 'requested') ||
      (prev.truck_photos !== 'requested' && status.truck_photos === 'requested') ||
      (prev.truck_inspection !== 'requested' && status.truck_inspection === 'requested');

    // Equipment ready: all three equipment items just became complete together
    const equipmentReady =
      status.decal_applied === 'yes' &&
      status.eld_installed === 'yes' &&
      status.fuel_card_issued === 'yes';
    const wasEquipmentReady =
      prev.decal_applied === 'yes' &&
      prev.eld_installed === 'yes' &&
      prev.fuel_card_issued === 'yes';

    const milestones: { key: string; label: string; triggered: boolean }[] = [
      {
        key: 'ica_sent',
        label: 'ICA Agreement Sent for Signature',
        triggered: prev.ica_status !== 'sent_for_signature' && status.ica_status === 'sent_for_signature',
      },
      {
        key: 'ica_complete',
        label: 'ICA Agreement Signed & Complete',
        triggered: prev.ica_status !== 'complete' && status.ica_status === 'complete',
      },
      {
        key: 'mvr_approved',
        label: 'MVR / Clearinghouse Background Check Approved',
        triggered: prev.mvr_ch_approval !== 'approved' && status.mvr_ch_approval === 'approved',
      },
      {
        key: 'pe_clear',
        label: 'Pre-Employment Screening — Clear',
        triggered: prev.pe_screening_result !== 'clear' && status.pe_screening_result === 'clear',
      },
      {
        key: 'docs_requested',
        label: 'Documents Requested — Please Upload Your Documents',
        triggered: anyDocJustRequested,
      },
      {
        key: 'docs_approved',
        label: 'All Documents Received & Approved',
        triggered: !wasAllDocsReceived && allDocsReceived,
      },
      {
        key: 'equipment_ready',
        label: 'Equipment Setup Complete (Decal, ELD, Fuel Card)',
        triggered: !wasEquipmentReady && equipmentReady,
      },
      {
        key: 'mo_reg_received',
        label: 'Missouri Registration Received',
        triggered: prev.mo_reg_received !== 'yes' && status.mo_reg_received === 'yes',
      },
      {
        key: 'fully_onboarded',
        label: 'Fully Onboarded — Welcome to SUPERTRANSPORT!',
        triggered: isNewlyFullyOnboarded,
      },
    ];
    const triggeredMilestones = milestones.filter(m => m.triggered);

    const { error } = await supabase
      .from('operators')
      .update({ notes })
      .eq('id', operatorId);

    if (statusId) {
      // fully_onboarded is a DB-generated column (insurance_added_date IS NOT NULL) — never write it
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, fully_onboarded: _fo, ...updateData } = status as any;
      await supabase
        .from('onboarding_status')
        .update(updateData)
        .eq('id', statusId);

      // Reflect generated value in local state immediately so header badge updates
      if (isNewlyFullyOnboarded) {
        setStatus(prev => ({ ...prev, fully_onboarded: true }));
      }
    }

    if (error) {
      toast({ title: 'Error saving', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved successfully', description: 'Operator record has been updated.' });

      // ── Fire milestone notifications ──────────────────────────────────
      if (triggeredMilestones.length > 0) {
        for (const m of triggeredMilestones) {
          try {
            await supabase.functions.invoke('send-notification', {
              body: {
                type: 'onboarding_milestone',
                operator_id: operatorId,
                operator_name: operatorName,
                operator_email: operatorEmail || undefined,
                milestone: m.label,
                milestone_key: m.key,
              },
              headers: session?.access_token
                ? { Authorization: `Bearer ${session.access_token}` }
                : undefined,
            });
            toast({
              title: m.key === 'fully_onboarded' ? '🎉 Operator fully onboarded!' : `📩 Operator notified`,
              description: `${operatorName}: ${m.label}`,
            });
          } catch (notifErr) {
            console.error('Milestone notification error:', notifErr);
          }
        }

        // Update snapshot so re-saves don't re-fire
        savedMilestones.current = {
          ica_status: status.ica_status ?? prev.ica_status,
          mvr_ch_approval: status.mvr_ch_approval ?? prev.mvr_ch_approval,
          pe_screening_result: status.pe_screening_result ?? prev.pe_screening_result,
          insurance_added_date: status.insurance_added_date ?? prev.insurance_added_date,
          form_2290: status.form_2290 ?? prev.form_2290,
          truck_title: status.truck_title ?? prev.truck_title,
          truck_photos: status.truck_photos ?? prev.truck_photos,
          truck_inspection: status.truck_inspection ?? prev.truck_inspection,
          decal_applied: status.decal_applied ?? prev.decal_applied,
          eld_installed: status.eld_installed ?? prev.eld_installed,
          fuel_card_issued: status.fuel_card_issued ?? prev.fuel_card_issued,
          mo_reg_received: status.mo_reg_received ?? prev.mo_reg_received,
        };
      }

      // ── Write audit log for operator status changes ───────────────────
      if (triggeredMilestones.length > 0 || statusId) {
        // Only log if something meaningfully changed (milestones triggered)
        if (triggeredMilestones.length > 0) {
          supabase.from('audit_log' as any).insert({
            actor_id: session?.user?.id ?? null,
            actor_name: null, // resolved server-side ideally; null falls back to actor_id lookup in UI
            action: 'operator_status_updated',
            entity_type: 'operator',
            entity_id: operatorId,
            entity_label: operatorName,
            metadata: {
              milestones: triggeredMilestones.map(m => m.label),
            },
          }).then(() => {}).catch((e: unknown) => console.error('Audit log error:', e));
        }
      }
    }

    setSaving(false);
  };

  const updateStatus = (field: keyof OnboardingStatus, value: string | null) => {
    setStatus(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
      </div>
    );
  }

  const SelectField = ({ label, field, options }: { label: string; field: keyof OnboardingStatus; options: { value: string; label: string }[] }) => (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
      <Select value={(status[field] as string) || undefined} onValueChange={v => updateStatus(field, v)}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  const mvrOptions = [{ value: 'not_started', label: 'Not Started' }, { value: 'requested', label: 'Requested' }, { value: 'received', label: 'Received' }];
  const approvalOptions = [{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'denied', label: 'Denied' }];
  const screeningOptions = [{ value: 'not_started', label: 'Not Started' }, { value: 'scheduled', label: 'Scheduled' }, { value: 'results_in', label: 'Results In' }];
  const resultOptions = [{ value: 'pending', label: 'Pending' }, { value: 'clear', label: 'Clear' }, { value: 'non_clear', label: 'Non-Clear' }];
  const docOptions = [{ value: 'not_started', label: 'Not Started' }, { value: 'requested', label: 'Requested' }, { value: 'received', label: 'Received' }];
  const regOptions = [{ value: 'own_registration', label: 'Own Registration' }, { value: 'needs_mo_reg', label: 'Needs MO Reg' }];
  const icaOptions = [{ value: 'not_issued', label: 'Not Issued' }, { value: 'sent_for_signature', label: 'Sent for Signature' }, { value: 'complete', label: 'Complete' }];
  const moDocsOptions = [{ value: 'not_submitted', label: 'Not Submitted' }, { value: 'submitted', label: 'Submitted' }];
  const moRegOptions = [{ value: 'not_yet', label: 'Not Yet' }, { value: 'yes', label: 'Yes' }];
  const methodOptions = [{ value: 'ar_shop_install', label: 'AR Shop Install' }, { value: 'ups_self_install', label: 'UPS Self-Install' }];
  const yesNoOptions = [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }];

  const isAlert = status.mvr_ch_approval === 'denied' || status.pe_screening_result === 'non_clear';

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Pipeline
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              {operatorName}
              {isAlert && <AlertTriangle className="h-4 w-4 text-destructive" />}
              {status.fully_onboarded && <CheckCircle2 className="h-4 w-4 text-status-complete" />}
            </h1>
            <p className="text-sm text-muted-foreground">{operatorEmail}</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-gold text-surface-dark font-semibold hover:bg-gold-light gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>

      {/* Status overview */}
      <div className="flex flex-wrap gap-2">
        {isAlert && <Badge className="status-action border text-xs">⚠ Alert — Review Required</Badge>}
        {status.fully_onboarded && <Badge className="status-complete border text-xs">✓ Fully Onboarded</Badge>}
        {status.ica_status === 'complete' && <Badge className="status-complete border text-xs">ICA Signed</Badge>}
        {status.pe_screening_result === 'clear' && <Badge className="status-complete border text-xs">PE Clear</Badge>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Stage 1 — Background */}
        <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-4 w-4 text-gold" />
            <h3 className="font-semibold text-foreground text-sm">Stage 1 — Background Check</h3>
          </div>
          <div className="space-y-3">
            <SelectField label="MVR Status" field="mvr_status" options={mvrOptions} />
            <SelectField label="Clearinghouse (CH) Status" field="ch_status" options={mvrOptions} />
            <SelectField label="MVR/CH Approval" field="mvr_ch_approval" options={approvalOptions} />
            <SelectField label="PE Screening" field="pe_screening" options={screeningOptions} />
            <SelectField label="PE Screening Result" field="pe_screening_result" options={resultOptions} />
          </div>
        </div>

        {/* Stage 2 — Documents */}
        <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <FileCheck className="h-4 w-4 text-gold" />
            <h3 className="font-semibold text-foreground text-sm">Stage 2 — Documents</h3>
          </div>
          <div className="space-y-3">
            <SelectField label="Registration Status" field="registration_status" options={regOptions} />
            <SelectField label="Form 2290" field="form_2290" options={docOptions} />
            <SelectField label="Truck Title" field="truck_title" options={docOptions} />
            <SelectField label="Truck Photos" field="truck_photos" options={docOptions} />
            <SelectField label="Truck Inspection" field="truck_inspection" options={docOptions} />
          </div>
        </div>

        {/* Stage 3 — ICA */}
        <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <FileCheck className="h-4 w-4 text-gold" />
            <h3 className="font-semibold text-foreground text-sm">Stage 3 — ICA</h3>
          </div>
          <div className="space-y-3">
            <SelectField label="ICA Status" field="ica_status" options={icaOptions} />
            {status.pe_screening_result !== 'clear' && (
              <div className="p-3 rounded-lg bg-status-action/10 border border-status-action/30 text-xs text-status-action">
                PE Screening must be Clear before sending ICA.
              </div>
            )}
            {status.pe_screening_result === 'clear' && (
              <Button variant="outline" size="sm" className="w-full border-gold text-gold hover:bg-gold/10 text-xs">
                Send ICA via PandaDoc
              </Button>
            )}
          </div>
        </div>

        {/* Stage 4 — Missouri Registration (conditional) */}
        {status.registration_status === 'needs_mo_reg' && (
          <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <FileCheck className="h-4 w-4 text-gold" />
              <h3 className="font-semibold text-foreground text-sm">Stage 4 — Missouri Registration</h3>
            </div>
            <div className="p-3 rounded-lg bg-status-progress/10 border border-status-progress/30 text-xs text-status-progress mb-3">
              ⚠ Missouri requires Title + Form 2290 + signed ICA submitted together. Partial submissions are not accepted. ICA must be Complete before submitting.
            </div>
            <div className="space-y-3">
              <SelectField label="MO Docs Submitted" field="mo_docs_submitted" options={moDocsOptions} />
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Expected Approval Date</Label>
                <Input
                  type="date"
                  value={status.mo_expected_approval_date ?? ''}
                  onChange={e => updateStatus('mo_expected_approval_date', e.target.value || null)}
                  className="h-9 text-sm"
                />
              </div>
              <SelectField label="MO Registration Received" field="mo_reg_received" options={moRegOptions} />
            </div>
          </div>
        )}

        {/* Stage 5 — Equipment */}
        <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Truck className="h-4 w-4 text-gold" />
            <h3 className="font-semibold text-foreground text-sm">Stage 5 — Equipment Setup</h3>
          </div>
          <div className="space-y-3">
            <SelectField label="Decal Method" field="decal_method" options={methodOptions} />
            <SelectField label="Decal Applied" field="decal_applied" options={yesNoOptions} />
            <SelectField label="ELD Method" field="eld_method" options={methodOptions} />
            <SelectField label="ELD Installed" field="eld_installed" options={yesNoOptions} />
            <SelectField label="Fuel Card Issued" field="fuel_card_issued" options={yesNoOptions} />
          </div>
        </div>

        {/* Stage 6 — Insurance */}
        <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-4 w-4 text-gold" />
            <h3 className="font-semibold text-foreground text-sm">Stage 6 — Insurance</h3>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Added to Insurance Date</Label>
              <Input
                type="date"
                value={status.insurance_added_date ?? ''}
                onChange={e => updateStatus('insurance_added_date', e.target.value || null)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Assigned Unit Number</Label>
              <Input
                value={status.unit_number ?? ''}
                onChange={e => updateStatus('unit_number', e.target.value || null)}
                placeholder="e.g. ST-042"
                className="h-9 text-sm"
              />
            </div>
            {status.insurance_added_date && (
              <Badge className="status-complete border text-xs w-full justify-center">
                ✓ FULLY ONBOARDED
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Internal Notes */}
      <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
        <Label className="text-sm font-semibold text-foreground mb-2 block">Internal Notes</Label>
        <p className="text-xs text-muted-foreground mb-3">These notes are visible to staff only and will not be shown to the operator.</p>
        <Textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Add internal notes here…"
          className="min-h-[100px] text-sm"
        />
      </div>
    </div>
  );
}
