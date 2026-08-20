import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { LoadClaim } from '@/lib/loadDetail';
import { DetailSection } from './DetailPrimitives';
import ClaimCard from './ClaimCard';
import RaiseClaimDialog from './RaiseClaimDialog';
import ResolveClaimDialog from './ResolveClaimDialog';
import ReopenClaimDialog from './ReopenClaimDialog';

/** Staff-only. The host page must not render this for operator sessions. */
export default function ClaimsSection({
  loadId, claims, canManage, canReopen,
}: {
  loadId: string;
  claims: LoadClaim[];
  /** Management, owner, dispatcher. Onboarding staff are read-only. */
  canManage: boolean;
  /** Management and owner only. */
  canReopen: boolean;
}) {
  const qc = useQueryClient();
  const [raising, setRaising] = useState(false);
  const [resolving, setResolving] = useState<LoadClaim | null>(null);
  const [reopening, setReopening] = useState<LoadClaim | null>(null);

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['load-claims', loadId] }),
      qc.invalidateQueries({ queryKey: ['load-detail', loadId] }),
      qc.invalidateQueries({ queryKey: ['claim-history'] }),
      qc.invalidateQueries({ queryKey: ['loads'] }),
    ]);
  };

  const activeCount = claims.filter(c => c.is_active).length;

  return (
    <DetailSection
      title="Claims"
      action={
        <div className="flex items-center gap-2">
          {activeCount ? (
            <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-[10px] text-destructive">
              {activeCount} active
            </Badge>
          ) : null}
          {canManage ? (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setRaising(true)}>
              <Plus className="h-4 w-4" />
              Raise Claim
            </Button>
          ) : null}
        </div>
      }
    >
      {claims.length ? (
        <ul className="space-y-2">
          {claims.map(c => (
            <ClaimCard
              key={c.id}
              claim={c}
              canResolve={canManage}
              canReopen={canReopen}
              onResolve={() => setResolving(c)}
              onReopen={() => setReopening(c)}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No claims have been raised against this load.
        </p>
      )}

      {raising ? (
        <RaiseClaimDialog
          loadId={loadId}
          open
          onOpenChange={v => { if (!v) setRaising(false); }}
          onSaved={refresh}
        />
      ) : null}
      {resolving ? (
        <ResolveClaimDialog
          claim={resolving}
          open
          onOpenChange={v => { if (!v) setResolving(null); }}
          onSaved={refresh}
        />
      ) : null}
      {reopening ? (
        <ReopenClaimDialog
          claim={reopening}
          open
          onOpenChange={v => { if (!v) setReopening(null); }}
          onSaved={refresh}
        />
      ) : null}
    </DetailSection>
  );
}
