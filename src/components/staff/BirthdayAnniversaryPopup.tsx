import { useMemo, useState } from 'react';
import { X, Send } from 'lucide-react';
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

export default function BirthdayAnniversaryPopup() {
  const { events, acknowledge } = useStaffBirthdayAnniversaryEvents();
  const [composing, setComposing] = useState<BdayAnnivEvent | null>(null);
  const [expanded, setExpanded] = useState(false);

  const visible = useMemo(() => (expanded ? events : events.slice(0, 3)), [events, expanded]);
  const hiddenCount = events.length - visible.length;

  if (events.length === 0) return null;

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2 w-[320px] max-w-[calc(100vw-2rem)] pointer-events-none">
        {visible.map((ev) => {
          const info = labelFor(ev);
          return (
            <div
              key={ev.id}
              className="pointer-events-auto bg-white border border-gold/40 shadow-lg rounded-lg p-3 flex items-start gap-3 animate-fade-in"
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
                  <p className="text-[11px] text-muted-foreground mt-0.5">{info.sub}</p>
                )}
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-gold/40 hover:bg-gold/10"
                    onClick={() => setComposing(ev)}
                  >
                    <Send className="h-3 w-3 mr-1" />
                    Send Message
                  </Button>
                </div>
              </div>
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
          );
        })}
        {hiddenCount > 0 && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="pointer-events-auto text-xs text-center py-1.5 rounded-md bg-white/90 border border-border shadow hover:bg-white"
          >
            +{hiddenCount} more
          </button>
        )}
        {expanded && events.length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="pointer-events-auto text-xs text-center py-1.5 rounded-md bg-white/90 border border-border shadow hover:bg-white"
          >
            Show fewer
          </button>
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