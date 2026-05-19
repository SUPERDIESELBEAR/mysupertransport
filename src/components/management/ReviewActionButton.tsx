import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export type ReviewActionTone = 'revise' | 'propose' | 'deny';

const toneClasses: Record<ReviewActionTone, string> = {
  revise: 'border-status-progress/40 text-status-progress hover:bg-status-progress/10',
  propose: 'border-gold/40 text-foreground hover:bg-gold/10',
  deny: 'border-destructive/40 text-destructive hover:bg-destructive/10',
};

interface ReviewActionButtonProps {
  tone: ReviewActionTone;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  className?: string;
  'data-testid'?: string;
}

/**
 * Shared action button used in the pending review footer of
 * ApplicationReviewDrawer. Centralises spacing so the icon stays aligned with
 * the first line of wrapped labels across all breakpoints.
 */
export function ReviewActionButton({
  tone,
  icon: Icon,
  label,
  onClick,
  className,
  ...rest
}: ReviewActionButtonProps) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      data-testid={rest['data-testid']}
      className={cn(
        'w-full whitespace-normal h-auto min-h-[3.25rem] py-2.5 leading-snug items-start justify-start text-left gap-2 [&>svg]:mt-0.5',
        toneClasses[tone],
        className,
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="flex-1">{label}</span>
    </Button>
  );
}