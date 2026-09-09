import { Check, AlertTriangle } from 'lucide-react';

interface Props {
  /** null = reachable; a string = blocked, with the reason. */
  reason: string | null;
  /**
   * Show the green "reachable" check too. In dense pickers (bulk message,
   * new message) reachable is the norm, so only the warning is shown.
   */
  showWhenReachable?: boolean;
  className?: string;
}

/**
 * Tiny corner badge telling staff at a glance whether this person can receive
 * in-app messages. Amber triangle = blocked, reason on hover/tap (title).
 */
export function ReachabilityBadge({ reason, showWhenReachable = false, className = '' }: Props) {
  if (reason) {
    return (
      <span
        title={`Cannot receive messages: ${reason}`}
        aria-label={`Cannot receive messages: ${reason}`}
        className={`inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-accent text-accent-foreground ring-2 ring-background ${className}`}
      >
        <AlertTriangle className="h-2 w-2" />
      </span>
    );
  }
  if (!showWhenReachable) return null;
  return (
    <span
      title="Can receive messages"
      aria-label="Can receive messages"
      className={`inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-status-complete text-white ring-2 ring-background ${className}`}
    >
      <Check className="h-2 w-2" />
    </span>
  );
}
