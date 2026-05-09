import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { playTruckDownChime } from '@/lib/chime';
import { useSearchParams, useNavigate } from 'react-router-dom';
import StaffLayout from '@/components/layouts/StaffLayout';
import MessagesView from '@/components/staff/MessagesView';
import NotificationHistory from '@/components/management/NotificationHistory';
import StaffNotificationPreferencesModal from '@/components/staff/StaffNotificationPreferencesModal';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { sanitizeText } from '@/lib/sanitize';
import { useDesktopNotifications } from '@/hooks/useDesktopNotifications';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Truck, Users, AlertTriangle, CheckCircle2, Home,
  Search, Edit2, X, Save, RefreshCw, MapPin, MessageSquare, Clock, ChevronDown, ChevronUp,
  LayoutGrid, List, Phone, Siren, Send, ExternalLink, SlidersHorizontal, Bell, Volume2, VolumeX,
  CheckCheck, Users2, Shield, Container, EyeOff, RotateCcw, HelpCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { formatDistanceToNow } from 'date-fns';
import DriverHubView from '@/components/drivers/DriverHubView';
import MiniDispatchCalendar from '@/components/dispatch/MiniDispatchCalendar';
import OperatorInspectionBinder from '@/components/inspection/OperatorInspectionBinder';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface QuickComposeTarget {
  operatorUserId: string;
  name: string;
  unit: string | null;
  status: string;
}

type DispatchStatusType = 'not_dispatched' | 'dispatched' | 'home' | 'truck_down';
type FilterTab = 'all' | DispatchStatusType;

// Mirror of the cutoff defined in MiniDispatchCalendar — drivers without a
// `go_live_date` are treated as if they started dispatching on this date when
// counting "unlogged" past days (no false-positive gaps for legacy/imported drivers).
const LEGACY_DISPATCH_START = '2026-04-01';

// Rolling window for the roster-level "unlogged" rollup.
const UNLOGGED_WINDOW_DAYS = 7;

interface DispatchRow {
  operator_id: string;
  operator_user_id: string;
  dispatch_id: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  home_state: string | null;
  unit_number: string | null;
  avatar_url: string | null;
  dispatch_status: DispatchStatusType;
  assigned_dispatcher: string | null;
  current_load_lane: string | null;
  eta_redispatch: string | null;
  status_notes: string | null;
  updated_at: string | null;
}

interface StatusHistoryEntry {
  id: string;
  dispatch_status: DispatchStatusType;
  current_load_lane: string | null;
  status_notes: string | null;
  changed_at: string;
}

const STATUS_CONFIG: Record<DispatchStatusType, {
  label: string;
  rowClass: string;
  badgeClass: string;
  dotColor: string;
  tabActiveClass: string;
  historyDot: string;
}> = {
  not_dispatched: {
    label: 'Not Dispatched',
    rowClass: '',
    badgeClass: 'status-neutral border',
    dotColor: 'bg-muted-foreground',
    tabActiveClass: 'bg-muted text-foreground border-muted-foreground/40',
    historyDot: 'bg-muted-foreground/60',
  },
  dispatched: {
    label: 'Dispatched',
    rowClass: '',
    badgeClass: 'status-complete border',
    dotColor: 'bg-status-complete',
    tabActiveClass: 'bg-status-complete/15 text-status-complete border-status-complete/40',
    historyDot: 'bg-status-complete',
  },
  home: {
    label: 'Home',
    rowClass: '',
    badgeClass: 'status-progress border',
    dotColor: 'bg-status-progress',
    tabActiveClass: 'bg-status-progress/15 text-status-progress border-status-progress/40',
    historyDot: 'bg-status-progress',
  },
  truck_down: {
    label: 'Truck Down',
    rowClass: 'bg-destructive/[0.03]',
    badgeClass: 'status-action border',
    dotColor: 'bg-destructive',
    tabActiveClass: 'bg-destructive/15 text-destructive border-destructive/40',
    historyDot: 'bg-destructive',
  },
};

interface DispatchPortalProps {
  embedded?: boolean;
  defaultFilter?: FilterTab;
}

