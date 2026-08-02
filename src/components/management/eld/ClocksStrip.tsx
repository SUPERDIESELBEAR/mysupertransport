import { REPAIR_WINDOW_DAYS, repairClockColor } from '@/lib/eld/constants';
import {
  backdateDays, extensionDaysLeft, extensionDeadline, formatDateKey, repairDayInZone,
} from '@/lib/eld/repairClock';

/**
 * The two clocks, always both, always labelled by what they are.
 *
 * They are the same number on every event reported at discovery and differ by
 * up to two days on a backdated report — precisely the event where reading the
 * wrong one matters. Rendering them conditionally would mean a staff member
 * meets the distinction for the first time on the one row it changes an answer.
 */
export default function ClocksStrip({
  discoveredAt,
  createdAt,
  repairDeadline,
  extensionGrantedAt,
  extensionExpiresOn,
  timeZone = 'America/Chicago',
}: {
  discoveredAt: string;
  createdAt: string;
  repairDeadline: string;
  extensionGrantedAt?: string | null;
  extensionExpiresOn?: string | null;
  timeZone?: string;
}) {
  const day = repairDayInZone(discoveredAt, new Date(), timeZone);
  const gap = backdateDays(discoveredAt, createdAt, timeZone);
  const daysLeft = extensionDaysLeft(createdAt);
  const granted = !!extensionGrantedAt;

  const extensionRight = granted
    ? `Granted ${formatDateKey(extensionGrantedAt as string, timeZone)}`
    : daysLeft > 0
      ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left to file`
      : 'Window closed';

  return (
    <div className="rounded-lg border border-border">
      <Row
        label="Repair deadline"
        value={formatDateKey(repairDeadline, timeZone)}
        right={`Day ${day} of ${REPAIR_WINDOW_DAYS}`}
        rightColor={repairClockColor(day)}
        anchor={`from discovery, ${formatDateKey(discoveredAt, timeZone)}`}
      />
      {gap > 0 && (
        <p className="border-t border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
          Reported {gap} day{gap === 1 ? '' : 's'} after discovery — the two clocks
          below and above are anchored on different dates.
        </p>
      )}
      <Row
        label="Extension deadline"
        value={
          granted && extensionExpiresOn
            ? `Repair extended to ${formatDateKey(extensionExpiresOn, timeZone)}`
            : formatDateKey(extensionDeadline(createdAt), timeZone)
        }
        right={extensionRight}
        rightColor={!granted && daysLeft === 0 ? '#8A8A8A' : undefined}
        anchor={`from driver report, ${formatDateKey(createdAt, timeZone)} · 49 CFR 395.34(d)(2)`}
        divider
      />
    </div>
  );
}

function Row({
  label, value, right, rightColor, anchor, divider,
}: {
  label: string; value: string; right: string; rightColor?: string; anchor: string; divider?: boolean;
}) {
  return (
    <div className={`px-3 py-2 ${divider ? 'border-t border-border' : ''}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold text-foreground">{value}</span>
        <span className="text-xs font-semibold" style={rightColor ? { color: rightColor } : undefined}>
          {right}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">{anchor}</p>
    </div>
  );
}