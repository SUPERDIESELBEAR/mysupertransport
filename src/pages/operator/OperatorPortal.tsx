import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import OperatorNotificationPreferencesModal from '@/components/operator/OperatorNotificationPreferencesModal';
import { useAuth } from '@/hooks/useAuth';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  CheckCircle2, Circle, Clock, AlertTriangle,
  MessageSquare, BookOpen, HelpCircle, FileText, SlidersHorizontal,
  LogOut, Menu, X, Upload, Shield, FileCheck, Truck, TriangleAlert, Phone, Bell, CheckCheck, KeyRound, RefreshCw,
  ArrowRight, Library, Cpu, Camera, CreditCard, Gauge, FolderOpen, Eye, Calculator, Home, ChevronRight, ChevronLeft,
} from 'lucide-react';
// Heavy view-gated panels are lazy-loaded so the initial portal mount and
// switches between unrelated views don't pay the full bundle/render cost
// (see audit item #5 — OperatorPortal jank on mid-range Android).
const DocumentHub = lazy(() => import('@/components/documents/DocumentHub'));
const DriverServiceLibrary = lazy(() => import('@/components/service-library/DriverServiceLibrary'));
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
const NotificationHistory = lazy(() => import('@/components/management/NotificationHistory'));
import logo from '@/assets/supertransport-logo.png';
import OperatorDocumentUpload from '@/components/operator/OperatorDocumentUpload';
import TruckPhotoGuideModal from '@/components/operator/TruckPhotoGuideModal';
import { OperatorResourceLibrary, OperatorFAQ } from '@/components/operator/OperatorResourcesAndFAQ';
const OperatorMessagesHub = lazy(() => import('@/components/operator/OperatorMessagesHub'));
import NotificationBell from '@/components/NotificationBell';
const OperatorStatusPage = lazy(() => import('@/components/operator/OperatorStatusPage'));
import OperatorDispatchStatus from '@/components/operator/OperatorDispatchStatus';
import OperatorICASign from '@/components/operator/OperatorICASign';
import { useDesktopNotifications } from '@/hooks/useDesktopNotifications';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import EditProfileModal from '@/components/EditProfileModal';
const OperatorInspectionBinder = lazy(() => import('@/components/inspection/OperatorInspectionBinder'));
const ContractorPaySetup = lazy(() => import('@/components/operator/ContractorPaySetup'));
import TruckInfoCard, { TruckInfo, EquipmentShippingInfo } from '@/components/operator/TruckInfoCard';
import EquipmentAssetSheet from '@/components/equipment/EquipmentAssetSheet';
import DriverVaultCard from '@/components/drivers/DriverVaultCard';
const FleetDetailDrawer = lazy(() => import('@/components/fleet/FleetDetailDrawer'));
import { BuildInfo } from '@/components/BuildInfo';
const SettlementForecast = lazy(() => import('@/components/operator/SettlementForecast'));
import { useAppRefresh } from '@/hooks/useAppRefresh';
import { Skeleton } from '@/components/ui/skeleton';
import DestinationSkeleton from '@/components/operator/DestinationSkeleton';
import { isIcaComplete, isIcaActionRequired } from '@/lib/icaCompletion';
import {
  type OperatorNavigateOptions,
  type OperatorView,
  type OperatorViewState,
  buildOperatorViewUrl,
  getOperatorBasePath,
  getRouteSegments,
  getViewStateFromLocation,
  getViewStateFromSearch,
  isKnownOperatorRoute,
  isOperatorView,
} from '@/lib/operatorRoutes';

type StageStatus = 'not_started' | 'in_progress' | 'complete' | 'action_required';

