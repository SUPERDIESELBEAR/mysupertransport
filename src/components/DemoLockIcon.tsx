import { Lock } from 'lucide-react';
import { useDemoMode } from '@/hooks/useDemoMode';

/**
 * Two display modes:
 *
 * 1. Inline (default) — renders a small amber lock next to button text.
 *    <Button><DemoLockIcon />Save</Button>
 *
 * 2. Badge — renders an absolute amber lock badge in the corner of a
 *    `relative`-positioned wrapper. Use for icon-only buttons.
 *    <div className="relative inline-flex"><Button …/><DemoLockIcon badge /></div>
 */
export default function DemoLockIcon({
  className,
  badge = false,
}: {
  className?: string;
  badge?: boolean;
}) {
  const { isDemo } = useDemoMode();
  if (!isDemo) return null;

  if (badge) {
    return (
      <span
        className="pointer-events-none absolute -top-1 -right-1 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 ring-1 ring-background"
        aria-label="Blocked in demo mode"
      >
        <Lock className="h-2 w-2 text-white" strokeWidth={3} />
      </span>
    );
  }

  return (
    <Lock
      className={className ?? 'h-3 w-3 text-amber-500 shrink-0'}
      aria-label="Blocked in demo mode"
    />
  );
}
