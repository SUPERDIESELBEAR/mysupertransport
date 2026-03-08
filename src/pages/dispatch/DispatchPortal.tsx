import { useState, useEffect, useRef, useMemo } from 'react';
import StaffLayout from '@/components/layouts/StaffLayout';
import MessagesView from '@/components/staff/MessagesView';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Truck, Users, AlertTriangle, CheckCircle2, Home,
  Search, Edit2, X, Save, RefreshCw, MapPin, MessageSquare, Clock, ChevronDown, ChevronUp,
  LayoutGrid, List, Phone
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

type DispatchStatusType = 'not_dispatched' | 'dispatched' | 'home' | 'truck_down';
type FilterTab = 'all' | DispatchStatusType;

interface DispatchRow {
  operator_id: string;
  dispatch_id: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  home_state: string | null;
  unit_number: string | null;
  dispatch_status: DispatchStatusType;
  assigned_dispatcher: string | null;
  current_load_lane: string | null;
  eta_redispatch: string | null;
  status_notes: string | null;
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
}

export default function DispatchPortal({ embedded = false }: DispatchPortalProps) {
  const { toast } = useToast();
  const { session } = useAuth();
  const [activePage, setActivePage] = useState<'dispatch' | 'dispatch-messages'>('dispatch');
  const [rows, setRows] = useState<DispatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editRow, setEditRow] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<DispatchRow>>({});
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [liveIndicator, setLiveIndicator] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const [historyMap, setHistoryMap] = useState<Record<string, StatusHistoryEntry[]>>({});
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Unread message count ──────────────────────────────────────────────────
  const fetchUnreadCount = async () => {
    if (!session?.user?.id) return;
    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', session.user.id)
      .is('read_at', null);
    setUnreadMessages(count ?? 0);
  };

  useEffect(() => {
    if (!session?.user?.id) return;
    fetchUnreadCount();
    const channel = supabase
      .channel('dispatch-messages-unread')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'messages',
        filter: `recipient_id=eq.${session.user.id}`,
      }, () => fetchUnreadCount())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id]);

  // Clear badge when navigating to Messages tab
  const handleNavigate = (path: string) => {
    const p = path as 'dispatch' | 'dispatch-messages';
    setActivePage(p);
    if (p === 'dispatch-messages') setUnreadMessages(0);
  };

  useEffect(() => {
    fetchDispatch();

    const channel = supabase
      .channel('dispatch-board-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'active_dispatch' },
        () => {
          setLiveIndicator(true);
          if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
          liveTimerRef.current = setTimeout(() => setLiveIndicator(false), 2000);
          fetchDispatch(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    };
  }, []);

  const fetchDispatch = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    const { data } = await supabase
      .from('operators')
      .select(`
        id,
        user_id,
        unit_number,
        onboarding_status (fully_onboarded, unit_number),
        active_dispatch (id, dispatch_status, assigned_dispatcher, current_load_lane, eta_redispatch, status_notes)
      `);

    if (data) {
      const onboarded = (data as any[]).filter(op => op.onboarding_status?.[0]?.fully_onboarded);
      const userIds = onboarded.map(op => op.user_id).filter(Boolean);
      const profileMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name, phone, home_state')
          .in('user_id', userIds);
        (profileData ?? []).forEach((p: any) => { profileMap[p.user_id] = p; });
      }

      const mapped: DispatchRow[] = onboarded
        .map(op => {
          const d = op.active_dispatch?.[0] ?? {};
          const p = profileMap[op.user_id] ?? {};
          return {
            operator_id: op.id,
            dispatch_id: d.id ?? null,
            first_name: p.first_name ?? null,
            last_name: p.last_name ?? null,
            phone: p.phone ?? null,
            home_state: p.home_state ?? null,
            unit_number: op.onboarding_status?.[0]?.unit_number ?? op.unit_number ?? null,
            dispatch_status: (d.dispatch_status ?? 'not_dispatched') as DispatchStatusType,
            assigned_dispatcher: d.assigned_dispatcher ?? null,
            current_load_lane: d.current_load_lane ?? null,
            eta_redispatch: d.eta_redispatch ?? null,
            status_notes: d.status_notes ?? null,
          };
        })
        .sort((a, b) => {
          const order: Record<DispatchStatusType, number> = {
            truck_down: 0, not_dispatched: 1, home: 2, dispatched: 3,
          };
          return order[a.dispatch_status] - order[b.dispatch_status];
        });
      setRows(mapped);

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
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        `${r.first_name} ${r.last_name}`.toLowerCase().includes(q) ||
        (r.unit_number ?? '').toLowerCase().includes(q) ||
        (r.current_load_lane ?? '').toLowerCase().includes(q) ||
        (r.home_state ?? '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [rows, activeTab, search]);

  const startEdit = (row: DispatchRow) => {
    setEditRow(row.operator_id);
    setEditData({
      dispatch_status: row.dispatch_status,
      current_load_lane: row.current_load_lane ?? '',
      eta_redispatch: row.eta_redispatch ?? '',
      status_notes: row.status_notes ?? '',
    });
  };

  const cancelEdit = () => { setEditRow(null); setEditData({}); };

  const saveEdit = async (row: DispatchRow) => {
    setSaving(true);
    const newStatus = editData.dispatch_status ?? 'not_dispatched';
    const payload = {
      operator_id: row.operator_id,
      dispatch_status: newStatus,
      current_load_lane: editData.current_load_lane || null,
      eta_redispatch: editData.eta_redispatch || null,
      status_notes: editData.status_notes || null,
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
            current_load_lane: editData.current_load_lane || null,
            eta_redispatch: editData.eta_redispatch || null,
            status_notes: editData.status_notes || null,
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

  const board = (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dispatch Board</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-muted-foreground text-sm">Manage status for all active operators</p>
            <span className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border transition-all duration-500 ${
              liveIndicator
                ? 'bg-status-complete/15 text-status-complete border-status-complete/30'
                : 'bg-muted text-muted-foreground border-border'
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${liveIndicator ? 'bg-status-complete animate-pulse' : 'bg-muted-foreground'}`} />
              {liveIndicator ? 'Updated' : 'Live'}
            </span>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchDispatch(true)}
          disabled={refreshing}
          className="gap-1.5 shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Active', value: counts.total, icon: <Users className="h-4 w-4 text-gold" />, borderColor: 'border-gold/30', textColor: 'text-gold' },
          { label: 'Dispatched', value: counts.dispatched, icon: <CheckCircle2 className="h-4 w-4 text-status-complete" />, borderColor: 'border-status-complete/30', textColor: 'text-status-complete' },
          { label: 'Home', value: counts.home, icon: <Home className="h-4 w-4 text-status-progress" />, borderColor: 'border-status-progress/30', textColor: 'text-status-progress' },
          { label: 'Truck Down', value: counts.truck_down, icon: <AlertTriangle className="h-4 w-4 text-destructive" />, borderColor: 'border-destructive/30', textColor: 'text-destructive' },
          { label: 'Not Dispatched', value: counts.not_dispatched, icon: <Truck className="h-4 w-4 text-muted-foreground" />, borderColor: 'border-border', textColor: 'text-muted-foreground' },
        ].map(m => (
          <div key={m.label} className={`bg-white border ${m.borderColor} rounded-xl p-3.5 shadow-sm`}>
            <div className="flex items-center gap-2.5">
              {m.icon}
              <div>
                <p className={`text-2xl font-bold ${m.textColor}`}>{m.value}</p>
                <p className="text-[11px] text-muted-foreground leading-tight">{m.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter tabs + search bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex gap-1.5 flex-wrap">
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

      {/* Table */}
      <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Operator</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Unit #</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Load / Lane</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">ETA Redispatch</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden xl:table-cell">Notes</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-7 w-7 animate-spin rounded-full border-2 border-gold border-t-transparent" />
                      <p className="text-sm text-muted-foreground">Loading operators…</p>
                    </div>
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16">
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
                      className={`transition-colors ${isEditing ? 'bg-gold/[0.04] border-l-2 border-l-gold' : cfg.rowClass + ' hover:bg-muted/30'}`}
                    >
                      <td className="px-4 py-3">
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
                          onClick={() => toggleHistory(row.operator_id)}
                          className="flex items-center gap-1 mt-1.5 text-[11px] text-muted-foreground hover:text-gold transition-colors"
                        >
                          <Clock className="h-3 w-3" />
                          History
                          {isHistoryExpanded
                            ? <ChevronUp className="h-3 w-3" />
                            : <ChevronDown className="h-3 w-3" />
                          }
                        </button>
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
                          <Badge className={`${cfg.badgeClass} text-xs gap-1`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotColor}`} />
                            {cfg.label}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {isEditing ? (
                          <Input
                            value={editData.current_load_lane ?? ''}
                            onChange={e => setEditData(p => ({ ...p, current_load_lane: e.target.value }))}
                            className="h-8 text-xs w-36"
                            placeholder="e.g. ATL→CHI"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground font-mono">{row.current_load_lane ?? <span className="opacity-40">—</span>}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {isEditing ? (
                          <Input
                            value={editData.eta_redispatch ?? ''}
                            onChange={e => setEditData(p => ({ ...p, eta_redispatch: e.target.value }))}
                            className="h-8 text-xs w-28"
                            placeholder="e.g. Fri AM"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">{row.eta_redispatch ?? <span className="opacity-40">—</span>}</span>
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
                      </td>
                    </tr>

                    {/* Status history expansion row */}
                    {isHistoryExpanded && (
                      <tr key={`${row.operator_id}-history`} className="bg-muted/20">
                        <td colSpan={7} className="px-6 py-3">
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
    </div>
  );

  if (embedded) return board;

  const navItems = [
    { label: 'Dispatch Board', icon: <Truck className="h-4 w-4" />, path: 'dispatch' },
    { label: 'Messages', icon: <MessageSquare className="h-4 w-4" />, path: 'dispatch-messages', badge: unreadMessages || undefined },
  ];

  return (
    <StaffLayout
      navItems={navItems}
      currentPath={activePage}
      onNavigate={handleNavigate}
      title="Dispatch"
    >
      {activePage === 'dispatch-messages' ? <MessagesView /> : board}
    </StaffLayout>
  );
}
