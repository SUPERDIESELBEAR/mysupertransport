import { AlertTriangle } from 'lucide-react';
import { CLOCK_RED, REPAIR_WINDOW_DAYS, elapsedRepairDay } from '@/lib/eld/constants';
import type { EldMalfunctionEvent } from '@/hooks/useEldMalfunction';

/** Non-dismissible while an ELD malfunction is open. */
export default function ELDMalfunctionBanner({
  event,
  onOpen,
}: {
  event: EldMalfunctionEvent | null;
  onOpen: () => void;
}) {
  if (!event) return null;
  const day = elapsedRepairDay(event.discovered_at);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-semibold text-white sm:text-sm"
      style={{ backgroundColor: CLOCK_RED }}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        ELD malfunction open — day {day} of {REPAIR_WINDOW_DAYS}.
        {event.hinders_hos_recording ? ' Keep paper logs in the truck.' : ''}
      </span>
      <span className="underline">View</span>
    </button>
  );
}