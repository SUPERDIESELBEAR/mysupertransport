import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Truck, MapPin, Clock, AlertTriangle, CheckCircle2, Home, Radio, Phone, MessageSquare } from 'lucide-react';

type DispatchStatusType = 'not_dispatched' | 'dispatched' | 'home' | 'truck_down';

interface DispatchData {
  dispatch_status: DispatchStatusType;
  current_load_lane: string | null;
  eta_redispatch: string | null;
  status_notes: string | null;
  updated_at: string;
  assigned_dispatcher: string | null;
}

interface DispatcherInfo {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
}

interface Props {
  operatorId: string;
  onMessageDispatcher?: (dispatcherUserId: string) => void;
}

const STATUS_CONFIG: Record<DispatchStatusType, {
  label: string;
  icon: React.ReactNode;
  cardClass: string;
  badgeClass: string;
  dotColor: string;
  iconColor: string;
}> = {
  not_dispatched: {
    label: 'Not Dispatched',
    icon: <Truck className="h-6 w-6" />,
    cardClass: 'border-border bg-white',
    badgeClass: 'bg-muted text-muted-foreground border-border',
    dotColor: 'bg-muted-foreground',
    iconColor: 'text-muted-foreground',
  },
  dispatched: {
    label: 'Dispatched',
    icon: <CheckCircle2 className="h-6 w-6" />,
    cardClass: 'border-status-complete/30 bg-status-complete/5',
    badgeClass: 'bg-status-complete/15 text-status-complete border-status-complete/30',
    dotColor: 'bg-status-complete',
    iconColor: 'text-status-complete',
  },
  home: {
    label: 'Home',
    icon: <Home className="h-6 w-6" />,
    cardClass: 'border-status-progress/30 bg-status-progress/5',
    badgeClass: 'bg-status-progress/15 text-status-progress border-status-progress/30',
    dotColor: 'bg-status-progress',
    iconColor: 'text-status-progress',
  },
  truck_down: {
    label: 'Truck Down',
    icon: <AlertTriangle className="h-6 w-6" />,
    cardClass: 'border-destructive/30 bg-destructive/5',
    badgeClass: 'bg-destructive/15 text-destructive border-destructive/30',
    dotColor: 'bg-destructive',
    iconColor: 'text-destructive',
  },
};

