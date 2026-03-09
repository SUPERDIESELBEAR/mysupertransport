import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowLeft, Save, FileCheck, Truck, Shield, CheckCircle2, AlertTriangle, Clock, FilePen, Trash2, Bell, Paperclip, ExternalLink, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import ICABuilderModal from '@/components/ica/ICABuilderModal';
import ICAViewModal from '@/components/ica/ICAViewModal';
import { formatDistanceToNow, format } from 'date-fns';

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

type DispatchHistoryEntry = {
  id: string;
  dispatch_status: string;
  current_load_lane: string | null;
  status_notes: string | null;
  changed_at: string;
};

const DISPATCH_STATUS_CONFIG: Record<string, { label: string; dotClass: string; badgeClass: string; emoji: string }> = {
  not_dispatched: { label: 'Not Dispatched', dotClass: 'bg-muted-foreground', badgeClass: 'bg-muted text-muted-foreground border-border', emoji: '⏸' },
  dispatched:     { label: 'Dispatched',     dotClass: 'bg-status-complete',   badgeClass: 'bg-status-complete/10 text-status-complete border-status-complete/30', emoji: '🚛' },
  home:           { label: 'Home',           dotClass: 'bg-status-progress',   badgeClass: 'bg-status-progress/10 text-status-progress border-status-progress/30', emoji: '🏠' },
  truck_down:     { label: 'Truck Down',     dotClass: 'bg-destructive',       badgeClass: 'bg-destructive/10 text-destructive border-destructive/30', emoji: '🔴' },
};

