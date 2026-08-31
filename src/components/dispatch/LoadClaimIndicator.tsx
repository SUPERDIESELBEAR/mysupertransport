import { AlertTriangle, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CLAIM_TYPE_LABELS, type ClaimLevel, type ClaimType } from '@/components/dispatch/loadDetail/claimConstants';

interface LoadClaimIndicatorProps {
  level: ClaimLevel;
  claimType: ClaimType;
  title?: string;
  className?: string;
}

/**
 * Inline claim indicator used on the Loads list and Dispatch Board.
 * Hold is a plain red warning triangle with no background; Watch is a
 * quieter informational eye badge.
 */
export default function LoadClaimIndicator({ level, claimType, title, className }: LoadClaimIndicatorProps) {
  const isHold = level === 'hold';
  const Icon = isHold ? AlertTriangle : Eye;
  const label = CLAIM_TYPE_LABELS[claimType] ?? claimType;
  const tooltip = title ?? `${isHold ? 'Hold' : 'Watch'} — ${label}`;

  if (isHold) {
    return (
      <span
        title={tooltip}
        aria-label={tooltip}
        className={cn('inline-flex text-destructive', className)}
      >
        <AlertTriangle className="h-4 w-4" />
      </span>
    );
  }

  return (
    <span
      title={tooltip}
      className={cn(
        'inline-flex items-center justify-center rounded-full',
        'bg-warning/15 text-warning border border-warning/45',
        'h-5 w-5',
        className,
      )}
      aria-label={tooltip}
    >
      <Icon className="h-3 w-3" />
    </span>
  );
}
