import { Lock } from 'lucide-react';
import { useDemoMode } from '@/hooks/useDemoMode';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const TOOLTIP_TEXT = 'Blocked in demo mode — exit demo to save changes';

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
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="pointer-events-auto absolute -top-1 -right-1 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 ring-1 ring-background"
              aria-label={TOOLTIP_TEXT}
            >
              <Lock className="h-2 w-2 text-white" strokeWidth={3} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{TOOLTIP_TEXT}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center" aria-label={TOOLTIP_TEXT}>
            <Lock
              className={className ?? 'h-3 w-3 text-amber-500 shrink-0'}
              strokeWidth={2.5}
            />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>{TOOLTIP_TEXT}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
