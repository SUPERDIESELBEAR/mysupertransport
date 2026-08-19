import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import LoadStatusBadge from '@/components/dispatch/LoadStatusBadge';
import { DetailSection } from './DetailPrimitives';
import { fetchLoadStatusHistory, formatDateTime } from '@/lib/loadDetail';
const SOURCE_LABELS: Record<string, string> = { manual_ui: 'Manual change' };

/** Notes may contain internal commentary, so operators never see them. */
export default function StatusHistoryCard({ loadId, canSeeNotes }: { loadId: string; canSeeNotes: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ['load-status-history', loadId],
    queryFn: () => fetchLoadStatusHistory(loadId),
  });

  return (
    <DetailSection title="Status History">
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No status changes have been recorded for this load yet.
        </p>
      ) : (
        <ol className="space-y-4">
          {data.map(entry => (
            <li key={entry.id} className="border-l-2 border-border pl-4">
              <div className="flex flex-wrap items-center gap-2">
                {entry.previous_status ? (
                  <>
                    <LoadStatusBadge status={entry.previous_status} />
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </>
                ) : null}
                <LoadStatusBadge status={entry.new_status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDateTime(entry.changed_at)}
                {entry.changed_by_name ? ` · ${entry.changed_by_name}` : ''}
                {entry.change_source ? ` · ${SOURCE_LABELS[entry.change_source] ?? entry.change_source}` : ''}
              </p>
              {canSeeNotes && entry.notes?.trim() ? (
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{entry.notes}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </DetailSection>
  );
}
