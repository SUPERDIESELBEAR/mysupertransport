import { Skeleton } from '@/components/ui/skeleton';
import { Clock } from 'lucide-react';

type View = 'inspection-binder' | 'forecast' | 'my-truck' | 'resource-center';

/**
 * Destination-shaped loading placeholder for Home tiles.
 * Each variant mirrors the silhouette of the first screen of the
 * destination view, so the transition feels continuous.
 */
export default function DestinationSkeleton({ view }: { view: View }) {
  return (
    <div className="w-full space-y-3 animate-fade-in">
      {/* Tiny header row identifying which destination is opening */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28 rounded bg-primary/15" />
        <Clock className="h-4 w-4 text-primary animate-spin shrink-0" />
      </div>

      {view === 'inspection-binder' && (
        <div className="space-y-2">
          {/* Dark binder cover strip */}
          <Skeleton className="h-6 w-full rounded-lg bg-foreground/15" />
          {/* Document rows */}
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-7 w-7 rounded-md shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-4/5 rounded" />
                <Skeleton className="h-2.5 w-1/3 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'forecast' && (
        <div className="space-y-2">
          {/* Notice strip */}
          <Skeleton className="h-7 w-full rounded-md bg-status-progress/20" />
          {/* Big payout figure */}
          <Skeleton className="h-10 w-2/3 rounded" />
          <div className="flex gap-2">
            <Skeleton className="h-3 w-1/3 rounded" />
            <Skeleton className="h-3 w-1/4 rounded" />
          </div>
        </div>
      )}

      {view === 'my-truck' && (
        <div className="space-y-2">
          <Skeleton className="h-5 w-1/2 rounded" />
          {/* 2-col specs grid */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-2.5 w-2/3 rounded" />
                <Skeleton className="h-3.5 w-full rounded" />
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'resource-center' && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-3 w-3 rounded-sm shrink-0" />
              <Skeleton className="h-3 rounded" style={{ width: `${60 + ((i * 17) % 35)}%` }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
