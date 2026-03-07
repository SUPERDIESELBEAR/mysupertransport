import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Save, User, FileCheck, Truck, Shield, Package, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [operatorName, setOperatorName] = useState('');
  const [operatorEmail, setOperatorEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<Partial<OnboardingStatus>>({});
  const [statusId, setStatusId] = useState<string | null>(null);

  useEffect(() => {
    fetchOperatorDetail();
  }, [operatorId]);

  const fetchOperatorDetail = async () => {
    setLoading(true);
    const { data: op } = await supabase
      .from('operators')
      .select(`
        notes,
        profiles!operators_user_id_fkey (first_name, last_name),
        onboarding_status (*),
        applications (email)
      `)
      .eq('id', operatorId)
      .single();

    if (op) {
      const profile = (op as any).profiles ?? {};
      setOperatorName(`${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'Unknown Operator');
      const app = (op as any).applications;
      setOperatorEmail(app?.email ?? '');
      setNotes((op as any).notes ?? '');
      const os = (op as any).onboarding_status?.[0];
      if (os) {
        setStatus(os);
        setStatusId(os.id);
      }
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('operators')
      .update({ notes })
      .eq('id', operatorId);

    if (statusId) {
      const { id: _id, fully_onboarded: _fo, ...updateData } = status as Record<string, unknown>;
      await supabase.from('onboarding_status').update(updateData as Parameters<typeof supabase.from>[0] extends never ? never : any).eq('id', statusId);
    }

    if (error) {
      toast({ title: 'Error saving', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved successfully', description: 'Operator record has been updated.' });
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
      <Select value={(status[field] as string) ?? ''} onValueChange={v => updateStatus(field, v)}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue />
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
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700 mb-3">
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