export default function OperatorDetailPanel({ operatorId, onBack }: OperatorDetailPanelProps) {
  const { toast } = useToast();
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [voidingICA, setVoidingICA] = useState(false);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [operatorName, setOperatorName] = useState('');
  const [operatorEmail, setOperatorEmail] = useState('');
  const [operatorUserId, setOperatorUserId] = useState<string | null>(null);
  const [showICABuilder, setShowICABuilder] = useState(false);
  const [showICAView, setShowICAView] = useState(false);
  const [applicationData, setApplicationData] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<Partial<OnboardingStatus>>({});
  const [statusId, setStatusId] = useState<string | null>(null);
  const [dispatchHistory, setDispatchHistory] = useState<DispatchHistoryEntry[]>([]);
  const [currentDispatchStatus, setCurrentDispatchStatus] = useState<string | null>(null);
  type DocFileRow = { id: string; file_name: string | null; file_url: string | null; uploaded_at: string };
  const [docFiles, setDocFiles] = useState<Record<string, DocFileRow[]>>({});
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());
  const [showStickyBar, setShowStickyBar] = useState(false);

  const stageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  // Show sticky bar when the main progress bar scrolls out of view
  useEffect(() => {
    const el = progressBarRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyBar(!entry.isIntersecting),
      { threshold: 0, rootMargin: '-64px 0px 0px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading]);

  const toggleStage = (stageKey: string) => {
    setCollapsedStages(prev => {
      const next = new Set(prev);
      next.has(stageKey) ? next.delete(stageKey) : next.add(stageKey);
      return next;
    });
  };

  const scrollToStage = (stageKey: string) => {
    setCollapsedStages(prev => {
      const next = new Set(prev);
      next.delete(stageKey);
      return next;
    });
    setTimeout(() => {
      stageRefs.current[stageKey]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

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
    fetchDispatchHistory();
  }, [operatorId]);

  const fetchDispatchHistory = async () => {
    const { data: dispatch } = await supabase
      .from('active_dispatch')
      .select('dispatch_status')
      .eq('operator_id', operatorId)
      .maybeSingle();
    setCurrentDispatchStatus((dispatch as any)?.dispatch_status ?? null);

    const { data } = await supabase
      .from('dispatch_status_history' as any)
      .select('id, dispatch_status, current_load_lane, status_notes, changed_at')
      .eq('operator_id', operatorId)
      .order('changed_at', { ascending: false })
      .limit(10);
    setDispatchHistory((data as unknown as DispatchHistoryEntry[]) ?? []);
  };

  const fetchOperatorDetail = async () => {
    setLoading(true);

    // Fetch operator core data and doc files in parallel
    const [{ data: op }, { data: opDocs }] = await Promise.all([
      supabase
        .from('operators')
        .select(`id, user_id, notes, onboarding_status (*), applications (email, first_name, last_name, phone, address_street, address_city, address_state, address_zip)`)
        .eq('id', operatorId)
        .single(),
      supabase
        .from('operator_documents')
        .select('id, document_type, file_name, file_url, uploaded_at')
        .eq('operator_id', operatorId)
        .order('uploaded_at', { ascending: false }),
    ]);

    // Group doc files by document_type
    const grouped: Record<string, DocFileRow[]> = {};
    for (const doc of (opDocs ?? []) as any[]) {
      if (!grouped[doc.document_type]) grouped[doc.document_type] = [];
      grouped[doc.document_type].push(doc);
    }
    setDocFiles(grouped);

    if (op) {
      // Fetch profile separately to avoid FK hint issues
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('user_id', (op as any).user_id)
        .maybeSingle();

      setOperatorName(
        profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'Unknown Operator' : 'Unknown Operator'
      );
      setOperatorUserId((op as any).user_id ?? null);
      const app = (op as any).applications;
      setOperatorEmail(app?.email ?? '');
      setApplicationData(app ?? null);
      setNotes((op as any).notes ?? '');
      const os = (op as any).onboarding_status ?? null;
      if (os) {
        setStatus(os);
        setStatusId(os.id);
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
        // Auto-collapse stages that are already complete on load
        const autoCollapse = new Set<string>();
        if (os.mvr_ch_approval === 'approved') autoCollapse.add('stage1');
        if (os.form_2290 === 'received' && os.truck_title === 'received' && os.truck_photos === 'received' && os.truck_inspection === 'received') autoCollapse.add('stage2');
        if (os.ica_status === 'complete') autoCollapse.add('stage3');
        if (os.mo_reg_received === 'yes') autoCollapse.add('stage4');
        if (os.decal_applied === 'yes' && os.eld_installed === 'yes' && os.fuel_card_issued === 'yes') autoCollapse.add('stage5');
        if (os.insurance_added_date) autoCollapse.add('stage6');
        if (autoCollapse.size > 0) setCollapsedStages(autoCollapse);
      }
    }
    setLoading(false);
  };

  // Map doc field keys to human-readable labels
  const DOC_LABELS: Record<string, string> = {
    form_2290: 'Form 2290',
    truck_title: 'Truck Title',
    truck_photos: 'Truck Photos',
    truck_inspection: 'Truck Inspection Report',
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
      }

      // ── Update snapshot (always, so re-saves don't re-fire) ──────────
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

      // ── Per-doc received notifications → operator ─────────────────────
      if (operatorUserId) {
        const docFields: Array<keyof OnboardingStatus> = ['form_2290', 'truck_title', 'truck_photos', 'truck_inspection'];
        const justReceived = docFields.filter(
          f => prev[f as keyof typeof prev] !== 'received' && status[f] === 'received'
        );
        for (const f of justReceived) {
          const docLabel = DOC_LABELS[f as string] ?? f;
          await supabase.from('notifications').insert({
            user_id: operatorUserId,
            type: 'doc_received',
            title: `Your ${docLabel} has been received`,
            body: `Your ${docLabel} has been reviewed and received by your onboarding coordinator.`,
            channel: 'in_app',
            link: '/operator?tab=documents',
          });
          toast({
            title: `✅ ${docLabel} received`,
            description: `${operatorName} has been notified.`,
          });
        }
      }

      // ── Write audit log for operator status changes ───────────────────
      if (triggeredMilestones.length > 0 || statusId) {
        // Only log if something meaningfully changed (milestones triggered)
        if (triggeredMilestones.length > 0) {
          void supabase.from('audit_log' as any).insert({
            actor_id: session?.user?.id ?? null,
            actor_name: null,
            action: 'operator_status_updated',
            entity_type: 'operator',
            entity_id: operatorId,
            entity_label: operatorName,
            metadata: {
              milestones: triggeredMilestones.map(m => m.label),
            },
          });
        }
      }
    }

    setSaving(false);
  };

  const handleVoidICA = async () => {
    setVoidingICA(true);
    try {
      // Delete the ica_contracts record for this operator
      const { error: delError } = await supabase
        .from('ica_contracts' as any)
        .delete()
        .eq('operator_id', operatorId);
      if (delError) throw delError;

      // Reset ica_status on onboarding_status
      if (statusId) {
        const { error: updError } = await supabase
          .from('onboarding_status')
          .update({ ica_status: 'not_issued' })
          .eq('id', statusId);
        if (updError) throw updError;
      }

      // Log the void action
      void supabase.from('audit_log' as any).insert({
        actor_id: session?.user?.id ?? null,
        actor_name: null,
        action: 'ica_voided',
        entity_type: 'operator',
        entity_id: operatorId,
        entity_label: operatorName,
        metadata: { previous_ica_status: status.ica_status },
      });

      setStatus(prev => ({ ...prev, ica_status: 'not_issued' }));
      savedMilestones.current.ica_status = 'not_issued';
      setShowVoidConfirm(false);
      toast({ title: 'ICA voided', description: 'The contract has been cleared. You can now prepare a new ICA.' });
    } catch (err: any) {
      toast({ title: 'Error voiding ICA', description: err.message, variant: 'destructive' });
    } finally {
      setVoidingICA(false);
    }
  };

  const updateStatus = (field: keyof OnboardingStatus, value: string | null) => {
    setStatus(prev => ({ ...prev, [field]: value }));
  };

  // Track which doc fields are currently being "requested" (for button loading state)
  const [requestingDoc, setRequestingDoc] = useState<string | null>(null);
  const [markingReceived, setMarkingReceived] = useState<string | null>(null);

  const handleRequestDoc = async (field: keyof OnboardingStatus, label: string) => {
    if (!statusId) return;
    setRequestingDoc(field as string);
    try {
      const { error } = await supabase
        .from('onboarding_status')
        .update({ [field]: 'requested' })
        .eq('id', statusId);
      if (error) throw error;

      // Update local state & milestone snapshot
      setStatus(prev => ({ ...prev, [field]: 'requested' }));
      savedMilestones.current = { ...savedMilestones.current, [field]: 'requested' };

      // Notify the operator via the existing edge function
      await supabase.functions.invoke('send-notification', {
        body: {
          type: 'onboarding_milestone',
          operator_id: operatorId,
          operator_name: operatorName,
          operator_email: operatorEmail || undefined,
          milestone: `Documents Requested — Please Upload Your Documents`,
          milestone_key: 'docs_requested',
        },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });

      toast({
        title: `${label} requested`,
        description: `${operatorName} has been notified to upload this document.`,
      });
    } catch (err: any) {
      toast({ title: 'Error requesting document', description: err.message, variant: 'destructive' });
    } finally {
      setRequestingDoc(null);
    }
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

      {/* Sticky mini progress bar — shown when main bar scrolls out of view */}
      {(() => {
        const stages = [
          { label: 'Background', key: 'stage1', complete: status.mvr_ch_approval === 'approved' },
          { label: 'Documents',  key: 'stage2', complete: status.form_2290 === 'received' && status.truck_title === 'received' && status.truck_photos === 'received' && status.truck_inspection === 'received' },
          { label: 'ICA',        key: 'stage3', complete: status.ica_status === 'complete' },
          { label: 'MO Reg',     key: 'stage4', complete: status.mo_reg_received === 'yes' },
          { label: 'Equipment',  key: 'stage5', complete: status.decal_applied === 'yes' && status.eld_installed === 'yes' && status.fuel_card_issued === 'yes' },
          { label: 'Insurance',  key: 'stage6', complete: !!status.insurance_added_date },
        ];
        const completedCount = stages.filter(s => s.complete).length;
        const pct = Math.round((completedCount / stages.length) * 100);
        return (
          <div
            className={`sticky top-0 z-30 -mx-6 px-6 transition-all duration-300 ${
              showStickyBar ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
            }`}
          >
            <div className="bg-white/95 backdrop-blur border-b border-border shadow-sm py-2 px-4">
              <div className="flex items-center gap-3 max-w-4xl">
                {/* Operator name + unit number */}
                <span className="hidden sm:flex items-center gap-1.5 shrink-0">
                  <span className="text-xs font-semibold text-foreground whitespace-nowrap">{operatorName}</span>
                  {status.unit_number && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border whitespace-nowrap">
                      #{status.unit_number}
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground hidden sm:block">·</span>
                {/* Progress percentage — prominent */}
                <span
                  className="text-sm font-bold whitespace-nowrap shrink-0 tabular-nums"
                  style={{ color: completedCount === stages.length ? 'hsl(var(--status-complete))' : 'hsl(var(--gold-main))' }}
                >
                  {pct}%
                </span>
                {/* Dispatch status badge */}
                {currentDispatchStatus && currentDispatchStatus !== 'not_dispatched' && (() => {
                  const cfg = DISPATCH_STATUS_CONFIG[currentDispatchStatus];
                  return cfg ? (
                    <span className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.badgeClass} whitespace-nowrap shrink-0`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotClass} shrink-0`} />
                      {cfg.emoji} {cfg.label}
                    </span>
                  ) : null;
                })()}
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background: completedCount === stages.length
                        ? 'hsl(var(--status-complete))'
                        : 'hsl(var(--gold-main))',
                    }}
                  />
                </div>
                <TooltipProvider delayDuration={150}>
                  <div className="flex items-center gap-1 shrink-0">
                    {stages.map((s, i) => (
                      <Tooltip key={s.key}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => scrollToStage(s.key)}
                            className={`h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold border-2 transition-all hover:scale-110 ${
                              s.complete
                                ? 'bg-status-complete border-status-complete text-white'
                                : 'bg-background border-border text-muted-foreground hover:border-gold hover:text-gold'
                            }`}
                          >
                            {s.complete ? '✓' : i + 1}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                          <span className="font-semibold">{s.label}</span>
                          <span className={`ml-1.5 ${s.complete ? 'text-status-complete' : 'text-muted-foreground'}`}>
                            — {s.complete ? '✓ Complete' : 'Pending'}
                          </span>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </TooltipProvider>
              </div>
            </div>
          </div>
        );
      })()}
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

      {/* Stage Completion Progress Bar */}
      {(() => {
        const stages = [
          { label: 'Background', key: 'stage1', complete: status.mvr_ch_approval === 'approved' },
          { label: 'Documents',  key: 'stage2', complete: status.form_2290 === 'received' && status.truck_title === 'received' && status.truck_photos === 'received' && status.truck_inspection === 'received' },
          { label: 'ICA',        key: 'stage3', complete: status.ica_status === 'complete' },
          { label: 'MO Reg',     key: 'stage4', complete: status.mo_reg_received === 'yes' },
          { label: 'Equipment',  key: 'stage5', complete: status.decal_applied === 'yes' && status.eld_installed === 'yes' && status.fuel_card_issued === 'yes' },
          { label: 'Insurance',  key: 'stage6', complete: !!status.insurance_added_date },
        ];
        const completedCount = stages.filter(s => s.complete).length;
        const pct = Math.round((completedCount / stages.length) * 100);
        return (
          <div ref={progressBarRef} className="bg-white border border-border rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Onboarding Progress</span>
              <span className="text-xs font-bold text-foreground">{completedCount} / {stages.length} stages complete</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden mb-3">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  background: completedCount === stages.length
                    ? 'hsl(var(--status-complete))'
                    : 'hsl(var(--gold-main))',
                }}
              />
            </div>
            <div className="grid grid-cols-6 gap-1">
              {stages.map((s, i) => (
                <button
                  key={s.label}
                  onClick={() => scrollToStage(s.key)}
                  title={`Jump to ${s.label}`}
                  className="flex flex-col items-center gap-1 group focus:outline-none"
                >
                  <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-colors group-hover:scale-110 group-hover:shadow-sm ${
                    s.complete
                      ? 'bg-status-complete border-status-complete text-white'
                      : 'bg-background border-border text-muted-foreground group-hover:border-gold group-hover:text-gold'
                  }`}>
                    {s.complete ? '✓' : i + 1}
                  </div>
                  <span className={`text-[10px] text-center leading-tight transition-colors ${s.complete ? 'text-status-complete font-medium' : 'text-muted-foreground group-hover:text-foreground'}`}>
                    {s.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Collapse All / Expand All */}
      {(() => {
        const allStageKeys = ['stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'stage6'];
        const allCollapsed = allStageKeys.every(k => collapsedStages.has(k));
        return (
          <div className="flex justify-end">
            <button
              onClick={() => setCollapsedStages(allCollapsed ? new Set() : new Set(allStageKeys))}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
            >
              {allCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              {allCollapsed ? 'Expand All' : 'Collapse All'}
            </button>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Stage 1 — Background */}
        {(() => {
          const s1Complete = status.mvr_ch_approval === 'approved';
          const s1Collapsed = collapsedStages.has('stage1');
          return (
            <div ref={el => { stageRefs.current['stage1'] = el; }} className={`bg-white border rounded-xl shadow-sm transition-colors ${s1Complete ? 'border-status-complete' : 'border-border'}`}>
              <button onClick={() => toggleStage('stage1')} className="w-full flex items-center justify-between px-5 py-4 text-left">
                <div className="flex items-center gap-2">
                  <Shield className={`h-4 w-4 ${s1Complete ? 'text-status-complete' : 'text-gold'}`} />
                  <h3 className="font-semibold text-foreground text-sm">Stage 1 — Background Check</h3>
                </div>
                <div className="flex items-center gap-2">
                  {s1Complete && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-status-complete/10 text-status-complete border border-status-complete/30"><CheckCircle2 className="h-3 w-3" />Complete</span>}
                  {s1Collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>
              {!s1Collapsed && (
                <div className="px-5 pb-5 space-y-3">
                  <SelectField label="MVR Status" field="mvr_status" options={mvrOptions} />
                  <SelectField label="Clearinghouse (CH) Status" field="ch_status" options={mvrOptions} />
                  <SelectField label="MVR/CH Approval" field="mvr_ch_approval" options={approvalOptions} />
                  <SelectField label="PE Screening" field="pe_screening" options={screeningOptions} />
                  <SelectField label="PE Screening Result" field="pe_screening_result" options={resultOptions} />
                </div>
              )}
            </div>
          );
        })()}

        {/* Stage 2 — Documents */}
        {(() => {
          const allDocsComplete =
            status.form_2290 === 'received' &&
            status.truck_title === 'received' &&
            status.truck_photos === 'received' &&
            status.truck_inspection === 'received';
          const s2Collapsed = collapsedStages.has('stage2');
          return (
        <div ref={el => { stageRefs.current['stage2'] = el; }} className={`bg-white border rounded-xl shadow-sm transition-colors ${allDocsComplete ? 'border-status-complete' : 'border-border'}`}>
          <button onClick={() => toggleStage('stage2')} className="w-full flex items-center justify-between px-5 py-4 text-left">
            <div className="flex items-center gap-2">
              <FileCheck className={`h-4 w-4 ${allDocsComplete ? 'text-status-complete' : 'text-gold'}`} />
              <h3 className="font-semibold text-foreground text-sm">Stage 2 — Documents</h3>
            </div>
            <div className="flex items-center gap-2">
              {allDocsComplete && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-status-complete/10 text-status-complete border border-status-complete/30"><CheckCircle2 className="h-3 w-3" />All Docs Complete</span>}
              {s2Collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
            </div>
          </button>
          {!s2Collapsed && (
          <div className="px-5 pb-5 space-y-3">
            <SelectField label="Registration Status" field="registration_status" options={regOptions} />
            {/* Doc fields with inline Request buttons */}
            {([
              { field: 'form_2290', label: 'Form 2290' },
              { field: 'truck_title', label: 'Truck Title' },
              { field: 'truck_photos', label: 'Truck Photos' },
              { field: 'truck_inspection', label: 'Truck Inspection' },
            ] as { field: keyof OnboardingStatus; label: string }[]).map(({ field, label }) => {
              const current = (status[field] as string) ?? 'not_started';
              const isRequesting = requestingDoc === field;
              const alreadyRequested = current === 'requested';
              const received = current === 'received';
              const files = docFiles[field as string] ?? [];
              const fileCount = files.length;
              return (
                <div key={field as string} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
                    {fileCount > 0 && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="flex items-center gap-1 text-[11px] font-medium text-info hover:text-info/80 transition-colors cursor-pointer leading-none">
                            <Paperclip className="h-3 w-3" />
                            {fileCount} {fileCount === 1 ? 'file' : 'files'} uploaded
                          </button>
                        </PopoverTrigger>
                        <PopoverContent side="top" align="start" className="w-72 p-0">
                          <div className="p-3 border-b border-border">
                            <p className="text-xs font-semibold text-foreground">{label} — Uploaded Files</p>
                          </div>
                          <ul className="divide-y divide-border max-h-48 overflow-y-auto">
                            {files.map(f => (
                              <li key={f.id} className="flex items-center justify-between gap-2 px-3 py-2">
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-foreground truncate max-w-[160px]">
                                    {f.file_name ?? 'Unnamed file'}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {format(new Date(f.uploaded_at), 'MMM d, yyyy')}
                                  </p>
                                </div>
                                {f.file_url ? (
                                  <a
                                    href={f.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-[11px] text-gold hover:text-gold-light font-medium shrink-0"
                                  >
                                    View <ExternalLink className="h-3 w-3" />
                                  </a>
                                ) : (
                                  <span className="text-[11px] text-muted-foreground shrink-0">No URL</span>
                                )}
                              </li>
                            ))}
                          </ul>
                          {/* Mark as Received shortcut */}
                          {!received && (
                            <div className="p-2 border-t border-border">
                              <button
                                className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold text-status-complete bg-status-complete/10 hover:bg-status-complete/20 border border-status-complete/30 rounded-md py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={markingReceived === (field as string)}
                                onClick={async () => {
                                  if (!statusId) return;
                                  setMarkingReceived(field as string);
                                  try {
                                    await supabase.from('onboarding_status').update({ [field]: 'received' }).eq('id', statusId);
                                    // Update local state & snapshot
                                    setStatus(prev => ({ ...prev, [field]: 'received' }));
                                    savedMilestones.current = { ...savedMilestones.current, [field as string]: 'received' };
                                    // Notify operator
                                    if (operatorUserId) {
                                      await supabase.from('notifications').insert({
                                        user_id: operatorUserId,
                                        type: 'doc_received',
                                        title: `Your ${DOC_LABELS[field as string] ?? label} has been received`,
                                        body: `Your ${DOC_LABELS[field as string] ?? label} has been reviewed and received by your onboarding coordinator.`,
                                        channel: 'in_app',
                                        link: '/operator?tab=documents',
                                      });
                                    }
                                    toast({ title: `✅ ${label} marked received`, description: `${operatorName} has been notified.` });
                                  } catch (err: any) {
                                    toast({ title: 'Error', description: err.message, variant: 'destructive' });
                                  } finally {
                                    setMarkingReceived(null);
                                  }
                                }}
                              >
                                {markingReceived === (field as string)
                                  ? <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                                  : <CheckCircle2 className="h-3 w-3" />
                                }
                                {markingReceived === (field as string) ? 'Saving…' : 'Mark as Received'}
                              </button>
                            </div>
                          )}
                          {received && (
                            <div className="p-2 border-t border-border flex items-center justify-center gap-1.5 text-[11px] font-semibold text-status-complete">
                              <CheckCircle2 className="h-3 w-3" /> Already marked received
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <div className="flex-1">
                      <Select value={current} onValueChange={v => updateStatus(field, v)}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          {docOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className={`h-9 px-2.5 text-xs gap-1 shrink-0 transition-colors ${
                        received
                          ? 'border-status-complete/40 text-status-complete bg-status-complete/5 cursor-default'
                          : alreadyRequested
                          ? 'border-gold/40 text-gold bg-gold/5 cursor-default'
                          : 'border-info/40 text-info hover:bg-info/10'
                      }`}
                      disabled={isRequesting || alreadyRequested || received}
                      onClick={() => handleRequestDoc(field, label)}
                      title={received ? 'Document received' : alreadyRequested ? 'Already requested' : `Request ${label} from operator`}
                    >
                      {isRequesting ? (
                        <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                      ) : received ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <Bell className="h-3.5 w-3.5" />
                      )}
                      <span>{received ? 'Received' : alreadyRequested ? 'Requested' : 'Request'}</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
          );
        })()}

        {/* Stage 3 — ICA */}
        {(() => {
          const s3Complete = status.ica_status === 'complete';
          const s3Collapsed = collapsedStages.has('stage3');
          return (
            <div ref={el => { stageRefs.current['stage3'] = el; }} className={`bg-white border rounded-xl shadow-sm transition-colors ${s3Complete ? 'border-status-complete' : 'border-border'}`}>
              <button onClick={() => toggleStage('stage3')} className="w-full flex items-center justify-between px-5 py-4 text-left">
                <div className="flex items-center gap-2">
                  <FileCheck className={`h-4 w-4 ${s3Complete ? 'text-status-complete' : 'text-gold'}`} />
                  <h3 className="font-semibold text-foreground text-sm">Stage 3 — ICA</h3>
                </div>
                <div className="flex items-center gap-2">
                  {s3Complete && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-status-complete/10 text-status-complete border border-status-complete/30"><CheckCircle2 className="h-3 w-3" />Complete</span>}
                  {s3Collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>
              {!s3Collapsed && (
                <div className="px-5 pb-5 space-y-3">
            <SelectField label="ICA Status" field="ica_status" options={icaOptions} />
            {status.pe_screening_result !== 'clear' && (
              <div className="p-3 rounded-lg bg-status-action/10 border border-status-action/30 text-xs text-status-action">
                PE Screening must be Clear before sending ICA.
              </div>
            )}
            {status.pe_screening_result === 'clear' && status.ica_status !== 'complete' && (
              <Button
                variant="outline"
                size="sm"
                className="w-full border-gold text-gold hover:bg-gold/10 text-xs gap-1.5"
                onClick={() => setShowICABuilder(true)}
              >
                <FilePen className="h-3.5 w-3.5" />
                {status.ica_status === 'sent_for_signature' ? 'View / Edit ICA' : 'Prepare & Send ICA'}
              </Button>
            )}
            {status.ica_status === 'complete' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-status-complete/10 border border-status-complete/30">
                  <CheckCircle2 className="h-3.5 w-3.5 text-status-complete" />
                  <span className="text-xs text-status-complete font-medium">ICA Fully Executed</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-border text-foreground hover:bg-secondary text-xs gap-1.5"
                  onClick={() => setShowICAView(true)}
                >
                  <FileCheck className="h-3.5 w-3.5" />
                  View Executed ICA
                </Button>
              </div>
            )}
            {status.ica_status === 'sent_for_signature' && (
              <Button
                variant="outline"
                size="sm"
                className="w-full border-border text-foreground hover:bg-secondary text-xs gap-1.5"
                onClick={() => setShowICAView(true)}
              >
                <FileCheck className="h-3.5 w-3.5" />
                View Sent ICA
              </Button>
            )}

            {/* Void ICA — available when a contract has been issued (sent or complete) */}
            {(status.ica_status === 'sent_for_signature' || status.ica_status === 'complete') && (
              <div className="pt-1 border-t border-border">
                {!showVoidConfirm ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive text-xs gap-1.5"
                    onClick={() => setShowVoidConfirm(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Void ICA &amp; Re-issue
                  </Button>
                ) : (
                  <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/30 space-y-3">
                    <p className="text-xs font-medium text-destructive">
                      ⚠ This will permanently delete the current ICA contract and reset the status to "Not Issued". This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1 text-xs h-7 gap-1.5"
                        onClick={handleVoidICA}
                        disabled={voidingICA}
                      >
                        <Trash2 className="h-3 w-3" />
                        {voidingICA ? 'Voiding…' : 'Yes, Void ICA'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs h-7"
                        onClick={() => setShowVoidConfirm(false)}
                        disabled={voidingICA}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Stage 4 — Missouri Registration (conditional) */}
        {status.registration_status === 'needs_mo_reg' && (() => {
          const s4Complete = status.mo_reg_received === 'yes';
          const s4Collapsed = collapsedStages.has('stage4');
          return (
            <div ref={el => { stageRefs.current['stage4'] = el; }} className={`bg-white border rounded-xl shadow-sm transition-colors ${s4Complete ? 'border-status-complete' : 'border-border'}`}>
              <button onClick={() => toggleStage('stage4')} className="w-full flex items-center justify-between px-5 py-4 text-left">
                <div className="flex items-center gap-2">
                  <FileCheck className={`h-4 w-4 ${s4Complete ? 'text-status-complete' : 'text-gold'}`} />
                  <h3 className="font-semibold text-foreground text-sm">Stage 4 — Missouri Registration</h3>
                </div>
                <div className="flex items-center gap-2">
                  {s4Complete && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-status-complete/10 text-status-complete border border-status-complete/30"><CheckCircle2 className="h-3 w-3" />Complete</span>}
                  {s4Collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>
              {!s4Collapsed && (
                <div className="px-5 pb-5 space-y-3">
                  <div className="p-3 rounded-lg bg-status-progress/10 border border-status-progress/30 text-xs text-status-progress">
                    ⚠ Missouri requires Title + Form 2290 + signed ICA submitted together. Partial submissions are not accepted. ICA must be Complete before submitting.
                  </div>
                  <SelectField label="MO Docs Submitted" field="mo_docs_submitted" options={moDocsOptions} />
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Expected Approval Date</Label>
                    <Input type="date" value={status.mo_expected_approval_date ?? ''} onChange={e => updateStatus('mo_expected_approval_date', e.target.value || null)} className="h-9 text-sm" />
                  </div>
                  <SelectField label="MO Registration Received" field="mo_reg_received" options={moRegOptions} />
                </div>
              )}
            </div>
          );
        })()}

        {/* Stage 5 — Equipment */}
        {(() => {
          const allEquipmentReady = status.decal_applied === 'yes' && status.eld_installed === 'yes' && status.fuel_card_issued === 'yes';
          const s5Collapsed = collapsedStages.has('stage5');
          return (
            <div ref={el => { stageRefs.current['stage5'] = el; }} className={`bg-white border rounded-xl shadow-sm transition-colors ${allEquipmentReady ? 'border-status-complete' : 'border-border'}`}>
              <button onClick={() => toggleStage('stage5')} className="w-full flex items-center justify-between px-5 py-4 text-left">
                <div className="flex items-center gap-2">
                  <Truck className={`h-4 w-4 ${allEquipmentReady ? 'text-status-complete' : 'text-gold'}`} />
                  <h3 className="font-semibold text-foreground text-sm">Stage 5 — Equipment Setup</h3>
                </div>
                <div className="flex items-center gap-2">
                  {allEquipmentReady && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-status-complete/10 text-status-complete border border-status-complete/30"><CheckCircle2 className="h-3 w-3" />All Equipment Ready</span>}
                  {s5Collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>
              {!s5Collapsed && (
                <div className="px-5 pb-5 space-y-3">
                  <SelectField label="Decal Method" field="decal_method" options={methodOptions} />
                  <SelectField label="Decal Applied" field="decal_applied" options={yesNoOptions} />
                  <SelectField label="ELD Method" field="eld_method" options={methodOptions} />
                  <SelectField label="ELD Installed" field="eld_installed" options={yesNoOptions} />
                  <SelectField label="Fuel Card Issued" field="fuel_card_issued" options={yesNoOptions} />
                </div>
              )}
            </div>
          );
        })()}

        {/* Stage 6 — Insurance */}
        {(() => {
          const s6Complete = !!status.insurance_added_date;
          const s6Collapsed = collapsedStages.has('stage6');
          return (
            <div ref={el => { stageRefs.current['stage6'] = el; }} className={`bg-white border rounded-xl shadow-sm transition-colors ${s6Complete ? 'border-status-complete' : 'border-border'}`}>
              <button onClick={() => toggleStage('stage6')} className="w-full flex items-center justify-between px-5 py-4 text-left">
                <div className="flex items-center gap-2">
                  <Shield className={`h-4 w-4 ${s6Complete ? 'text-status-complete' : 'text-gold'}`} />
                  <h3 className="font-semibold text-foreground text-sm">Stage 6 — Insurance</h3>
                </div>
                <div className="flex items-center gap-2">
                  {s6Complete && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-status-complete/10 text-status-complete border border-status-complete/30"><CheckCircle2 className="h-3 w-3" />Fully Onboarded</span>}
                  {s6Collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>
              {!s6Collapsed && (
                <div className="px-5 pb-5 space-y-3">
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
                  {s6Complete && (
                    <Badge className="status-complete border text-xs w-full justify-center">
                      ✓ FULLY ONBOARDED
                    </Badge>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Dispatch Status History */}
      {(status.fully_onboarded || dispatchHistory.length > 0 || currentDispatchStatus) && (
        <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gold" />
              <h3 className="font-semibold text-foreground text-sm">Dispatch Status History</h3>
            </div>
            {currentDispatchStatus && DISPATCH_STATUS_CONFIG[currentDispatchStatus] && (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${DISPATCH_STATUS_CONFIG[currentDispatchStatus].badgeClass}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${DISPATCH_STATUS_CONFIG[currentDispatchStatus].dotClass}`} />
                Current: {DISPATCH_STATUS_CONFIG[currentDispatchStatus].label}
              </span>
            )}
          </div>

          {dispatchHistory.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Truck className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">No dispatch history recorded yet.</p>
            </div>
          ) : (
            <div className="relative">
              {/* vertical line */}
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
              <div className="space-y-4">
                {dispatchHistory.map((entry, idx) => {
                  const cfg = DISPATCH_STATUS_CONFIG[entry.dispatch_status] ?? DISPATCH_STATUS_CONFIG['not_dispatched'];
                  return (
                    <div key={entry.id} className="flex gap-4 relative">
                      {/* dot */}
                      <div className={`h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm shrink-0 mt-0.5 z-10 ${cfg.dotClass}`} />
                      <div className="flex-1 min-w-0 pb-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.badgeClass}`}>
                            {cfg.emoji} {cfg.label}
                          </span>
                          {idx === 0 && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gold/15 text-gold border border-gold/30">Latest</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                          {entry.current_load_lane && (
                            <span className="text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">Lane:</span> {entry.current_load_lane}
                            </span>
                          )}
                          {entry.status_notes && (
                            <span className="text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">Note:</span> {entry.status_notes}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(entry.changed_at), { addSuffix: true })}
                          <span className="ml-1.5 text-muted-foreground/60">
                            · {new Date(entry.changed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

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

      {/* ICA Builder Modal */}
      {showICABuilder && (
        <ICABuilderModal
          operatorId={operatorId}
          operatorName={operatorName}
          operatorEmail={operatorEmail}
          applicationData={applicationData}
          onClose={() => setShowICABuilder(false)}
          onSent={() => {
            setShowICABuilder(false);
            updateStatus('ica_status', 'sent_for_signature');
            toast({ title: 'ICA sent', description: `${operatorName} will be notified to review and sign.` });
          }}
        />
      )}

      {/* ICA View Modal */}
      {showICAView && (
        <ICAViewModal
          operatorId={operatorId}
          operatorName={operatorName}
          onClose={() => setShowICAView(false)}
        />
      )}
    </div>
  );
}
