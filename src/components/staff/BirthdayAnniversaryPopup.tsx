import { useMemo, useState } from 'react';
import { X, Send, ChevronDown, Cake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStaffBirthdayAnniversaryEvents, type BdayAnnivEvent } from '@/hooks/useStaffBirthdayAnniversaryEvents';
import SendBirthdayAnniversaryModal from './SendBirthdayAnniversaryModal';

function formatUpcomingDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function initials(first: string, last: string): string {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase() || '??';
}

function labelFor(ev: BdayAnnivEvent): { emoji: string; title: string; sub?: string } {
  if (ev.kind === 'birthday') {
    if (ev.isEarly) {
      return {
        emoji: '🎂',
        title: 'Upcoming Birthday',
        sub: formatUpcomingDate(ev.actualDate),
      };
    }
    return { emoji: '🎂', title: 'Birthday Today' };
  }
  const years = ev.years ?? 1;
  const ordinal = `${years}-Year`;
  if (ev.isEarly) {
    return {
      emoji: '🎉',
      title: `Upcoming ${ordinal} Anniversary`,
      sub: formatUpcomingDate(ev.actualDate),
    };
  }
  return { emoji: '🎉', title: `${ordinal} Anniversary Today` };
}

interface BirthdayAnniversaryPopupProps {
  /** Whether the desktop left sidebar is expanded, so the popup can offset itself. */
  sidebarOpen?: boolean;
}

export default function BirthdayAnniversaryPopup({ sidebarOpen = false }: BirthdayAnniversaryPopupProps) {
  const { events, acknowledge } = useStaffBirthdayAnniversaryEvents();
  const [composing, setComposing] = useState<BdayAnnivEvent | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [minimized, setMinimized] = useState(false);

  const visible = useMemo(() => (expanded ? events : events.slice(0, 2)), [events, expanded]);
  const hiddenCount = events.length - visible.length;

  if (events.length === 0) return null;

  // Position in the bottom-left viewport corner, offset just inside the main content
  // so the popup never sits on top of the left sidebar or the mobile bottom nav.
  const positionClasses = sidebarOpen
    ? 'bottom-6 left-64' // desktop, sidebar expanded (w-60 = 15rem; left-64 keeps it inside main content)
    : 'bottom-6 left-20'; // desktop, sidebar collapsed (w-16 = 4rem; left-20 keeps it inside main content)

  return (
    <>
      <div
        className={`fixed z-50 flex flex-col gap-2 pointer-events-none ${positionClasses} bottom-20 lg:bottom-6 max-w-[calc(100vw-5rem)] max-h-[70dvh] overflow-y-auto`}
      >
        {minimized ? (
          <button
            type="button"
            onClick={() => setMinimized(false)}
            className="pointer-events-auto flex items-center gap-2 bg-white border border-gold/40 shadow-lg rounded-full pl-1 pr-3 py-1 hover:bg-gold/5 transition-colors"
            aria-label={`Show ${events.length} birthday/anniversary notifications`}
            title={`${events.length} celebration${events.length !== 1 ? 's' : ''}`}
          >
            <span className="h-8 w-8 rounded-full bg-gold/15 border border-gold/30 flex items-center justify-center">
              <Cake className="h-4 w-4 text-gold" />
            </span>
            <span className="text-xs font-semibold text-foreground">{events.length}</span>
          </button>
        ) : (
          <>
            {visible.map((ev) => {
              const info = labelFor(ev);
              return (
                <div
                  key={ev.id}
                  className="pointer-events-auto bg-white border border-gold/40 shadow-lg rounded-lg p-3 flex items-start gap-3 animate-fade-in w-[260px] md:w-72"
                >
                  <div className="h-10 w-10 rounded-full overflow-hidden shrink-0 border border-gold/30 bg-gold/10 flex items-center justify-center">
                    {ev.avatarUrl ? (
                      <img src={ev.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-gold text-xs font-bold">{initials(ev.firstName, ev.lastName)}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {ev.firstName} {ev.lastName}
                    </p>
                    <p className="text-xs text-foreground/80 leading-tight">
                      <span className="mr-1">{info.emoji}</span>{info.title}
                    </p>
                    {info.sub && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">{info.sub}</p>
                    )}
                    <div className="mt-1.5 flex items-center gap-2">
                      <Button
                        variant="outline"
                        className="h-7 px-2 text-xs border-gold/40 hover:bg-gold/10"
                        onClick={() => setComposing(ev)}
                      >
                        <Send className="h-3 w-3 mr-1" />
                        Send
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <button
                      type="button"
                      onClick={() => acknowledge(ev)}
                      className="text-muted-foreground hover:text-foreground p-1 -m-1"
                      aria-label="Dismiss"
                      title="Dismiss"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
            {hiddenCount > 0 && !expanded && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="pointer-events-auto text-xs text-center py-1.5 rounded-md bg-white/90 border border-border shadow hover:bg-white w-[260px] md:w-72"
              >
                +{hiddenCount} more
              </button>
            )}
            {expanded && events.length > 2 && (
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="pointer-events-auto text-xs text-center py-1.5 rounded-md bg-white/90 border border-border shadow hover:bg-white w-[260px] md:w-72"
              >
                Show fewer
              </button>
            )}
            {/* Minimize bar */}
            <button
              type="button"
              onClick={() => setMinimized(true)}
              className="pointer-events-auto self-start flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground bg-white/80 border border-border rounded-full px-2 py-1 shadow-sm transition-colors"
              aria-label="Minimize birthday/anniversary notifications"
              title="Minimize"
            >
              <ChevronDown className="h-3 w-3" />
              <span>Minimize</span>
            </button>
          </>
        )}
      </div>

      <SendBirthdayAnniversaryModal
        event={composing}
        onClose={() => setComposing(null)}
        onSent={(ev) => {
          setComposing(null);
          void acknowledge(ev);
        }}
      />
    </>
  );
}
