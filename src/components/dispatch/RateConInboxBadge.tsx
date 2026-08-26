import { useRateConInboxCount } from '@/hooks/useRateConInboxCount';

/**
 * Leaf badge for the Rate Con Inbox nav item.
 *
 * The realtime subscription lives HERE, not in the portal, so a rate
 * confirmation arriving re-renders this one span and nothing else. A
 * dispatcher mid-form elsewhere in the portal sees no re-render at all.
 * Renders nothing at zero so the positioning wrapper stays invisible.
 */
export default function RateConInboxBadge() {
  const count = useRateConInboxCount();
  if (count <= 0) return null;
  return (
    <span
      data-testid="rate-con-inbox-badge"
      className="h-4 min-w-4 px-1 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center leading-none"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
