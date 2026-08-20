import { useState } from 'react';
import { AlertTriangle, ChevronDown, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { formatDateTime, type LoadClaim } from '@/lib/loadDetail';
import { formatCurrency } from '@/lib/loadFormat';
import ClaimHistoryPanel from './ClaimHistoryPanel';
import {
  CLAIM_LEVEL_CLASSES, CLAIM_LEVEL_LABELS, CLAIM_TYPE_LABELS, resolutionLabel,
} from './claimConstants';

export default function ClaimCard({
  claim, canResolve, canReopen, onResolve, onReopen,
}: {
  claim: LoadClaim;
  canResolve: boolean;
  canReopen: boolean;
  onResolve: () => void;
  onReopen: () => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const isHold = claim.is_active && claim.flag_level === 'hold';

  return (
    <li
      className={cn(
        'rounded-lg border p-3',
        isHold ? 'border-destructive bg-destructive/10'
          : claim.is_active ? 'border-warning/45 bg-warning/5'
          : 'border-border bg-background',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {isHold ? <AlertTriangle className="h-4 w-4 text-destructive" /> : null}
        <Badge variant="outline" className={cn('text-[10px]', CLAIM_LEVEL_CLASSES[claim.flag_level])}>
          {CLAIM_LEVEL_LABELS[claim.flag_level]}
        </Badge>
        <span className="text-sm font-semibold text-foreground">
          {CLAIM_TYPE_LABELS[claim.claim_type]}
        </span>
        {!claim.is_active ? (
          <Badge variant="outline" className="border-border bg-muted text-[10px] text-muted-foreground">
            Resolved
          </Badge>
        ) : null}

        <div className="ml-auto flex gap-2">
          {claim.is_active && canResolve ? (
            <Button size="sm" variant="outline" onClick={onResolve}>Resolve</Button>
          ) : null}
          {!claim.is_active && canReopen ? (
            <Button size="sm" variant="outline" onClick={onReopen}>Reopen</Button>
          ) : null}
        </div>
      </div>

      {isHold ? (
        <p className="mt-1.5 text-sm font-medium text-destructive">
          Settlement is blocked on this load while this hold is active.
        </p>
      ) : null}

      {claim.description ? (
        <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">{claim.description}</p>
      ) : null}

      <p className="mt-1 text-xs text-muted-foreground">
        Reported {formatDateTime(claim.reported_at)}
        {claim.reported_by_contact ? ` by ${claim.reported_by_contact}` : ''}
        {claim.created_by_name ? ` · logged by ${claim.created_by_name}` : ''}
      </p>

      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Estimated: <span className="text-foreground">{formatCurrency(claim.estimated_claim_amount)}</span></span>
        {claim.actual_claim_amount !== null && claim.actual_claim_amount !== undefined ? (
          <span>Actual: <span className="text-foreground">{formatCurrency(claim.actual_claim_amount)}</span></span>
        ) : null}
        {claim.documentation_url ? (
          <a
            href={claim.documentation_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
          >
            Documentation <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>

      {!claim.is_active ? (
        <div className="mt-2 rounded-md border border-border bg-muted/40 p-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Resolution</p>
          <p className="mt-0.5 text-sm text-foreground">{resolutionLabel(claim.resolution)}</p>
          {claim.resolution_notes ? (
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{claim.resolution_notes}</p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            {claim.resolved_at ? `Closed ${formatDateTime(claim.resolved_at)}` : 'Closed'}
            {claim.resolved_by_name ? ` by ${claim.resolved_by_name}` : ''}
          </p>
        </div>
      ) : null}

      <Collapsible open={historyOpen} onOpenChange={setHistoryOpen} className="mt-2">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="-ml-2 h-7 gap-1.5 px-2 text-xs">
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', historyOpen && 'rotate-180')} />
            {historyOpen ? 'Hide history' : 'View history'}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          {historyOpen ? <ClaimHistoryPanel claimId={claim.id} /> : null}
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}
