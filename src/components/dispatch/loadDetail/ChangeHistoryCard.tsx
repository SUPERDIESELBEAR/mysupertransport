import { useQuery } from '@tanstack/react-query';
import { History, Loader2, DollarSign } from 'lucide-react';
import { fetchLoadChangeHistory, type LoadChangeEntry } from '@/lib/loadDetail';
import { Badge } from '@/components/ui/badge';
import { formatEnumLabel } from '@/lib/loadFormat';

interface Props {
  loadId: string;
}

const FIELD_LABELS: Record<string, string> = {
  linehaul_rate: 'Linehaul rate',
  fsc_amount: 'FSC amount',
  fsc_bundled_into_linehaul: 'FSC bundled into linehaul',
  rate_per_mile: 'Rate per mile',
  rate_per_ton: 'Rate per ton',
  estimated_tons: 'Estimated tons',
  loaded_miles: 'Loaded miles',
  deadhead_miles: 'Deadhead miles',
  total_load_value: 'Total load value',
  loadout_relocation_fee: 'Loadout relocation fee',
};

const fieldLabel = (path: string) =>
  FIELD_LABELS[path] ?? formatEnumLabel(path.replace(/\./g, ' '));

const displayValue = (v: string | null) =>
  v === null || v === '' ? '—' : v;

function Row({ entry }: { entry: LoadChangeEntry }) {
  return (
    <li className="rounded-md border border-border bg-background p-3 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-foreground">{fieldLabel(entry.field_path)}</span>
        {entry.is_financial && (
          <Badge variant="outline" className="gap-1 border-gold/50 text-gold">
            <DollarSign className="h-3 w-3" /> Financial
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {new Date(entry.changed_at).toLocaleString()}
        </span>
      </div>
      <p className="text-sm text-muted-foreground break-words">
        <span className="line-through">{displayValue(entry.previous_value)}</span>
        {' → '}
        <span className="text-foreground">{displayValue(entry.new_value)}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        {entry.changed_by_name ?? 'Unknown user'}
        {entry.change_source ? ` · ${formatEnumLabel(entry.change_source)}` : ''}
      </p>
      {entry.reason && (
        <p className="text-xs text-foreground bg-muted/50 rounded p-2">Reason: {entry.reason}</p>
      )}
    </li>
  );
}

/** Staff-only field-level edit trail for a load. */
export default function ChangeHistoryCard({ loadId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['load-change-history', loadId],
    queryFn: () => fetchLoadChangeHistory(loadId),
  });

  const entries = data ?? [];

  return (
    <section className="rounded-lg border border-border bg-card p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-semibold text-foreground">Change History</h2>
        {entries.length > 0 && (
          <span className="text-xs text-muted-foreground">{entries.length} change{entries.length === 1 ? '' : 's'}</span>
        )}
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No edits have been made to this load.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map(e => <Row key={e.id} entry={e} />)}
        </ul>
      )}
    </section>
  );
}
