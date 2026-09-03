import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateInput } from '@/components/ui/date-input';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, CheckCircle2, AlertTriangle, Send, UserX, FileSignature, RotateCcw, CreditCard, ShieldAlert, MapPin, LogOut, ChevronRight, ChevronLeft, Ban, ArrowLeft } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

export interface DeactivationWizardContentProps {
  operatorId: string;
  operatorName: string;
  unitNumber?: string | null;
  isActive: boolean;
  isManagement: boolean;
  onComplete: () => void;
  onCancel: () => void;
  layout: 'modal' | 'page';
}

type StepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

interface StepState {
  key: string;
  label: string;
  description: string;
  status: StepStatus;
  skippedReason?: string;
}

type OffboardingStepKey =
  | 'reason'
  | 'unit_disposition'
  | 'safety_advisor'
  | 'lease_termination'
  | 'equipment_return'
  | 'fuel_card'
  | 'mo_plate'
  | 'ica_void'
  | 'login_retention'
  | 'confirm';

/** What happens to the truck when this driver leaves. */
type UnitDisposition = 'truck_leaves' | 'truck_stays' | 'undecided';

interface TruckSnapshot {
  unit_number: string | null;
  truck_year: string | null;
  truck_make: string | null;
  truck_model: string | null;
  truck_vin: string | null;
  truck_plate: string | null;
  truck_plate_state: string | null;
  trailer_number: string | null;
}

interface TruckOwnerLite {
  id: string;
  name: string;
}


interface EquipmentSheet {
  id: string;
  unit_number: string | null;
  status: Database['public']['Enums']['osas_status'];
  return_requested_at: string | null;
  return_completed_at: string | null;
  items: { device_type: string; serial_snapshot: string | null }[];
}

interface EquipmentItem {
  id: string;
  device_type: string;
  serial_number: string;
  status: string;
  current_assignment_id: string | null;
  current_operator_name: string | null;
}

interface MoPlateAssignment {
  id: string;
  plate_id: string;
  assigned_at: string;
  mo_plates?: { plate_number: string } | null;
}

interface IcaContract {
  id: string;
  status: string;
  truck_year: string | null;
  truck_make: string | null;
  truck_model: string | null;
  truck_vin: string | null;
  lease_effective_date: string | null;
}

