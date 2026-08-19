import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatEnumLabel, type LoadStatus } from '@/lib/loadFormat';

/** Visual weight per lifecycle stage, using semantic design tokens only. */
const STATUS_CLASSES: Record<LoadStatus, string> = {
  available:             'bg-status-neutral/12 text-status-neutral border-status-neutral/30',
  covered:               'bg-info/12 text-info border-info/30',
  dispatched:            'bg-info/12 text-info border-info/30',
  in_transit:            'bg-warning/15 text-warning border-warning/35',
  at_delivery:           'bg-warning/15 text-warning border-warning/35',
  delivered:             'bg-status-complete/12 text-status-complete border-status-complete/30',
  pod_received:          'bg-status-complete/12 text-status-complete border-status-complete/30',
  accessorials_approved: 'bg-status-complete/12 text-status-complete border-status-complete/30',
  ready_to_invoice:      'bg-billing/12 text-billing border-billing/30',
  invoiced:              'bg-billing/12 text-billing border-billing/30',
  factored:              'bg-billing/12 text-billing border-billing/30',
  paid:                  'bg-muted text-muted-foreground border-border',
  settled:               'bg-muted text-muted-foreground border-border',
  closed:                'bg-muted text-muted-foreground border-border',
  tonu:                  'bg-destructive/12 text-destructive border-destructive/30',
  cancelled:             'bg-destructive/12 text-destructive border-destructive/30',
};

export default function LoadStatusBadge({ status, className }: { status: LoadStatus; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn('font-medium text-[11px] px-2 py-0.5', STATUS_CLASSES[status], className)}
    >
      {formatEnumLabel(status)}
    </Badge>
  );
}