const appendNavTrace = (entry: Record<string, unknown>) => {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem('sd-nav-trace');
    const parsed = raw ? JSON.parse(raw) : [];
    const arr = Array.isArray(parsed) ? parsed : [];
    arr.push({ ts: Date.now(), ...entry });
    window.localStorage.setItem('sd-nav-trace', JSON.stringify(arr.slice(-50)));
  } catch {
    // Local diagnostics only — never block navigation.
  }
};

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
  const { profile: authProfile, user, signOut, refreshProfile, isTruckOwner } = useAuth();
  const { refresh: handleRefresh, refreshing } = useAppRefresh();
  const isPreview = !!previewUserId;
  // For a truck owner, the effective user id is the LINKED DRIVER's user id, so
  // every existing query keyed on `effectiveUserId` automatically scopes to the
  // driver's records (RLS already grants the owner read/sign access).
  const [resolvedOwnerDriverUserId, setResolvedOwnerDriverUserId] = useState<string | null>(null);
  const [ownerLookupDone, setOwnerLookupDone] = useState<boolean>(!isTruckOwner);
  useEffect(() => {
    if (previewUserId || !isTruckOwner || !user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('truck_owners')
        .select('operator_id, operators:operator_id(user_id)')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      const driverUid = (data as any)?.operators?.user_id ?? null;
      setResolvedOwnerDriverUserId(driverUid);
      setOwnerLookupDone(true);
    })();
    return () => { cancelled = true; };
  }, [isTruckOwner, previewUserId, user?.id]);
  const effectiveUserId = previewUserId
    ?? (isTruckOwner ? resolvedOwnerDriverUserId : user?.id);
  const viewerRole: 'driver' | 'truck_owner' = isTruckOwner && !previewUserId ? 'truck_owner' : 'driver';
  const [previewProfile, setPreviewProfile] = useState<{ first_name: string | null; last_name: string | null; avatar_url: string | null; phone: string | null } | null>(null);
  useEffect(() => {
    if (!previewUserId) return;
    supabase.from('profiles').select('first_name, last_name, avatar_url, phone').eq('user_id', previewUserId).maybeSingle()
      .then(({ data }) => setPreviewProfile(data));
  }, [previewUserId]);
  const profile = isPreview ? previewProfile : authProfile;
  const location = useLocation();
  const navigate = useNavigate();
  const urlViewState = useMemo(
    () => getViewStateFromLocation(location.pathname, location.search),
    [location.pathname, location.search],
  );
  const [previewViewState, setPreviewViewState] = useState<OperatorViewState>(() => getViewStateFromLocation(location.pathname, location.search));

  // URL-only source of truth. Avoid a second "requested tab" state because it
  // can race against auth/data refreshes and visually snap drivers back to Status.
  const viewState = isPreview ? previewViewState : urlViewState;
  const view = viewState.view;
  const binderView = viewState.binderView;
  const confirmedView = viewState.view;
  const [paySetupData, setPaySetupData] = useState<{ submitted_at: string | null; terms_accepted: boolean } | null>(null);

  // Single navigation entry point for the driver portal. Writes the URL once
  // via React Router; view/binderView update on the next render because they
  // are derived from location.search.
  const navigateToView = useCallback((target: OperatorView, options: OperatorNavigateOptions = {}) => {
    const nextState: OperatorViewState = {
      view: target,
      binderView: target === 'inspection-binder' && options.binderView === 'pages' ? 'pages' : undefined,
    };
    if (isPreview) {
      setPreviewViewState(nextState);
      if (options.closeMobileMenu !== false) setMobileMenuOpen(false);
      appendNavTrace({
        event: 'preview-tab-change',
        fromTab: view,
        toTab: target,
        renderedTab: target,
        url: window.location.href,
      });
      return;
    }
    const next = buildOperatorViewUrl(location.pathname, location.search, target, options);
    const href = `${next.pathname}${next.search}`;
    if (options.closeMobileMenu !== false) setMobileMenuOpen(false);
    appendNavTrace({
      event: 'tap',
      fromTab: view,
      fromBinderView: binderView ?? null,
      fromSearch: window.location.search,
      toTab: target,
      toBinderView: nextState.binderView ?? null,
      toSearch: next.search,
      href,
      renderedTab: target,
      url: window.location.href,
    });
    navigate(href, { replace: !!options.replace });
  }, [isPreview, location.pathname, location.search, navigate, view, binderView]);

  const navigateWithinOperatorPortal = useCallback((path: string) => {
    try {
      const url = new URL(path, window.location.origin);
      const isSameOrigin = url.origin === window.location.origin;
      const isDriverPortalPath = url.pathname === '/dashboard' || url.pathname.startsWith('/operator') || url.pathname.startsWith('/owner');
      if (isSameOrigin && isDriverPortalPath && url.searchParams.has('tab')) {
        const next = getViewStateFromSearch(url.search);
        navigateToView(next.view, { binderView: next.binderView });
        return;
      }
      if (isSameOrigin && (url.pathname.startsWith('/operator') || url.pathname.startsWith('/owner'))) {
        const routeState = getViewStateFromLocation(url.pathname, url.search);
        navigateToView(routeState.view, { binderView: routeState.binderView });
        return;
      }
    } catch {
      // Fall through to router navigation for malformed/legacy paths.
    }
    setMobileMenuOpen(false);
    navigate(path);
  }, [navigate, navigateToView]);

  // Desktop push notifications for high-priority events use the same tab-aware
  // router as the bell dropdown so notification clicks cannot bypass view state.
  const { fireNotification } = useDesktopNotifications({
    onNavigate: navigateWithinOperatorPortal,
  });
  const [onboardingStatus, setOnboardingStatus] = useState<Record<string, string | null>>({});
  const [latestIcaContract, setLatestIcaContract] = useState<{ status?: string | null; contractor_signed_at?: string | null } | null>(null);
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
  // Latest committed view, used by navigation callbacks to avoid stale closures.
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);
  // ── Back button history ─────────────────────────────────────────────
  // Tracks confirmed views only. Requested/tentative views are deliberately not
  // pushed so a mid-navigation remount cannot re-open the tab the driver left.
  const [viewHistory, setViewHistory] = useState<OperatorView[]>([]);
  const suppressNextHistoryRef = useRef(false);
  const prevConfirmedViewRef = useRef<OperatorView>(confirmedView);
  useEffect(() => {
    if (prevConfirmedViewRef.current === confirmedView) return;
    if (suppressNextHistoryRef.current) {
      suppressNextHistoryRef.current = false;
    } else {
      setViewHistory((h) => [...h.slice(-9), prevConfirmedViewRef.current]);
    }
    prevConfirmedViewRef.current = confirmedView;
  }, [confirmedView]);
  const goBack = useCallback(() => {
    const target = viewHistory[viewHistory.length - 1];
    if (!target) return;
    suppressNextHistoryRef.current = true;
    setViewHistory((h) => h.slice(0, -1));
    navigateToView(target, { replace: true });
  }, [viewHistory, navigateToView]);
  // Esc key triggers Back when there's history.
  useEffect(() => {
    if (viewHistory.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') goBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewHistory.length, goBack]);
  // Browser/hardware back is handled by the URL history naturally. Avoid
  // pushState interception here because it can race against tab navigation.
  // Empty driver URLs are normalized below after onboarding status loads.
  // Crossfade overlay shown while a destination view loads its first data.
  // `phase: 'visible'` = skeleton fully shown over the mounting destination.
  // `phase: 'fading'`  = destination fired onReady; skeleton fades out, then unmounts.
  const [transitionOverlay, setTransitionOverlay] = useState<{ tile: OperatorView; phase: 'visible' | 'fading' } | null>(null);
  // Clear overlay if the user navigates away from the destination (e.g. via bottom nav)
  // before it ever fires onReady.
  useEffect(() => {
    if (transitionOverlay && view !== transitionOverlay.tile) setTransitionOverlay(null);
  }, [view, transitionOverlay]);
  // Safety net: if a destination never fires onReady (network failure, no data path),
  // force-fade after 6s so the user is never stuck behind the skeleton.
  useEffect(() => {
    if (!transitionOverlay || transitionOverlay.phase !== 'visible') return;
    const t = setTimeout(() => {
      setTransitionOverlay((o) => (o && o.phase === 'visible' ? { ...o, phase: 'fading' } : o));
    }, 6000);
    return () => clearTimeout(t);
  }, [transitionOverlay]);
  const handleDestinationReady = useCallback((tile: OperatorView) => {
    setTransitionOverlay((o) => (o && o.tile === tile && o.phase === 'visible' ? { ...o, phase: 'fading' } : o));
  }, []);
  // Track which tiles we've already prefetched data for so we don't refire on every pointer event.
  const prefetchedTiles = useRef<Set<OperatorView>>(new Set());
  // Reset prefetch cache whenever we leave Home so a return visit re-warms (data may have changed).
  useEffect(() => {
    if (view === 'home') prefetchedTiles.current.clear();
  }, [view]);
  // Fire a small read against the same tables the destination view will hit.
  // Browser/PostgREST caches the response so the in-view query lands warm and tap feels instant.
  const prefetchTile = useCallback((target: OperatorView) => {
    if (!operatorId) return;
    if (prefetchedTiles.current.has(target)) return;
    prefetchedTiles.current.add(target);
    const sb = supabase as any;
    // Fire-and-forget; we don't need the result here.
    try {
      if (target === 'inspection-binder') {
        void sb.from('inspection_documents').select('id, document_type, file_url').limit(1);
        void sb.from('driver_uploads').select('id, document_type, file_url').eq('operator_id', operatorId).limit(50);
      } else if (target === 'forecast') {
        void sb.from('operators').select('pay_percentage').eq('id', operatorId).maybeSingle();
      } else if (target === 'my-truck') {
        void sb.from('operators').select('id, truck_year, truck_make, truck_vin, truck_plate').eq('id', operatorId).maybeSingle();
        void sb.from('truck_maintenance_records').select('id, service_date, service_type').eq('operator_id', operatorId).limit(10);
      } else if (target === 'resource-center') {
        void sb.from('resource_documents').select('id, title').limit(20);
      }
    } catch {
      // Prefetch failures are silent — the destination view will fetch normally.
    }
  }, [operatorId]);

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
      // Defense-in-depth: filter out soft-deleted docs even though RLS already hides them
      setUploadedDocs(
        ((op as any).operator_documents ?? []).filter((d: any) => !d.deleted_at)
      );

      // Fetch Stage 8 pay setup status
      const { data: ps } = await supabase
        .from('contractor_pay_setup')
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
          .from('ica_contracts')
          .select('status, contractor_signed_at, truck_year, truck_make, truck_vin, truck_plate, truck_plate_state, trailer_number')
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
        setLatestIcaContract({
          status: ica.status ?? null,
          contractor_signed_at: ica.contractor_signed_at ?? null,
        });
        setIcaTruckInfo({
          truck_year: ica.truck_year ?? null,
          truck_make: ica.truck_make ?? null,
          truck_vin: ica.truck_vin ?? null,
          truck_plate: ica.truck_plate ?? null,
          truck_plate_state: ica.truck_plate_state ?? null,
          trailer_number: ica.trailer_number ?? null,
        });
      } else {
        setLatestIcaContract(null);
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

  // Realtime: keep Stage 2 doc statuses and uploaded docs in sync with management edits
  useEffect(() => {
    if (isPreview || !operatorId) return;
    const channel = supabase
      .channel(`operator-onboarding-sync-${operatorId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'onboarding_status',
        filter: `operator_id=eq.${operatorId}`,
      }, (payload: any) => {
        if (payload.new) {
          setOnboardingStatus((prev: any) => ({ ...(prev ?? {}), ...payload.new }));
        }
        // Reconcile with the full row in case the payload was partial / a column
        // we depend on for stage completion was missing from REPLICA IDENTITY.
        fetchData();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'operator_documents',
        filter: `operator_id=eq.${operatorId}`,
      }, (payload: any) => {
        setUploadedDocs((prev: any[]) => {
          const list = Array.isArray(prev) ? [...prev] : [];
          if (payload.eventType === 'DELETE') {
            return list.filter(d => d.id !== payload.old?.id);
          }
          const row = payload.new;
          if (!row) return list;
          if (row.deleted_at) return list.filter(d => d.id !== row.id);
          const idx = list.findIndex(d => d.id === row.id);
          if (idx === -1) list.push(row);
          else list[idx] = { ...list[idx], ...row };
          return list;
        });
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ica_contracts',
        filter: `operator_id=eq.${operatorId}`,
      }, (payload: any) => {
        if (payload.new) {
          setLatestIcaContract({
            status: payload.new.status ?? null,
            contractor_signed_at: payload.new.contractor_signed_at ?? null,
          });
          if (isIcaComplete(null, payload.new)) {
            setOnboardingStatus((prev: any) => ({ ...(prev ?? {}), ica_status: 'complete' }));
          }
        }
        fetchData();
      })
      .subscribe((status) => {
        // When the channel (re)connects, immediately resync from the DB so any
        // management edits made before the subscription was live are picked up.
        if (status === 'SUBSCRIBED') {
          fetchData();
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, [operatorId, fetchData, isPreview]);

  // Catch-up refresh whenever the driver returns to the app, the window
  // regains focus, or the device reconnects. Logout/login + manual refresh
  // should already pull fresh data, but mobile browsers aggressively pause
  // tabs in the background, which can stall Realtime *and* the existing
  // fetch paths — this is the safety net that guarantees the portal sees
  // management's latest Stage 1/2 status without a hard reload.
  useEffect(() => {
    if (isPreview || !operatorId) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchData();
    };
    const onFocusOrOnline = () => fetchData();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocusOrOnline);
    window.addEventListener('online', onFocusOrOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocusOrOnline);
      window.removeEventListener('online', onFocusOrOnline);
    };
  }, [isPreview, operatorId, fetchData]);

  // PWA install + presence tracking handled globally by <TrackOperatorPresence />

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
          link: '/operator/messages',
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
  const effectiveOnboardingStatus = isIcaComplete(onboardingStatus, latestIcaContract)
    ? { ...onboardingStatus, ica_status: 'complete' }
    : onboardingStatus;

  // ── Stage status logic ─────────────────────────────────────────────────
  const getStageStatus = (stageNum: number): StageStatus => {
    const s = effectiveOnboardingStatus;
    switch (stageNum) {
      case 1:
        if (s.mvr_ch_approval === 'denied') return 'action_required';
        if (s.mvr_ch_approval === 'approved') return 'complete';
        if (s.mvr_status !== 'not_started' && s.mvr_status != null) return 'in_progress';
        return 'not_started';
      case 2:
        if (s.form_2290 === 'received' && s.truck_title === 'received' && s.truck_photos === 'received' && s.truck_inspection === 'received') return 'complete';
        if (s.form_2290 !== 'not_started' || s.truck_title !== 'not_started' || uploadedDocs.length > 0) return 'in_progress';
        return 'not_started';
      case 3:
        if (isIcaComplete(s, latestIcaContract)) return 'complete';
        if (isIcaActionRequired(s, latestIcaContract)) return 'action_required';
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
        if (s.pe_screening_result === 'non_clear') return 'action_required';
        if (s.pe_screening_result === 'clear') return 'complete';
        if (s.pe_screening === 'results_in') return 'in_progress';
        if (s.pe_screening === 'scheduled') return 'in_progress';
        return 'not_started';
      case 7:
        if (s.insurance_added_date) return 'complete';
        return 'not_started';
      case 8:
        if (s.go_live_date) return 'complete';
        if (s.dispatch_ready_orientation || s.dispatch_ready_consortium || s.dispatch_ready_first_assigned) return 'in_progress';
        return 'not_started';
      case 9:
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
      description: 'MVR and Clearinghouse review',
      icon: <Shield className="h-4 w-4" />,
      status: getStageStatus(1),
      substeps: [
        { label: 'MVR', value: fmt(onboardingStatus.mvr_status ?? 'not_started'), status: onboardingStatus.mvr_status === 'received' ? 'complete' : onboardingStatus.mvr_status === 'requested' ? 'in_progress' : 'not_started' },
        { label: 'Clearinghouse', value: fmt(onboardingStatus.ch_status ?? 'not_started'), status: onboardingStatus.ch_status === 'received' ? 'complete' : onboardingStatus.ch_status === 'requested' ? 'in_progress' : 'not_started' },
        { label: 'MVR/CH Approval', value: fmt(onboardingStatus.mvr_ch_approval ?? 'pending'), status: onboardingStatus.mvr_ch_approval === 'approved' ? 'complete' : onboardingStatus.mvr_ch_approval === 'denied' ? 'action_required' : 'in_progress' },
      ],
      hint: 'Your onboarding coordinator will initiate your MVR and Clearinghouse checks. No action needed yet.',
    },
    {
      number: 2,
      title: 'Documents',
      description: 'Form 2290, truck title, photos, and inspection report',
      icon: <FileCheck className="h-4 w-4" />,
      status: getStageStatus(2),
      substeps: [
        { label: 'Form 2290', value: onboardingStatus.form_2290 === 'received' ? 'Received' : uploadedDocs.some(d => d.document_type === 'form_2290') ? 'Awaiting review' : onboardingStatus.form_2290 === 'requested' ? 'Requested' : 'Not Started', status: onboardingStatus.form_2290 === 'received' ? 'complete' : uploadedDocs.some(d => d.document_type === 'form_2290') ? 'in_progress' : onboardingStatus.form_2290 === 'requested' ? 'action_required' : 'not_started' },
        { label: 'Truck Title', value: onboardingStatus.truck_title === 'received' ? 'Received' : uploadedDocs.some(d => d.document_type === 'truck_title') ? 'Awaiting review' : onboardingStatus.truck_title === 'requested' ? 'Requested' : 'Not Started', status: onboardingStatus.truck_title === 'received' ? 'complete' : uploadedDocs.some(d => d.document_type === 'truck_title') ? 'in_progress' : onboardingStatus.truck_title === 'requested' ? 'action_required' : 'not_started' },
        { label: 'Truck Photos', value: (() => {
            if (onboardingStatus.truck_photos === 'received') return 'Reviewed';
            const n = uploadedDocs.filter(d => d.document_type === 'truck_photos').length;
            if (n === 0) return 'Not Started';
            if (n >= 10) return 'All 10 uploaded · awaiting review';
            return `${n} of 10 uploaded`;
          })(), status: onboardingStatus.truck_photos === 'received' ? 'complete' : uploadedDocs.some(d => d.document_type === 'truck_photos') ? 'in_progress' : 'not_started' },
        { label: 'Truck Inspection', value: onboardingStatus.truck_inspection === 'received' ? 'Received' : uploadedDocs.some(d => d.document_type === 'truck_inspection') ? 'Awaiting review' : onboardingStatus.truck_inspection === 'requested' ? 'Requested' : 'Not Started', status: onboardingStatus.truck_inspection === 'received' ? 'complete' : uploadedDocs.some(d => d.document_type === 'truck_inspection') ? 'in_progress' : onboardingStatus.truck_inspection === 'requested' ? 'action_required' : 'not_started' },
      ],
    },
    {
      number: 3,
      title: 'ICA Agreement',
      description: 'Independent Contractor Agreement — sign electronically',
      icon: <FileText className="h-4 w-4" />,
      status: getStageStatus(3),
      substeps: [
        { label: 'ICA Status', value: isIcaComplete(effectiveOnboardingStatus, latestIcaContract) ? 'Signed' : fmt(effectiveOnboardingStatus.ica_status ?? 'not_issued'), status: isIcaComplete(effectiveOnboardingStatus, latestIcaContract) ? 'complete' : isIcaActionRequired(effectiveOnboardingStatus, latestIcaContract) ? 'action_required' : 'not_started' },
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
      title: 'Pre-Employment Screening',
      description: onboardingStatus.pe_screening_result === 'clear' ? 'Drug screening cleared' : 'DOT pre-employment drug screening',
      icon: <Shield className="h-4 w-4" />,
      status: getStageStatus(6),
      substeps: [
        { label: 'PE Screening', value: onboardingStatus.pe_screening_result === 'clear' ? 'Complete' : fmt(onboardingStatus.pe_screening ?? 'not_started'), status: onboardingStatus.pe_screening_result === 'clear' || onboardingStatus.pe_screening === 'results_in' ? 'complete' : onboardingStatus.pe_screening === 'scheduled' ? 'in_progress' : 'not_started' },
        { label: 'PE Result', value: fmt(onboardingStatus.pe_screening_result ?? 'pending'), status: onboardingStatus.pe_screening_result === 'clear' ? 'complete' : onboardingStatus.pe_screening_result === 'non_clear' ? 'action_required' : 'in_progress' },
      ],
      hint: 'Your coordinator will schedule your drug screening appointment and upload the QPassport form here.',
    },
    {
      number: 7,
      title: 'Insurance & Activation',
      description: onboardingStatus.insurance_added_date ? `Added to policy on ${new Date(onboardingStatus.insurance_added_date).toLocaleDateString()}` : 'Added to insurance policy and assigned unit number',
      icon: <Shield className="h-4 w-4" />,
      status: getStageStatus(7),
      substeps: [
        { label: 'Insurance', value: onboardingStatus.insurance_added_date ? 'Added' : 'Pending', status: onboardingStatus.insurance_added_date ? 'complete' : 'not_started' },
        ...(onboardingStatus.unit_number ? [{ label: 'Unit Number', value: onboardingStatus.unit_number, status: 'complete' as StageStatus }] : []),
      ],
    },
    {
      number: 8,
      title: 'Go Live & Dispatch Readiness',
      description: onboardingStatus.go_live_date
        ? `Go-live confirmed on ${new Date(onboardingStatus.go_live_date + 'T12:00:00').toLocaleDateString()}`
        : 'Final readiness check before first dispatch',
      icon: <CheckCircle2 className="h-4 w-4" />,
      status: getStageStatus(8),
      substeps: [
        { label: 'Orientation Call', value: onboardingStatus.dispatch_ready_orientation ? 'Completed' : 'Pending', status: onboardingStatus.dispatch_ready_orientation ? 'complete' : 'not_started' },
        { label: 'Consortium Enrolled', value: onboardingStatus.dispatch_ready_consortium ? 'Enrolled' : 'Pending', status: onboardingStatus.dispatch_ready_consortium ? 'complete' : 'not_started' },
        { label: 'First Dispatch Assigned', value: onboardingStatus.dispatch_ready_first_assigned ? 'Assigned' : 'Pending', status: onboardingStatus.dispatch_ready_first_assigned ? 'complete' : 'not_started' },
        { label: 'Go-Live Date', value: onboardingStatus.go_live_date ? new Date(onboardingStatus.go_live_date + 'T12:00:00').toLocaleDateString() : 'Not set', status: onboardingStatus.go_live_date ? 'complete' : 'not_started' },
      ],
      hint: 'Your coordinator will confirm your orientation call, consortium enrollment, and first dispatch assignment before setting your official go-live date.',
    },
    {
      number: 9,
      title: 'Contractor Pay Setup',
      description: paySetupData?.submitted_at && paySetupData?.terms_accepted
        ? 'Payroll information submitted — account setup in progress'
        : 'Enter your payroll details so we can set up your contractor account',
      icon: <CreditCard className="h-4 w-4" />,
      status: getStageStatus(9),
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

  // Redirect legacy query-param tabs and empty driver portal URLs to stable
  // route paths. Once a real /operator/<screen> path is present, data refreshes
  // cannot rewrite the route and snap drivers back to Status.
  useEffect(() => {
    if (isPreview) return;
    const base = getOperatorBasePath(location.pathname);
    const segments = getRouteSegments(location.pathname);
    const params = new URLSearchParams(location.search);
    const currentTab = params.get('tab');
    if (isOperatorView(currentTab)) {
      const legacyState = getViewStateFromSearch(location.search);
      const next = buildOperatorViewUrl(location.pathname, location.search, legacyState.view, { binderView: legacyState.binderView });
      appendNavTrace({
        event: 'redirect-legacy-tab-route',
        fromTab: view,
        toTab: legacyState.view,
        fromSearch: window.location.search,
        toSearch: next.search,
        href: `${next.pathname}${next.search}`,
        renderedTab: legacyState.view,
        url: window.location.href,
      });
      navigate(`${next.pathname}${next.search}`, { replace: true });
      return;
    }

    if (segments.length > 0 && isKnownOperatorRoute(location.pathname)) return;
    const target: OperatorView = 'progress';
    const next = buildOperatorViewUrl(base, location.search, target);
    const href = `${next.pathname}${next.search}`;
    appendNavTrace({
      event: segments.length > 0 ? 'redirect-invalid-route' : 'redirect-empty-route',
      fromTab: view,
      toTab: target,
      fromSearch: window.location.search,
      toSearch: next.search,
      href,
      renderedTab: target,
      url: window.location.href,
    });
    navigate(href, { replace: true });
  }, [isPreview, location.pathname, location.search, navigate, view]);

  useEffect(() => {
    appendNavTrace({
      event: 'rendered-route',
      renderedTab: view,
      renderedBinderView: binderView ?? null,
      path: location.pathname,
      search: location.search,
      url: window.location.href,
    });
  }, [binderView, location.pathname, location.search, view]);

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
    const s = effectiveOnboardingStatus;

    // 1. ICA awaiting signature — highest urgency
    if (isIcaActionRequired(s, latestIcaContract)) return {
      label: 'Sign Your ICA Agreement',
      sublabel: 'Action required',
      action: () => navigateToView('ica'),
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
      action: () => navigateToView('documents'),
      variant: 'action' as const,
      icon: <Upload className="h-4 w-4" />,
    };

    // 3. Compliance expiry nudge
    if (hasCriticalExpiry && expiryDotInfo) return {
      label: expiryDotInfo.count === 1 ? '1 Document Expiring Soon' : `${expiryDotInfo.count} Documents Expiring`,
      sublabel: expiryDotInfo.tooltip,
      action: () => navigateToView('progress'),
      variant: 'urgent' as const,
      icon: <AlertTriangle className="h-4 w-4" />,
    };

    // 4. Documents in progress
    if (getStageStatus(2) === 'in_progress') return {
      label: 'Continue Document Upload',
      sublabel: 'Stage 2 in progress',
      action: () => navigateToView('documents'),
      variant: 'info' as const,
      icon: <Upload className="h-4 w-4" />,
    };

    // 5. General active stage nudge
    const active = stages.find(st => st.status === 'in_progress');
    if (active) return {
      label: `Stage ${active.number}: ${active.title}`,
      sublabel: 'In progress — keep going',
      action: () => navigateToView('progress'),
      variant: 'info' as const,
      icon: <ArrowRight className="h-4 w-4" />,
    };

    return null;
  })();

  const icaActionDot = isIcaActionRequired(effectiveOnboardingStatus, latestIcaContract);
  const icaComplete = isIcaComplete(effectiveOnboardingStatus, latestIcaContract);

  const navItems = [
    { view: 'home' as OperatorView, label: 'Home', icon: <Home className="h-5 w-5" />, showIf: isFullyOnboarded },
    { view: 'progress' as OperatorView, label: isFullyOnboarded ? 'Onboarding Status' : 'My Progress', shortLabel: isFullyOnboarded ? 'Status' : 'Progress', icon: <CheckCircle2 className="h-5 w-5" />, criticalDot: hasCriticalExpiry },
    { view: 'documents' as OperatorView, label: 'Documents', icon: <Upload className="h-5 w-5" /> },
    { view: 'docs-hub' as OperatorView, label: 'Doc Hub', icon: <Library className="h-5 w-5" />, badge: unackedRequiredDocs || undefined },
    { view: 'inspection-binder' as OperatorView, label: 'Inspection Binder', shortLabel: 'Binder', icon: <Shield className="h-5 w-5" />, pillBadge: isFullyOnboarded ? 'DOT' : undefined },
    { view: 'my-docs' as OperatorView, label: 'My Documents', shortLabel: 'My Docs', icon: <FolderOpen className="h-5 w-5" /> },
    { view: 'my-truck' as OperatorView, label: 'My Truck', icon: <Truck className="h-5 w-5" /> },
    { view: 'resource-center' as OperatorView, label: 'Resource Center', shortLabel: 'Resources', icon: <BookOpen className="h-5 w-5" /> },
    { view: 'pay-setup' as OperatorView, label: 'Pay Setup', icon: <CreditCard className="h-5 w-5" /> },
    { view: 'forecast' as OperatorView, label: 'Settlement Forecast', shortLabel: 'Forecast', icon: <Calculator className="h-5 w-5" /> },
    { view: 'ica' as OperatorView, label: 'ICA', icon: <FileText className="h-5 w-5" />, showIf: isIcaActionRequired(effectiveOnboardingStatus, latestIcaContract) || icaComplete, icaDot: icaActionDot },
    { view: 'dispatch' as OperatorView, label: 'Dispatch', icon: <Truck className="h-5 w-5" />, onlyOnboarded: true },
    { view: 'messages' as OperatorView, label: 'Messages', icon: <MessageSquare className="h-5 w-5" /> },
    { view: 'faq' as OperatorView, label: 'FAQ', icon: <HelpCircle className="h-5 w-5" /> },
    { view: 'notifications' as OperatorView, label: 'Notifications', shortLabel: 'Alerts', icon: <Bell className="h-5 w-5" />, badge: unreadNotifCount },
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
      isIcaActionRequired(effectiveOnboardingStatus, latestIcaContract)
        ? { view: 'ica' as OperatorView, label: 'ICA', icon: <FileText className="h-5 w-5" />, icaDot: icaActionDot }
        : isFullyOnboarded
        ? { view: 'dispatch' as OperatorView, label: 'Dispatch', icon: <Truck className="h-5 w-5" /> }
        : { view: 'faq' as OperatorView, label: 'FAQ', icon: <HelpCircle className="h-5 w-5" /> };
    const firstSlot = isFullyOnboarded
      ? { view: 'home' as OperatorView, label: 'Home', icon: <Home className="h-5 w-5" /> }
      : { view: 'progress' as OperatorView, label: 'Status', icon: <CheckCircle2 className="h-5 w-5" />, criticalDot: hasCriticalExpiry };
    return [
      firstSlot,
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
    <div className={isPreview ? '' : 'min-h-dvh bg-secondary'}>
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
              type="button"
              key={item.view}
              onClick={() => navigateToView(item.view)}
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
      <header
        className={isPreview ? 'hidden' : "bg-surface-dark border-b border-surface-dark-border fixed top-0 inset-x-0 z-40"}
        style={isPreview ? undefined : { paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="max-w-7xl mx-auto px-4 h-16 md:h-20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1 min-w-0">
            {viewHistory.length > 0 && (
              <button
                type="button"
                onClick={goBack}
                aria-label="Back"
                title="Back"
                className="text-surface-dark-muted hover:text-surface-dark-foreground p-2 -ml-2 rounded-lg hover:bg-surface-dark-card transition-colors shrink-0"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <img src={logo} alt="SUPERTRANSPORT" className="h-9 w-auto max-w-[140px] object-contain shrink-0" />
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-end gap-0.5">
            <TooltipProvider delayDuration={200}>
            {navItems.map(item => {
              const showExpiry = 'criticalDot' in item && item.criticalDot && view !== 'progress' && expiryDotInfo;
              const btn = (
                <button
                  type="button"
                  key={item.view}
                  onClick={() => navigateToView(item.view)}
                  className={`relative shrink-0 flex flex-col items-center justify-end gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-colors w-[68px] xl:w-[76px] ${
                    view === item.view
                      ? 'bg-gold/15 text-gold'
                      : 'text-surface-dark-muted hover:text-surface-dark-foreground hover:bg-surface-dark-card'
                  }`}
                  aria-label={item.label}
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
                  <span className="block leading-tight truncate max-w-full">
                    <span className="2xl:hidden">{('shortLabel' in item && item.shortLabel) ? item.shortLabel : item.label}</span>
                    <span className="hidden 2xl:inline">{item.label}</span>
                  </span>
                  {'pillBadge' in item && item.pillBadge && (
                    <span className="absolute top-0.5 right-0.5 px-1 py-0.5 rounded bg-gold/20 text-gold text-[8px] font-bold uppercase tracking-wider border border-gold/30 leading-none">
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
              type="button"
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
              type="button"
              onClick={() => setNotifPrefOpen(true)}
              title="Notification preferences"
              className="text-surface-dark-muted hover:text-surface-dark-foreground p-2 rounded-lg hover:bg-surface-dark-card transition-colors"
            >
              <SlidersHorizontal className="h-5 w-5" />
            </button>
            <NotificationBell
              variant="dark"
              notificationsPath={`${getOperatorBasePath(location.pathname)}/notifications`}
              clearBadge={view === 'notifications'}
              onNavigate={navigateWithinOperatorPortal}
            />
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="hidden md:flex text-surface-dark-muted hover:text-surface-dark-foreground p-2 rounded-lg hover:bg-surface-dark-card transition-colors disabled:opacity-60"
              title="Refresh data"
              aria-label="Refresh data"
            >
              <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={signOut}
              className="hidden md:flex text-surface-dark-muted hover:text-destructive p-2 rounded-lg hover:bg-surface-dark-card transition-colors"
              title="Sign out"
            >
              <LogOut className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="md:hidden text-surface-dark-muted hover:text-surface-dark-foreground p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
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
                  type="button"
                  key={item.view}
                  onClick={() => navigateToView(item.view)}
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
                type="button"
                onClick={() => { handleRefresh(); setMobileMenuOpen(false); }}
                disabled={refreshing}
                className="flex items-center gap-1.5 text-xs text-surface-dark-muted hover:text-surface-dark-foreground disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
              </button>
              <button
                type="button"
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
                type="button"
                onClick={() => { setChangePasswordOpen(true); setMobileMenuOpen(false); }}
                className="flex items-center gap-1.5 text-xs text-surface-dark-muted hover:text-surface-dark-foreground"
              >
                <KeyRound className="h-4 w-4" /> Change Password
              </button>
              <button type="button" onClick={signOut} className="flex items-center gap-1.5 text-xs text-surface-dark-muted hover:text-destructive">
                <LogOut className="h-4 w-4" /> Sign Out
              </button>
            </div>
          </div>
        )}
      </header>

      <div
        className="relative max-w-4xl mx-auto px-4 py-6 pb-36 md:pb-6 space-y-6"
        style={isPreview ? undefined : { paddingTop: `calc(1.5rem + 4rem + env(safe-area-inset-top))` }}
      >

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
                    type="button"
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
                  type="button"
                  onClick={() => navigateToView('messages')}
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
        {isIcaActionRequired(effectiveOnboardingStatus, latestIcaContract) && view === 'progress' && (
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
                type="button"
                onClick={() => navigateToView('ica')}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-gold text-surface-dark text-xs font-bold px-4 py-2.5 rounded-lg hover:bg-gold-light transition-colors shadow-sm"
              >
                <FileText className="h-3.5 w-3.5" />
                Review &amp; Sign Now
              </button>
            </div>
          </div>
        )}

        {/* ── ICA SIGNED CONFIRMATION ── */}
        {icaComplete && view === 'progress' && (
          <div className="bg-status-complete/10 border border-status-complete/40 rounded-xl px-4 py-4 animate-fade-in">
            <div className="flex flex-col items-start gap-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-status-complete/15 shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-status-complete" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-status-complete leading-tight">
                    ICA Agreement Signed — Thank You!
                  </p>
                  <p className="text-xs text-status-complete/80 mt-0.5 leading-snug">
                    Your Independent Contractor Agreement is on file. You can view it any time.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigateToView('ica')}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-status-complete text-white text-xs font-bold px-4 py-2.5 rounded-lg hover:bg-status-complete/90 transition-colors shadow-sm"
              >
                <FileText className="h-3.5 w-3.5" />
                View Signed Agreement
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
          if (requestedDocs.length === 0 || view !== 'progress') return null;
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
                  type="button"
                  onClick={() => navigateToView('documents')}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-info text-info-foreground text-xs font-bold px-4 py-2.5 rounded-lg hover:bg-info/90 transition-colors shadow-sm"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload Documents
                </button>
              </div>
            </div>
          );
        })()}

        {/* ── HOME VIEW (post-onboarding dashboard) ── */}
        {view === 'home' && (() => {
          const hour = new Date().getHours();
          const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
          const tiles: Array<{
            view: OperatorView;
            label: string;
            sublabel: string;
            icon: React.ReactNode;
          }> = [
            { view: 'inspection-binder', label: '3-Ring Binder', sublabel: 'DOT inspection-ready documents', icon: <Shield className="h-8 w-8" /> },
            { view: 'forecast', label: 'Settlement Forecast', sublabel: "This week's projected pay", icon: <Calculator className="h-8 w-8" /> },
            { view: 'my-truck', label: 'My Truck', sublabel: 'Equipment, specs & maintenance', icon: <Truck className="h-8 w-8" /> },
            { view: 'resource-center', label: 'Resource Center', sublabel: 'Guides, how-tos & references', icon: <BookOpen className="h-8 w-8" /> },
          ];
          return (
            <div className="space-y-5 animate-fade-in">
              <div className="space-y-1">
                <h1 className="text-2xl font-bold text-foreground">{greeting}, {displayName}</h1>
                <p className="text-sm text-muted-foreground">Pick where you want to go.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {tiles.map((t, idx) => (
                  <button
                    type="button"
                    key={t.view}
                    onPointerEnter={() => prefetchTile(t.view)}
                    onTouchStart={() => prefetchTile(t.view)}
                    onFocus={() => prefetchTile(t.view)}
                    onClick={() => {
                      // Start crossfade: skeleton overlay covers the destination
                      // until it fires onReady (or the 6s safety net trips).
                      setTransitionOverlay({ tile: t.view, phase: 'visible' });
                      navigateToView(t.view, { binderView: t.view === 'inspection-binder' ? 'pages' : undefined });
                    }}
                    style={{ animationDelay: `${idx * 60}ms`, animationFillMode: 'both' }}
                    className="group relative flex items-center gap-4 p-5 rounded-2xl border border-border bg-card text-left shadow-sm transition-all duration-200 ease-out hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 min-h-[112px] animate-fade-in"
                  >
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                      {t.icon}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-base font-semibold text-foreground">{t.label}</span>
                      <span className="block text-xs text-muted-foreground mt-0.5 leading-snug">{t.sublabel}</span>
                    </span>
                    <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform shrink-0 group-hover:text-primary group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>

              {/* Secondary link back to onboarding status */}
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => navigateToView('progress')}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  View onboarding status
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })()}

        {/* ── PROGRESS VIEW ── */}
        {view === 'progress' && (
          <Suspense fallback={<div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}>
            <OperatorStatusPage
              stages={stages}
              isFullyOnboarded={isFullyOnboarded}
              progressPct={progressPct}
              completedStages={completedStages}
              currentStage={currentStage}
              onboardingStatus={effectiveOnboardingStatus}
              onNavigateTo={(v) => {
                if (isOperatorView(v)) navigateToView(v);
              }}
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
                navigateToView('messages');
              }}
              onMessageCoordinator={() => {
                if (assignedCoordinator?.userId) {
                  setMessageInitialUserId(assignedCoordinator.userId);
                }
                navigateToView('messages');
              }}
              onOpenBinder={(mode) => {
                navigateToView('inspection-binder', { binderView: mode === 'pages' ? 'pages' : undefined });
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

            {/* ── EQUIPMENT ASSET SHEET (Driver signature + shipping receipts) ── */}
            {operatorId && (
              <EquipmentAssetSheet
                mode="driver"
                operatorId={operatorId}
                status={onboardingStatus as Record<string, any>}
                onStatusRefresh={fetchData}
              />
            )}

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
          </Suspense>
        )}

        {/* ── INSPECTION BINDER VIEW ── */}
        {view === 'inspection-binder' && effectiveUserId && (
          <Suspense fallback={<div className="py-16 text-center text-muted-foreground text-sm">Loading inspection binder…</div>}>
            <OperatorInspectionBinder userId={effectiveUserId} operatorId={operatorId} initialViewMode={binderView} onReady={() => handleDestinationReady('inspection-binder')} />
          </Suspense>
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
          <Suspense fallback={<div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}>
            <FleetDetailDrawer operatorId={operatorId} onBack={() => navigateToView('progress')} readOnly onReady={() => handleDestinationReady('my-truck')} />
          </Suspense>
        )}

        {/* ── SETTLEMENT FORECAST VIEW ── */}
        {view === 'forecast' && operatorId && (
          <Suspense fallback={<div className="py-16 text-center text-muted-foreground text-sm">Loading forecast…</div>}>
            <SettlementForecast operatorId={operatorId} onReady={() => handleDestinationReady('forecast')} />
          </Suspense>
        )}
        {view === 'forecast' && !operatorId && (
          <div className="py-16 text-center text-muted-foreground text-sm">Loading your operator profile…</div>
        )}

        {/* ── ICA SIGN VIEW ── */}
        {view === 'ica' && <OperatorICASign onComplete={() => { fetchData(); navigateToView('progress'); }} />}

        {/* ── DOCUMENTS VIEW ── */}
        {view === 'documents' && operatorId && (
          <OperatorDocumentUpload
            operatorId={operatorId}
            uploadedDocs={uploadedDocs}
            onboardingStatus={effectiveOnboardingStatus}
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
                <Suspense fallback={<div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}>
                  <DriverServiceLibrary />
                </Suspense>
              </TabsContent>
              <TabsContent value="documents">
                <OperatorResourceLibrary onReady={() => handleDestinationReady('resource-center')} />
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
                <h2 className="text-base font-bold text-foreground">Stage 9 — Payroll and Procedures</h2>
                <p className="text-xs text-muted-foreground">Payroll Setup, BOL Procedures, Handbook, and Load Out Procedures.</p>
              </div>
            </div>
            <Suspense fallback={<div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}>
              <ContractorPaySetup operatorId={operatorId} onSubmitted={fetchData} />
            </Suspense>
          </div>
        )}

        {/* ── NOTIFICATIONS VIEW ── */}
        {view === 'notifications' && (
          <Suspense fallback={<div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}>
            <NotificationHistory />
          </Suspense>
        )}

        {/* ── MESSAGES VIEW ── */}
        {view === 'messages' && (
          <Suspense fallback={<div className="py-16 text-center text-muted-foreground text-sm">Loading messages…</div>}>
            <OperatorMessagesHub
              initialBroadcastId={new URLSearchParams(location.search).get('b') ?? undefined}
            />
          </Suspense>
        )}

        {/* ── DISPATCH VIEW ── */}
        {view === 'dispatch' && operatorId && (
          <OperatorDispatchStatus
            operatorId={operatorId}
            onMessageDispatcher={() => navigateToView('messages')}
          />
        )}
        {view === 'dispatch' && !operatorId && (
          <div className="text-center text-sm text-muted-foreground py-12">
            Your dispatch status will appear here once onboarding is complete.
          </div>
        )}

        {/* ── DOC HUB VIEW ── */}
        {view === 'docs-hub' && (
          <Suspense fallback={<div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}>
            <DocumentHub onAcknowledged={fetchData} />
          </Suspense>
        )}

        {/* ── CROSSFADE OVERLAY ──────────────────────────────────────────
             Sits over the just-mounted destination view and shows a
             destination-shaped skeleton until that view fires onReady.
             Then fades out (300ms) and unmounts on transition end. */}
        {transitionOverlay && (
          <div
            aria-hidden="true"
            onTransitionEnd={(e) => {
              if (e.propertyName === 'opacity' && transitionOverlay.phase === 'fading') {
                setTransitionOverlay(null);
              }
            }}
            className={`absolute inset-0 z-20 px-4 py-6 bg-secondary transition-opacity duration-300 ease-out ${
              transitionOverlay.phase === 'fading' ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
          >
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <DestinationSkeleton view={transitionOverlay.tile as 'inspection-binder' | 'forecast' | 'my-truck' | 'resource-center'} />
            </div>
          </div>
        )}
      </div>

      {/* ── Floating Next-Step CTA (mobile only, above bottom nav) ────── */}
      {!isPreview && nextStep && (
        <div
          className="md:hidden fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] inset-x-0 z-30 px-3 pb-2 pointer-events-none transform-gpu will-change-transform"
          style={{ transform: 'translateZ(0)' }}
        >
          <button
            type="button"
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
                type="button"
                key={item.view}
                onClick={() => navigateToView(item.view)}
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