export default function OperatorDispatchStatus({ operatorId, onMessageDispatcher }: Props) {
  const [dispatch, setDispatch] = useState<DispatchData | null>(null);
  const [dispatcher, setDispatcher] = useState<DispatcherInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveFlash, setLiveFlash] = useState(false);
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchDispatcherInfo = async (dispatcherUserId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('first_name, last_name, phone')
      .eq('user_id', dispatcherUserId)
      .maybeSingle();
    setDispatcher(data as DispatcherInfo | null);
  };

  const fetchDispatch = async (silent = false) => {
    if (!silent) setLoading(true);
    const { data } = await supabase
      .from('active_dispatch')
      .select('dispatch_status, current_load_lane, eta_redispatch, status_notes, updated_at, assigned_dispatcher')
      .eq('operator_id', operatorId)
      .maybeSingle();
    setDispatch(data as DispatchData | null);
    if (data?.assigned_dispatcher) {
      await fetchDispatcherInfo(data.assigned_dispatcher);
    } else {
      setDispatcher(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDispatch();

    const channel = supabase
      .channel(`operator-dispatch-${operatorId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'active_dispatch', filter: `operator_id=eq.${operatorId}` },
        () => {
          setLiveFlash(true);
          if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
          liveTimerRef.current = setTimeout(() => setLiveFlash(false), 2500);
          fetchDispatch(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    };
  }, [operatorId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-gold border-t-transparent" />
      </div>
    );
  }

  const status = (dispatch?.dispatch_status ?? 'not_dispatched') as DispatchStatusType;
  const cfg = STATUS_CONFIG[status];

  const lastUpdated = dispatch?.updated_at
    ? new Date(dispatch.updated_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  const dispatcherName = dispatcher
    ? [dispatcher.first_name, dispatcher.last_name].filter(Boolean).join(' ') || null
    : null;

  const dispatcherInitial = dispatcherName?.[0]?.toUpperCase() ?? '?';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dispatch Status</h1>
          <p className="text-sm text-muted-foreground mt-1">Your current load and dispatch information</p>
        </div>
        {/* Live pill */}
        <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-all duration-500 shrink-0 ${
          liveFlash
            ? 'bg-status-complete/15 text-status-complete border-status-complete/30'
            : 'bg-muted text-muted-foreground border-border'
        }`}>
          <Radio className={`h-3 w-3 ${liveFlash ? 'text-status-complete animate-pulse' : 'text-muted-foreground'}`} />
          {liveFlash ? 'Updated' : 'Live'}
        </span>
      </div>

      {/* Status card */}
      <div className={`rounded-2xl border-2 p-6 transition-all duration-300 ${cfg.cardClass}`}>
        <div className="flex items-start gap-4">
          <div className={`h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 ${
            status === 'dispatched' ? 'bg-status-complete/15'
            : status === 'home' ? 'bg-status-progress/15'
            : status === 'truck_down' ? 'bg-destructive/15'
            : 'bg-muted'
          }`}>
            <span className={cfg.iconColor}>{cfg.icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xl font-bold text-foreground">{cfg.label}</p>
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${cfg.badgeClass}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotColor}`} />
                {cfg.label}
              </span>
            </div>
            {lastUpdated && (
              <p className="text-xs text-muted-foreground mt-1">Last updated: {lastUpdated}</p>
            )}
          </div>
        </div>

        {/* Dispatcher contact — shown whenever a dispatcher is assigned */}
        {dispatch && dispatch.assigned_dispatcher && (
          <div className="mt-5 pt-5 border-t border-border/60">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Your Dispatcher</p>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-surface-dark flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-gold">{dispatcherInitial}</span>
                </div>
                <div>
                  {dispatcherName ? (
                    <p className="text-sm font-semibold text-foreground">{dispatcherName}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Dispatcher assigned</p>
                  )}
                  {dispatcher?.phone ? (
                    <a
                      href={`tel:${dispatcher.phone}`}
                      className="flex items-center gap-1 text-xs text-gold hover:text-gold/80 transition-colors mt-0.5"
                    >
                      <Phone className="h-3 w-3" />
                      {dispatcher.phone}
                    </a>
                  ) : (
                    <p className="text-xs text-muted-foreground/60 mt-0.5">No phone on file</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {dispatcher?.phone && (
                  <a
                    href={`tel:${dispatcher.phone}`}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-surface-dark text-surface-dark-foreground hover:bg-surface-dark/90 transition-colors"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    Call
                  </a>
                )}
                {onMessageDispatcher && (
                  <button
                    onClick={() => onMessageDispatcher(dispatch.assigned_dispatcher!)}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-gold/15 text-gold hover:bg-gold/25 transition-colors"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Message
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Load / Lane */}
        <div className="bg-white border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="h-4 w-4 text-gold shrink-0" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Current Load / Lane</p>
          </div>
          {dispatch?.current_load_lane ? (
            <p className="text-base font-semibold text-foreground font-mono">{dispatch.current_load_lane}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">No load assigned</p>
          )}
        </div>

        {/* ETA Redispatch */}
        <div className="bg-white border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-gold shrink-0" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">ETA / Redispatch</p>
          </div>
          {dispatch?.eta_redispatch ? (
            <p className="text-base font-semibold text-foreground">{dispatch.eta_redispatch}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">No ETA set</p>
          )}
        </div>
      </div>

      {/* Notes */}
      {dispatch?.status_notes && (
        <div className="bg-white border border-border rounded-xl p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Dispatcher Notes</p>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{dispatch.status_notes}</p>
        </div>
      )}

      {/* No record yet */}
      {!dispatch && (
        <div className="bg-muted/40 border border-border rounded-xl p-6 text-center">
          <Truck className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No dispatch record yet. Your dispatcher will update your status once you're ready to roll.</p>
        </div>
      )}

      {/* Truck down message */}
      {status === 'truck_down' && (
        <div className="bg-destructive/8 border border-destructive/25 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">Truck Down Reported</p>
              <p className="text-xs text-muted-foreground mt-1">Your dispatcher has been notified. Please contact your coordinator if you haven't already.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
