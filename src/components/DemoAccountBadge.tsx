import { FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Badge marking a driver record as a demo/training account. */
export default function DemoAccountBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border border-purple-400/40 bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-purple-600',
        className,
      )}
      title="Demo account — safe for testing and training"
    >
      <FlaskConical className="h-2.5 w-2.5" />
      Demo
    </span>
  );
}
