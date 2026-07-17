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
      <div className="fixed top-16 right-16 z-50 flex flex-col gap-2 w-[420px] md:w-[480px] max-w-[calc(100vw-5rem)] pointer-events-none">
        {visible.map((ev) => {
          const info = labelFor(ev);
          return (
            <div
              key={ev.id}
              className="pointer-events-auto bg-white border border-gold/40 shadow-lg rounded-lg p-4 flex items-start gap-4 animate-fade-in"
            >
              <div className="h-14 w-14 rounded-full overflow-hidden shrink-0 border border-gold/30 bg-gold/10 flex items-center justify-center">
                {ev.avatarUrl ? (
                  <img src={ev.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-gold text-sm font-bold">{initials(ev.firstName, ev.lastName)}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-foreground truncate">
                  {ev.firstName} {ev.lastName}
                </p>
                <p className="text-sm text-foreground/80 leading-tight">
                  <span className="mr-1">{info.emoji}</span>{info.title}
                </p>
                {info.sub && (
                  <p className="text-xs text-muted-foreground mt-1">{info.sub}</p>
                )}
                <div className="mt-2">
                  <Button
                    variant="outline"
                    className="h-8 px-3 text-sm border-gold/40 hover:bg-gold/10"
                    onClick={() => setComposing(ev)}
                  >
                    <Send className="h-4 w-4 mr-1.5" />
                    Send Message
                  </Button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => acknowledge(ev)}
                className="text-muted-foreground hover:text-foreground p-1.5 -m-1.5"
                aria-label="Dismiss"
                title="Dismiss"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          );
        })}
        {hiddenCount > 0 && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="pointer-events-auto text-sm text-center py-2 rounded-md bg-white/90 border border-border shadow hover:bg-white"
          >
            +{hiddenCount} more
          </button>
        )}
        {expanded && events.length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="pointer-events-auto text-sm text-center py-2 rounded-md bg-white/90 border border-border shadow hover:bg-white"
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