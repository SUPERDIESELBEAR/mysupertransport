import { Lock } from 'lucide-react';
import { useDemoMode } from '@/hooks/useDemoMode';

/**
 * Renders a small amber lock icon when Demo Mode is active.
 * Drop this inline inside any write-action button label.
 *
 * Usage:
 *   <Button onClick={handleSave}>
 *     <DemoLockIcon />
 *     Save
 *   </Button>
 */
export default function DemoLockIcon({ className }: { className?: string }) {
  const { isDemo } = useDemoMode();
  if (!isDemo) return null;
  return (
    <Lock
      className={className ?? 'h-3 w-3 text-amber-500 shrink-0'}
      aria-label="Blocked in demo mode"
    />
  );
}
