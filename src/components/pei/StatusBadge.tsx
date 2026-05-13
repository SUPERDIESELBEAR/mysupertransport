import { Badge } from '@/components/ui/badge';
import { STATUS_LABEL, type PEIRequestStatus } from '@/lib/pei/types';

const STYLES: Record<PEIRequestStatus, string> = {
  pending: 'bg-muted text-muted-foreground',
  sent: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  follow_up_sent: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  final_notice_sent: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  gfe_documented: 'bg-purple-500/15 text-purple-700 dark:text-purple-300',
};

export function PEIStatusBadge({ status }: { status: PEIRequestStatus }) {
  return (
    <Badge variant="outline" className={`${STYLES[status]} border-transparent font-medium`}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}