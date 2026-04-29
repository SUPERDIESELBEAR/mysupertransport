import { useState, useEffect, useCallback, useRef } from 'react';
import OperatorNotificationPreferencesModal from '@/components/operator/OperatorNotificationPreferencesModal';
import { useAuth } from '@/hooks/useAuth';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  CheckCircle2, Circle, Clock, AlertTriangle,
  MessageSquare, BookOpen, HelpCircle, FileText, SlidersHorizontal,
  LogOut, Menu, X, Upload, Shield, FileCheck, Truck, TriangleAlert, Phone, Bell, CheckCheck, KeyRound,
  ArrowRight, Library, Cpu, Camera, CreditCard, Gauge, FolderOpen, Eye, Calculator, Home, ChevronRight,
} from 'lucide-react';
import DocumentHub from '@/components/documents/DocumentHub';
import DriverServiceLibrary from '@/components/service-library/DriverServiceLibrary';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import NotificationHistory from '@/components/management/NotificationHistory';
import logo from '@/assets/supertransport-logo.png';
import OperatorDocumentUpload from '@/components/operator/OperatorDocumentUpload';
import TruckPhotoGuideModal from '@/components/operator/TruckPhotoGuideModal';
import { OperatorResourceLibrary, OperatorFAQ } from '@/components/operator/OperatorResourcesAndFAQ';
import OperatorMessagesView from '@/components/operator/OperatorMessagesView';
import NotificationBell from '@/components/NotificationBell';
import OperatorStatusPage from '@/components/operator/OperatorStatusPage';
import OperatorDispatchStatus from '@/components/operator/OperatorDispatchStatus';
import OperatorICASign from '@/components/operator/OperatorICASign';
import { useDesktopNotifications } from '@/hooks/useDesktopNotifications';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import EditProfileModal from '@/components/EditProfileModal';
import OperatorInspectionBinder from '@/components/inspection/OperatorInspectionBinder';
import ContractorPaySetup from '@/components/operator/ContractorPaySetup';
import TruckInfoCard, { TruckInfo, EquipmentShippingInfo } from '@/components/operator/TruckInfoCard';
import DriverVaultCard from '@/components/drivers/DriverVaultCard';
import FleetDetailDrawer from '@/components/fleet/FleetDetailDrawer';
import { BuildInfo } from '@/components/BuildInfo';
import SettlementForecast from '@/components/operator/SettlementForecast';

type StageStatus = 'not_started' | 'in_progress' | 'complete' | 'action_required';
type OperatorView = 'home' | 'progress' | 'documents' | 'messages' | 'resource-center' | 'faq' | 'dispatch' | 'ica' | 'notifications' | 'docs-hub' | 'inspection-binder' | 'pay-setup' | 'my-docs' | 'my-truck' | 'forecast';

interface Stage {
  number: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  status: StageStatus;
  substeps: { label: string; value: string; status: StageStatus }[];
  hint?: string;
}

interface UploadedDoc {
  id: string;
  document_type: string;
  file_name: string | null;
  file_url: string | null;
  uploaded_at: string;
}

