import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { BrokerCandidate } from '@/lib/rateConfirmation';

interface Props {
  candidate: BrokerCandidate;
  onSelect?: () => void;
  actionLabel?: string;
  showBadge?: boolean;
}

export default function BrokerCandidateRow({
  candidate,
  onSelect,
  actionLabel = 'Use this broker',
  showBadge = true,
}: Props) {
  const mc = candidate.mc_number?.trim() || null;
  const contact = candidate.primary_contact_name?.trim() || null;
  const cityState = [candidate.city, candidate.state]
    .map(s => s?.trim())
    .filter(Boolean)
    .join(', ') || null;

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">{candidate.company_name}</span>
        {showBadge && (
          <Badge
            variant="outline"
            className={
              candidate.matchedOn === 'mc'
                ? 'text-[10px] border-gold/60 text-gold bg-gold/10'
                : 'text-[10px]'
            }
          >
            {candidate.matchedOn === 'mc' ? 'MC confirmed' : 'Name match only'}
          </Badge>
        )}
        {onSelect && (
          <Button type="button" size="sm" variant="outline" className="ml-auto gap-1" onClick={onSelect}>
            <Check className="h-3.5 w-3.5" />
            {actionLabel}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        <span>{mc ? `MC ${mc}` : 'MC — not on record'}</span>
        <span>{cityState ?? 'City/state — not on record'}</span>
        <span>{contact ? `Contact: ${contact}` : 'Contact — not on record'}</span>
      </div>
    </div>
  );
}