export default function DispatchPortal({ embedded = false, defaultFilter }: DispatchPortalProps) {
  const { toast } = useToast();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Desktop push notifications for high-priority events (truck_down, new_message)
  const { fireNotification } = useDesktopNotifications({
    onNavigate: (link) => navigate(link),
  });
  const [prefOpen, setPrefOpen] = useState(false);
  const [activePage, setActivePage] = useState<'dispatch' | 'dispatch-messages' | 'dispatch-notifications' | 'dispatch-drivers'>(() => {
    const p = searchParams.get('page');
    if (p === 'dispatch-messages' || p === 'dispatch-notifications' || p === 'dispatch-drivers') return p;
    if (searchParams.get('tab') === 'notifications') return 'dispatch-notifications';
    return 'dispatch';
  });
  const [rows, setRows] = useState<DispatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editRow, setEditRow] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<DispatchRow>>({});
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>(() => {
    const t = searchParams.get('filter') as FilterTab | null;
    if (t && ['all','dispatched','not_dispatched','home','truck_down'].includes(t)) return t;
    return defaultFilter ?? 'all';
  });
  const [search, setSearch] = useState('');
  const [liveIndicator, setLiveIndicator] = useState(false);
  const [chimeMuted, setChimeMuted] = useState(() => localStorage.getItem('dispatch_chime_muted') === 'true');
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  // Map of operator_user_id → unread count for per-card badges
  const [unreadPerOperator, setUnreadPerOperator] = useState<Record<string, number>>({});
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const [historyMap, setHistoryMap] = useState<Record<string, StatusHistoryEntry[]>>({});
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(() => {
    const m = searchParams.get('mode');
    return m === 'table' ? 'table' : 'cards';
  });
  const [messageInitialUserId, setMessageInitialUserId] = useState<string | null>(null);
  const [highlightedCard, setHighlightedCard] = useState<string | null>(null);
  // Quick-compose modal state
  const [quickCompose, setQuickCompose] = useState<QuickComposeTarget | null>(null);
  const [composeBody, setComposeBody] = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks which operator cards are flashing from a live update
  const [flashedCards, setFlashedCards] = useState<Set<string>>(new Set());
  const flashTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // Ref mirror of rows so realtime callbacks can read current operator info synchronously
  const rowsRef = useRef<DispatchRow[]>([]);
  // Map of operator_id → ISO timestamp of the most recent truck-down acknowledgement
  const [ackMap, setAckMap] = useState<Record<string, string>>({});
  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<DispatchStatusType>('not_dispatched');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  // Dispatcher filter
  const [dispatcherFilter, setDispatcherFilter] = useState<string>('all');
  const [dispatcherNames, setDispatcherNames] = useState<Record<string, string>>({});
  // All dispatchers/management for the assignment dropdown
  const [allDispatchers, setAllDispatchers] = useState<Record<string, string>>({});
  // Binder sheet
  const [binderTarget, setBinderTarget] = useState<{ userId: string; operatorId: string; name: string } | null>(null);
  // Excluded-from-dispatch tracking
  const [excludedRows, setExcludedRows] = useState<Array<{
    operator_id: string;
    first_name: string | null;
    last_name: string | null;
    unit_number: string | null;
    excluded_from_dispatch_reason: string | null;
  }>>([]);
  const [showExcludedDialog, setShowExcludedDialog] = useState(false);
  const [reIncludingId, setReIncludingId] = useState<string | null>(null);
  // Per-operator count of unlogged days in the rolling 7-day window (excludes today + future,
  // and respects each operator's go-live / legacy-cutoff anchor).
  const [unloggedCountMap, setUnloggedCountMap] = useState<Record<string, number>>({});

  // Status Alerts collapsible (Trucks Down / Home / Not Dispatched ribbons)
  const [statusAlertsOpen, setStatusAlertsOpen] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('dispatch_status_ribbons_open');
      if (v === 'true') return true;
      if (v === 'false') return false;
    } catch {}
    return true;
  });
  useEffect(() => {
    try { localStorage.setItem('dispatch_status_ribbons_open', String(statusAlertsOpen)); } catch {}
  }, [statusAlertsOpen]);

  // Keep rowsRef in sync so realtime callbacks can access current operator info
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  // ── Acknowledgement map: operator_id → ack timestamp ────────────────────
  const ACK_NOTE = 'Operator acknowledged truck down alert.';

  const fetchAckMap = useCallback(async (operatorIds?: string[]) => {
    const ids = operatorIds ?? rowsRef.current
      .filter(r => r.dispatch_status === 'truck_down')
      .map(r => r.operator_id);
    if (ids.length === 0) return;
    const { data } = await supabase
      .from('dispatch_status_history' as any)
      .select('operator_id, changed_at, status_notes')
      .in('operator_id', ids)
      .eq('status_notes', ACK_NOTE)
      .order('changed_at', { ascending: false });
    if (data) {
      const map: Record<string, string> = {};
      (data as any[]).forEach(entry => {
        if (!map[entry.operator_id]) map[entry.operator_id] = entry.changed_at;
      });
      setAckMap(map);
    }
  }, []);

  // Fetch ack map whenever rows change (truck_down operators might have changed)
  useEffect(() => {
    const truckDownIds = rows
      .filter(r => r.dispatch_status === 'truck_down')
      .map(r => r.operator_id);
    if (truckDownIds.length > 0) {
      fetchAckMap(truckDownIds);
    } else {
      setAckMap({});
    }
  }, [rows, fetchAckMap]);

  // Realtime subscription for new ack notes
  useEffect(() => {
    const channel = supabase
      .channel('dispatch-ack-history')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dispatch_status_history' },
        (payload: any) => {
          if (payload.new?.status_notes === ACK_NOTE) {
            setAckMap(prev => ({
              ...prev,
              [payload.new.operator_id]: payload.new.changed_at,
            }));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);


  const scrollToCard = useCallback((operatorId: string) => {
    // Switch to cards view if in table mode
    setViewMode('cards');
    // Clear any active tab filter so the card is visible
    setActiveTab('all');
    // Highlight the card
    setHighlightedCard(operatorId);
    // Scroll after a short delay to let the view settle
    setTimeout(() => {
      const el = cardRefs.current[operatorId];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Clear highlight after 3 s
      setTimeout(() => setHighlightedCard(null), 3000);
    }, 100);
  }, []);

  // ── Quick-compose send ────────────────────────────────────────────────────
  const sendQuickMessage = async () => {
    if (!quickCompose || !composeBody.trim() || !session?.user?.id) return;
    setComposeSending(true);
    const { error } = await supabase.from('messages').insert({
      sender_id: session.user.id,
      recipient_id: quickCompose.operatorUserId,
      body: composeBody.trim(),
    });
    setComposeSending(false);
    if (error) {
      toast({ title: 'Failed to send', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Message sent', description: `Sent to ${quickCompose.name}.` });
      setComposeBody('');
      setQuickCompose(null);
      fetchUnreadCounts();
    }
  };

  // ── Unread message counts (total + per-operator) ─────────────────────────
  const fetchUnreadCounts = async (operatorUserIds?: string[]) => {
    if (!session?.user?.id) return;

    // Total unread for nav badge
    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', session.user.id)
      .is('read_at', null);
    setUnreadMessages(count ?? 0);

    // Per-operator unread — fetch all unread messages sent to this dispatcher
    // and group by sender_id (which is the operator's user_id)
    const { data: unreadData } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('recipient_id', session.user.id)
      .is('read_at', null);

    if (unreadData) {
      const grouped: Record<string, number> = {};
      unreadData.forEach(({ sender_id }) => {
        grouped[sender_id] = (grouped[sender_id] ?? 0) + 1;
      });
      setUnreadPerOperator(grouped);
    }
  };

  useEffect(() => {
    if (!session?.user?.id) return;
    fetchUnreadCounts();
    const channel = supabase
      .channel('dispatch-messages-unread')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `recipient_id=eq.${session.user.id}`,
      }, (payload: any) => {
        fetchUnreadCounts();
        // Desktop push for new operator messages
        fireNotification({
          title: 'New Message from Operator',
          body: payload.new?.body ?? 'An operator has sent you a new message.',
          type: 'new_message',
          link: '/dispatch?tab=dispatch-messages',
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'messages',
        filter: `recipient_id=eq.${session.user.id}`,
      }, () => fetchUnreadCounts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id, fireNotification]);

  // Fetch + realtime for unread notification count + desktop push on truck_down
  useEffect(() => {
    if (!session?.user?.id) return;
    const fetchCount = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .is('read_at', null);
      setUnreadNotifCount(count ?? 0);
    };
    fetchCount();
    const channel = supabase
      .channel('dispatch-unread-notif-badge')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${session.user.id}`,
      }, (payload: any) => {
        setUnreadNotifCount(prev => prev + 1);
        // Desktop push for truck_down notifications sent to this dispatcher
        if (payload.new) {
          fireNotification({
            title: payload.new.title,
            body: payload.new.body,
            type: payload.new.type,
            link: payload.new.link,
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id, fireNotification]);

  // One-shot deep-link migration on mount: translate legacy
  // ?tab=notifications into the canonical ?page=dispatch-notifications.
  // The lazy useState above already handled initial state from the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'notifications') {
      setActivePage('dispatch-notifications');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Writer: persist current page/filter/mode to the URL so browser refresh
  // restores the section. Reads the URL imperatively and does NOT depend on
  // searchParams, so it can never feed back into itself.
  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    if (activePage && activePage !== 'dispatch') next.set('page', activePage); else next.delete('page');
    if (activeTab && activeTab !== 'all') next.set('filter', activeTab); else next.delete('filter');
    if (viewMode && viewMode !== 'cards') next.set('mode', viewMode); else next.delete('mode');
    // Clean up legacy ?tab=notifications once we've adopted ?page=
    if (next.get('tab') === 'notifications') next.delete('tab');
    const current = window.location.search.replace(/^\?/, '');
    if (next.toString() !== current) {
      setSearchParams(next, { replace: true });
    }
  }, [activePage, activeTab, viewMode, setSearchParams]);

  // Clear badges when navigating to the respective tab
  const handleNavigate = (path: string) => {
    const p = path as 'dispatch' | 'dispatch-messages' | 'dispatch-notifications' | 'dispatch-drivers';
    setActivePage(p);
    if (p === 'dispatch-messages') {
      setUnreadMessages(0);
      setUnreadPerOperator({});
    }
    if (p === 'dispatch-notifications') {
      setUnreadNotifCount(0);
    }
  };

  const flashCard = useCallback((operatorId: string) => {
    if (flashTimers.current[operatorId]) clearTimeout(flashTimers.current[operatorId]);
    setFlashedCards(prev => new Set(prev).add(operatorId));
    flashTimers.current[operatorId] = setTimeout(() => {
      setFlashedCards(prev => {
        const next = new Set(prev);
        next.delete(operatorId);
        return next;
      });
    }, 2500);
  }, []);

  useEffect(() => {
    fetchDispatch();

    const channel = supabase
      .channel('dispatch-board-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'active_dispatch' },
        (payload: any) => {
          // Flash the live indicator
          setLiveIndicator(true);
          if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
          liveTimerRef.current = setTimeout(() => setLiveIndicator(false), 2000);

          const newRow = payload.new as Partial<DispatchRow> | null;
          const operatorId = newRow?.operator_id ?? (payload.old as any)?.operator_id;

          if (!operatorId) {
            // Fallback: full refresh if we can't identify the operator
            fetchDispatch(true);
            return;
          }

          // Surgical in-place update — no full re-fetch, no flicker
          setRows(prev => {
            const idx = prev.findIndex(r => r.operator_id === operatorId);
            if (idx === -1) {
              // New operator became fully_onboarded or was added — do a silent refresh
              fetchDispatch(true);
              return prev;
            }

            const updated = { ...prev[idx] };
            if (newRow?.dispatch_status) updated.dispatch_status = newRow.dispatch_status as DispatchStatusType;
            if ('current_load_lane' in (newRow ?? {})) updated.current_load_lane = newRow!.current_load_lane ?? null;
            if ('eta_redispatch' in (newRow ?? {})) updated.eta_redispatch = newRow!.eta_redispatch ?? null;
            if ('status_notes' in (newRow ?? {})) updated.status_notes = newRow!.status_notes ?? null;
            if (newRow?.updated_at) updated.updated_at = newRow.updated_at as string;
            if (newRow?.assigned_dispatcher !== undefined) updated.assigned_dispatcher = newRow.assigned_dispatcher ?? null;

            const next = [...prev];
            next[idx] = updated;

            // Re-sort by priority: truck_down → not_dispatched → home → dispatched
            const order: Record<DispatchStatusType, number> = {
              truck_down: 0, not_dispatched: 1, home: 2, dispatched: 3,
            };
            next.sort((a, b) => order[a.dispatch_status] - order[b.dispatch_status]);
            return next;
          });

          // Flash the updated card so the change is visually obvious
          flashCard(operatorId);

          // Play chime + show toast when status transitions TO truck_down from something else
          const oldStatus = (payload.old as any)?.dispatch_status;
          if (newRow?.dispatch_status === 'truck_down' && oldStatus !== 'truck_down') {
            if (!chimeMuted) playTruckDownChime();

            // Find the operator in the current rows ref to build a descriptive toast
            const op = rowsRef.current.find(r => r.operator_id === operatorId);
            const name = op ? [op.first_name, op.last_name].filter(Boolean).join(' ') || 'Unknown' : 'Unknown';
            const unit = op?.unit_number ? `Unit #${op.unit_number}` : null;
            const notes = newRow?.status_notes ?? op?.status_notes ?? null;

            toast({
              title: `🔴 Truck Down — ${name}${unit ? ` · ${unit}` : ''}`,
              description: notes || 'Status changed to Truck Down.',
              variant: 'destructive',
              duration: 8000,
              action: (
                <ToastAction
                  altText="Scroll to operator card"
                  onClick={() => scrollToCard(operatorId)}
                  className="shrink-0"
                >
                  View Card
                </ToastAction>
              ),
            });
          }


          // Refresh history for this operator if it's expanded
          setExpandedHistory(prev => {
            if (prev.has(operatorId)) fetchHistoryForOperators([operatorId]);
            return prev;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'operators' },
        (payload: any) => {
          const oldExcluded = (payload.old as any)?.excluded_from_dispatch;
          const newExcluded = (payload.new as any)?.excluded_from_dispatch;
          // Only re-fetch if the dispatch-exclusion flag flipped (avoids unnecessary refetch on unrelated updates)
          if (oldExcluded !== newExcluded) {
            fetchDispatch(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
      Object.values(flashTimers.current).forEach(clearTimeout);
    };
  }, [flashCard]);

  const fetchDispatch = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    const { data } = await supabase
      .from('operators')
      .select(`
        id,
        user_id,
        unit_number,
        is_active,
        created_at,
        excluded_from_dispatch,
        excluded_from_dispatch_reason,
        onboarding_status (fully_onboarded, unit_number, go_live_date),
        active_dispatch (id, dispatch_status, assigned_dispatcher, current_load_lane, eta_redispatch, status_notes, updated_at)
      `)
      .neq('is_active', false);

    if (data) {
      // onboarding_status and active_dispatch are one-to-one relations — Supabase returns
      // them as plain objects (or null), not arrays. Normalise both to handle either shape.
      const getOne = (val: any) => (Array.isArray(val) ? val[0] : val) ?? null;

      const onboarded = (data as any[]).filter(op => getOne(op.onboarding_status)?.fully_onboarded);
      // Split into included vs excluded — only included operators count on the board/tiles
      const excludedOnboarded = onboarded.filter(op => op.excluded_from_dispatch === true);
      const includedOnboarded = onboarded.filter(op => op.excluded_from_dispatch !== true);
      const userIds = includedOnboarded.map(op => op.user_id).filter(Boolean);
      // Also fetch profiles for excluded operators so we can list them in the dialog
      const excludedUserIds = excludedOnboarded.map(op => op.user_id).filter(Boolean);
      const profileMap: Record<string, any> = {};
      const allProfileIds = [...new Set([...userIds, ...excludedUserIds])];
      if (allProfileIds.length > 0) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name, phone, home_state, avatar_url')
          .in('user_id', allProfileIds);
        (profileData ?? []).forEach((p: any) => { profileMap[p.user_id] = p; });
      }

      // Build excluded list for the footer dialog
      const excludedList = excludedOnboarded.map(op => {
        const os = getOne(op.onboarding_status) ?? {};
        const p = profileMap[op.user_id] ?? {};
        return {
          operator_id: op.id,
          first_name: p.first_name ?? null,
          last_name: p.last_name ?? null,
          unit_number: os.unit_number ?? op.unit_number ?? null,
          excluded_from_dispatch_reason: op.excluded_from_dispatch_reason ?? null,
        };
      }).sort((a, b) => (a.last_name ?? '').localeCompare(b.last_name ?? ''));
      setExcludedRows(excludedList);

      const mapped: DispatchRow[] = includedOnboarded
        .map(op => {
          const d = getOne(op.active_dispatch) ?? {};
          const os = getOne(op.onboarding_status) ?? {};
          const p = profileMap[op.user_id] ?? {};
          return {
            operator_id: op.id,
            operator_user_id: op.user_id,
            dispatch_id: d.id ?? null,
            first_name: p.first_name ?? null,
            last_name: p.last_name ?? null,
            phone: p.phone ?? null,
            home_state: p.home_state ?? null,
            unit_number: os.unit_number ?? op.unit_number ?? null,
            avatar_url: p.avatar_url ?? null,
            dispatch_status: (d.dispatch_status ?? 'not_dispatched') as DispatchStatusType,
            assigned_dispatcher: d.assigned_dispatcher ?? null,
            current_load_lane: d.current_load_lane ?? null,
            eta_redispatch: d.eta_redispatch ?? null,
            status_notes: d.status_notes ?? null,
            updated_at: d.updated_at ?? null,
          };
        })
        .sort((a, b) => {
          const order: Record<DispatchStatusType, number> = {
            truck_down: 0, not_dispatched: 1, home: 2, dispatched: 3,
          };
          return order[a.dispatch_status] - order[b.dispatch_status];
        });
      setRows(mapped);

      // ── Roster-level "unlogged days" rollup ──────────────────────────────
      // For each included driver, count past days in the rolling 7-day window
      // that have no row in dispatch_daily_log. Window excludes today + future.
      // The lower bound for each driver is max(go_live_date, LEGACY_DISPATCH_START
      // for legacy drivers, created_at as final fallback) so a driver who went
      // live 3 days ago can show at most 3 unlogged days, not 7.
      try {
        const includedIds = includedOnboarded.map(op => op.id);
        if (includedIds.length === 0) {
          setUnloggedCountMap({});
        } else {
          // Build the past-day list for the window (excludes today).
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const windowDates: string[] = [];
          for (let i = 1; i <= UNLOGGED_WINDOW_DAYS; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            windowDates.push(d.toISOString().slice(0, 10));
          }
          const earliestStr = windowDates[windowDates.length - 1]; // oldest date in the window
          const todayStr = today.toISOString().slice(0, 10);

          const { data: logRows } = await supabase
            .from('dispatch_daily_log')
            .select('operator_id, log_date')
            .in('operator_id', includedIds)
            .gte('log_date', earliestStr)
            .lt('log_date', todayStr);

          const loggedByOp = new Map<string, Set<string>>();
          (logRows ?? []).forEach((r: any) => {
            const date = String(r.log_date).slice(0, 10);
            if (!loggedByOp.has(r.operator_id)) loggedByOp.set(r.operator_id, new Set());
            loggedByOp.get(r.operator_id)!.add(date);
          });

          const map: Record<string, number> = {};
          includedOnboarded.forEach(op => {
            const os = getOne(op.onboarding_status) ?? {};
            const goLive: string | null = os.go_live_date ?? null;
            const created: string | null = op.created_at ?? null;
            const anchorRaw = goLive
              ? goLive.slice(0, 10)
              : (LEGACY_DISPATCH_START || (created ? created.slice(0, 10) : null));
            if (!anchorRaw) return;
            const logged = loggedByOp.get(op.id) ?? new Set<string>();
            let unlogged = 0;
            for (const d of windowDates) {
              if (d < anchorRaw) continue; // before this driver's start
              if (!logged.has(d)) unlogged++;
            }
            if (unlogged > 0) map[op.id] = unlogged;
          });
          setUnloggedCountMap(map);
        }
      } catch (e) {
        // Non-fatal — chip just won't render.
        console.error('Failed to compute unlogged counts', e);
      }

      // Fetch all users with dispatcher or management roles for assignment dropdown
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['dispatcher', 'management', 'owner']);
      const roleUserIds = [...new Set((roleData ?? []).map((r: any) => r.user_id))];
      if (roleUserIds.length > 0) {
        const { data: roleProfiles } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name')
          .in('user_id', roleUserIds);
        if (roleProfiles) {
          const allNames: Record<string, string> = {};
          (roleProfiles as any[]).forEach(p => {
            allNames[p.user_id] = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown';
          });
          setAllDispatchers(allNames);
          // Also use this for the filter dropdown + display names
          setDispatcherNames(allNames);
        }
      } else {
        // Fallback: build from assigned dispatchers on rows
        const dispIds = [...new Set(mapped.map(r => r.assigned_dispatcher).filter(Boolean))] as string[];
        if (dispIds.length > 0) {
          const { data: dispProfiles } = await supabase
            .from('profiles')
            .select('user_id, first_name, last_name')
            .in('user_id', dispIds);
          if (dispProfiles) {
            const names: Record<string, string> = {};
            (dispProfiles as any[]).forEach(p => {
              names[p.user_id] = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown';
            });
            setDispatcherNames(names);
          }
        }
      }

      // Fetch history for any already-expanded rows
      const currentExpanded = expandedHistory;
      if (currentExpanded.size > 0) {
        const opIds = mapped.map(r => r.operator_id).filter(id => currentExpanded.has(id));
        if (opIds.length > 0) fetchHistoryForOperators(opIds);
      }
    }
    setLoading(false);
    setRefreshing(false);
  };

  const fetchHistoryForOperators = async (operatorIds: string[]) => {
    const { data } = await supabase
      .from('dispatch_status_history' as any)
      .select('id, operator_id, dispatch_status, current_load_lane, status_notes, changed_at')
      .in('operator_id', operatorIds)
      .order('changed_at', { ascending: false })
      .limit(3 * operatorIds.length);

    if (data) {
      const grouped: Record<string, StatusHistoryEntry[]> = {};
      (data as any[]).forEach(entry => {
        if (!grouped[entry.operator_id]) grouped[entry.operator_id] = [];
        if (grouped[entry.operator_id].length < 3) {
          grouped[entry.operator_id].push(entry as StatusHistoryEntry);
        }
      });
      setHistoryMap(prev => ({ ...prev, ...grouped }));
    }
  };

  const toggleHistory = async (operatorId: string) => {
    const next = new Set(expandedHistory);
    if (next.has(operatorId)) {
      next.delete(operatorId);
    } else {
      next.add(operatorId);
      if (!historyMap[operatorId]) {
        await fetchHistoryForOperators([operatorId]);
      }
    }
    setExpandedHistory(next);
  };

  const counts = useMemo(() => ({
    total: rows.length,
    dispatched: rows.filter(r => r.dispatch_status === 'dispatched').length,
    home: rows.filter(r => r.dispatch_status === 'home').length,
    truck_down: rows.filter(r => r.dispatch_status === 'truck_down').length,
    not_dispatched: rows.filter(r => r.dispatch_status === 'not_dispatched').length,
  }), [rows]);

  const filteredRows = useMemo(() => {
    let result = activeTab === 'all' ? rows : rows.filter(r => r.dispatch_status === activeTab);
    // Dispatcher filter
    if (dispatcherFilter === 'my' && session?.user?.id) {
      result = result.filter(r => r.assigned_dispatcher === session.user.id);
    } else if (dispatcherFilter !== 'all' && dispatcherFilter !== 'my') {
      result = result.filter(r => r.assigned_dispatcher === dispatcherFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        `${r.first_name} ${r.last_name}`.toLowerCase().includes(q) ||
        (r.unit_number ?? '').toLowerCase().includes(q) ||
        (r.home_state ?? '').toLowerCase().includes(q)
      );
    }
    // Sort by dispatcher name (alphabetical), unassigned last, then by driver last name
    result = [...result].sort((a, b) => {
      const dNameA = a.assigned_dispatcher ? (dispatcherNames[a.assigned_dispatcher] ?? '') : '\uffff';
      const dNameB = b.assigned_dispatcher ? (dispatcherNames[b.assigned_dispatcher] ?? '') : '\uffff';
      const cmp = dNameA.localeCompare(dNameB);
      if (cmp !== 0) return cmp;
      return (a.last_name ?? '').localeCompare(b.last_name ?? '');
    });
    return result;
  }, [rows, activeTab, search, dispatcherFilter, session?.user?.id, dispatcherNames]);

  const startEdit = (row: DispatchRow) => {
    setEditRow(row.operator_id);
    setEditData({
      dispatch_status: row.dispatch_status,
      assigned_dispatcher: row.assigned_dispatcher ?? '',
      current_load_lane: row.current_load_lane ?? '',
      eta_redispatch: row.eta_redispatch ?? '',
      status_notes: row.status_notes ?? '',
    });
  };

  const cancelEdit = () => { setEditRow(null); setEditData({}); };

  // ── Bulk status update ────────────────────────────────────────────────────
  const applyBulkStatus = async () => {
    if (selectedIds.size === 0) return;
    setBulkSaving(true);
    const targets = rows.filter(r => selectedIds.has(r.operator_id));
    const todayStr = new Date().toISOString().slice(0, 10);
    await Promise.all(targets.map(row => {
      const payload = {
        operator_id: row.operator_id,
        dispatch_status: bulkStatus,
        current_load_lane: row.current_load_lane ?? null,
        eta_redispatch: row.eta_redispatch ?? null,
        status_notes: row.status_notes ?? null,
        updated_at: new Date().toISOString(),
        updated_by: session?.user?.id ?? null,
      };
      if (row.dispatch_id) {
        return supabase.from('active_dispatch').update(payload).eq('id', row.dispatch_id);
      } else {
        return supabase.from('active_dispatch').insert(payload);
      }
    }));
    // Mirror today's status to dispatch_daily_log so the calendar stays in sync.
    await Promise.all(targets.map(row =>
      supabase
        .from('dispatch_daily_log')
        .upsert(
          {
            operator_id: row.operator_id,
            log_date: todayStr,
            status: bulkStatus,
            created_by: session?.user?.id ?? null,
          },
          { onConflict: 'operator_id,log_date' }
        )
    ));
    setBulkSaving(false);
    setSelectedIds(new Set());
    setBulkMode(false);
    toast({ title: `${targets.length} operator${targets.length !== 1 ? 's' : ''} updated`, description: `Status set to ${STATUS_CONFIG[bulkStatus].label}.` });
    fetchDispatch(true);
  };

  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredRows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRows.map(r => r.operator_id)));
    }
  };

  // ── Re-include an operator in the Dispatch Hub ───────────────────────────
  const handleReIncludeOperator = async (operatorId: string, operatorName: string) => {
    setReIncludingId(operatorId);
    try {
      const { error } = await supabase
        .from('operators')
        .update({
          excluded_from_dispatch: false,
          excluded_from_dispatch_reason: null,
          excluded_from_dispatch_at: null,
          excluded_from_dispatch_by: null,
        } as any)
        .eq('id', operatorId);
      if (error) throw error;

      // Audit-log the change
      void supabase.from('audit_log' as any).insert({
        actor_id: session?.user?.id ?? null,
        action: 'operator.dispatch_exclusion_changed',
        entity_type: 'operator',
        entity_id: operatorId,
        entity_label: operatorName,
        metadata: { from: true, to: false, reason: null, source: 'dispatch_portal_dialog' },
      });

      toast({
        title: 'Driver re-included',
        description: `${operatorName} now appears in the Dispatch Hub.`,
      });
      // Realtime listener will refresh, but force one too for snappy UX
      fetchDispatch(true);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setReIncludingId(null);
    }
  };

  const saveEdit = async (row: DispatchRow) => {
    setSaving(true);
    const newStatus = editData.dispatch_status ?? 'not_dispatched';
    // Sanitize free-text fields before persisting
    const lane = editData.current_load_lane ? sanitizeText(editData.current_load_lane) : null;
    const eta = editData.eta_redispatch ? sanitizeText(editData.eta_redispatch) : null;
    const notes = editData.status_notes ? sanitizeText(editData.status_notes) : null;
    const payload = {
      operator_id: row.operator_id,
      dispatch_status: newStatus,
      assigned_dispatcher: editData.assigned_dispatcher || null,
      current_load_lane: lane || null,
      eta_redispatch: eta || null,
      status_notes: notes || null,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (row.dispatch_id) {
      ({ error } = await supabase.from('active_dispatch').update(payload).eq('id', row.dispatch_id));
    } else {
      ({ error } = await supabase.from('active_dispatch').insert(payload));
    }

    setSaving(false);
    if (error) {
      toast({ title: 'Error saving', description: error.message, variant: 'destructive' });
    } else {
      // Mirror today's status to dispatch_daily_log so the calendar stays in sync.
      const todayStr = new Date().toISOString().slice(0, 10);
      void supabase
        .from('dispatch_daily_log')
        .upsert(
          {
            operator_id: row.operator_id,
            log_date: todayStr,
            status: newStatus,
            created_by: session?.user?.id ?? null,
          },
          { onConflict: 'operator_id,log_date' }
        );
      toast({ title: 'Dispatch updated', description: `${row.first_name} ${row.last_name} status saved.` });
      setEditRow(null);
      // Invalidate history cache for this operator so it refreshes on next expand
      setHistoryMap(prev => {
        const next = { ...prev };
        delete next[row.operator_id];
        return next;
      });
      fetchDispatch(true);

      if (newStatus !== 'not_dispatched') {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        fetch(`https://${projectId}.supabase.co/functions/v1/send-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({
            type: 'dispatch_status_change',
            operator_id: row.operator_id,
            operator_name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || 'Operator',
            unit_number: row.unit_number ?? null,
            new_status: newStatus,
            current_load_lane: lane || null,
            eta_redispatch: eta || null,
            status_notes: notes || null,
            caller_user_id: session?.user?.id ?? null,
          }),
        }).catch(console.error);
      }
    }
  };

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.total },
    { key: 'truck_down', label: 'Truck Down', count: counts.truck_down },
    { key: 'not_dispatched', label: 'Not Dispatched', count: counts.not_dispatched },
    { key: 'home', label: 'Home', count: counts.home },
    { key: 'dispatched', label: 'Dispatched', count: counts.dispatched },
  ];

  // Roster-wide total of unlogged days across all included drivers (last 7 days).
  const totalUnlogged = useMemo(
    () => Object.values(unloggedCountMap).reduce((a, b) => a + b, 0),
    [unloggedCountMap]
  );

  const board = (
    <div className="space-y-5 animate-fade-in">
      {/* Header — stacks on mobile */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-foreground">Dispatch Board</h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <p className="text-muted-foreground text-sm">Manage status for all active operators</p>
            <span className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border transition-all duration-500 ${
              liveIndicator
                ? 'bg-status-complete/15 text-status-complete border-status-complete/30'
                : 'bg-muted text-muted-foreground border-border'
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${liveIndicator ? 'bg-status-complete animate-pulse' : 'bg-muted-foreground'}`} />
              {liveIndicator ? 'Updated' : 'Live'}
            </span>
            <button
              onClick={() => setChimeMuted(prev => {
                const next = !prev;
                localStorage.setItem('dispatch_chime_muted', String(next));
                return next;
              })}
              title={chimeMuted ? 'Chime muted — click to unmute' : 'Mute Truck Down chime'}
              className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border transition-all duration-200 cursor-pointer select-none ${
                chimeMuted
                  ? 'bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20'
                  : 'bg-muted text-muted-foreground border-border hover:bg-muted/80 hover:text-foreground'
              }`}
            >
              {chimeMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
              <span className="hidden sm:inline">{chimeMuted ? 'Muted' : 'Sound'}</span>
            </button>
            {totalUnlogged > 0 && (
              <span
                className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-400"
                title={`${totalUnlogged} unlogged day${totalUnlogged !== 1 ? 's' : ''} across the fleet in the last ${UNLOGGED_WINDOW_DAYS} days`}
              >
                <HelpCircle className="h-3 w-3" />
                {totalUnlogged} unlogged across fleet
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* View toggle */}
          <div className="flex items-center bg-muted rounded-lg p-0.5 border border-border">
            <button
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === 'cards' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Cards</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === 'table' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Table</span>
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchDispatch(true)}
            disabled={refreshing}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* ── Truck Down Alert Banner ── */}
      {counts.truck_down > 0 && !loading && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 animate-fade-in">
          <div className="flex items-center gap-2 shrink-0">
            <Siren className="h-4 w-4 text-destructive animate-pulse shrink-0" />
            <span className="text-sm font-bold text-destructive">
              {counts.truck_down === 1 ? '1 Truck Down' : `${counts.truck_down} Trucks Down`}
            </span>
            <span className="text-destructive/60 text-xs hidden sm:inline">—</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {rows
              .filter(r => r.dispatch_status === 'truck_down')
              .map(r => {
                const name = `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Unknown';
                const unit = r.unit_number ? ` · ${r.unit_number}` : '';
                return (
                  <button
                    key={r.operator_id}
                    onClick={() => scrollToCard(r.operator_id)}
                    className="flex items-center gap-1.5 bg-destructive/15 hover:bg-destructive/25 border border-destructive/30 rounded-lg px-2.5 py-1 text-xs font-semibold text-destructive transition-colors"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                    {name}{unit}
                  </button>
                );
              })}
          </div>
          <button
            onClick={() => { setActiveTab('truck_down'); }}
            className="text-xs text-destructive/70 hover:text-destructive underline underline-offset-2 shrink-0 ml-auto hidden sm:block"
          >
            View all
          </button>
        </div>
      )}

      {/* KPI cards — 2-col on mobile (5 items → 2+2+1 centred last row), 3-col sm, 5-col lg */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        {[
          { label: 'Total Active', value: counts.total, icon: <Users className="h-4 w-4 text-gold" />, borderColor: 'border-gold/30', textColor: 'text-gold' },
          { label: 'Dispatched', value: counts.dispatched, icon: <CheckCircle2 className="h-4 w-4 text-status-complete" />, borderColor: 'border-status-complete/30', textColor: 'text-status-complete' },
          { label: 'Home', value: counts.home, icon: <Home className="h-4 w-4 text-status-progress" />, borderColor: 'border-status-progress/30', textColor: 'text-status-progress' },
          { label: 'Truck Down', value: counts.truck_down, icon: <AlertTriangle className="h-4 w-4 text-destructive" />, borderColor: 'border-destructive/30', textColor: 'text-destructive' },
          { label: 'Not Dispatched', value: counts.not_dispatched, icon: <Truck className="h-4 w-4 text-muted-foreground" />, borderColor: 'border-border', textColor: 'text-muted-foreground', spanFull: true },
        ].map(m => (
          <div key={m.label} className={`bg-white border ${m.borderColor} rounded-xl p-3 shadow-sm ${'spanFull' in m && m.spanFull ? 'col-span-2 sm:col-span-1' : ''}`}>
            <div className="flex items-center gap-2">
              {m.icon}
              <div className="min-w-0">
                <p className={`text-xl font-bold leading-none ${m.textColor}`}>{m.value}</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">{m.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Excluded-from-dispatch footer line */}
      {excludedRows.length > 0 && (
        <div className="flex items-center justify-end gap-1 -mt-1 text-[11px] text-muted-foreground">
          <EyeOff className="h-3 w-3" />
          <span>
            Showing {counts.total} of {counts.total + excludedRows.length} active operators.{' '}
            <button
              onClick={() => setShowExcludedDialog(true)}
              className="text-foreground hover:text-gold underline underline-offset-2 transition-colors"
            >
              {excludedRows.length} excluded from Dispatch Hub — View
            </button>
          </span>
        </div>
      )}

      {/* Filter tabs + search bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* Tabs — horizontal scroll on mobile */}
        <div className="w-full sm:w-auto overflow-x-auto pb-1 -mb-1">
          <div className="flex gap-1.5 min-w-max sm:flex-wrap sm:min-w-0">
            {tabs.map(tab => {
              const isActive = activeTab === tab.key;
              const cfg = tab.key !== 'all' ? STATUS_CONFIG[tab.key as DispatchStatusType] : null;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    isActive
                      ? (cfg ? cfg.tabActiveClass : 'bg-foreground text-background border-foreground/20')
                      : 'bg-white text-muted-foreground border-border hover:border-muted-foreground/30 hover:text-foreground'
                  }`}
                >
                  {cfg && <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotColor}`} />}
                  {tab.label}
                  <span className={`ml-0.5 rounded-full px-1.5 py-0 text-[10px] font-semibold ${
                    isActive ? 'bg-current/20 opacity-80' : 'bg-muted text-muted-foreground'
                  }`}>{tab.count}</span>
                </button>
              );
            })}
          </div>
        </div>
        {/* Dispatcher filter */}
        <Select value={dispatcherFilter} onValueChange={setDispatcherFilter}>
          <SelectTrigger className="h-8 text-xs w-full sm:w-40 shrink-0">
            <SelectValue placeholder="Filter by dispatcher" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="my">My Drivers</SelectItem>
            <SelectItem value="all">All Drivers</SelectItem>
            {Object.entries(dispatcherNames).map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative sm:ml-auto w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search operator, unit…"
            className="pl-8 h-8 text-xs"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => { setBulkMode(v => !v); setSelectedIds(new Set()); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            bulkMode ? 'bg-foreground text-background border-foreground/20' : 'bg-white text-muted-foreground border-border hover:border-muted-foreground/30 hover:text-foreground'
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {bulkMode ? 'Cancel' : 'Bulk Edit'}
        </button>
        {bulkMode && (
          <>
            <button
              onClick={toggleSelectAll}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              {selectedIds.size === filteredRows.length ? 'Deselect all' : `Select all (${filteredRows.length})`}
            </button>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 flex-wrap w-full mt-1">
                <span className="text-xs font-medium text-foreground w-full sm:w-auto">{selectedIds.size} selected — set to:</span>
                <Select value={bulkStatus} onValueChange={v => setBulkStatus(v as DispatchStatusType)}>
                  <SelectTrigger className="h-8 text-xs flex-1 min-w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_dispatched">Not Dispatched</SelectItem>
                    <SelectItem value="dispatched">Dispatched</SelectItem>
                    <SelectItem value="home">Home</SelectItem>
                    <SelectItem value="truck_down">Truck Down</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={applyBulkStatus}
                  disabled={bulkSaving}
                  className="h-8 text-xs bg-gold text-surface-dark hover:bg-gold-light gap-1.5 shrink-0"
                >
                  {bulkSaving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Apply
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Cards view */}
      {viewMode === 'cards' && (
        <div>
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-gold border-t-transparent" />
              <p className="text-sm text-muted-foreground">Loading operators…</p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16">
              <Truck className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                {search ? 'No operators match your search.' : activeTab === 'all' ? 'No active operators yet.' : `No operators with status "${STATUS_CONFIG[activeTab as DispatchStatusType]?.label}".`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
              {filteredRows.map(row => {
                const cfg = STATUS_CONFIG[row.dispatch_status];
                const isEditing = editRow === row.operator_id;
                const fullName = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || '—';
                const initials = [row.first_name?.[0], row.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?';

                return (
                  <div
                    key={row.operator_id}
                    ref={el => { cardRefs.current[row.operator_id] = el; }}
                    onClick={bulkMode ? () => toggleSelect(row.operator_id) : undefined}
                    className={`bg-white border-2 rounded-2xl shadow-sm overflow-hidden transition-all duration-300 ${bulkMode ? 'cursor-pointer' : ''} ${
                      bulkMode && selectedIds.has(row.operator_id)
                        ? 'border-primary ring-2 ring-primary/30'
                        : highlightedCard === row.operator_id
                        ? 'border-destructive ring-4 ring-destructive/30 scale-[1.01]'
                        : flashedCards.has(row.operator_id)
                        ? 'ring-2 ring-primary/60 border-primary/50 scale-[1.005]'
                        : row.dispatch_status === 'truck_down'
                        ? 'border-destructive/40'
                        : row.dispatch_status === 'dispatched'
                        ? 'border-status-complete/30'
                        : row.dispatch_status === 'home'
                        ? 'border-status-progress/30'
                        : 'border-border'
                    }`}
                  >
                    {/* Card header — status strip: wraps on mobile */}
                    <div className={`px-3 py-2 flex flex-wrap items-center gap-x-2 gap-y-1 ${
                      row.dispatch_status === 'truck_down'
                        ? 'bg-destructive/8'
                        : row.dispatch_status === 'dispatched'
                        ? 'bg-status-complete/8'
                        : row.dispatch_status === 'home'
                        ? 'bg-status-progress/8'
                        : 'bg-muted/40'
                    }`}>
                      {/* Bulk-mode checkbox */}
                      {bulkMode && (
                        <Checkbox
                          checked={selectedIds.has(row.operator_id)}
                          onCheckedChange={() => toggleSelect(row.operator_id)}
                          className="shrink-0"
                          aria-label={`Select ${[row.first_name, row.last_name].filter(Boolean).join(' ') || 'operator'}`}
                        />
                      )}
                      <Badge className={`${cfg.badgeClass} text-xs gap-1 shrink-0`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotColor}`} />
                        {cfg.label}
                      </Badge>
                      {/* Unlogged-days rollup chip — last 7 days, hidden when 0 */}
                      {!!unloggedCountMap[row.operator_id] && (
                        <span
                          className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-400 shrink-0"
                          title={`${unloggedCountMap[row.operator_id]} unlogged day${unloggedCountMap[row.operator_id] !== 1 ? 's' : ''} in the last ${UNLOGGED_WINDOW_DAYS} days`}
                        >
                          <HelpCircle className="h-2.5 w-2.5" />
                          {unloggedCountMap[row.operator_id]} unlogged
                        </span>
                      )}
                      {/* Operator-acknowledged badge — only on truck_down cards */}
                      {row.dispatch_status === 'truck_down' && ackMap[row.operator_id] && (
                        <span
                          className="flex items-center gap-1 bg-status-complete/10 text-status-complete border border-status-complete/30 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                          title={`Acknowledged ${new Date(ackMap[row.operator_id]).toLocaleString()}`}
                        >
                          <CheckCheck className="h-3 w-3 shrink-0" />
                          <span className="hidden sm:inline">Acknowledged</span>
                          <span className="sm:hidden">Ack'd</span>
                        </span>
                      )}
                      <div className="flex items-center gap-2 ml-auto">
                        {row.updated_at && (
                          <span
                            className="flex items-center gap-1 text-[10px] text-muted-foreground"
                            title={new Date(row.updated_at).toLocaleString()}
                          >
                            <Clock className="h-3 w-3 shrink-0" />
                            <span className="hidden sm:inline">{formatDistanceToNow(new Date(row.updated_at), { addSuffix: true })}</span>
                            <span className="sm:hidden">{formatDistanceToNow(new Date(row.updated_at), { addSuffix: false })}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Dispatcher label */}
                    <div className="px-3 pt-1.5">
                      <span className={`text-[11px] ${row.assigned_dispatcher ? 'text-muted-foreground' : 'text-muted-foreground/60 italic'}`}>
                        Dispatcher: {row.assigned_dispatcher ? (dispatcherNames[row.assigned_dispatcher] || 'Unknown') : 'Unassigned'}
                      </span>
                    </div>

                    {/* Card body */}
                    <div className="p-3 pt-1 space-y-2">
                       {/* Operator identity with bold unit # */}
                      <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 rounded-full overflow-hidden border border-border/60 shrink-0 flex items-center justify-center bg-surface-dark">
                          {row.avatar_url ? (
                            <img src={row.avatar_url} alt={fullName} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-xs font-bold text-gold">{initials}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-foreground text-sm truncate">{fullName}</p>
                            {row.unit_number && (
                              <span className="font-mono font-bold text-sm text-primary shrink-0">#{row.unit_number}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {row.phone && (
                              <a href={`tel:${row.phone}`} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-gold transition-colors">
                                <Phone className="h-2.5 w-2.5" />{row.phone}
                              </a>
                            )}
                            {row.home_state && (
                              <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                                <MapPin className="h-2.5 w-2.5" />{row.home_state}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Mini calendar */}
                      <MiniDispatchCalendar operatorId={row.operator_id} />

                      {/* Status select (editing) */}
                      {isEditing && (
                        <div className="space-y-2">
                          <Select
                            value={editData.dispatch_status}
                            onValueChange={v => setEditData(p => ({ ...p, dispatch_status: v as DispatchStatusType }))}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="not_dispatched">Not Dispatched</SelectItem>
                              <SelectItem value="dispatched">Dispatched</SelectItem>
                              <SelectItem value="home">Home</SelectItem>
                              <SelectItem value="truck_down">Truck Down</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select
                            value={editData.assigned_dispatcher ?? ''}
                            onValueChange={v => setEditData(p => ({ ...p, assigned_dispatcher: v === '__unassigned__' ? '' : v }))}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Assign Dispatcher" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__unassigned__">Unassigned</SelectItem>
                              {session?.user?.id && allDispatchers[session.user.id] && (
                                <SelectItem value={session.user.id}>
                                  {allDispatchers[session.user.id]} (Me)
                                </SelectItem>
                              )}
                              {Object.entries(allDispatchers)
                                .filter(([id]) => id !== session?.user?.id)
                                .sort(([, a], [, b]) => a.localeCompare(b))
                                .map(([id, name]) => (
                                  <SelectItem key={id} value={id}>{name}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <Textarea
                            value={editData.status_notes ?? ''}
                            onChange={e => setEditData(p => ({ ...p, status_notes: e.target.value }))}
                            className="text-xs min-h-[52px] resize-none"
                            placeholder="Notes…"
                          />
                        </div>
                      )}

                      {/* Notes (view mode) */}
                      {!isEditing && row.status_notes && (
                        <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2 line-clamp-2 italic">
                          {row.status_notes}
                        </p>
                      )}

                      {/* ── Status history timeline ── */}
                      {!isEditing && (() => {
                        const isHistoryExpanded = expandedHistory.has(row.operator_id);
                        const history = historyMap[row.operator_id] ?? [];
                        return (
                          <>
                            <button
                              onClick={() => toggleHistory(row.operator_id)}
                              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-gold transition-colors w-full pt-1"
                            >
                              <Clock className="h-3 w-3 shrink-0" />
                              <span className="font-medium">History</span>
                              {isHistoryExpanded
                                ? <ChevronUp className="h-3 w-3 ml-auto" />
                                : <ChevronDown className="h-3 w-3 ml-auto" />
                              }
                            </button>
                            {isHistoryExpanded && (
                              <div className="border-t border-border pt-2 mt-1">
                                {history.length === 0 ? (
                                  <p className="text-[11px] text-muted-foreground pl-1">No history recorded yet.</p>
                                ) : (
                                  <div className="flex flex-col gap-1.5">
                                    {history.map((entry, idx) => {
                                      const hcfg = STATUS_CONFIG[entry.dispatch_status] ?? STATUS_CONFIG.not_dispatched;
                                      return (
                                        <div key={entry.id} className="flex items-start gap-2.5">
                                          <div className="flex flex-col items-center shrink-0 mt-1">
                                            <span className={`h-2 w-2 rounded-full ${hcfg.historyDot} ring-2 ring-background`} />
                                            {idx < history.length - 1 && (
                                              <span className="w-px h-4 bg-border mt-0.5" />
                                            )}
                                          </div>
                                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <Badge className={`${hcfg.badgeClass} text-[10px] gap-1 px-1.5 py-0 h-4`}>
                                                {hcfg.label}
                                              </Badge>
                                              {entry.current_load_lane && (
                                                <span className="text-[11px] font-mono text-muted-foreground">{entry.current_load_lane}</span>
                                              )}
                                              <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">
                                                {formatDistanceToNow(new Date(entry.changed_at), { addSuffix: true })}
                                              </span>
                                            </div>
                                            {entry.status_notes && (
                                              <span className="text-[11px] text-muted-foreground italic truncate">{entry.status_notes}</span>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    {/* Card footer — actions */}
                    <div className="px-3 pb-3 pt-0 flex flex-wrap items-center gap-1">
                      {/* Call */}
                      {row.phone && (
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          className="h-7 text-xs gap-1 px-2 text-muted-foreground hover:text-status-complete hover:bg-status-complete/10"
                          title={`Call ${[row.first_name, row.last_name].filter(Boolean).join(' ') || 'operator'}`}
                        >
                          <a href={`tel:${row.phone}`}>
                            <Phone className="h-3 w-3" />
                            Call
                          </a>
                        </Button>
                      )}
                      {/* Binder */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setBinderTarget({ userId: row.operator_user_id, operatorId: row.operator_id, name: fullName })}
                        className="h-7 text-xs gap-1 px-2 text-muted-foreground hover:text-gold hover:bg-gold/10"
                        title="Inspection Binder"
                      >
                        <Shield className="h-3 w-3" />
                        Binder
                      </Button>
                      {/* Message quick-action */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const name = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || 'Operator';
                          setQuickCompose({
                            operatorUserId: row.operator_user_id,
                            name,
                            unit: row.unit_number,
                            status: STATUS_CONFIG[row.dispatch_status].label,
                          });
                          setComposeBody('');
                        }}
                        className={`h-7 text-xs gap-1 px-2.5 relative ${
                          unreadPerOperator[row.operator_user_id]
                            ? 'text-primary hover:text-primary hover:bg-primary/10'
                            : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
                        }`}
                        title={`Message ${[row.first_name, row.last_name].filter(Boolean).join(' ') || 'operator'}${unreadPerOperator[row.operator_user_id] ? ` (${unreadPerOperator[row.operator_user_id]} unread)` : ''}`}
                      >
                        <span className="relative">
                          <MessageSquare className="h-3 w-3" />
                          {!!unreadPerOperator[row.operator_user_id] && (
                            <span className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 rounded-full bg-destructive text-[9px] font-bold text-white flex items-center justify-center leading-none">
                              {unreadPerOperator[row.operator_user_id] > 9 ? '9+' : unreadPerOperator[row.operator_user_id]}
                            </span>
                          )}
                        </span>
                        Message
                      </Button>
                      {/* Edit / Save / Cancel — pushed to right */}
                      <div className="flex gap-1 ml-auto">
                        {isEditing ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() => saveEdit(row)}
                              disabled={saving}
                              className="h-7 text-xs bg-gold text-surface-dark hover:bg-gold-light gap-1 px-3"
                            >
                              {saving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-7 text-xs px-2">
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => startEdit(row)}
                            className="h-7 text-xs text-muted-foreground hover:text-gold hover:bg-gold/10 gap-1 px-2.5"
                          >
                            <Edit2 className="h-3 w-3" />
                            Edit
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!loading && filteredRows.length > 0 && (
            <p className="text-xs text-muted-foreground mt-3 text-right">
              Showing {filteredRows.length} of {rows.length} active operator{rows.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}

      {/* Table view */}
      {viewMode === 'table' && (
      <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
        {/* Mobile nudge: table view is dense, suggest cards */}
        <div className="sm:hidden flex items-center gap-2 px-4 py-2.5 bg-gold/8 border-b border-gold/20 text-xs text-foreground/70">
          <List className="h-3.5 w-3.5 text-gold shrink-0" />
          <span>Table view is best on wider screens.</span>
          <button onClick={() => setViewMode('cards')} className="ml-auto text-gold font-semibold hover:underline shrink-0">Switch to Cards</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {bulkMode && (
                  <th className="w-10 px-3 py-3">
                    <Checkbox
                      checked={filteredRows.length > 0 && selectedIds.size === filteredRows.length}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all operators"
                    />
                  </th>
                )}
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Operator</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Unit #</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Dispatcher</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden xl:table-cell">Notes</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-7 w-7 animate-spin rounded-full border-2 border-gold border-t-transparent" />
                      <p className="text-sm text-muted-foreground">Loading operators…</p>
                    </div>
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-16">
                    <div className="flex flex-col items-center gap-2">
                      <Truck className="h-8 w-8 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">
                        {search ? 'No operators match your search.' : activeTab === 'all' ? 'No active operators yet.' : `No operators with status "${STATUS_CONFIG[activeTab as DispatchStatusType]?.label}".`}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : filteredRows.map(row => {
                const cfg = STATUS_CONFIG[row.dispatch_status];
                const isEditing = editRow === row.operator_id;
                const isHistoryExpanded = expandedHistory.has(row.operator_id);
                const history = historyMap[row.operator_id] ?? [];
                const fullName = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || '—';

                return (
                  <>
                    <tr
                      key={row.operator_id}
                      onClick={bulkMode ? () => toggleSelect(row.operator_id) : undefined}
                      className={`transition-all duration-300 ${bulkMode ? 'cursor-pointer' : ''} ${
                        bulkMode && selectedIds.has(row.operator_id)
                          ? 'bg-primary/[0.06] border-l-2 border-l-primary'
                          : isEditing
                          ? 'bg-gold/[0.04] border-l-2 border-l-gold'
                          : flashedCards.has(row.operator_id)
                          ? 'bg-primary/[0.04] outline outline-1 outline-primary/30'
                          : cfg.rowClass + ' hover:bg-muted/30'
                      }`}
                    >
                      {/* Bulk checkbox cell */}
                      {bulkMode && (
                        <td className="w-10 px-3 py-3" onClick={e => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(row.operator_id)}
                            onCheckedChange={() => toggleSelect(row.operator_id)}
                            aria-label={`Select ${fullName}`}
                          />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {/* Avatar */}
                          <div className="h-8 w-8 rounded-full overflow-hidden border border-border/60 shrink-0 flex items-center justify-center bg-surface-dark">
                            {row.avatar_url ? (
                              <img src={row.avatar_url} alt={fullName} className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-xs font-bold text-gold">
                                {[row.first_name?.[0], row.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?'}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground text-sm">{fullName}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {row.phone && <span className="text-xs text-muted-foreground">{row.phone}</span>}
                              {row.home_state && (
                                <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                                  <MapPin className="h-2.5 w-2.5" />{row.home_state}
                                </span>
                              )}
                            </div>
                            {/* History toggle */}
                            <button
                              onClick={e => { e.stopPropagation(); toggleHistory(row.operator_id); }}
                              className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground hover:text-gold transition-colors"
                            >
                              <Clock className="h-3 w-3" />
                              History
                              {isHistoryExpanded
                                ? <ChevronUp className="h-3 w-3" />
                                : <ChevronDown className="h-3 w-3" />
                              }
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded text-foreground">{row.unit_number ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <Select
                            value={editData.dispatch_status}
                            onValueChange={v => setEditData(p => ({ ...p, dispatch_status: v as DispatchStatusType }))}
                          >
                            <SelectTrigger className="h-8 text-xs w-38 min-w-[140px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="not_dispatched">Not Dispatched</SelectItem>
                              <SelectItem value="dispatched">Dispatched</SelectItem>
                              <SelectItem value="home">Home</SelectItem>
                              <SelectItem value="truck_down">Truck Down</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <Badge className={`${cfg.badgeClass} text-xs gap-1 w-fit`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotColor}`} />
                              {cfg.label}
                            </Badge>
                            {!!unloggedCountMap[row.operator_id] && (
                              <span
                                className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-400 w-fit"
                                title={`${unloggedCountMap[row.operator_id]} unlogged day${unloggedCountMap[row.operator_id] !== 1 ? 's' : ''} in the last ${UNLOGGED_WINDOW_DAYS} days`}
                              >
                                <HelpCircle className="h-2.5 w-2.5" />
                                {unloggedCountMap[row.operator_id]} unlogged
                              </span>
                            )}
                            {row.dispatch_status === 'truck_down' && ackMap[row.operator_id] && (
                              <span
                                className="flex items-center gap-1 bg-status-complete/10 text-status-complete border border-status-complete/30 text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit"
                                title={`Acknowledged ${new Date(ackMap[row.operator_id]).toLocaleString()}`}
                              >
                                <CheckCheck className="h-3 w-3 shrink-0" />
                                Ack'd
                              </span>
                            )}
                          </div>
                        )
                      }
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {isEditing ? (
                          <Select
                            value={editData.assigned_dispatcher ?? ''}
                            onValueChange={v => setEditData(p => ({ ...p, assigned_dispatcher: v === '__unassigned__' ? '' : v }))}
                          >
                            <SelectTrigger className="h-8 text-xs min-w-[140px]">
                              <SelectValue placeholder="Assign Dispatcher" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__unassigned__">Unassigned</SelectItem>
                              {session?.user?.id && allDispatchers[session.user.id] && (
                                <SelectItem value={session.user.id}>
                                  {allDispatchers[session.user.id]} (Me)
                                </SelectItem>
                              )}
                              {Object.entries(allDispatchers)
                                .filter(([id]) => id !== session?.user?.id)
                                .sort(([, a], [, b]) => a.localeCompare(b))
                                .map(([id, name]) => (
                                  <SelectItem key={id} value={id}>{name}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {row.assigned_dispatcher ? (dispatcherNames[row.assigned_dispatcher] ?? '—') : <span className="opacity-40">—</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell max-w-[220px]">
                        {isEditing ? (
                          <Textarea
                            value={editData.status_notes ?? ''}
                            onChange={e => setEditData(p => ({ ...p, status_notes: e.target.value }))}
                            className="text-xs min-h-[56px] resize-none w-44"
                            placeholder="Notes…"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground line-clamp-2 block">{row.status_notes ?? <span className="opacity-40">—</span>}</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {isEditing ? (
                          <div className="flex gap-1 justify-end items-center">
                            <Button
                              size="sm"
                              onClick={() => saveEdit(row)}
                              disabled={saving}
                              className="h-7 text-xs bg-gold text-surface-dark hover:bg-gold-light gap-1 px-2.5"
                            >
                              {saving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-7 text-xs px-2">
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-1 justify-end">
                            {row.phone && (
                              <Button
                                variant="ghost"
                                size="sm"
                                asChild
                                className="h-7 text-xs gap-1 px-2.5 text-muted-foreground hover:text-status-complete hover:bg-status-complete/10"
                                title={`Call ${[row.first_name, row.last_name].filter(Boolean).join(' ') || 'operator'}`}
                              >
                                <a href={`tel:${row.phone}`}>
                                  <Phone className="h-3 w-3" />
                                  Call
                                </a>
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setMessageInitialUserId(row.operator_user_id);
                                setActivePage('dispatch-messages');
                              }}
                              className={`h-7 text-xs gap-1 px-2.5 relative ${
                                unreadPerOperator[row.operator_user_id]
                                  ? 'text-primary hover:text-primary hover:bg-primary/10'
                                  : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
                              }`}
                              title={`Message ${[row.first_name, row.last_name].filter(Boolean).join(' ') || 'operator'}${unreadPerOperator[row.operator_user_id] ? ` (${unreadPerOperator[row.operator_user_id]} unread)` : ''}`}
                            >
                              <span className="relative">
                                <MessageSquare className="h-3 w-3" />
                                {!!unreadPerOperator[row.operator_user_id] && (
                                  <span className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 rounded-full bg-destructive text-[9px] font-bold text-white flex items-center justify-center leading-none">
                                    {unreadPerOperator[row.operator_user_id] > 9 ? '9+' : unreadPerOperator[row.operator_user_id]}
                                  </span>
                                )}
                              </span>
                              Message
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setBinderTarget({ userId: row.operator_user_id, operatorId: row.operator_id, name: fullName })}
                              className="h-7 text-xs text-muted-foreground hover:text-gold hover:bg-gold/10 gap-1 px-2.5"
                              title="Inspection Binder"
                            >
                              <Shield className="h-3 w-3" />
                              Binder
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEdit(row)}
                              className="h-7 text-xs text-muted-foreground hover:text-gold hover:bg-gold/10 gap-1 px-2.5"
                            >
                              <Edit2 className="h-3 w-3" />
                              Edit
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* Status history expansion row */}
                    {isHistoryExpanded && (
                      <tr key={`${row.operator_id}-history`} className="bg-muted/20">
                        <td colSpan={5} className="px-6 py-3">
                          <div className="flex items-start gap-2 mb-2">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Last 3 Status Changes</p>
                          </div>
                          {history.length === 0 ? (
                            <p className="text-xs text-muted-foreground pl-5">No history recorded yet.</p>
                          ) : (
                            <div className="pl-5 flex flex-col gap-2">
                              {history.map((entry, idx) => {
                                const hcfg = STATUS_CONFIG[entry.dispatch_status] ?? STATUS_CONFIG.not_dispatched;
                                return (
                                  <div key={entry.id} className="flex items-start gap-3">
                                    {/* Timeline dot + line */}
                                    <div className="flex flex-col items-center shrink-0 mt-1">
                                      <span className={`h-2 w-2 rounded-full ${hcfg.historyDot} ring-2 ring-background`} />
                                      {idx < history.length - 1 && (
                                        <span className="w-px h-4 bg-border mt-0.5" />
                                      )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 min-w-0">
                                      <Badge className={`${hcfg.badgeClass} text-[10px] gap-1 px-1.5 py-0`}>
                                        {hcfg.label}
                                      </Badge>
                                      {entry.current_load_lane && (
                                        <span className="text-[11px] font-mono text-muted-foreground">{entry.current_load_lane}</span>
                                      )}
                                      {entry.status_notes && (
                                        <span className="text-[11px] text-muted-foreground italic truncate max-w-[240px]">{entry.status_notes}</span>
                                      )}
                                      <span className="text-[11px] text-muted-foreground/60 shrink-0">
                                        {formatDistanceToNow(new Date(entry.changed_at), { addSuffix: true })}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && filteredRows.length > 0 && (
          <div className="px-4 py-2.5 border-t border-border bg-muted/20 text-xs text-muted-foreground">
            Showing {filteredRows.length} of {rows.length} active operator{rows.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
      )}
    </div>
  );

  if (embedded) return board;

  const navItems = [
    { label: 'Dispatch Board', icon: <Container className="h-4 w-4" />, path: 'dispatch',               dividerBefore: 'Operations' },
    { label: 'Drivers',        icon: <Users2 className="h-4 w-4" />, path: 'dispatch-drivers' },
    { label: 'Messages',       icon: <MessageSquare className="h-4 w-4" />, path: 'dispatch-messages',       badge: unreadMessages || undefined, dividerBefore: 'Tools' },
    { label: 'Notifications',  icon: <Bell className="h-4 w-4" />, path: 'dispatch-notifications',  badge: unreadNotifCount || undefined },
  ];

  // ── Quick-compose modal ────────────────────────────────────────────────────
  const quickComposeModal = quickCompose && (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={() => { setQuickCompose(null); setComposeBody(''); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

      {/* Panel */}
      <div
        className="relative w-full sm:max-w-md bg-background border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl p-0 overflow-hidden animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`px-4 py-3 flex items-center justify-between gap-3 border-b border-border ${
          quickCompose.status === 'Truck Down'
            ? 'bg-destructive/8'
            : quickCompose.status === 'Dispatched'
            ? 'bg-status-complete/8'
            : quickCompose.status === 'Home'
            ? 'bg-status-progress/8'
            : 'bg-muted/40'
        }`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-full bg-surface-dark flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-gold">
                {quickCompose.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
              </span>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm text-foreground truncate">{quickCompose.name}</p>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span>{quickCompose.status}</span>
                {quickCompose.unit && <><span>·</span><span className="font-mono">Unit {quickCompose.unit}</span></>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {/* Open full thread link */}
            <button
              onClick={() => {
                setMessageInitialUserId(quickCompose.operatorUserId);
                setActivePage('dispatch-messages');
                setQuickCompose(null);
                setComposeBody('');
              }}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-md hover:bg-primary/10"
              title="Open full message thread"
            >
              <ExternalLink className="h-3 w-3" />
              Full thread
            </button>
            <button
              onClick={() => { setQuickCompose(null); setComposeBody(''); }}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Compose area */}
        <div className="p-4 space-y-3">
          <Textarea
            value={composeBody}
            onChange={e => setComposeBody(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendQuickMessage();
            }}
            placeholder={`Message ${quickCompose.name}…`}
            className="min-h-[80px] resize-none text-sm"
            autoFocus
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted-foreground">
              ⌘↵ to send
            </span>
            <Button
              onClick={sendQuickMessage}
              disabled={composeSending || !composeBody.trim()}
              size="sm"
              className="gap-1.5 bg-gold text-surface-dark hover:bg-gold-light"
            >
              {composeSending
                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                : <Send className="h-3.5 w-3.5" />}
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <StaffNotificationPreferencesModal open={prefOpen} onClose={() => setPrefOpen(false)} />
      <StaffLayout
        navItems={navItems}
        currentPath={activePage}
        onNavigate={handleNavigate}
        title="Dispatch Board"
        notificationsPath="/dispatch?tab=notifications"
        headerActions={
          <button
            onClick={() => setPrefOpen(true)}
            title="Notification preferences"
            className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-muted"
          >
            <SlidersHorizontal className="h-4.5 w-4.5" />
          </button>
        }
      >
        {quickComposeModal}
        {activePage === 'dispatch-messages'
          ? <MessagesView initialUserId={messageInitialUserId} />
          : activePage === 'dispatch-notifications'
          ? <NotificationHistory />
          : activePage === 'dispatch-drivers'
          ? <DriverHubView dispatchMode={true} onMessageDriver={userId => { setMessageInitialUserId(userId); setActivePage('dispatch-messages'); }} />
          : board}
      </StaffLayout>

      {/* Inspection Binder Sheet */}
      <Sheet open={!!binderTarget} onOpenChange={open => { if (!open) setBinderTarget(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          <SheetHeader className="px-4 py-3 border-b border-border">
            <SheetTitle className="text-base">Inspection Binder — {binderTarget?.name}</SheetTitle>
          </SheetHeader>
          {binderTarget && (
            <OperatorInspectionBinder userId={binderTarget.userId} operatorId={binderTarget.operatorId} />
          )}
        </SheetContent>
      </Sheet>

      {/* Excluded-from-Dispatch Dialog */}
      <Dialog open={showExcludedDialog} onOpenChange={setShowExcludedDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <EyeOff className="h-4 w-4 text-gold" />
              Excluded from Dispatch Hub
            </DialogTitle>
            <DialogDescription className="text-xs">
              These drivers are active in the system but hidden from the Dispatch Board and excluded from the daily count tiles.
              Re-include any driver to bring them back into the Dispatch Hub.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto -mx-1 px-1">
            {excludedRows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No drivers are currently excluded.
              </p>
            ) : (
              excludedRows.map(r => {
                const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unknown Driver';
                return (
                  <div
                    key={r.operator_id}
                    className="flex items-start gap-2 p-2.5 rounded-lg border border-border bg-muted/30"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground truncate">{name}</span>
                        {r.unit_number && (
                          <span className="font-mono text-[11px] text-muted-foreground">#{r.unit_number}</span>
                        )}
                      </div>
                      {r.excluded_from_dispatch_reason && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                          {r.excluded_from_dispatch_reason}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReIncludeOperator(r.operator_id, name)}
                      disabled={reIncludingId === r.operator_id}
                      className="h-7 text-[11px] gap-1 px-2 shrink-0 border-gold/40 text-gold hover:bg-gold/10 hover:text-gold"
                    >
                      {reIncludingId === r.operator_id ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3 w-3" />
                      )}
                      Re-include
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
