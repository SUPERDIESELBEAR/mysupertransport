import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import LoadStatusBadge from '@/components/dispatch/LoadStatusBadge';
import LoadStatusControls from '@/components/dispatch/loadDetail/LoadStatusControls';
import StatusHistoryCard from '@/components/dispatch/loadDetail/StatusHistoryCard';
import LoadSummaryCard from '@/components/dispatch/loadDetail/LoadSummaryCard';
import RateDetailsCard from '@/components/dispatch/loadDetail/RateDetailsCard';
import { FlagsBlock, LoadoutBlock, ReeferBlock } from '@/components/dispatch/loadDetail/ConditionalBlocks';
import StopsTimeline from '@/components/dispatch/loadDetail/StopsTimeline';
import DocumentsSection from '@/components/dispatch/loadDetail/DocumentsSection';
import ClaimsSection from '@/components/dispatch/loadDetail/ClaimsSection';
import NotesSection from '@/components/dispatch/loadDetail/NotesSection';
import { fetchLoadClaims, fetchLoadDetail } from '@/lib/loadDetail';
import { CLAIM_TYPE_LABELS } from '@/components/dispatch/loadDetail/claimConstants';
import { type LoadStatus } from '@/lib/loadFormat';
import { LOAD_TYPE_LABELS, type LoadType } from '@/lib/loadRateMath';

interface LoadDetailPageProps {
  /** Host-supplied load id (Management Portal drives sections with state). */
  loadId?: string | null;
  /** Host-supplied back handler; defaults to the dispatch loads route. */
  onBack?: () => void;
  /** Host-supplied edit handler; defaults to the dispatch edit route. */
  onEdit?: () => void;
}

export default function LoadDetailPage({ loadId, onBack, onEdit }: LoadDetailPageProps = {}) {
  const params = useParams<{ id: string }>();
  const id = loadId ?? params.id;
  const navigate = useNavigate();
  const { isStaff, isDispatcher, isManagement } = useAuth();
  const canChangeStatus = isDispatcher || isManagement;
  const canManageClaims = isDispatcher || isManagement;

  const goBack = () => (onBack ? onBack() : navigate('/dispatch/loads'));

  const { data: load, isLoading, error } = useQuery({
    queryKey: ['load-detail', id],
    enabled: !!id,
    queryFn: () => fetchLoadDetail(id as string),
  });

  // Operators must never request or see claim flag information. Staff read the whole
  // claim list once; the hold banner is derived from it.
  const { data: claims } = useQuery({
    queryKey: ['load-claims', id],
    enabled: !!id && isStaff,
    queryFn: () => fetchLoadClaims(id as string),
  });

  const holdFlag = (claims ?? []).find(f => f.is_active && f.flag_level === 'hold');

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  if (error || !load) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" onClick={goBack}>
          <ArrowLeft className="h-4 w-4" />
          Back to Loads
        </Button>
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm font-medium text-foreground">This load could not be found.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            It may have been removed, or you may not have access to it.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={goBack}>
            Return to Loads
          </Button>
        </div>
      </div>
    );
  }

  const loadType = load.load_type as LoadType;
  const showLoadTypeChip = loadType === 'per_ton' || loadType === 'loadout';

  return (
    <div className="space-y-4 pb-10">
      <div className="sticky top-0 z-20 -mx-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
            Back to Loads
          </Button>
          <h1 className="font-mono text-xl font-semibold text-foreground sm:text-2xl">{load.load_number}</h1>
          <LoadStatusBadge status={load.status as LoadStatus} />
          {showLoadTypeChip ? (
            <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
              {LOAD_TYPE_LABELS[loadType]}
            </Badge>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="ml-auto gap-1.5"
            onClick={() => (onEdit ? onEdit() : navigate(`/dispatch/loads/${id}/edit`))}
          >
            <Pencil className="h-4 w-4" />
            Edit Load
          </Button>
        </div>
        {canChangeStatus ? (
          <div className="mt-3">
            <LoadStatusControls
              loadId={load.id}
              currentStatus={load.status as LoadStatus}
              canChangeStatus={canChangeStatus}
              canChangeBilling={isManagement}
            />
          </div>
        ) : null}
      </div>

      {isStaff && holdFlag ? (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-destructive">
              This load is on hold and excluded from settlement.
            </p>
            <p className="mt-1 text-sm text-foreground">
              {CLAIM_TYPE_LABELS[holdFlag.claim_type]}
              {holdFlag.description ? ` — ${holdFlag.description}` : ''}
            </p>
          </div>
        </div>
      ) : null}

      <LoadSummaryCard load={load} canAssign={canChangeStatus} canOverride={isManagement} />
      <RateDetailsCard load={load} />
      <ReeferBlock load={load} />
      <LoadoutBlock load={load} />
      <FlagsBlock load={load} />
      <StopsTimeline stops={load.stops} />
      <DocumentsSection load={load} canManage={isStaff} canSeeInternal={isStaff} />
      {isStaff ? (
        <ClaimsSection
          loadId={load.id}
          claims={claims ?? []}
          canManage={canManageClaims}
          canReopen={isManagement}
        />
      ) : null}
      <StatusHistoryCard loadId={load.id} canSeeNotes={isStaff} />
      <NotesSection load={load} canSeeInternal={isStaff} />
    </div>
  );
}