const DOT_SETTINGS_ROW_ID = '00000000-0000-0000-0000-000000000001';
const OWNER_EMAIL = 'marc@mysupertransport.com';
const OWNER_NAME = 'Marcus Mueller';
const REASON_OPTIONS = ['Resigned', 'Terminated', 'Personal Reasons', 'Truck Down', 'Not Compliant', 'Medical', 'Abandoned', 'Other'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function DeactivationWizardContent({
  operatorId,
  operatorName,
  unitNumber,
  isActive,
  isManagement,
  onComplete,
  onCancel,
  layout,
}: DeactivationWizardContentProps) {
  const { session, user } = useAuth();
  const { toast } = useToast();

  const [currentStep, setCurrentStep] = useState<OffboardingStepKey>('reason');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  // Step 1: Reason & date
  const [deactivationDate, setDeactivationDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [deactivationReason, setDeactivationReason] = useState<string>('');
  const [deactivationNotes, setDeactivationNotes] = useState<string>('');

  // Step 2: Safety advisor — date & reason are inherited from Step 1
  const [rehire, setRehire] = useState<'yes' | 'no' | ''>('');
  const [safetyNotes, setSafetyNotes] = useState<string>('');
  const [safetyNotesTouched, setSafetyNotesTouched] = useState(false);
  const [toEmails, setToEmails] = useState<string[]>([]);
  const [ccEmails, setCcEmails] = useState<string[]>([OWNER_EMAIL]);
  const [toInput, setToInput] = useState('');
  const [ccInput, setCcInput] = useState('');
  const [safetySent, setSafetySent] = useState(false);
  // What the send actually did — recipients and whether the saved consultant was on it.
  // The confirmation reads from this, never from the saved consultant record, so it can
  // never claim a notice went to someone who was removed from the To field.
  const [safetySentTo, setSafetySentTo] = useState<string[]>([]);
  const [safetyConsultantIncluded, setSafetyConsultantIncluded] = useState(true);
  // Saved DOT Consultant record — recipients, display name, and email greeting.
  const [consultantEmails, setConsultantEmails] = useState<string[]>([]);
  const [consultantName, setConsultantName] = useState('');
  const [greetingName, setGreetingName] = useState('');
  const consultantLabel = consultantName.trim() || 'the DOT Consultant';
  const sentToLabel = safetySentTo.length === 0
    ? 'no recipients'
    : safetySentTo.length === 1
      ? safetySentTo[0]
      : `${safetySentTo[0]} and ${safetySentTo.length - 1} other${safetySentTo.length > 2 ? 's' : ''}`;


  // Step 3: Lease termination
  const [ica, setIca] = useState<IcaContract | null>(null);
  const [carrierSettings, setCarrierSettings] = useState<{
    typed_name: string;
    title: string;
    signature_url: string | null;
  } | null>(null);
  const [effectiveTerminationDate, setEffectiveTerminationDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [leaseReason, setLeaseReason] = useState<'voluntary' | 'mutual' | 'cause'>('voluntary');
  const [leaseNotes, setLeaseNotes] = useState<string>('');
  const [terminationCreated, setTerminationCreated] = useState(false);
  const [existingTerminationId, setExistingTerminationId] = useState<string | null>(null);

  // Step 4: Equipment return
  const [sheets, setSheets] = useState<EquipmentSheet[]>([]);
  const [sendingInstructions, setSendingInstructions] = useState<Record<string, boolean>>({});

  // Step 5: Fuel card
  const [fuelCards, setFuelCards] = useState<EquipmentItem[]>([]);
  const [deactivatingCards, setDeactivatingCards] = useState<Record<string, boolean>>({});
  const [fuelCardError, setFuelCardError] = useState<string | null>(null);

  // Step 6: MO plate
  const [plateAssignments, setPlateAssignments] = useState<MoPlateAssignment[]>([]);
  const [releasingPlates, setReleasingPlates] = useState<Record<string, boolean>>({});

  // Step 7: ICA void
  const [icaVoided, setIcaVoided] = useState(false);
  const [voidingIca, setVoidingIca] = useState(false);

  // Step 8: Login retention
  const [keepLoginActive, setKeepLoginActive] = useState(true);
  const [loginRetentionReason, setLoginRetentionReason] = useState('');
  const [receiptsUploaded, setReceiptsUploaded] = useState(false);

  // Step 2: Unit disposition
  const [unitDisposition, setUnitDisposition] = useState<UnitDisposition | null>(null);
  const [unitDispositionNotes, setUnitDispositionNotes] = useState('');
  const [truckSnapshot, setTruckSnapshot] = useState<TruckSnapshot | null>(null);
  const [truckOwner, setTruckOwner] = useState<TruckOwnerLite | null>(null);

  // Step tracking
  const [steps, setSteps] = useState<Record<OffboardingStepKey, StepState>>({
    reason: { key: 'reason', label: 'Reason & Date', description: 'Confirm why and when the driver is leaving', status: 'in_progress' },
    unit_disposition: { key: 'unit_disposition', label: 'Unit Disposition', description: 'Does the truck leave with the driver or stay leased?', status: 'pending' },
    safety_advisor: { key: 'safety_advisor', label: 'DOT Consultant', description: 'Notify the DOT Consultant of the deactivation', status: 'pending' },
    lease_termination: { key: 'lease_termination', label: 'Lease Termination', description: 'Create and sign the Appendix C', status: 'pending' },
    equipment_return: { key: 'equipment_return', label: 'Equipment Return', description: 'Send return instructions and confirm receipt', status: 'pending' },
    fuel_card: { key: 'fuel_card', label: 'Fuel Card', description: 'Deactivate assigned fuel cards', status: 'pending' },
    mo_plate: { key: 'mo_plate', label: 'MO Plate', description: 'Release assigned Missouri plates', status: 'pending' },
    ica_void: { key: 'ica_void', label: 'ICA Void', description: 'Void the active ICA contract', status: 'pending' },
    login_retention: { key: 'login_retention', label: 'Login Retention', description: 'Decide when to revoke driver portal access', status: 'pending' },
    confirm: { key: 'confirm', label: 'Confirm', description: 'Review and finalize deactivation', status: 'pending' },
  });

  const orderedSteps: OffboardingStepKey[] = [
    'reason',
    'unit_disposition',
    'safety_advisor',
    'lease_termination',
    'equipment_return',
    'fuel_card',
    'mo_plate',
    'ica_void',
    'login_retention',
    'confirm',
  ];


  const updateStepStatus = useCallback((key: OffboardingStepKey, status: StepStatus, skippedReason?: string) => {
    setSteps(prev => ({ ...prev, [key]: { ...prev[key], status, skippedReason } }));
  }, []);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [icaRes, carrierRes, sheetsRes, equipmentRes, platesRes, terminationRes] = await Promise.all([
        supabase.from('ica_contracts').select('id, status, truck_year, truck_make, truck_model, truck_vin, lease_effective_date').eq('operator_id', operatorId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('carrier_signature_settings').select('typed_name, title, signature_url').maybeSingle(),
        supabase.from('onboard_assignment_sheets').select('id, unit_number, status, return_requested_at, return_completed_at, items:onboard_assignment_sheet_items(device_type, serial_snapshot)').eq('operator_id', operatorId).order('created_at', { ascending: false }),
        supabase
          .from('equipment_assignments')
          .select('id, equipment_id, equipment_items!inner(id, device_type, serial_number, status)')
          .eq('operator_id', operatorId)
          .is('returned_at', null),
        supabase.from('mo_plate_assignments').select('id, plate_id, assigned_at, mo_plates!inner(plate_number)').eq('operator_id', operatorId).is('returned_at', null).order('assigned_at', { ascending: false }),
        supabase.from('lease_terminations').select('id').eq('operator_id', operatorId).is('voided_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);

      // Truck snapshot + owner, so a unit that stays leased keeps its identity
      // after the driver's records are torn down.
      const [snapRes, ownerRes] = await Promise.all([
        supabase
          .from('onboarding_status')
          .select('unit_number, truck_year, truck_make, truck_model, truck_vin, truck_plate, truck_plate_state, trailer_number')
          .eq('operator_id', operatorId)
          .maybeSingle(),
        supabase
          .from('truck_owners')
          .select('id, legal_first_name, legal_last_name, business_name')
          .eq('operator_id', operatorId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (snapRes.data) setTruckSnapshot(snapRes.data as unknown as TruckSnapshot);
      if (ownerRes.data) {
        const o = ownerRes.data as any;
        const name = [o.legal_first_name, o.legal_last_name].filter(Boolean).join(' ').trim() || o.business_name || '';
        setTruckOwner({ id: o.id, name });
      }



      if (icaRes.data) setIca(icaRes.data as IcaContract);
      if (carrierRes.data) {
        const c = carrierRes.data as any;
        setCarrierSettings({ typed_name: c.typed_name || '', title: c.title || '', signature_url: c.signature_url || null });
      }
      setSheets((sheetsRes.data as any[])?.map(s => ({
        id: s.id,
        unit_number: s.unit_number,
        status: s.status,
        return_requested_at: s.return_requested_at,
        return_completed_at: s.return_completed_at,
        items: s.items || [],
      })) || []);
      if (equipmentRes.error) {
        console.error('Failed to load equipment assignments for deactivation', equipmentRes.error);
        setFuelCardError(equipmentRes.error.message);
        setFuelCards([]);
      } else {
        setFuelCardError(null);
        setFuelCards(
          (equipmentRes.data || [])
            .map((row: any) => ({ assignmentId: row.id, item: Array.isArray(row.equipment_items) ? row.equipment_items[0] : row.equipment_items }))
            .filter(({ item }) => item?.device_type === 'fuel_card')
            .map(({ assignmentId, item }) => ({
              id: item.id,
              device_type: item.device_type,
              serial_number: item.serial_number,
              status: item.status,
              current_assignment_id: assignmentId,
              current_operator_name: operatorName,
            })) as EquipmentItem[]
        );
      }
      setPlateAssignments((platesRes.data || []) as MoPlateAssignment[]);
      if (terminationRes.data) {
        setExistingTerminationId((terminationRes.data as any).id);
        setTerminationCreated(true);
      }

      // Resume: hydrate step statuses previously persisted for this operator
      const { data: savedSteps } = await supabase
        .from('operator_offboarding_steps')
        .select('step_key, completed, skipped, skipped_reason')
        .eq('operator_id', operatorId);
      if (savedSteps?.length) {
        setSteps(prev => {
          const next = { ...prev };
          for (const row of savedSteps as any[]) {
            const key = row.step_key as OffboardingStepKey;
            if (!next[key]) continue;
            if (row.completed) next[key] = { ...next[key], status: 'completed', skippedReason: undefined };
            else if (row.skipped) next[key] = { ...next[key], status: 'skipped', skippedReason: row.skipped_reason || undefined };
          }
          return next;
        });
      }
    } catch (err) {
      console.error('Failed to load offboarding data', err);
    } finally {
      setLoading(false);
    }
  }, [operatorId, operatorName]);

  useEffect(() => {
    setCurrentStep('reason');
    setDeactivationDate(new Date().toISOString().slice(0, 10));
    setEffectiveTerminationDate(new Date().toISOString().slice(0, 10));
    setSafetySent(false);
    setTerminationCreated(false);
    setExistingTerminationId(null);
    setIcaVoided(false);
    setKeepLoginActive(true);
    setLoginRetentionReason('');
    setReceiptsUploaded(false);
    setToEmails(consultantEmails);
    setCcEmails([OWNER_EMAIL]);
    if (session?.user?.email && EMAIL_RE.test(session.user.email) && session.user.email !== OWNER_EMAIL) {
      setCcEmails([OWNER_EMAIL, session.user.email.toLowerCase()]);
    }
    setDeactivationReason('');
    setDeactivationNotes('');
    setSafetyNotes('');
    setSafetyNotesTouched(false);
    setLeaseNotes('');
    setLeaseReason('voluntary');
    fetchAllData();
  }, [operatorId, session?.user?.email, fetchAllData]);

  // Auto-complete steps that have no work to do
  useEffect(() => {
    if (loading) return;
    if (!sheets.length && !receiptsUploaded) {
      updateStepStatus('equipment_return', 'skipped', 'No active equipment assignment sheets');
    } else if (sheets.every(s => s.return_completed_at)) {
      updateStepStatus('equipment_return', 'completed');
    } else {
      updateStepStatus('equipment_return', 'pending');
    }

    if (fuelCardError) {
      updateStepStatus('fuel_card', 'pending');
    } else if (!fuelCards.length) {
      updateStepStatus('fuel_card', 'skipped', 'No fuel cards assigned to this driver');
    } else if (fuelCards.every(c => c.status === 'deactivated')) {
      updateStepStatus('fuel_card', 'completed');
    } else {
      updateStepStatus('fuel_card', 'pending');
    }

    if (!plateAssignments.length) {
      updateStepStatus('mo_plate', 'skipped', 'No MO plates assigned to this driver');
    } else {
      updateStepStatus('mo_plate', 'pending');
    }

    if (!ica) {
      updateStepStatus('ica_void', 'skipped', 'No active ICA contract on file');
      updateStepStatus('lease_termination', 'skipped', 'No active ICA contract on file');
    } else {
      if (terminationCreated || existingTerminationId) {
        updateStepStatus('lease_termination', 'completed');
      } else {
        updateStepStatus('lease_termination', 'pending');
      }
      if (icaVoided) {
        updateStepStatus('ica_void', 'completed');
      } else {
        updateStepStatus('ica_void', 'pending');
      }
    }
  }, [loading, sheets, fuelCards, fuelCardError, plateAssignments, ica, icaVoided, terminationCreated, existingTerminationId, receiptsUploaded, updateStepStatus]);

  const addEmail = (input: string, list: string[], setList: (v: string[]) => void, setInput: (v: string) => void) => {
    const email = input.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      toast({ title: 'Invalid email', variant: 'destructive' });
      return;
    }
    if (list.includes(email)) {
      setInput('');
      return;
    }
    setList([...list, email]);
    setInput('');
  };

  // Load the saved DOT Consultant and pre-fill the To field with them.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('dot_consultant_email_settings')
        .select('recipient_emails, consultant_name, greeting_name')
        .eq('id', DOT_SETTINGS_ROW_ID)
        .maybeSingle();
      if (cancelled) return;
      const emails = (((data as any)?.recipient_emails ?? []) as unknown[])
        .filter((v): v is string => typeof v === 'string')
        .map(v => v.trim().toLowerCase())
        .filter(v => EMAIL_RE.test(v));
      setConsultantEmails(emails);
      setConsultantName(((data as any)?.consultant_name ?? '') as string);
      setGreetingName(((data as any)?.greeting_name ?? '') as string);
      setToEmails(prev => (prev.length === 0 ? emails : prev));
    })();
    return () => { cancelled = true; };
  }, [operatorId]);

  // Pre-fill the DOT Consultant notes from Step 1's internal notes until staff edit them.
  useEffect(() => {
    if (!safetyNotesTouched) setSafetyNotes(deactivationNotes);
  }, [deactivationNotes, safetyNotesTouched]);

  const handleSendSafetyNotice = async () => {
    if (!deactivationDate || !deactivationReason || !rehire) return;
    setSaving(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('send-deactivation-notice', {
        body: {
          operator_id: operatorId,
          termination_date: deactivationDate,
          reason: deactivationReason,
          rehire,
          notes: safetyNotes.trim(),
          to_emails: toEmails,
          cc_emails: ccEmails,
          greeting_name: greetingName.trim() || null,
        },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (fnErr) throw new Error(fnErr.message || 'Failed to send email');
      if (!data?.success) throw new Error(data?.error || 'Failed to send email');

      const actualTo = Array.isArray(data?.sent_to)
        ? (data.sent_to as unknown[]).filter((v): v is string => typeof v === 'string')
        : [...toEmails, ...ccEmails];
      const included = data?.consultant_included !== false;
      setSafetySentTo(actualTo);
      setSafetyConsultantIncluded(included);
      setSafetySent(true);
      updateStepStatus('safety_advisor', 'completed');
      toast({
        title: 'Deactivation notice sent',
        description: actualTo.length === 1
          ? `Sent to ${actualTo[0]}`
          : `Sent to ${actualTo.length} recipient${actualTo.length === 1 ? '' : 's'}: ${actualTo.join(', ')}`,
      });

    } catch (err: any) {
      toast({ title: 'Email failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateLeaseTermination = async () => {
    if (!carrierSettings?.signature_url || !ica) return;
    if (!user?.id) {
      toast({ title: 'Not signed in', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const contractorLabel = ica && (ica as any).owner_name && (ica as any).owner_business_name
        ? `${(ica as any).owner_name} d/b/a ${(ica as any).owner_business_name}`
        : (ica as any).owner_business_name || (ica as any).owner_name || operatorName;

      const payload: any = {
        operator_id: operatorId,
        ica_contract_id: ica.id,
        effective_date: effectiveTerminationDate,
        reason: leaseReason,
        notes: leaseNotes.trim() || null,
        truck_year: ica.truck_year,
        truck_make: ica.truck_make,
        truck_model: ica.truck_model,
        truck_vin: ica.truck_vin,
        truck_plate: (ica as any).truck_plate ?? null,
        truck_plate_state: (ica as any).truck_plate_state ?? null,
        trailer_number: (ica as any).trailer_number ?? null,
        contractor_label: contractorLabel,
        lease_effective_date: ica.lease_effective_date,
        carrier_signed_by: user.id,
        carrier_typed_name: carrierSettings.typed_name,
        carrier_title: carrierSettings.title,
        carrier_signature_url: carrierSettings.signature_url,
        carrier_signed_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from('lease_terminations').insert(payload).select('id').single();
      if (error) throw error;

      setExistingTerminationId((data as any).id);
      setTerminationCreated(true);
      updateStepStatus('lease_termination', 'completed');
      toast({ title: 'Lease termination signed', description: 'Appendix C saved and ready to send.' });
    } catch (err: any) {
      toast({ title: 'Sign failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleSendReturnInstructions = async (sheetId: string) => {
    setSendingInstructions(prev => ({ ...prev, [sheetId]: true }));
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('send-equipment-return-instructions', {
        body: { sheetId },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (fnErr) throw new Error(fnErr.message || 'Failed to send instructions');
      if (!data?.success) throw new Error(data?.error || 'Failed to send instructions');
      toast({ title: 'Return instructions sent', description: 'The driver has been emailed.' });
      await fetchAllData();
    } catch (err: any) {
      toast({ title: 'Send failed', description: err.message, variant: 'destructive' });
    } finally {
      setSendingInstructions(prev => ({ ...prev, [sheetId]: false }));
    }
  };

  const handleRecordReceipt = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('onboard_assignment_sheets')
        .update({ return_completed_at: new Date().toISOString() })
        .eq('operator_id', operatorId)
        .is('return_completed_at', null);
      if (error) throw error;
      setReceiptsUploaded(true);
      await fetchAllData();
      toast({ title: 'Receipts confirmed', description: 'Equipment return recorded.' });
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivateFuelCard = async (cardId: string, assignmentId: string | null) => {
    setDeactivatingCards(prev => ({ ...prev, [cardId]: true }));
    try {
      if (assignmentId) {
        const { data: assignment } = await supabase.from('equipment_assignments').select('operator_id').eq('id', assignmentId).single();
        const { error: assignErr } = await supabase.from('equipment_assignments').update({
          returned_at: new Date().toISOString(),
          return_condition: 'deactivated',
        }).eq('id', assignmentId);
        if (assignErr) throw assignErr;
        if (assignment) {
          const { error: clearErr } = await supabase.from('onboarding_status').update({ fuel_card_number: null }).eq('operator_id', assignment.operator_id);
          if (clearErr) throw clearErr;
        }
      }
      const { error: itemErr } = await supabase.from('equipment_items').update({ status: 'deactivated' }).eq('id', cardId);
      if (itemErr) throw itemErr;
      await fetchAllData();
      toast({ title: 'Fuel card deactivated', description: 'The card has been archived.' });
    } catch (err: any) {
      toast({ title: 'Deactivation failed', description: err.message, variant: 'destructive' });
    } finally {
      setDeactivatingCards(prev => ({ ...prev, [cardId]: false }));
    }
  };

  const handleReleasePlate = async (assignmentId: string) => {
    setReleasingPlates(prev => ({ ...prev, [assignmentId]: true }));
    try {
      const { error } = await supabase.from('mo_plate_assignments')
        .update({ returned_at: new Date().toISOString(), returned_by: user?.id ?? null })
        .eq('id', assignmentId);
      if (error) throw error;
      await fetchAllData();
      toast({ title: 'MO plate released', description: 'Plate returned to the registry.' });
    } catch (err: any) {
      toast({ title: 'Release failed', description: err.message, variant: 'destructive' });
    } finally {
      setReleasingPlates(prev => ({ ...prev, [assignmentId]: false }));
    }
  };

  const handleVoidIca = async () => {
    setVoidingIca(true);
    try {
      const { error: delError } = await supabase.from('ica_contracts').delete().eq('operator_id', operatorId);
      if (delError) throw delError;

      const { data: statusRow } = await supabase.from('onboarding_status').select('id').eq('operator_id', operatorId).maybeSingle();
      if (statusRow) {
        const { error: updError } = await supabase.from('onboarding_status').update({ ica_status: 'not_issued' }).eq('id', statusRow.id);
        if (updError) throw updError;
      }

      await supabase.from('audit_log').insert({
        actor_id: user?.id ?? null,
        actor_name: null,
        action: 'ica_voided',
        entity_type: 'operator',
        entity_id: operatorId,
        entity_label: operatorName,
        metadata: { via: 'deactivation_wizard' },
      });

      setIcaVoided(true);
      setIca(null);
      updateStepStatus('ica_void', 'completed');
      toast({ title: 'ICA voided', description: 'The contract has been cleared.' });
    } catch (err: any) {
      toast({ title: 'Error voiding ICA', description: err.message, variant: 'destructive' });
    } finally {
      setVoidingIca(false);
    }
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    try {
      const { error } = await supabase.from('operators').update({
        is_active: false,
        deactivation_reason: deactivationReason || null,
        deactivated_by: user?.id ?? null,
      } as any).eq('id', operatorId);
      if (error) throw error;

      // Persist step completion for audit
      const stepRecords = Object.values(steps).map(s => ({
        operator_id: operatorId,
        step_key: s.key,
        completed: s.status === 'completed',
        skipped: s.status === 'skipped',
        skipped_reason: s.skippedReason || null,
        completed_by: s.status === 'completed' ? user?.id ?? null : null,
        completed_at: s.status === 'completed' ? new Date().toISOString() : null,
      }));
      const { error: stepErr } = await supabase.from('operator_offboarding_steps').upsert(stepRecords, { onConflict: 'operator_id,step_key' });
      if (stepErr) console.error('Failed to persist offboarding steps', stepErr);

      // The truck stays leased: hold the unit so it can be handed to a new
      // driver instead of quietly vanishing from the roster.
      if (unitDisposition === 'truck_stays' || unitDisposition === 'undecided') {
        const snap = truckSnapshot;
        const { error: vacErr } = await (supabase as any).from('vacant_units').insert({
          operator_id: operatorId,
          unit_number: snap?.unit_number ?? unitNumber ?? null,
          truck_year: snap?.truck_year ?? null,
          truck_make: snap?.truck_make ?? null,
          truck_model: snap?.truck_model ?? null,
          truck_vin: snap?.truck_vin ?? null,
          truck_plate: snap?.truck_plate ?? null,
          truck_plate_state: snap?.truck_plate_state ?? null,
          trailer_number: snap?.trailer_number ?? null,
          truck_owner_id: truckOwner?.id ?? null,
          truck_owner_name: truckOwner?.name || null,
          disposition: unitDisposition,
          notes: unitDispositionNotes.trim() || null,
          held_by: user?.id ?? null,
        });
        if (vacErr) console.error('Failed to hold vacant unit', vacErr);

        // Tell the people who staff a vacant truck.
        const { data: staff } = await supabase
          .from('user_roles')
          .select('user_id, role')
          .in('role', ['management', 'owner', 'onboarding_staff'] as any);
        const recipients = Array.from(new Set((staff || []).map((r: any) => r.user_id))).filter(Boolean);
        if (recipients.length) {
          await supabase.from('notifications').insert(
            recipients.map(uid => ({
              user_id: uid,
              type: 'vacant_unit',
              title: `Unit ${snap?.unit_number ?? unitNumber ?? '—'} is now vacant`,
              body: `${operatorName} was deactivated and the truck ${unitDisposition === 'truck_stays' ? 'stays leased to SUPERTRANSPORT' : 'disposition is undecided'}. Assign a new driver or release the unit from Vehicle Hub.`,
              link: '/management/fleet',
              entity_type: 'operator',
              entity_id: operatorId,
              channel: 'in_app' as any,
              priority: 'normal',
            })) as any
          );
        }
      }

      await supabase.from('audit_log').insert({
        actor_id: user?.id ?? null,
        actor_name: null,
        action: 'operator_deactivated',
        entity_type: 'operator',
        entity_id: operatorId,
        entity_label: operatorName,
        metadata: {
          reason: deactivationReason || null,
          notes: deactivationNotes.trim() || null,
          deactivation_date: deactivationDate,
          keep_login_active: keepLoginActive,
          login_retention_reason: loginRetentionReason || null,
          unit_disposition: unitDisposition,
          unit_disposition_notes: unitDispositionNotes.trim() || null,
        },
      });

      toast({ title: 'Driver deactivated', description: `${operatorName} has been deactivated.` });
      onComplete();
    } catch (err: any) {
      toast({ title: 'Deactivation failed', description: err.message, variant: 'destructive' });
    } finally {
      setFinalizing(false);
    }
  };

  const stepIndex = orderedSteps.indexOf(currentStep);
  const canGoNext = (() => {
    if (currentStep === 'reason') return !!deactivationReason && !!deactivationDate;
    if (currentStep === 'unit_disposition') return !!unitDisposition;

    if (currentStep === 'safety_advisor') return steps.safety_advisor.status === 'completed' || steps.safety_advisor.status === 'skipped';
    if (currentStep === 'lease_termination') return steps.lease_termination.status === 'completed' || steps.lease_termination.status === 'skipped';
    if (currentStep === 'equipment_return') return steps.equipment_return.status === 'completed' || steps.equipment_return.status === 'skipped';
    if (currentStep === 'fuel_card') return steps.fuel_card.status === 'completed' || steps.fuel_card.status === 'skipped';
    if (currentStep === 'mo_plate') return steps.mo_plate.status === 'completed' || steps.mo_plate.status === 'skipped';
    if (currentStep === 'ica_void') return steps.ica_void.status === 'completed' || steps.ica_void.status === 'skipped';
    if (currentStep === 'login_retention') return true;
    return true;
  })();

  const goNext = () => {
    if (stepIndex < orderedSteps.length - 1) {
      const next = orderedSteps[stepIndex + 1];
      setCurrentStep(next);
      updateStepStatus(currentStep, steps[currentStep].status === 'pending' ? 'completed' : steps[currentStep].status);
      updateStepStatus(next, 'in_progress');
    }
  };

  const goBack = () => {
    if (stepIndex > 0) {
      const prev = orderedSteps[stepIndex - 1];
      setCurrentStep(prev);
      updateStepStatus(prev, 'in_progress');
    }
  };

  const skipStep = (reason: string) => {
    updateStepStatus(currentStep, 'skipped', reason);
    goNext();
  };

  const stepperHorizontal = (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {orderedSteps.map((key, idx) => {
        const s = steps[key];
        const isActive = key === currentStep;
        const isCompleted = s.status === 'completed';
        const isSkipped = s.status === 'skipped';
        return (
          <button
            key={key}
            onClick={() => setCurrentStep(key)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition border ${
              isActive
                ? 'bg-primary/10 border-primary text-primary'
                : isCompleted
                ? 'bg-status-complete/10 border-status-complete/40 text-status-complete'
                : isSkipped
                ? 'bg-muted border-border text-muted-foreground'
                : 'bg-background border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
              isCompleted ? 'bg-status-complete text-white' : isSkipped ? 'bg-muted-foreground/20' : isActive ? 'bg-primary text-primary-foreground' : 'bg-muted'
            }`}>
              {isCompleted ? <CheckCircle2 className="h-3 w-3" /> : isSkipped ? '—' : idx + 1}
            </span>
            <span className="whitespace-nowrap">{s.label}</span>
          </button>
        );
      })}
    </div>
  );

  const stepperVertical = (
    <div className="space-y-1">
      {orderedSteps.map((key, idx) => {
        const s = steps[key];
        const isActive = key === currentStep;
        const isCompleted = s.status === 'completed';
        const isSkipped = s.status === 'skipped';
        return (
          <button
            key={key}
            onClick={() => setCurrentStep(key)}
            className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition border ${
              isActive
                ? 'bg-primary/10 border-primary text-primary'
                : isCompleted
                ? 'bg-status-complete/10 border-status-complete/40 text-status-complete'
                : isSkipped
                ? 'bg-muted border-border text-muted-foreground'
                : 'bg-background border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
              isCompleted ? 'bg-status-complete text-white' : isSkipped ? 'bg-muted-foreground/20' : isActive ? 'bg-primary text-primary-foreground' : 'bg-muted'
            }`}>
              {isCompleted ? <CheckCircle2 className="h-3.5 w-3.5" /> : isSkipped ? '—' : idx + 1}
            </span>
            <div className="min-w-0">
              <p className="font-medium leading-tight">{s.label}</p>
              <p className="text-xs opacity-80 mt-0.5 leading-tight">{s.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );

  const hasStep1Input = !!deactivationReason || !!deactivationNotes.trim();
  const requestExit = () => {
    if (hasStep1Input && !window.confirm('Leave the deactivation wizard? Unsaved entries on this step will be lost.')) return;
    onCancel();
  };

  const backToDriverButton = (
    <Button variant="ghost" size="sm" onClick={requestExit} className="gap-1 -ml-2 mb-2 text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> Back to driver
    </Button>
  );

  const actionButtons = (
    <>
      {stepIndex === 0 ? (
        <Button variant="outline" size="sm" onClick={requestExit} disabled={finalizing} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Cancel
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={goBack} disabled={finalizing} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
      )}
      <div className="flex items-center gap-2">
        {currentStep !== 'confirm' && currentStep !== 'reason' && currentStep !== 'unit_disposition' && (
          <Button variant="ghost" size="sm" onClick={() => {
            const reason = window.prompt('Reason for skipping this step?');
            if (reason) skipStep(reason);
          }} disabled={finalizing}>
            Skip
          </Button>
        )}
        {currentStep !== 'confirm' && (
          <Button size="sm" onClick={goNext} disabled={!canGoNext || finalizing} className="gap-1">
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </>
  );

  const renderStep = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      );
    }

    switch (currentStep) {
      case 'reason':
        return (
          <div className="space-y-4">
            <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Driver</span><span className="font-medium">{operatorName}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Unit #</span><span className="font-medium">{unitNumber || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Current status</span><span className="font-medium">{isActive ? 'Active' : 'Inactive'}</span></div>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Deactivation Date <span className="text-destructive">*</span></Label>
              <DateInput value={deactivationDate} onChange={v => setDeactivationDate(v ?? '')} className="h-9 text-sm mt-1.5" />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reason for Deactivation <span className="text-destructive">*</span></Label>
              <Select value={deactivationReason} onValueChange={setDeactivationReason}>
                <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder="Select a reason…" /></SelectTrigger>
                <SelectContent>
                  {REASON_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Internal Notes</Label>
              <Textarea value={deactivationNotes} onChange={e => setDeactivationNotes(e.target.value)} placeholder="Notes for the audit log…" className="text-sm min-h-[80px] resize-none mt-1.5" />
            </div>
            {deactivationReason && !isActive && (
              <Alert className="border-warning/30 bg-warning/5">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <AlertDescription className="text-xs">
                  This driver is already inactive. Running the wizard will update the deactivation record and let you complete any remaining offboarding steps.
                </AlertDescription>
              </Alert>
            )}
          </div>
        );

      case 'unit_disposition': {
        const snap = truckSnapshot;
        const truckLine = [snap?.truck_year, snap?.truck_make, snap?.truck_model].filter(Boolean).join(' ') || '—';
        const options: { value: UnitDisposition; label: string; hint: string }[] = [
          { value: 'truck_leaves', label: 'The truck leaves with the driver', hint: 'Owner-operator takes his truck off the authority. The unit number is retired with the driver.' },
          { value: 'truck_stays', label: 'The truck stays leased — waiting on a new driver', hint: 'The truck owner keeps the truck on our authority. The unit is held open so it can be handed to a replacement driver.' },
          { value: 'undecided', label: 'Not sure yet', hint: 'Hold the unit open and decide later. It appears under Vacant units in Vehicle Hub.' },
        ];
        return (
          <div className="space-y-4">
            <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Unit #</span><span className="font-medium">{snap?.unit_number || unitNumber || '—'}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Truck</span><span className="font-medium text-right">{truckLine}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">VIN</span><span className="font-mono text-right break-all">{snap?.truck_vin || '—'}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Truck owner</span><span className="font-medium text-right">{truckOwner?.name || '—'}</span></div>
            </div>

            <div className="space-y-2">
              {options.map(opt => {
                const active = unitDisposition === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setUnitDisposition(opt.value)}
                    className={`w-full text-left border rounded-lg p-3 transition ${active ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-muted-foreground/40'}`}
                  >
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.hint}</p>
                  </button>
                );
              })}
            </div>

            {(unitDisposition === 'truck_stays' || unitDisposition === 'undecided') && (
              <>
                <Alert className="border-muted-foreground/30 bg-muted/30">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Keep the MO plate on this unit unless the owner is taking it — the plate follows the truck, not the driver.
                    Voiding the ICA ends this driver's agreement only; a replacement driver needs a new ICA on the same truck.
                  </AlertDescription>
                </Alert>
                <div className="space-y-1.5">
                  <Label className="text-sm">Notes for whoever picks this unit up (optional)</Label>
                  <Textarea
                    value={unitDispositionNotes}
                    onChange={e => setUnitDispositionNotes(e.target.value)}
                    placeholder="e.g. Owner has a driver lined up for next week."
                    rows={3}
                  />
                </div>
              </>
            )}
          </div>
        );
      }

      case 'safety_advisor':
        return (
          <div className="space-y-4">
            <Alert className="border-gold/30 bg-gold/5">
              <ShieldAlert className="h-4 w-4 text-gold" />
              <AlertDescription className="text-xs">
                The DOT Consultant must be notified of every deactivation so DQ files and compliance records stay current.
              </AlertDescription>
            </Alert>
            <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">From Step 1</span>
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setCurrentStep('reason')}>Edit</Button>
              </div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Driver</span><span className="font-medium min-w-0 text-right break-words">{operatorName}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Unit #</span><span className="font-medium min-w-0 text-right break-words">{unitNumber || '—'}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Termination date</span><span className="font-medium min-w-0 text-right break-words">{deactivationDate ? new Date(`${deactivationDate}T12:00:00`).toLocaleDateString('en-US') : '—'}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Reason</span><span className="font-medium min-w-0 text-right break-words">{deactivationReason || '—'}</span></div>
            </div>
            {(!deactivationDate || !deactivationReason) && (
              <Alert className="border-warning/30 bg-warning/5">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <AlertDescription className="text-xs">
                  Finish Step 1 (Reason &amp; Date) before sending the notice — the email uses those values.
                </AlertDescription>
              </Alert>
            )}
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Available for Rehire? <span className="text-destructive">*</span></Label>
              <div className="mt-1.5 flex gap-2">
                {(['yes', 'no'] as const).map(v => (
                  <button key={v} onClick={() => setRehire(v)} className={`flex-1 h-9 rounded-md border text-sm font-medium transition ${
                    rehire === v ? (v === 'yes' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-red-50 border-red-500 text-red-800') : 'bg-background border-border text-foreground hover:bg-muted/40'
                  }`}>{v === 'yes' ? 'Yes' : 'No'}</button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes to the DOT Consultant</Label>
              <Textarea value={safetyNotes} onChange={e => { setSafetyNotesTouched(true); setSafetyNotes(e.target.value); }} placeholder="Context for the DOT Consultant…" className="text-sm min-h-[60px] resize-none mt-1.5" />
              <p className="text-[11px] text-muted-foreground mt-1">Pre-filled from your Step 1 notes — review before sending, this goes to an outside party.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email Greeting</Label>
              <Input value={greetingName} onChange={e => setGreetingName(e.target.value)} maxLength={60} placeholder="First name" className="h-8 text-xs" />
              <p className="text-[11px] text-muted-foreground break-words">Email opens with “{greetingName.trim() ? `Hi ${greetingName.trim()}` : 'Hello'}, please find the deactivation details below.”</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">To</Label>
              <div className="flex gap-2">
                <Input type="email" value={toInput} onChange={e => setToInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEmail(toInput, toEmails, setToEmails, setToInput); } }} placeholder="name@example.com" className="h-8 text-xs flex-1" />
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs px-3" onClick={() => addEmail(toInput, toEmails, setToEmails, setToInput)}>Add</Button>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {toEmails.map(email => (
                  <span key={email} className="inline-flex max-w-full min-w-0 items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-gold/10 border-gold/40 text-foreground">
                    <span className="min-w-0 break-all">{consultantEmails.includes(email) && consultantName.trim() ? `${consultantName.trim()} <${email}>` : email}</span>
                    <button onClick={() => setToEmails(prev => prev.filter(e => e !== email))} className="shrink-0 text-muted-foreground hover:text-destructive">×</button>
                  </span>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">CC</Label>
              <div className="flex flex-wrap gap-1.5">
                {ccEmails.map(email => (
                  <span key={email} className="inline-flex max-w-full min-w-0 items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-muted border-border text-foreground">
                    <span className="min-w-0 break-all">{email === OWNER_EMAIL ? OWNER_NAME : email}</span>
                    {email !== OWNER_EMAIL && <button onClick={() => setCcEmails(prev => prev.filter(e => e !== email))} className="shrink-0 text-muted-foreground hover:text-destructive">×</button>}
                  </span>
                ))}
              </div>
            </div>
            {safetySent ? (
              <div className="flex items-center gap-2 text-status-complete text-sm font-medium">
                <CheckCircle2 className="h-4 w-4" /> Notice sent to {consultantLabel}
              </div>
            ) : (
              <Button className="w-full bg-gold hover:bg-gold/90 text-black gap-1.5" onClick={handleSendSafetyNotice} disabled={!deactivationDate || !deactivationReason || !rehire || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send Deactivation Notice
              </Button>
            )}
          </div>
        );

      case 'lease_termination':
        return (
          <div className="space-y-4">
            {!ica ? (
              <Alert className="border-muted-foreground/30 bg-muted/30">
                <AlertDescription className="text-xs">No active ICA contract exists for this driver. A lease termination is not required.</AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="border border-border rounded-lg p-4 bg-card space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Driver</span><span className="font-medium min-w-0 text-right break-words">{operatorName}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Truck</span><span className="font-medium min-w-0 text-right break-words">{[ica.truck_year, ica.truck_make, ica.truck_model].filter(Boolean).join(' ') || '—'}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">VIN</span><span className="font-mono min-w-0 text-right break-all">{ica.truck_vin || '—'}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Original ICA</span><span className="font-medium min-w-0 text-right break-words">{ica.lease_effective_date ? new Date(ica.lease_effective_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Effective Termination Date</Label>
                    <Input type="date" value={effectiveTerminationDate} onChange={e => setEffectiveTerminationDate(e.target.value)} className="mt-1.5" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reason</Label>
                    <Select value={leaseReason} onValueChange={v => setLeaseReason(v as typeof leaseReason)}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="voluntary">Voluntary separation</SelectItem>
                        <SelectItem value="mutual">Mutual release</SelectItem>
                        <SelectItem value="cause">For cause</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes for Insurance</Label>
                  <Textarea value={leaseNotes} onChange={e => setLeaseNotes(e.target.value)} placeholder="Equipment retrieved, decals removed…" className="text-sm min-h-[60px] resize-none mt-1.5" />
                </div>
                <div className="border border-border rounded-lg p-3 bg-card">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Carrier Signature</Label>
                  {carrierSettings?.signature_url ? (
                    <div className="mt-1.5 text-sm">
                      <p className="font-medium text-foreground">{carrierSettings.typed_name}</p>
                      <p className="text-xs text-muted-foreground">{carrierSettings.title}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-destructive mt-1.5">No carrier signature on file. Configure it in Settings → Carrier Signature.</p>
                  )}
                </div>
                {terminationCreated || existingTerminationId ? (
                  <div className="flex items-center gap-2 text-status-complete text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4" /> Lease termination signed and saved
                  </div>
                ) : (
                  <Button className="w-full gap-1.5 bg-gold hover:bg-gold/90 text-black" onClick={handleCreateLeaseTermination} disabled={!carrierSettings?.signature_url || saving}>
                    <FileSignature className="h-4 w-4" />
                    {saving ? 'Signing…' : 'Sign & Save Lease Termination'}
                  </Button>
                )}
                <Button variant="outline" className="w-full" onClick={() => skipStep('No active ICA or termination already handled outside wizard')}>Skip — No Lease Termination Needed</Button>
              </>
            )}
          </div>
        );

      case 'equipment_return':
        return (
          <div className="space-y-4">
            {sheets.length === 0 ? (
              <Alert className="border-muted-foreground/30 bg-muted/30">
                <AlertDescription className="text-xs">No active Onboard Systems Assignment Sheets for this driver.</AlertDescription>
              </Alert>
            ) : (
              sheets.map(sheet => (
                <div key={sheet.id} className="border border-border rounded-lg p-3 bg-card space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <RotateCcw className="h-4 w-4 text-muted-foreground" />
                      Sheet {sheet.id.slice(0, 8)}… {sheet.unit_number ? `— Unit ${sheet.unit_number}` : ''}
                    </div>
                    <Badge variant={sheet.return_completed_at ? 'default' : sheet.return_requested_at ? 'secondary' : 'outline'} className="text-[10px]">
                      {sheet.return_completed_at ? 'Returned' : sheet.return_requested_at ? 'Instructions sent' : 'Pending'}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Items: {sheet.items.map(i => `${i.device_type}${i.serial_snapshot ? ` (${i.serial_snapshot})` : ''}`).join(', ') || 'None recorded'}
                  </div>
                  <div className="flex gap-2">
                    {!sheet.return_requested_at && !sheet.return_completed_at && (
                      <Button size="sm" variant="outline" onClick={() => handleSendReturnInstructions(sheet.id)} disabled={sendingInstructions[sheet.id]} className="gap-1.5">
                        {sendingInstructions[sheet.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Email Return Instructions
                      </Button>
                    )}
                    {sheet.return_requested_at && !sheet.return_completed_at && (
                      <Button size="sm" variant="outline" onClick={() => handleSendReturnInstructions(sheet.id)} disabled={sendingInstructions[sheet.id]} className="gap-1.5">
                        {sendingInstructions[sheet.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Resend Instructions
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
            {sheets.some(s => s.return_requested_at && !s.return_completed_at) && (
              <div className="border border-dashed border-border rounded-lg p-3 bg-muted/30">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Confirm Physical Return / Receipt</Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">Once the driver has uploaded a mailing receipt or the equipment is confirmed returned, mark this step complete.</p>
                <Button size="sm" onClick={handleRecordReceipt} disabled={saving} className="gap-1.5">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Confirm Equipment Returned
                </Button>
              </div>
            )}
            {sheets.length > 0 && !sheets.some(s => !s.return_completed_at) && (
              <div className="flex items-center gap-2 text-status-complete text-sm font-medium">
                <CheckCircle2 className="h-4 w-4" /> All equipment return sheets resolved
              </div>
            )}
          </div>
        );

      case 'fuel_card':
        return (
          <div className="space-y-4">
            {fuelCardError ? (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">
                  Could not load this driver's fuel cards: {fuelCardError}. Refresh and try again — do not assume none are assigned.
                </AlertDescription>
              </Alert>
            ) : fuelCards.length === 0 ? (
              <Alert className="border-muted-foreground/30 bg-muted/30">
                <AlertDescription className="text-xs">No fuel cards are assigned to this driver.</AlertDescription>
              </Alert>
            ) : (
              fuelCards.map(card => (
                <div key={card.id} className="border border-border rounded-lg p-3 bg-card flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium font-mono">{card.serial_number}</p>
                      <p className="text-xs text-muted-foreground capitalize">{card.status.replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                  {card.status === 'deactivated' ? (
                    <Badge className="text-[10px] bg-status-complete/10 text-status-complete">Deactivated</Badge>
                  ) : (
                    <Button size="sm" variant="destructive" onClick={() => handleDeactivateFuelCard(card.id, card.current_assignment_id)} disabled={deactivatingCards[card.id]} className="gap-1.5">
                      {deactivatingCards[card.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                      Deactivate
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        );

      case 'mo_plate':
        return (
          <div className="space-y-4">
            {(unitDisposition === 'truck_stays' || unitDisposition === 'undecided') && (
              <Alert className="border-muted-foreground/30 bg-muted/30">
                <AlertDescription className="text-xs">
                  This unit stays on the authority — normally the plate stays with the truck. Release it only if the owner is taking the plate too.
                </AlertDescription>
              </Alert>
            )}

            {plateAssignments.length === 0 ? (
              <Alert className="border-muted-foreground/30 bg-muted/30">
                <AlertDescription className="text-xs">No MO plates are currently assigned to this driver.</AlertDescription>
              </Alert>
            ) : (
              plateAssignments.map(pa => (
                <div key={pa.id} className="border border-border rounded-lg p-3 bg-card flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium font-mono">{pa.mo_plates?.plate_number ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">Assigned {new Date(pa.assigned_at + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleReleasePlate(pa.id)} disabled={releasingPlates[pa.id]} className="gap-1.5">
                    {releasingPlates[pa.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    Release Plate
                  </Button>
                </div>
              ))
            )}
          </div>
        );

      case 'ica_void':
        return (
          <div className="space-y-4">
            {(unitDisposition === 'truck_stays' || unitDisposition === 'undecided') && (
              <Alert className="border-muted-foreground/30 bg-muted/30">
                <AlertDescription className="text-xs">
                  Voiding ends this driver's agreement only. The truck stays leased — the replacement driver will need a new ICA issued on the same unit.
                </AlertDescription>
              </Alert>
            )}

            {!ica && !icaVoided ? (
              <Alert className="border-muted-foreground/30 bg-muted/30">
                <AlertDescription className="text-xs">No active ICA contract to void.</AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="border border-border rounded-lg p-4 bg-card space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">ICA Status</span><span className="font-medium capitalize">{icaVoided ? 'Voided' : ica?.status || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Truck</span><span className="font-medium">{[ica?.truck_year, ica?.truck_make, ica?.truck_model].filter(Boolean).join(' ') || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">VIN</span><span className="font-mono">{ica?.truck_vin || '—'}</span></div>
                </div>
                <Alert variant="destructive" className="bg-destructive/5">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Voiding the ICA removes the contract record and resets the driver's onboarding ICA status to "Not Issued". This cannot be undone.
                  </AlertDescription>
                </Alert>
                {icaVoided ? (
                  <div className="flex items-center gap-2 text-status-complete text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4" /> ICA voided
                  </div>
                ) : (
                  <Button variant="destructive" className="w-full gap-1.5" onClick={handleVoidIca} disabled={voidingIca}>
                    {voidingIca ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                    Void ICA Contract
                  </Button>
                )}
              </>
            )}
          </div>
        );

      case 'login_retention':
        return (
          <div className="space-y-4">
            <div className="border border-border rounded-lg p-4 bg-card">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Keep Driver Login Active</Label>
                  <p className="text-xs text-muted-foreground">Allow the driver to continue uploading return receipts or documents.</p>
                </div>
                <Switch checked={keepLoginActive} onCheckedChange={setKeepLoginActive} />
              </div>
            </div>
            {keepLoginActive && (
              <div>
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Retention Reason</Label>
                <Textarea value={loginRetentionReason} onChange={e => setLoginRetentionReason(e.target.value)} placeholder="Why is login access being retained? e.g. waiting on equipment return receipt…" className="text-sm min-h-[60px] resize-none mt-1.5" />
              </div>
            )}
            {!keepLoginActive && (
              <Alert variant="destructive" className="bg-destructive/5">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  The driver will lose access to the SUPERDRIVE portal immediately. Only choose this if all equipment has been returned and no further uploads are needed.
                </AlertDescription>
              </Alert>
            )}
            <Alert className="border-gold/30 bg-gold/5">
              <LogOut className="h-4 w-4 text-gold" />
              <AlertDescription className="text-xs">
                Best practice: keep login active until at least one equipment return receipt is uploaded. You can revoke access later from the driver profile.
              </AlertDescription>
            </Alert>
          </div>
        );

      case 'confirm':
        return (
          <div className="space-y-4">
            <div className="border border-border rounded-lg p-4 bg-card space-y-2 text-sm">
              <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Driver</span><span className="font-medium min-w-0 text-right break-words">{operatorName}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Unit #</span><span className="font-medium min-w-0 text-right break-words">{unitNumber || '—'}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Deactivation Date</span><span className="font-medium min-w-0 text-right break-words">{new Date(deactivationDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Reason</span><span className="font-medium min-w-0 text-right break-words">{deactivationReason}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Unit</span><span className="font-medium min-w-0 text-right break-words">{unitDisposition === 'truck_leaves' ? 'Leaves with the driver' : unitDisposition === 'truck_stays' ? 'Stays leased — held for a new driver' : unitDisposition === 'undecided' ? 'Undecided — held open' : 'Not set'}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Login Access</span><span className="font-medium min-w-0 text-right break-words">{keepLoginActive ? 'Retained' : 'Revoked now'}</span></div>
            </div>
            <div className="space-y-1">
              {orderedSteps.slice(1, -1).map(key => {
                const s = steps[key];
                return (
                  <div key={key} className="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0">
                    <span className="text-muted-foreground">{s.label}</span>
                    <Badge variant={s.status === 'completed' ? 'default' : s.status === 'skipped' ? 'secondary' : 'outline'} className="text-[10px]">
                      {s.status === 'completed' ? 'Done' : s.status === 'skipped' ? 'Skipped' : 'Pending'}
                    </Badge>
                  </div>
                );
              })}
            </div>
            <Alert variant="destructive" className="bg-destructive/5">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                This will mark {operatorName} as inactive and remove them from the active roster and dispatch board.
              </AlertDescription>
            </Alert>
            {!unitDisposition && (
              <p className="text-xs text-destructive">Choose what happens to the unit on the Unit Disposition step before finalizing.</p>
            )}
            <Button className="w-full gap-1.5" variant="destructive" onClick={handleFinalize} disabled={finalizing || !unitDisposition}>
              {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}
              {finalizing ? 'Deactivating…' : 'Confirm Deactivation'}
            </Button>
          </div>
        );
    }
  };

  const isManagementInternal = isManagement;

  if (layout === 'modal') {
    return (
      <div className="flex flex-col h-full max-h-[80dvh]">
        <div className="px-6 pt-6 pb-2">
          {backToDriverButton}
          <div className="flex items-center gap-2 text-foreground">
            <UserX className="h-5 w-5 text-destructive" />
            <h2 className="text-lg font-semibold">Deactivation & Delease Wizard</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {operatorName} — Unit {unitNumber || '—'}: step through every offboarding requirement before finalizing deactivation.
          </p>
        </div>
        <div className="px-6 pb-2">
          {stepperHorizontal}
        </div>
        <Separator />
        <div className="px-6 py-4 flex-1 overflow-y-auto">
          {renderStep()}
        </div>
        <Separator />
        <div className="px-6 py-4 flex items-center justify-between">
          {actionButtons}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full min-h-0 min-w-0 overflow-x-clip">
      <div className="lg:w-72 xl:w-80 shrink-0 min-w-0 overflow-y-auto">
        <div className="mb-4">
          {backToDriverButton}
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <UserX className="h-5 w-5 text-destructive" />
            Deactivation & Delease
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {operatorName} — Unit {unitNumber || '—'}
          </p>
        </div>
        {stepperVertical}
      </div>
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-clip pr-1">
          {renderStep()}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-4 mt-4 border-t border-border">
          {actionButtons}
        </div>
      </div>
    </div>
  );
}
