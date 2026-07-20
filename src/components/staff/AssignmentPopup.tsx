import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ChevronDown, Users, ArrowRight, UserPlus, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAssignmentPopupEvents, type AssignmentEvent } from '@/hooks/useAssignmentPopupEvents';
import AssignNotificationModal from './AssignNotificationModal';

/**
 * Fixed top-right assignment popup, styled to match BirthdayAnniversaryPopup.
 * Visible only to the staff member who was assigned a notification.
 */
export default function AssignmentPopup() {
  const { events, dismiss } = useAssignmentPopupEvents();
  const navigate = useNavigate();
  const [minimized, setMinimized] = useState(false);
  const [reassignFor, setReassignFor] = useState<AssignmentEvent | null>(null);
  const [decliningFor, setDecliningFor] = useState<AssignmentEvent | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  if (events.length === 0 && !minimized) return null;
  if (events.length === 0 && minimized) return null;

  const positionClasses = 'top-2 lg:top-3 right-32 lg:right-44';

  const openSource = async (ev: AssignmentEvent) => {
    setBusyId(ev.id);
    try {
      // Send ack back to assigner + owner audit, then navigate.
      await supabase.functions.invoke('assign-notification', {
        body: {
          action: 'ack',
          notificationIds: ev.entity_id ? [ev.entity_id] : [ev.id],
        },
      });
      await dismiss(ev.id);
      if (ev.link) navigate(ev.link);
    } finally {
      setBusyId(null);
    }
  };

  const handleDecline = async () => {
    if (!decliningFor) return;
    const ev = decliningFor;
    setBusyId(ev.id);
    try {
      const { error } = await supabase.functions.invoke('assign-notification', {
        body: {
          action: 'decline',
          notificationIds: ev.entity_id ? [ev.entity_id] : [ev.id],
          reason: declineReason.trim() || null,
        },
      });
      if (error) { toast.error('Failed to decline.'); return; }
      await dismiss(ev.id);
      toast.success('Declined and returned to the shared queue.');
      setDecliningFor(null);
      setDeclineReason('');
    } finally {
      setBusyId(null);
    }
  };

  const visible = events.slice(0, 3);
  const hidden = events.length - visible.length;

  return (
    <>
      <div
        className={`fixed z-40 flex flex-col gap-2 pointer-events-none ${positionClasses} max-w-[calc(100vw-5rem)] max-h-[70dvh] overflow-y-auto`}
      >
        {minimized ? (
          <button
            type="button"
            onClick={() => setMinimized(false)}
            className="pointer-events-auto flex items-center gap-2 bg-white border border-gold/40 shadow-lg rounded-full pl-1 pr-3 py-1 hover:bg-gold/5 transition-colors"
            aria-label={`Show ${events.length} assignments`}
            title={`${events.length} assignment${events.length !== 1 ? 's' : ''}`}
          >
            <span className="h-8 w-8 rounded-full bg-gold/15 border border-gold/30 flex items-center justify-center">
              <Users className="h-4 w-4 text-gold" />
            </span>
            <span className="text-xs font-semibold text-foreground">{events.length}</span>
          </button>
        ) : (
          <>
            {visible.map(ev => (
              <div
                key={ev.id}
                className="pointer-events-auto bg-white border border-gold/40 shadow-lg rounded-lg p-3 flex items-start gap-3 animate-fade-in w-[280px] md:w-80"
              >
                <div className="h-10 w-10 rounded-full overflow-hidden shrink-0 border border-gold/30 bg-gold/10 flex items-center justify-center">
                  <Users className="h-4 w-4 text-gold" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {ev.assignerName}
                  </p>
                  <p className="text-xs text-foreground/80 leading-tight">
                    Assigned you a notification
                  </p>
                  {ev.body && (
                    <p className="text-[11px] text-muted-foreground mt-1 line-clamp-3">{ev.body}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {ev.link && (
                      <Button
                        variant="default"
                        className="h-7 px-2 text-xs bg-gold text-surface-dark hover:bg-gold-light"
                        disabled={busyId === ev.id}
                        onClick={() => openSource(ev)}
                      >
                        Open <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="h-7 px-2 text-xs border-gold/40 hover:bg-gold/10"
                      disabled={busyId === ev.id}
                      onClick={() => setReassignFor(ev)}
                    >
                      <UserPlus className="h-3 w-3 mr-1" /> Re-assign
                    </Button>
                    <Button
                      variant="outline"
                      className="h-7 px-2 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                      disabled={busyId === ev.id}
                      onClick={() => { setDecliningFor(ev); setDeclineReason(''); }}
                    >
                      <XCircle className="h-3 w-3 mr-1" /> Decline
                    </Button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(ev.id)}
                  className="text-muted-foreground hover:text-foreground p-1 -m-1 shrink-0"
                  aria-label="Dismiss"
                  title="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {hidden > 0 && (
              <p className="pointer-events-none text-[10px] text-center text-muted-foreground bg-white/80 border border-border rounded-md py-1 w-[280px] md:w-80">
                +{hidden} more assignment{hidden !== 1 ? 's' : ''}
              </p>
            )}
            <button
              type="button"
              onClick={() => setMinimized(true)}
              className="pointer-events-auto self-start flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground bg-white/80 border border-border rounded-full px-2 py-1 shadow-sm transition-colors"
              aria-label="Minimize"
              title="Minimize"
            >
              <ChevronDown className="h-3 w-3" />
              <span>Minimize</span>
            </button>
          </>
        )}
      </div>

      {/* Re-assign flow */}
      <AssignNotificationModal
        open={!!reassignFor}
        mode="reassign"
        notificationIds={reassignFor?.entity_id ? [reassignFor.entity_id] : reassignFor ? [reassignFor.id] : []}
        onClose={() => setReassignFor(null)}
        onDone={() => { if (reassignFor) void dismiss(reassignFor.id); }}
      />

      {/* Decline reason prompt */}
      {decliningFor && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onClick={() => setDecliningFor(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-foreground">Decline assignment</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add a short reason so {decliningFor.assignerName} knows why.
            </p>
            <textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value.slice(0, 300))}
              rows={3}
              placeholder="Optional reason…"
              className="mt-3 w-full text-sm border border-border rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-gold/40"
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDecliningFor(null)} disabled={busyId === decliningFor.id}>Cancel</Button>
              <Button
                size="sm"
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={handleDecline}
                disabled={busyId === decliningFor.id}
              >
                {busyId === decliningFor.id ? 'Declining…' : 'Decline'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}