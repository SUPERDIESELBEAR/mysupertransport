import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchClaimHistory, formatDateTime, type ClaimHistoryEntry } from '@/lib/loadDetail';
import { formatCurrency, formatEnumLabel } from '@/lib/loadFormat';
import { resolutionLabel } from './claimConstants';

const dash = (v: string | null | undefined) => (v && v.trim() ? v : '—');

function changeLines(e: ClaimHistoryEntry): string[] {
  const out: string[] = [];
  if (e.previous_flag_level !== e.new_flag_level) {
    out.push(`Level: ${formatEnumLabel(e.previous_flag_level)} → ${formatEnumLabel(e.new_flag_level)}`);
  }
  if (e.previous_is_active !== e.new_is_active) {
    out.push(`Active: ${e.previous_is_active === null ? '—' : e.previous_is_active ? 'Yes' : 'No'} → ${e.new_is_active ? 'Yes' : 'No'}`);
  }
  if (e.previous_resolution !== e.new_resolution) {
    out.push(`Resolution: ${dash(resolutionLabel(e.previous_resolution))} → ${e.new_resolution ? resolutionLabel(e.new_resolution) : '—'}`);
  }
  if (e.previous_estimated_amount !== e.new_estimated_amount) {
    out.push(`Estimated: ${formatCurrency(e.previous_estimated_amount)} → ${formatCurrency(e.new_estimated_amount)}`);
  }
  if (e.previous_actual_amount !== e.new_actual_amount) {
    out.push(`Actual: ${formatCurrency(e.previous_actual_amount)} → ${formatCurrency(e.new_actual_amount)}`);
  }
  return out;
}

/** Audit trail for a single claim, loaded only when the panel is opened. */
export default function ClaimHistoryPanel({ claimId }: { claimId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['claim-history', claimId],
    queryFn: () => fetchClaimHistory(claimId),
  });

  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (error) return <p className="text-sm text-muted-foreground">Claim history could not be loaded.</p>;
  if (!data?.length) return <p className="text-sm text-muted-foreground">No recorded changes yet.</p>;

  return (
    <ol className="space-y-2">
      {data.map(e => {
        const lines = changeLines(e);
        return (
          <li key={e.id} className="rounded-md border border-border bg-background p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                {formatEnumLabel(e.action)}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDateTime(e.changed_at)}
                {e.changed_by_name ? ` · ${e.changed_by_name}` : ''}
              </span>
            </div>
            {lines.length ? (
              <ul className="mt-1 space-y-0.5">
                {lines.map(l => <li key={l} className="text-xs text-muted-foreground">{l}</li>)}
              </ul>
            ) : null}
            {e.notes ? (
              <p className="mt-1 whitespace-pre-wrap text-xs text-foreground">{e.notes}</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
