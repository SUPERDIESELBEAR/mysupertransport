import { useQuery } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BROKER_RATING_VALUES } from '@/lib/brokers';
import { fetchDoNotLoadHistory } from '@/lib/brokerRelationship';

interface Props {
  brokerId: string;
  doNotLoad: boolean;
  onDoNotLoadChange: (v: boolean) => void;
  reason: string;
  onReasonChange: (v: string) => void;
  rating: number | null;
  onRatingChange: (v: number | null) => void;
}

export const brokerDnlHistoryQueryKey = (id: string) => ['broker-dnl-history', id] as const;

const stamp = (v: string) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/**
 * Do-not-load is deliberately separate from factoring status: a broker can be
 * factorable and still be one you refuse to haul for.
 */
export default function BrokerDoNotLoadFields({
  brokerId, doNotLoad, onDoNotLoadChange, reason, onReasonChange, rating, onRatingChange,
}: Props) {
  const { data: history } = useQuery({
    queryKey: brokerDnlHistoryQueryKey(brokerId),
    queryFn: () => fetchDoNotLoadHistory(brokerId),
  });

  const rows = history ?? [];

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch id="broker-dnl" checked={doNotLoad} onCheckedChange={onDoNotLoadChange} />
          <Label htmlFor="broker-dnl" className="cursor-pointer text-sm flex items-center gap-1.5">
            <Ban className="h-3.5 w-3.5 text-destructive" aria-hidden />
            Do not load — refuse freight from this broker
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Separate from factoring status. Loads can still be built against this broker; staff are
          warned and must record a reason to proceed.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="broker-dnl-reason" className="text-xs">
            Reason {doNotLoad ? '*' : ''}
          </Label>
          <Textarea
            id="broker-dnl-reason"
            rows={2}
            value={reason}
            onChange={e => onReasonChange(e.target.value)}
            disabled={!doNotLoad}
            placeholder={doNotLoad ? 'Why we will not haul for this broker' : 'Flag do-not-load first'}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="broker-rating" className="text-xs">Dispatcher rating</Label>
        <Select
          value={rating ? String(rating) : 'none'}
          onValueChange={v => onRatingChange(v === 'none' ? null : Number(v))}
        >
          <SelectTrigger id="broker-rating" className="sm:w-56">
            <SelectValue placeholder="Not rated" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Not rated</SelectItem>
            {BROKER_RATING_VALUES.map(n => (
              <SelectItem key={n} value={String(n)}>{n} of 5</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          A dispatcher's judgment. Rate-per-mile, detention approval rate, and days to pay are
          computed later from load and invoice data.
        </p>
      </div>

      {rows.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Do-not-load history
          </p>
          <ul className="space-y-1">
            {rows.map(h => (
              <li key={h.id} className="text-xs text-muted-foreground">
                {h.new_value ? 'Flagged' : 'Cleared'} {stamp(h.changed_at)} by{' '}
                {h.actor_name ?? 'unknown staff'}
                {h.reason ? ` — ${h.reason}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