export default function OperatorPortal({ previewUserId }: { previewUserId?: string } = {}) {
  const { profile: authProfile, user, signOut, refreshProfile } = useAuth();
  const isPreview = !!previewUserId;
  const effectiveUserId = previewUserId ?? user?.id;
  const [previewProfile, setPreviewProfile] = useState<{ first_name: string | null; last_name: string | null; avatar_url: string | null; phone: string | null } | null>(null);
  useEffect(() => {
    if (!previewUserId) return;
    supabase.from('profiles').select('first_name, last_name, avatar_url, phone').eq('user_id', previewUserId).maybeSingle()
      .then(({ data }) => setPreviewProfile(data));
  }, [previewUserId]);
  const profile = isPreview ? previewProfile : authProfile;
  const location = useLocation();
  const navigate = useNavigate();
  const [view, setView] = useState<OperatorView>(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab') as OperatorView | null;
    if (tab && ['progress','documents','messages','resource-center','faq','dispatch','ica','notifications','docs-hub','inspection-binder','pay-setup','my-docs','my-truck','forecast'].includes(tab)) return tab;
    return 'progress';
  });
  // Sub-view for the inspection binder (list vs flipbook pages); driven via ?binderView=pages
  const [binderView, setBinderView] = useState<'list' | 'pages' | undefined>(() => {
    const params = new URLSearchParams(window.location.search);
    const bv = params.get('binderView');
    return bv === 'pages' ? 'pages' : undefined;
  });
  const [paySetupData, setPaySetupData] = useState<{ submitted_at: string | null; terms_accepted: boolean } | null>(null);

  // Desktop push notifications for high-priority events
  const { fireNotification } = useDesktopNotifications({
    onNavigate: (link) => navigate(link),
  });

  // React to in-app notification deep-links when navigate() is called while portal is already mounted
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab') as OperatorView | null;
    if (tab && ['progress','documents','messages','resource-center','faq','dispatch','ica','notifications','docs-hub','inspection-binder','pay-setup','my-docs','my-truck','forecast'].includes(tab)) setView(tab);
    const bv = params.get('binderView');
    setBinderView(bv === 'pages' ? 'pages' : undefined);
  }, [location.search]);
  const [onboardingStatus, setOnboardingStatus] = useState<Record<string, string | null>>({});
  const [operatorId, setOperatorId] = useState<string | null>(null);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [unackedRequiredDocs, setUnackedRequiredDocs] = useState(0);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);
  const [dispatchUpdatedAt, setDispatchUpdatedAt] = useState<string | null>(null);
  const [assignedDispatcher, setAssignedDispatcher] = useState<{ name: string; phone: string | null; userId: string | null; avatarUrl: string | null } | null>(null);
  const [assignedCoordinator, setAssignedCoordinator] = useState<{ name: string; phone: string | null; userId: string | null; avatarUrl: string | null } | null>(null);
  const [messageInitialUserId, setMessageInitialUserId] = useState<string | null>(null);
  const [notifPrefOpen, setNotifPrefOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [truckDownAcked, setTruckDownAcked] = useState(false);
  const [ackLoading, setAckLoading] = useState(false);
  const [cdlExpiration, setCdlExpiration] = useState<string | null>(null);
  const [medicalCertExpiration, setMedicalCertExpiration] = useState<string | null>(null);
  const [icaTruckInfo, setIcaTruckInfo] = useState<TruckInfo | null>(null);
  const [equipmentShipping, setEquipmentShipping] = useState<EquipmentShippingInfo[]>([]);
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);

  const handleTruckDownAck = useCallback(async () => {
    if (isPreview || !operatorId || !dispatchUpdatedAt || !user) return;
    setAckLoading(true);
    try {
      await supabase.from('dispatch_status_history').insert({
        operator_id: operatorId,
        dispatch_status: 'truck_down',
        status_notes: 'Operator acknowledged truck down alert.',
        changed_by: user.id,
      });
      const ackKey = `truck_down_ack_${operatorId}_${dispatchUpdatedAt}`;
      localStorage.setItem(ackKey, 'true');
      setTruckDownAcked(true);
    } finally {
      setAckLoading(false);
    }
  }, [operatorId, dispatchUpdatedAt, user]);

  const fetchDispatcherInfo = useCallback(async (dispatcherUserId: string | null) => {
    if (!dispatcherUserId) { setAssignedDispatcher(null); return; }
    const { data } = await supabase
      .from('profiles')
      .select('first_name, last_name, phone, avatar_url')
      .eq('user_id', dispatcherUserId)
      .maybeSingle();
    if (data) {
      setAssignedDispatcher({
        name: [data.first_name, data.last_name].filter(Boolean).join(' ') || 'Dispatcher',
        phone: data.phone ?? null,
        userId: dispatcherUserId,
        avatarUrl: data.avatar_url ?? null,
      });
    }
  }, []);

  const fetchCoordinatorInfo = useCallback(async (coordinatorUserId: string | null) => {
    if (!coordinatorUserId) { setAssignedCoordinator(null); return; }
    const { data } = await supabase
      .from('profiles')
      .select('first_name, last_name, phone, avatar_url')
      .eq('user_id', coordinatorUserId)
      .maybeSingle();
    if (data) {
      setAssignedCoordinator({
        name: [data.first_name, data.last_name].filter(Boolean).join(' ') || 'Coordinator',
        phone: data.phone ?? null,
        userId: coordinatorUserId,
        avatarUrl: data.avatar_url ?? null,
      });
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!effectiveUserId) return;
    const { data: op } = await supabase
      .from('operators')
      .select('id, application_id, assigned_onboarding_staff, onboarding_status(*), operator_documents(*)')
      .eq('user_id', effectiveUserId)
      .single();

    if (op) {
      const opId = (op as any).id;
      setOperatorId(opId);
      // onboarding_status is a 1:1 relation — returns object, not array
      const os = (op as any).onboarding_status ?? {};
      setOnboardingStatus(os);
      setUploadedDocs((op as any).operator_documents ?? []);

      // Fetch Stage 8 pay setup status
      const { data: ps } = await supabase
        .from('contractor_pay_setup' as any)
        .select('submitted_at, terms_accepted')
        .eq('operator_id', opId)
        .maybeSingle();
      setPaySetupData(ps ? { submitted_at: (ps as any).submitted_at, terms_accepted: (ps as any).terms_accepted } : null);

      // Fetch equipment shipping info via secure RPC (operator-scoped)
      const { data: shippingData } = await supabase.rpc(
        'get_equipment_shipping_for_operator' as any,
        { p_operator_id: opId },
      );
      if (Array.isArray(shippingData)) {
        setEquipmentShipping((shippingData as any[]).map(r => ({
          device_type: r.device_type,
          shipping_carrier: r.shipping_carrier,
          tracking_number: r.tracking_number,
          ship_date: r.ship_date,
          tracking_receipt_url: r.tracking_receipt_url,
        })));
      } else {
        setEquipmentShipping([]);
      }

      // Fetch coordinator info
      fetchCoordinatorInfo((op as any).assigned_onboarding_staff ?? null);

      // Fetch application for CDL + medical cert expiry dates
      const appId = (op as any).application_id;
      if (appId) {
        const { data: app } = await supabase
          .from('applications')
          .select('cdl_expiration, medical_cert_expiration')
          .eq('id', appId)
          .maybeSingle();
        setCdlExpiration((app as any)?.cdl_expiration ?? null);
        setMedicalCertExpiration((app as any)?.medical_cert_expiration ?? null);
      }

      // Fetch current dispatch status + ICA truck info in parallel
      const [dispatchResult, icaResult] = await Promise.all([
        supabase
          .from('active_dispatch')
          .select('dispatch_status, assigned_dispatcher, updated_at')
          .eq('operator_id', opId)
          .maybeSingle(),
        supabase
          .from('ica_contracts' as any)
          .select('truck_year, truck_make, truck_vin, truck_plate, truck_plate_state, trailer_number')
          .eq('operator_id', opId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const dispatch = dispatchResult.data;
      const newStatus = (dispatch as any)?.dispatch_status ?? null;
      const newUpdatedAt = (dispatch as any)?.updated_at ?? null;
      setDispatchStatus(newStatus);
      setDispatchUpdatedAt(newUpdatedAt);
      // Check localStorage for ack state keyed to this specific truck-down event
      if (newStatus === 'truck_down' && newUpdatedAt) {
        const ackKey = `truck_down_ack_${opId}_${newUpdatedAt}`;
        setTruckDownAcked(localStorage.getItem(ackKey) === 'true');
      } else {
        setTruckDownAcked(false);
      }
      fetchDispatcherInfo((dispatch as any)?.assigned_dispatcher ?? null);

      // Store ICA truck info
      const ica = icaResult.data as any;
      if (ica) {
        setIcaTruckInfo({
          truck_year: ica.truck_year ?? null,
          truck_make: ica.truck_make ?? null,
          truck_vin: ica.truck_vin ?? null,
          truck_plate: ica.truck_plate ?? null,
          truck_plate_state: ica.truck_plate_state ?? null,
          trailer_number: ica.trailer_number ?? null,
        });
      } else {
        setIcaTruckInfo(null);
      }
    }
  }, [effectiveUserId, fetchDispatcherInfo, fetchCoordinatorInfo]);

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', user.id)
      .is('read_at', null);
    setUnreadCount(count ?? 0);
  }, [user]);

  const fetchUnreadNotifCount = useCallback(async () => {
    if (!user) return;
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null);
    setUnreadNotifCount(count ?? 0);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchUnreadCount(); }, [fetchUnreadCount]);
  useEffect(() => { fetchUnreadNotifCount(); }, [fetchUnreadNotifCount]);

  // Fetch unacknowledged required docs count for badge
  const fetchUnackedDocs = useCallback(async () => {
    if (!user) return;
    const [{ data: docs }, { data: acks }] = await Promise.all([
      supabase.from('driver_documents').select('id, version').eq('is_visible', true).eq('is_required', true),
      supabase.from('document_acknowledgments').select('document_id, document_version').eq('user_id', user.id),
    ]);
    if (!docs) return;
    const ackMap = new Map((acks ?? []).map((a: any) => [a.document_id, a.document_version]));
    const count = docs.filter((d: any) => {
      const ackedVersion = ackMap.get(d.id);
      return ackedVersion === undefined || ackedVersion < d.version;
    }).length;
    setUnackedRequiredDocs(count);
  }, [user]);

  useEffect(() => { fetchUnackedDocs(); }, [fetchUnackedDocs, view]);

  // Realtime: update dispatch status live so the banner appears/disappears without refresh
  useEffect(() => {
    if (isPreview || !operatorId) return;
    const channel = supabase
      .channel(`operator-dispatch-status-${operatorId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'active_dispatch',
        filter: `operator_id=eq.${operatorId}`,
      }, (payload: any) => {
        const newStatus = payload.new?.dispatch_status ?? null;
        const newUpdatedAt = payload.new?.updated_at ?? null;
        setDispatchStatus(newStatus);
        setDispatchUpdatedAt(newUpdatedAt);
        if (newStatus === 'truck_down' && newUpdatedAt && operatorId) {
          const ackKey = `truck_down_ack_${operatorId}_${newUpdatedAt}`;
          setTruckDownAcked(localStorage.getItem(ackKey) === 'true');
        } else {
          setTruckDownAcked(false);
        }
        fetchDispatcherInfo(payload.new?.assigned_dispatcher ?? null);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [operatorId, fetchDispatcherInfo]);

  // Auto-report PWA installation when running in standalone mode
  useEffect(() => {
    if (isPreview || !operatorId) return;
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true;
    if (!isStandalone) return;
    // Fire-and-forget: check if already recorded, if not, stamp it
    (async () => {
      const { data } = await supabase
        .from('operators')
        .select('pwa_installed_at')
        .eq('id', operatorId)
        .maybeSingle();
      if (data && !(data as any).pwa_installed_at) {
        await supabase
          .from('operators')
          .update({ pwa_installed_at: new Date().toISOString() } as any)
          .eq('id', operatorId);
      }
    })();
  }, [operatorId, isPreview]);

  // Clear unread count when messages tab is opened
  useEffect(() => {
    if (view === 'messages') setUnreadCount(0);
    if (view === 'notifications') setUnreadNotifCount(0);
  }, [view]);

  // Realtime: increment badge + desktop push when a new message arrives (subscribe once per user)
  useEffect(() => {
    if (isPreview || !user) return;
    const channel = supabase
      .channel('operator-unread-badge')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `recipient_id=eq.${user.id}`,
      }, (payload: any) => {
        // Use ref so we never need to re-subscribe when view changes
        if (viewRef.current !== 'messages') {
          setUnreadCount(prev => prev + 1);
        }
        // Desktop push for new messages when tab is hidden
        fireNotification({
          title: 'New Message',
          body: payload.new?.body ?? 'You have a new message from your dispatcher.',
          type: 'new_message',
          link: '/operator?tab=messages',
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fireNotification]); // only re-subscribe when user changes

  // Realtime: update notification badge + desktop push when a new notification arrives
  useEffect(() => {
    if (isPreview || !user) return;
    const channel = supabase
      .channel('operator-unread-notif-badge')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload: any) => {
        if (viewRef.current !== 'notifications') fetchUnreadNotifCount();
        // Desktop push for high-priority notification types (e.g. truck_down)
        if (payload.new) {
          fireNotification({
            title: payload.new.title,
            body: payload.new.body,
            type: payload.new.type,
            link: payload.new.link,
          });
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        if (viewRef.current !== 'notifications') fetchUnreadNotifCount();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchUnreadNotifCount, fireNotification]);

  const displayName = profile?.first_name ?? 'Operator';

  // ── Stage status logic ─────────────────────────────────────────────────
  const getStageStatus = (stageNum: number): StageStatus => {
    const s = onboardingStatus;
    switch (stageNum) {
      case 1:
        if (s.mvr_ch_approval === 'denied' || s.pe_screening_result === 'non_clear') return 'action_required';
        if (s.pe_screening_result === 'clear') return 'complete';
        if (s.mvr_status !== 'not_started' && s.mvr_status != null) return 'in_progress';
        return 'not_started';
      case 2:
        if (s.form_2290 === 'received' && s.truck_title === 'received' && s.truck_photos === 'received' && s.truck_inspection === 'received') return 'complete';
        if (s.form_2290 !== 'not_started' || s.truck_title !== 'not_started' || uploadedDocs.length > 0) return 'in_progress';
        return 'not_started';
      case 3:
        if (s.ica_status === 'complete') return 'complete';
        if (s.ica_status === 'sent_for_signature') return 'action_required';
        return 'not_started';
      case 4:
        if (s.registration_status === 'own_registration') return 'complete';
        if (s.mo_reg_received === 'yes') return 'complete';
        if (s.mo_docs_submitted === 'submitted') return 'in_progress';
        if (s.registration_status === 'needs_mo_reg') return 'not_started';
        return 'not_started';
      case 5:
        if (s.decal_applied === 'yes' && ((s as any).eld_exempt === true || s.eld_installed === 'yes') && s.fuel_card_issued === 'yes') return 'complete';
        // Exception active: operator approved to run while en route to shop
        if ((s.paper_logbook_approved || s.temp_decal_approved) && (s.decal_method === 'supertransport_shop' || s.eld_method === 'supertransport_shop')) return 'in_progress';
        if (s.decal_applied === 'yes' || s.eld_installed === 'yes' || (s as any).eld_exempt === true) return 'in_progress';
        return 'not_started';
      case 6:
        if (s.insurance_added_date) return 'complete';
        return 'not_started';
      case 7:
        if (s.go_live_date) return 'complete';
        if (s.dispatch_ready_orientation || s.dispatch_ready_consortium || s.dispatch_ready_first_assigned) return 'in_progress';
        return 'not_started';
      case 8:
        if (paySetupData?.submitted_at && paySetupData?.terms_accepted) return 'complete';
        if (paySetupData && !paySetupData.submitted_at) return 'in_progress';
        return 'not_started';
      default:
        return 'not_started';
    }
  };

  const fmt = (v: string) => v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const stages: Stage[] = [
    {
      number: 1,
      title: 'Background Check',
      description: 'MVR, Clearinghouse, and pre-employment drug screening',
      icon: <Shield className="h-4 w-4" />,
      status: getStageStatus(1),
      substeps: [
        { label: 'MVR', value: fmt(onboardingStatus.mvr_status ?? 'not_started'), status: onboardingStatus.mvr_status === 'received' ? 'complete' : onboardingStatus.mvr_status === 'requested' ? 'in_progress' : 'not_started' },
        { label: 'Clearinghouse', value: fmt(onboardingStatus.ch_status ?? 'not_started'), status: onboardingStatus.ch_status === 'received' ? 'complete' : onboardingStatus.ch_status === 'requested' ? 'in_progress' : 'not_started' },
        { label: 'MVR/CH Approval', value: fmt(onboardingStatus.mvr_ch_approval ?? 'pending'), status: onboardingStatus.mvr_ch_approval === 'approved' ? 'complete' : onboardingStatus.mvr_ch_approval === 'denied' ? 'action_required' : 'in_progress' },
        { label: 'PE Screening', value: fmt(onboardingStatus.pe_screening ?? 'not_started'), status: onboardingStatus.pe_screening === 'results_in' ? 'complete' : onboardingStatus.pe_screening === 'scheduled' ? 'in_progress' : 'not_started' },
        { label: 'PE Result', value: fmt(onboardingStatus.pe_screening_result ?? 'pending'), status: onboardingStatus.pe_screening_result === 'clear' ? 'complete' : onboardingStatus.pe_screening_result === 'non_clear' ? 'action_required' : 'in_progress' },
      ],
      hint: 'Your onboarding coordinator will initiate your MVR, Clearinghouse, and drug screening. No action needed yet.',
    },
    {
      number: 2,
      title: 'Documents',
      description: 'Form 2290, truck title, photos, and inspection report',
      icon: <FileCheck className="h-4 w-4" />,
      status: getStageStatus(2),
      substeps: [
        { label: 'Form 2290', value: fmt(onboardingStatus.form_2290 ?? 'not_started'), status: onboardingStatus.form_2290 === 'received' ? 'complete' : onboardingStatus.form_2290 === 'requested' ? 'action_required' : uploadedDocs.some(d => d.document_type === 'form_2290') ? 'in_progress' : 'not_started' },
        { label: 'Truck Title', value: fmt(onboardingStatus.truck_title ?? 'not_started'), status: onboardingStatus.truck_title === 'received' ? 'complete' : onboardingStatus.truck_title === 'requested' ? 'action_required' : uploadedDocs.some(d => d.document_type === 'truck_title') ? 'in_progress' : 'not_started' },
        { label: 'Truck Photos', value: (() => {
            if (onboardingStatus.truck_photos === 'received') return 'Reviewed';
            const n = uploadedDocs.filter(d => d.document_type === 'truck_photos').length;
            if (n === 0) return 'Not Started';
            if (n >= 10) return 'All 10 uploaded · awaiting review';
            return `${n} of 10 uploaded`;
          })(), status: onboardingStatus.truck_photos === 'received' ? 'complete' : uploadedDocs.some(d => d.document_type === 'truck_photos') ? 'in_progress' : 'not_started' },
        { label: 'Truck Inspection', value: fmt(onboardingStatus.truck_inspection ?? 'not_started'), status: onboardingStatus.truck_inspection === 'received' ? 'complete' : uploadedDocs.some(d => d.document_type === 'truck_inspection') ? 'in_progress' : 'not_started' },
      ],
    },
    {
      number: 3,
      title: 'ICA Agreement',
      description: 'Independent Contractor Agreement — sign electronically',
      icon: <FileText className="h-4 w-4" />,
      status: getStageStatus(3),
      substeps: [
        { label: 'ICA Status', value: fmt(onboardingStatus.ica_status ?? 'not_issued'), status: onboardingStatus.ica_status === 'complete' ? 'complete' : onboardingStatus.ica_status === 'sent_for_signature' ? 'action_required' : 'not_started' },
      ],
    },
    {
      number: 4,
      title: 'Missouri Registration',
      description: onboardingStatus.registration_status === 'own_registration' ? 'O/O has own registration — no action needed' : onboardingStatus.mo_docs_submitted === 'submitted' ? 'Documents submitted, awaiting state approval' : 'Requires Form 2290, truck title + signed ICA',
      icon: <FileCheck className="h-4 w-4" />,
      status: getStageStatus(4),
      substeps: onboardingStatus.registration_status === 'needs_mo_reg' ? [
        { label: 'MO Docs Submitted', value: fmt(onboardingStatus.mo_docs_submitted ?? 'not_submitted'), status: onboardingStatus.mo_docs_submitted === 'submitted' ? 'in_progress' : 'not_started' },
        { label: 'MO Reg Received', value: fmt(onboardingStatus.mo_reg_received ?? 'not_yet'), status: onboardingStatus.mo_reg_received === 'yes' ? 'complete' : 'not_started' },
      ] : [],
    },
    {
      number: 5,
      title: 'Equipment Setup',
      description: 'Decal, ELD device, and fuel card',
      icon: <Truck className="h-4 w-4" />,
      status: getStageStatus(5),
      substeps: [
        { label: 'Decal Applied', value: fmt(onboardingStatus.decal_applied ?? 'no'), status: onboardingStatus.decal_applied === 'yes' ? 'complete' : (onboardingStatus.temp_decal_approved && onboardingStatus.decal_method === 'supertransport_shop') ? 'in_progress' : 'not_started' },
        ...((onboardingStatus as any).eld_exempt
          ? [{ label: 'ELD Status', value: 'Exempt — Pre-2000 truck (paper logs)', status: 'complete' as StageStatus }]
          : [{ label: 'ELD Installed', value: fmt(onboardingStatus.eld_installed ?? 'no'), status: onboardingStatus.eld_installed === 'yes' ? 'complete' as StageStatus : (onboardingStatus.paper_logbook_approved && onboardingStatus.eld_method === 'supertransport_shop') ? 'in_progress' as StageStatus : 'not_started' as StageStatus }]),
        { label: 'Fuel Card Issued', value: fmt(onboardingStatus.fuel_card_issued ?? 'no'), status: onboardingStatus.fuel_card_issued === 'yes' ? 'complete' : 'not_started' },
        ...((onboardingStatus.paper_logbook_approved || onboardingStatus.temp_decal_approved) && (onboardingStatus.decal_method === 'supertransport_shop' || onboardingStatus.eld_method === 'supertransport_shop') ? [
          { label: 'Exception Status', value: 'Approved — En Route to Shop', status: 'in_progress' as StageStatus },
        ] : []),
        ...(!(onboardingStatus as any).eld_exempt && onboardingStatus.eld_serial_number ? [{ label: 'ELD Serial #', value: onboardingStatus.eld_serial_number as string, status: 'complete' as StageStatus }] : []),
        ...(!(onboardingStatus as any).eld_exempt && onboardingStatus.dash_cam_number ? [{ label: 'Dash Cam #', value: onboardingStatus.dash_cam_number as string, status: 'complete' as StageStatus }] : []),
        ...(onboardingStatus.bestpass_number ? [{ label: 'BestPass #', value: onboardingStatus.bestpass_number as string, status: 'complete' as StageStatus }] : []),
        ...(onboardingStatus.fuel_card_number ? [{ label: 'Fuel Card #', value: onboardingStatus.fuel_card_number as string, status: 'complete' as StageStatus }] : []),
      ],
      hint: onboardingStatus.paper_logbook_approved || onboardingStatus.temp_decal_approved
        ? '⚠️ You have been approved to operate with temporary exceptions while traveling to the SUPERTRANSPORT shop for final equipment installation. This is a temporary approval — please arrive at the shop as soon as possible.'
        : 'Your onboarding coordinator will arrange decal installation, ELD setup, and fuel card issuance.',
    },
    {
      number: 6,
      title: 'Insurance & Activation',
      description: onboardingStatus.insurance_added_date ? `Added to policy on ${new Date(onboardingStatus.insurance_added_date).toLocaleDateString()}` : 'Added to insurance policy and assigned unit number',
      icon: <Shield className="h-4 w-4" />,
      status: getStageStatus(6),
      substeps: [
        { label: 'Insurance', value: onboardingStatus.insurance_added_date ? 'Added' : 'Pending', status: onboardingStatus.insurance_added_date ? 'complete' : 'not_started' },
        ...(onboardingStatus.unit_number ? [{ label: 'Unit Number', value: onboardingStatus.unit_number, status: 'complete' as StageStatus }] : []),
      ],
    },
    {
      number: 7,
      title: 'Go Live & Dispatch Readiness',
      description: onboardingStatus.go_live_date
        ? `Go-live confirmed on ${new Date(onboardingStatus.go_live_date + 'T12:00:00').toLocaleDateString()}`
        : 'Final readiness check before first dispatch',
      icon: <CheckCircle2 className="h-4 w-4" />,
      status: getStageStatus(7),
      substeps: [
        { label: 'Orientation Call', value: onboardingStatus.dispatch_ready_orientation ? 'Completed' : 'Pending', status: onboardingStatus.dispatch_ready_orientation ? 'complete' : 'not_started' },
        { label: 'Consortium Enrolled', value: onboardingStatus.dispatch_ready_consortium ? 'Enrolled' : 'Pending', status: onboardingStatus.dispatch_ready_consortium ? 'complete' : 'not_started' },
        { label: 'First Dispatch Assigned', value: onboardingStatus.dispatch_ready_first_assigned ? 'Assigned' : 'Pending', status: onboardingStatus.dispatch_ready_first_assigned ? 'complete' : 'not_started' },
        { label: 'Go-Live Date', value: onboardingStatus.go_live_date ? new Date(onboardingStatus.go_live_date + 'T12:00:00').toLocaleDateString() : 'Not set', status: onboardingStatus.go_live_date ? 'complete' : 'not_started' },
      ],
      hint: 'Your coordinator will confirm your orientation call, consortium enrollment, and first dispatch assignment before setting your official go-live date.',
    },
    {
      number: 8,
      title: 'Contractor Pay Setup',
      description: paySetupData?.submitted_at && paySetupData?.terms_accepted
        ? 'Payroll information submitted — account setup in progress'
        : 'Enter your payroll details so we can set up your contractor account',
      icon: <CreditCard className="h-4 w-4" />,
      status: getStageStatus(8),
      substeps: [
        {
          label: 'Pay Setup',
          value: paySetupData?.submitted_at && paySetupData?.terms_accepted ? 'Submitted' : paySetupData ? 'In Progress' : 'Pending',
          status: paySetupData?.submitted_at && paySetupData?.terms_accepted ? 'complete' : paySetupData ? 'in_progress' : 'not_started',
        },
      ],
      hint: 'Complete your payroll details so we can set up your contractor account.',
    },
  ];

  const completedStages = stages.filter(s => s.status === 'complete').length;
  const progressPct = Math.round((completedStages / stages.length) * 100);
  const isFullyOnboarded = onboardingStatus.insurance_added_date != null;

  const currentStageIndex = stages.findIndex(s => s.status === 'action_required' || s.status === 'in_progress' || s.status === 'not_started');
  const currentStage = currentStageIndex >= 0 ? stages[currentStageIndex] : null;

  // Compute critical expiry for nav badge + next-step CTA (≤30 days or expired)
  const expiryDotInfo = (() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const expiring: string[] = [];
    const checkDoc = (dateStr: string | null, label: string) => {
      if (!dateStr) return;
      const diff = Math.floor((new Date(dateStr).setHours(0,0,0,0) - today.valueOf()) / 86400000);
      if (diff <= 30) expiring.push(diff < 0 ? `${label} expired` : `${label} — ${diff}d left`);
    };
    checkDoc(cdlExpiration, 'CDL');
    checkDoc(medicalCertExpiration, 'Medical Cert');
    if (expiring.length === 0) return null;
    return { count: expiring.length, tooltip: expiring.join(' · ') };
  })();
  const hasCriticalExpiry = expiryDotInfo !== null;

  // ── Next-step CTA: single most urgent operator action ─────────────────
  const nextStep: {
    label: string;
    sublabel?: string;
    action: () => void;
    variant: 'urgent' | 'action' | 'info';
    icon: React.ReactNode;
  } | null = (() => {
    if (isFullyOnboarded) return null;
    const s = onboardingStatus;

    // 1. ICA awaiting signature — highest urgency
    if (s.ica_status === 'sent_for_signature') return {
      label: 'Sign Your ICA Agreement',
      sublabel: 'Action required',
      action: () => setView('ica'),
      variant: 'urgent' as const,
      icon: <FileText className="h-4 w-4" />,
    };

    // 2. Documents explicitly requested by staff — only flag if the
    //    operator hasn't already met the upload threshold for that doc type.
    const docMissing = (key: string, threshold = 1) => {
      if ((s as any)[key] !== 'requested') return false;
      const have = uploadedDocs.filter(d => d.document_type === key).length;
      return have < threshold;
    };
    const requestedDocs = [
      docMissing('form_2290') && 'Form 2290',
      docMissing('truck_title') && 'Truck Title',
      docMissing('truck_photos', 10) && 'Truck Photos',
      docMissing('truck_inspection') && 'Truck Inspection',
    ].filter(Boolean) as string[];
    if (requestedDocs.length > 0) return {
      label: requestedDocs.length === 1 ? `Upload ${requestedDocs[0]}` : `Upload ${requestedDocs.length} Documents`,
      sublabel: 'Your coordinator is waiting',
      action: () => setView('documents'),
      variant: 'action' as const,
      icon: <Upload className="h-4 w-4" />,
    };

    // 3. Compliance expiry nudge
    if (hasCriticalExpiry && expiryDotInfo) return {
      label: expiryDotInfo.count === 1 ? '1 Document Expiring Soon' : `${expiryDotInfo.count} Documents Expiring`,
      sublabel: expiryDotInfo.tooltip,
      action: () => setView('progress'),
      variant: 'urgent' as const,
      icon: <AlertTriangle className="h-4 w-4" />,
    };

    // 4. Documents in progress
    if (getStageStatus(2) === 'in_progress') return {
      label: 'Continue Document Upload',
      sublabel: 'Stage 2 in progress',
      action: () => setView('documents'),
      variant: 'info' as const,
      icon: <Upload className="h-4 w-4" />,
    };

    // 5. General active stage nudge
    const active = stages.find(st => st.status === 'in_progress');
    if (active) return {
      label: `Stage ${active.number}: ${active.title}`,
      sublabel: 'In progress — keep going',
      action: () => setView('progress'),
      variant: 'info' as const,
      icon: <ArrowRight className="h-4 w-4" />,
    };

    return null;
  })();

  const icaActionDot = onboardingStatus.ica_status === 'sent_for_signature';

  const navItems = [
    { view: 'progress' as OperatorView, label: 'My Progress', icon: <CheckCircle2 className="h-5 w-5" />, criticalDot: hasCriticalExpiry },
    { view: 'documents' as OperatorView, label: 'Documents', icon: <Upload className="h-5 w-5" /> },
    { view: 'docs-hub' as OperatorView, label: 'Doc Hub', icon: <Library className="h-5 w-5" />, badge: unackedRequiredDocs || undefined },
    { view: 'inspection-binder' as OperatorView, label: 'Inspection Binder', icon: <Shield className="h-5 w-5" />, pillBadge: isFullyOnboarded ? 'DOT' : undefined },
    { view: 'my-docs' as OperatorView, label: 'My Documents', icon: <FolderOpen className="h-5 w-5" /> },
    { view: 'my-truck' as OperatorView, label: 'My Truck', icon: <Truck className="h-5 w-5" /> },
    { view: 'resource-center' as OperatorView, label: 'Resource Center', icon: <BookOpen className="h-5 w-5" /> },
    { view: 'pay-setup' as OperatorView, label: 'Pay Setup', icon: <CreditCard className="h-5 w-5" /> },
    { view: 'forecast' as OperatorView, label: 'Settlement Forecast', icon: <Calculator className="h-5 w-5" /> },
    { view: 'ica' as OperatorView, label: 'ICA', icon: <FileText className="h-5 w-5" />, showIf: onboardingStatus.ica_status === 'sent_for_signature' || onboardingStatus.ica_status === 'complete', icaDot: icaActionDot },
    { view: 'dispatch' as OperatorView, label: 'Dispatch', icon: <Truck className="h-5 w-5" />, onlyOnboarded: true },
    { view: 'messages' as OperatorView, label: 'Messages', icon: <MessageSquare className="h-5 w-5" /> },
    { view: 'faq' as OperatorView, label: 'FAQ', icon: <HelpCircle className="h-5 w-5" /> },
    { view: 'notifications' as OperatorView, label: 'Notifications', icon: <Bell className="h-5 w-5" />, badge: unreadNotifCount },
  ].filter(item => {
    if (isPreview && ['messages', 'notifications', 'ica'].includes(item.view)) return false;
    if ('onlyOnboarded' in item && !isFullyOnboarded) return false;
    if ('showIf' in item && !item.showIf) return false;
    return true;
  });

  // Mobile bottom nav: scrollable with priority items always visible.
  // Core: Status, Binder, Messages, Doc Hub + context slot (ICA/Dispatch/FAQ)
  const mobileNavItems = (() => {
    const contextSlot =
      onboardingStatus.ica_status === 'sent_for_signature'
        ? { view: 'ica' as OperatorView, label: 'ICA', icon: <FileText className="h-5 w-5" />, icaDot: icaActionDot }
        : isFullyOnboarded
        ? { view: 'dispatch' as OperatorView, label: 'Dispatch', icon: <Truck className="h-5 w-5" /> }
        : { view: 'faq' as OperatorView, label: 'FAQ', icon: <HelpCircle className="h-5 w-5" /> };
    return [
      { view: 'progress' as OperatorView, label: 'Status', icon: <CheckCircle2 className="h-5 w-5" />, criticalDot: hasCriticalExpiry },
      { view: 'inspection-binder' as OperatorView, label: 'Binder', icon: <Shield className="h-5 w-5" /> },
      { view: 'messages' as OperatorView, label: 'Messages', icon: <MessageSquare className="h-5 w-5" />, badge: unreadCount },
      { view: 'docs-hub' as OperatorView, label: 'Doc Hub', icon: <Library className="h-5 w-5" />, badge: unackedRequiredDocs || undefined },
      { ...contextSlot },
    ];
  })();

  const statusConfig: Record<StageStatus, { color: string; badge: string; icon: React.ReactNode }> = {
    complete: { color: 'border-status-complete/30 bg-status-complete/5', badge: 'bg-status-complete/15 text-status-complete border-status-complete/30', icon: <CheckCircle2 className="h-5 w-5 text-status-complete" /> },
    in_progress: { color: 'border-gold/40 shadow-gold/10 shadow-md', badge: 'bg-gold/15 text-gold-muted border-gold/30', icon: <Clock className="h-5 w-5 text-gold" /> },
    action_required: { color: 'border-destructive/40 shadow-destructive/10 shadow-md', badge: 'bg-destructive/15 text-destructive border-destructive/30', icon: <AlertTriangle className="h-5 w-5 text-destructive" /> },
    not_started: { color: 'border-border', badge: 'bg-muted text-muted-foreground border-border', icon: <Circle className="h-5 w-5 text-muted-foreground/40" /> },
  };

  return (
    <>
    {!isPreview && (
      <>
        <OperatorNotificationPreferencesModal open={notifPrefOpen} onClose={() => setNotifPrefOpen(false)} />
        <ChangePasswordModal open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} variant="dark" />
        <EditProfileModal open={editProfileOpen} onClose={() => setEditProfileOpen(false)} onSaved={refreshProfile} variant="dark" />
      </>
    )}
    <div className={isPreview ? '' : 'min-h-screen bg-secondary'}>
      {/* Preview banner */}
      {isPreview && (
        <div className="flex items-center gap-3 bg-primary/10 border border-primary/30 rounded-xl px-4 py-3 mb-4">
          <Eye className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">Previewing {displayName}'s Operator Portal</p>
            <p className="text-xs text-muted-foreground">Read-only view — actions are disabled</p>
          </div>
        </div>
      )}
      {/* Preview tab bar */}
      {isPreview && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {navItems.map(item => (
            <button
              key={item.view}
              onClick={() => setView(item.view)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                view === item.view
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
      {/* Top nav */}
      <header className={isPreview ? 'hidden' : "bg-surface-dark border-b border-surface-dark-border sticky top-0 z-40"}>
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <img src={logo} alt="SUPERTRANSPORT" className="h-10 w-auto max-w-[180px] object-contain shrink-0" />

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            <TooltipProvider delayDuration={200}>
            {navItems.map(item => {
              const showExpiry = 'criticalDot' in item && item.criticalDot && view !== 'progress' && expiryDotInfo;
              const btn = (
                <button
                  key={item.view}
                  onClick={() => setView(item.view)}
                  className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    view === item.view
                      ? 'bg-gold/15 text-gold'
                      : 'text-surface-dark-muted hover:text-surface-dark-foreground hover:bg-surface-dark-card'
                  }`}
                >
                  <span className="relative">
                    {item.icon}
                    {(item.view === 'messages' && unreadCount > 0) && (
                      <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-0.5 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center leading-none">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                    {'badge' in item && item.badge != null && item.badge > 0 && item.view !== 'messages' && (
                      <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-0.5 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center leading-none">
                        {(item.badge as number) > 99 ? '99+' : item.badge}
                      </span>
                    )}
                    {'icaDot' in item && item.icaDot && view !== 'ica' && (
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-destructive animate-pulse border border-surface-dark" />
                    )}
                    {showExpiry && (
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-destructive animate-pulse border border-surface-dark" />
                    )}
                  </span>
                  {item.label}
                  {'pillBadge' in item && item.pillBadge && (
                    <span className="ml-1 px-1.5 py-0.5 rounded bg-gold/20 text-gold text-[9px] font-bold uppercase tracking-wider border border-gold/30">
                      {item.pillBadge as string}
                    </span>
                  )}
                </button>
              );
              if (showExpiry) {
                return (
                  <Tooltip key={item.view}>
                    <TooltipTrigger asChild>{btn}</TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs text-xs">
                      <p className="font-semibold mb-0.5">
                        {expiryDotInfo!.count === 1 ? '1 doc expiring soon' : `${expiryDotInfo!.count} docs expiring soon`}
                      </p>
                      <p className="text-muted-foreground">{expiryDotInfo!.tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              }
              return btn;
            })}
            </TooltipProvider>
          </nav>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setEditProfileOpen(true)}
              title="Edit profile"
              className="p-0.5 rounded-full hover:ring-2 hover:ring-gold/50 transition-all"
            >
              <div className="h-8 w-8 rounded-full overflow-hidden border-2 border-surface-dark-border shrink-0">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={displayName} className="block h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-gold/20">
                    <span className="text-xs font-bold text-gold leading-none">
                      {(profile?.first_name?.[0] ?? profile?.last_name?.[0] ?? '?').toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
            </button>
            <button
              onClick={() => setChangePasswordOpen(true)}
              title="Change password"
              className="text-surface-dark-muted hover:text-surface-dark-foreground p-2 rounded-lg hover:bg-surface-dark-card transition-colors"
            >
              <KeyRound className="h-5 w-5" />
            </button>
            <button
              onClick={() => setNotifPrefOpen(true)}
              title="Notification preferences"
              className="text-surface-dark-muted hover:text-surface-dark-foreground p-2 rounded-lg hover:bg-surface-dark-card transition-colors"
            >
              <SlidersHorizontal className="h-5 w-5" />
            </button>
            <NotificationBell variant="dark" notificationsPath="/operator?tab=notifications" clearBadge={view === 'notifications'} />
            <button
              onClick={signOut}
              className="hidden md:flex text-surface-dark-muted hover:text-destructive p-2 rounded-lg hover:bg-surface-dark-card transition-colors"
              title="Sign out"
            >
              <LogOut className="h-5 w-5" />
            </button>
            <button
              className="md:hidden text-surface-dark-muted hover:text-surface-dark-foreground p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-surface-dark-border bg-surface-dark px-4 py-3">
            <div className="grid grid-cols-4 gap-2">
              {navItems.map(item => (
                <button
                  key={item.view}
                  onClick={() => { setView(item.view); setMobileMenuOpen(false); }}
                  className={`relative flex flex-col items-center gap-1 p-3 rounded-xl text-xs font-medium transition-colors ${
                    view === item.view ? 'bg-gold/15 text-gold' : 'text-surface-dark-muted'
                  }`}
                >
                  <span className="relative">
                    {item.icon}
                    {(item.view === 'messages' && unreadCount > 0) && (
                      <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-0.5 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center leading-none">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                    {'badge' in item && item.badge != null && item.badge > 0 && item.view !== 'messages' && (
                      <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-0.5 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center leading-none">
                        {(item.badge as number) > 99 ? '99+' : item.badge}
                      </span>
                    )}
                    {'icaDot' in item && item.icaDot && view !== 'ica' && (
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-destructive animate-pulse border border-surface-dark" />
                    )}
                    {'criticalDot' in item && item.criticalDot && view !== 'progress' && (
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-destructive animate-pulse border border-surface-dark" />
                    )}
                  </span>
                  <span className="text-[10px]">{item.label}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-surface-dark-border flex flex-wrap justify-center gap-3">
              <button
                onClick={() => { setEditProfileOpen(true); setMobileMenuOpen(false); }}
                className="flex items-center gap-1.5 text-xs text-surface-dark-muted hover:text-surface-dark-foreground"
              >
                <div className="h-5 w-5 rounded-full overflow-hidden border border-surface-dark-border shrink-0">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt={displayName} className="block h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-gold/20">
                      <span className="text-[8px] font-bold text-gold leading-none">
                        {(profile?.first_name?.[0] ?? profile?.last_name?.[0] ?? '?').toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                Edit Profile
              </button>
              <button
                onClick={() => { setChangePasswordOpen(true); setMobileMenuOpen(false); }}
                className="flex items-center gap-1.5 text-xs text-surface-dark-muted hover:text-surface-dark-foreground"
              >
                <KeyRound className="h-4 w-4" /> Change Password
              </button>
              <button onClick={signOut} className="flex items-center gap-1.5 text-xs text-surface-dark-muted hover:text-destructive">
                <LogOut className="h-4 w-4" /> Sign Out
              </button>
            </div>
          </div>
        )}
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 pb-36 md:pb-6 space-y-6">

        {/* ── TRUCK DOWN ALERT BANNER ── */}
        {dispatchStatus === 'truck_down' && (
          <div className={`border rounded-xl px-4 py-3.5 animate-fade-in space-y-3 transition-colors duration-500 ${
            truckDownAcked
              ? 'bg-muted/40 border-border'
              : 'bg-destructive/10 border-destructive/40'
          }`}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${truckDownAcked ? 'bg-muted' : 'bg-destructive/15'}`}>
                  {truckDownAcked
                    ? <CheckCheck className="h-4 w-4 text-muted-foreground" />
                    : <TriangleAlert className="h-4 w-4 text-destructive animate-pulse" />
                  }
                </span>
                <div>
                  {truckDownAcked ? (
                    <>
                      <p className="text-sm font-semibold text-muted-foreground leading-tight">✅ Truck Down — Acknowledged</p>
                      <p className="text-xs text-muted-foreground/70 mt-0.5 leading-snug">
                        You've confirmed you've seen this alert. Your dispatcher has been notified.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-destructive leading-tight">🔴 Your Truck is Marked Down</p>
                      <p className="text-xs text-destructive/70 mt-0.5 leading-snug">
                        Your dispatcher has flagged your truck as out of service. Contact your dispatcher immediately.
                      </p>
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                {!truckDownAcked && (
                  <button
                    onClick={handleTruckDownAck}
                    disabled={ackLoading}
                    className="flex items-center gap-1.5 bg-destructive/15 border border-destructive/30 text-destructive text-xs font-semibold px-3 py-2 rounded-lg hover:bg-destructive/25 transition-colors disabled:opacity-60 flex-1 sm:flex-none justify-center"
                  >
                    {ackLoading
                      ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-destructive border-t-transparent" />
                      : <CheckCheck className="h-3.5 w-3.5" />
                    }
                    I Acknowledge
                  </button>
                )}
                <button
                  onClick={() => setView('messages')}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex-1 sm:flex-none justify-center ${
                    truckDownAcked
                      ? 'bg-muted text-muted-foreground hover:bg-muted/80'
                      : 'bg-destructive text-white hover:bg-destructive/90'
                  }`}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Message Dispatcher
                </button>
              </div>
            </div>
            {/* Dispatcher contact info */}
            {assignedDispatcher && (
              <div className={`flex items-center gap-3 border-t pt-2.5 ${truckDownAcked ? 'border-border' : 'border-destructive/20'}`}>
                <div className={`h-7 w-7 rounded-full overflow-hidden flex items-center justify-center shrink-0 ${truckDownAcked ? 'bg-muted' : 'bg-destructive/15'}`}>
                  {assignedDispatcher.avatarUrl ? (
                    <img src={assignedDispatcher.avatarUrl} alt={assignedDispatcher.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className={`text-xs font-bold ${truckDownAcked ? 'text-muted-foreground' : 'text-destructive'}`}>
                      {assignedDispatcher.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 min-w-0">
                  <span className="text-xs font-semibold text-foreground">{assignedDispatcher.name}</span>
                  {assignedDispatcher.phone ? (
                    <a
                      href={`tel:${assignedDispatcher.phone}`}
                      className={`text-xs font-medium hover:underline flex items-center gap-1 ${truckDownAcked ? 'text-muted-foreground' : 'text-destructive'}`}
                    >
                      <Phone className="h-3 w-3" />
                      {assignedDispatcher.phone}
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">No phone on file — use messages</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ICA ACTION-REQUIRED BANNER ── */}
        {onboardingStatus.ica_status === 'sent_for_signature' && view !== 'ica' && (
          <div className="bg-[hsl(var(--gold)/0.08)] border border-[hsl(var(--gold)/0.5)] rounded-xl px-4 py-4 animate-fade-in">
            <div className="flex flex-col items-start gap-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(var(--gold)/0.15)] shrink-0">
                  <FileText className="h-5 w-5 text-gold animate-pulse" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-gold leading-tight">
                    ✍️ Action Required — Sign Your ICA Agreement
                  </p>
                  <p className="text-xs text-gold/70 mt-0.5 leading-snug">
                    Your Independent Contractor Agreement is ready and waiting for your signature.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setView('ica')}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-gold text-surface-dark text-xs font-bold px-4 py-2.5 rounded-lg hover:bg-gold-light transition-colors shadow-sm"
              >
                <FileText className="h-3.5 w-3.5" />
                Review &amp; Sign Now
              </button>
            </div>
          </div>
        )}

        {/* ── DOCUMENTS REQUESTED BANNER ── */}
        {(() => {
          // Only surface document types that are still missing uploads.
          // Truck Photos requires 10; everything else requires at least 1.
          const stillNeeded = (key: string, threshold = 1) => {
            if ((onboardingStatus as any)[key] !== 'requested') return false;
            const have = uploadedDocs.filter(d => d.document_type === key).length;
            return have < threshold;
          };
          const requestedDocs = [
            stillNeeded('form_2290') && 'Form 2290',
            stillNeeded('truck_title') && 'Truck Title',
            stillNeeded('truck_photos', 10) && 'Truck Photos',
            stillNeeded('truck_inspection') && 'Truck Inspection',
          ].filter(Boolean) as string[];
          if (requestedDocs.length === 0 || view === 'documents') return null;
          return (
            <div className="bg-info/8 border border-info/40 rounded-xl px-4 py-4 animate-fade-in">
              <div className="flex flex-col items-start gap-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-info/15 shrink-0">
                    <Upload className="h-5 w-5 text-info animate-pulse" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-info leading-tight">
                      📎 Documents Requested — Upload Required
                    </p>
                    <p className="text-xs text-info/70 mt-0.5 leading-snug">
                      Your coordinator is waiting for:{' '}
                      <span className="font-semibold">{requestedDocs.join(', ')}</span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setView('documents')}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-info text-info-foreground text-xs font-bold px-4 py-2.5 rounded-lg hover:bg-info/90 transition-colors shadow-sm"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload Documents
                </button>
              </div>
            </div>
          );
        })()}

        {/* ── PROGRESS VIEW ── */}
        {view === 'progress' && (
          <>
            <OperatorStatusPage
              stages={stages}
              isFullyOnboarded={isFullyOnboarded}
              progressPct={progressPct}
              completedStages={completedStages}
              currentStage={currentStage}
              onboardingStatus={onboardingStatus}
              onNavigateTo={(v) => setView(v as OperatorView)}
              displayName={displayName}
              assignedDispatcher={assignedDispatcher}
              assignedCoordinator={assignedCoordinator}
              dispatchStatus={dispatchStatus}
              cdlExpiration={cdlExpiration}
              medicalCertExpiration={medicalCertExpiration}
              operatorId={operatorId}
              uploadedDocs={uploadedDocs}
              onUploadComplete={fetchData}
              unackedRequiredDocs={unackedRequiredDocs}
              onMessageDispatcher={() => {
                if (assignedDispatcher?.userId) {
                  setMessageInitialUserId(assignedDispatcher.userId);
                }
                setView('messages');
              }}
              onMessageCoordinator={() => {
                if (assignedCoordinator?.userId) {
                  setMessageInitialUserId(assignedCoordinator.userId);
                }
                setView('messages');
              }}
              onOpenBinder={(mode) => {
                setView('inspection-binder');
                setBinderView(mode === 'pages' ? 'pages' : undefined);
                if (!isPreview) {
                  const next = mode === 'pages'
                    ? '/operator?tab=inspection-binder&binderView=pages'
                    : '/operator?tab=inspection-binder';
                  navigate(next, { replace: false });
                }
              }}
            />

            {/* ── TRUCK & EQUIPMENT CARD ── */}
            <TruckInfoCard
              truckInfo={icaTruckInfo}
              deviceInfo={{
                unit_number: onboardingStatus.unit_number as string | null,
                eld_serial_number: onboardingStatus.eld_serial_number as string | null,
                dash_cam_number: onboardingStatus.dash_cam_number as string | null,
                bestpass_number: onboardingStatus.bestpass_number as string | null,
                fuel_card_number: onboardingStatus.fuel_card_number as string | null,
              }}
              shippingInfo={equipmentShipping}
            />

            {/* ── CONTACT SECTION ── */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                  <Phone className="h-4 w-4 text-primary" />
                </span>
                <h3 className="text-sm font-semibold text-foreground">Need Help?</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-1">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Onboarding Questions</p>
                  <a
                    href="mailto:onboarding@mysupertransport.com"
                    className="text-sm font-medium text-primary hover:underline break-all"
                  >
                    onboarding@mysupertransport.com
                  </a>
                  <p className="text-xs text-muted-foreground leading-snug mt-1">
                    Documents, background checks, ICA, registration, equipment setup — anything related to getting fully onboarded.
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-1">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">General Support</p>
                  <a
                    href="mailto:support@mysupertransport.com"
                    className="text-sm font-medium text-primary hover:underline break-all"
                  >
                    support@mysupertransport.com
                  </a>
                  <p className="text-xs text-muted-foreground leading-snug mt-1">
                    Account access, portal questions, or anything not related to active dispatch or onboarding.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── INSPECTION BINDER VIEW ── */}
        {view === 'inspection-binder' && effectiveUserId && (
          <OperatorInspectionBinder userId={effectiveUserId} operatorId={operatorId} initialViewMode={binderView} />
        )}

        {/* ── MY DOCUMENTS VIEW (read-only vault) ── */}
        {view === 'my-docs' && operatorId && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <FolderOpen className="h-6 w-6 text-primary" />
              <div>
                <h2 className="text-lg font-bold text-foreground">My Documents</h2>
                <p className="text-sm text-muted-foreground">Documents on file with your profile</p>
              </div>
            </div>
            <DriverVaultCard operatorId={operatorId} readOnly defaultCollapsed={false} />
          </div>
        )}

        {/* ── MY TRUCK VIEW (read-only fleet detail) ── */}
        {view === 'my-truck' && operatorId && (
          <FleetDetailDrawer operatorId={operatorId} onBack={() => setView('progress')} readOnly />
        )}

        {/* ── SETTLEMENT FORECAST VIEW ── */}
        {view === 'forecast' && operatorId && (
          <SettlementForecast operatorId={operatorId} />
        )}
        {view === 'forecast' && !operatorId && (
          <div className="py-16 text-center text-muted-foreground text-sm">Loading your operator profile…</div>
        )}

        {/* ── ICA SIGN VIEW ── */}
        {view === 'ica' && <OperatorICASign onComplete={() => { fetchData(); setView('progress'); }} />}

        {/* ── DOCUMENTS VIEW ── */}
        {view === 'documents' && operatorId && (
          <OperatorDocumentUpload
            operatorId={operatorId}
            uploadedDocs={uploadedDocs}
            onboardingStatus={onboardingStatus}
            onUploadComplete={fetchData}
          />
        )}
        {view === 'documents' && !operatorId && (
          <div className="py-16 text-center text-muted-foreground text-sm">Loading your operator profile…</div>
        )}

        {/* ── RESOURCE CENTER VIEW ── */}
        {view === 'resource-center' && (
          <div className="space-y-4 animate-fade-in">
            <div>
              <h2 className="text-base font-bold text-foreground">Resource Center</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Service guides and company documents</p>
            </div>
            <Tabs defaultValue="services" className="w-full">
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="services" className="flex-1 sm:flex-none">Services & Tools</TabsTrigger>
                <TabsTrigger value="documents" className="flex-1 sm:flex-none">Company Documents</TabsTrigger>
              </TabsList>
              <TabsContent value="services">
                <DriverServiceLibrary />
              </TabsContent>
              <TabsContent value="documents">
                <OperatorResourceLibrary />
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* ── FAQ VIEW ── */}
        {view === 'faq' && <OperatorFAQ />}

        {/* ── PAY SETUP VIEW ── */}
        {view === 'pay-setup' && operatorId && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                <CreditCard className="h-5 w-5 text-primary" />
              </span>
              <div>
                <h2 className="text-base font-bold text-foreground">Stage 8 — Contractor Pay Setup</h2>
                <p className="text-xs text-muted-foreground">Enter your payroll details to get your contractor account set up.</p>
              </div>
            </div>
            <ContractorPaySetup operatorId={operatorId} onSubmitted={fetchData} />
          </div>
        )}

        {/* ── NOTIFICATIONS VIEW ── */}
        {view === 'notifications' && <NotificationHistory />}

        {/* ── DOC HUB VIEW ── */}
        {view === 'docs-hub' && (
          <DocumentHub onAcknowledged={fetchData} />
        )}
      </div>

      {/* ── Floating Next-Step CTA (mobile only, above bottom nav) ────── */}
      {!isPreview && nextStep && (
        <div className="md:hidden fixed bottom-16 inset-x-0 z-30 px-3 pb-2 pointer-events-none">
          <button
            onClick={nextStep.action}
            className={`
              pointer-events-auto w-full flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl
              border transition-all active:scale-[0.98]
              ${nextStep.variant === 'urgent'
                ? 'bg-destructive border-destructive/60 text-white'
                : nextStep.variant === 'action'
                ? 'bg-gold border-gold/60 text-surface-dark'
                : 'bg-surface-dark border-surface-dark-border text-surface-dark-foreground'
              }
            `}
            style={{ backdropFilter: 'blur(12px)' }}
          >
            {/* Icon */}
            <span className={`
              h-9 w-9 rounded-xl flex items-center justify-center shrink-0
              ${nextStep.variant === 'urgent'
                ? 'bg-white/15'
                : nextStep.variant === 'action'
                ? 'bg-surface-dark/20'
                : 'bg-gold/15'
              }
            `}>
              <span className={nextStep.variant === 'action' ? 'text-surface-dark' : nextStep.variant === 'info' ? 'text-gold' : 'text-white'}>
                {nextStep.icon}
              </span>
            </span>

            {/* Text */}
            <div className="flex-1 min-w-0 text-left">
              {nextStep.sublabel && (
                <p className={`text-[10px] font-bold uppercase tracking-widest leading-none mb-0.5 ${
                  nextStep.variant === 'urgent' ? 'text-white/70' : nextStep.variant === 'action' ? 'text-surface-dark/60' : 'text-gold/70'
                }`}>
                  {nextStep.sublabel}
                </p>
              )}
              <p className="text-sm font-bold leading-tight truncate">{nextStep.label}</p>
            </div>

            {/* Arrow */}
            <ArrowRight className={`h-4 w-4 shrink-0 ${
              nextStep.variant === 'urgent' ? 'text-white/70' : nextStep.variant === 'action' ? 'text-surface-dark/60' : 'text-surface-dark-muted'
            }`} />
          </button>
        </div>
      )}

      {/* Build info — confirms which deployed build the operator is on */}
      {!isPreview && (
        <div className="max-w-4xl mx-auto px-4 pt-6 pb-24 md:pb-6">
          <BuildInfo />
        </div>
      )}

      {/* ── Sticky bottom nav (mobile only) ────────────────────────────── */}
      {!isPreview && <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface-dark border-t border-surface-dark-border">
        <div className="flex items-stretch h-16">
          {mobileNavItems.map((item) => {
            const isActive = view === item.view;
            const badge = 'badge' in item ? (item.badge as number | undefined) : undefined;
            return (
              <button
                key={item.view}
                onClick={() => { setView(item.view); setMobileMenuOpen(false); }}
                className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors min-w-0 px-1
                  ${isActive ? 'text-gold' : 'text-surface-dark-muted hover:text-surface-dark-foreground'}`}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <span className="absolute top-0 inset-x-2 h-0.5 bg-gold rounded-b-full" />
                )}
                {/* Icon with badge */}
                <span className="relative">
                  {item.icon}
                  {badge != null && badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-0.5 rounded-full bg-destructive text-white text-[9px] font-bold flex items-center justify-center leading-none">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                  {/* ICA action-required dot */}
                  {'icaDot' in item && item.icaDot && !isActive && (
                    <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-destructive animate-pulse border border-surface-dark" />
                  )}
                  {/* Critical expiry dot on Progress */}
                  {'criticalDot' in item && item.criticalDot && !isActive && (
                    <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-destructive animate-pulse border border-surface-dark" />
                  )}
                </span>
                <span className="truncate w-full text-center leading-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
        {/* Safe-area spacer for iOS home indicator */}
        <div className="h-safe-bottom bg-surface-dark" />
      </nav>}
    </div>
    </>
  );
}
