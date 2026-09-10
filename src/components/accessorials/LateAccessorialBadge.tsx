import { useQuery } from '@tanstack/react-query';
import { fetchPendingAdjustmentCount } from '@/lib/accessorialAdjustments';

/**
 * How many late accessorials are waiting on somebody, as a sidebar count.
 * Renders nothing at zero, so an empty queue is silent.
 */
export default function LateAccessorialBadge() {
  const { data } = useQuery({
    queryKey: ['pending-adjustment-count'],
    queryFn: fetchPendingAdjustmentCount,
    refetchInterval: 120_000,
  });
  if (!data) return null;
  return (
    <span
      data-testid="late-accessorial-badge"
      className="ml-auto rounded-full bg-gold px-1.5 py-0.5 text-[10px] font-semibold text-[#0D0D0D]"
    >
      {data}
    </span>
  );
}
