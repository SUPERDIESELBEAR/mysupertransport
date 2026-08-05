import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format, parseISO } from 'date-fns';
import {
  activePermits,
  permitExpiryStatus,
  PERMIT_STATE_META,
  type StatePermit,
} from '@/lib/statePermits';

interface StatePermitChipsProps {
  permits: StatePermit[];
  /** `chips` for the card row, `text` for the compact list-view cell. */
  variant?: 'chips' | 'text';
}

const CHIP_CLASS: Record<string, string> = {
  none:     'bg-primary/15 text-primary border-primary/40',
  ok:       'bg-primary/15 text-primary border-primary/40',
  expiring: 'bg-amber-100 text-amber-800 border-amber-300',
  expired:  'bg-destructive/10 text-destructive border-destructive/40',
};

/**
 * Renders ONLY the states a truck is registered in, alphabetically (KY, NM, NY, OR).
 * Renders nothing at all when the truck has no state permits enabled.
 */
export default function StatePermitChips({ permits, variant = 'chips' }: StatePermitChipsProps) {
  const active = activePermits(permits);
  if (active.length === 0) return variant === 'text' ? <span className="text-muted-foreground">—</span> : null;

  if (variant === 'text') {
    return (
      <span className="text-xs font-medium text-foreground">
        {active.map(p => p.stateCode).join(' · ')}
      </span>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-0.5">
          State Permits
        </span>
        {active.map(p => {
          const status = permitExpiryStatus(p.expiresAt);
          const meta = PERMIT_STATE_META[p.stateCode];
          return (
            <Tooltip key={p.stateCode}>
              <TooltipTrigger asChild>
                <span
                  className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${CHIP_CLASS[status]}`}
                >
                  {p.stateCode}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <div className="font-semibold">{meta.name}</div>
                <div>{meta.permitLabel}{p.permitNumber ? `: ${p.permitNumber}` : ''}</div>
                <div className="text-muted-foreground">
                  {p.expiresAt
                    ? `${status === 'expired' ? 'Expired' : 'Expires'} ${format(parseISO(p.expiresAt), 'MMM d, yyyy')}`
                    : 'No expiration tracked'}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}