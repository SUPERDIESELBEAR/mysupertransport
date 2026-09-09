import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { loadDMCandidates } from '@/components/messaging/NewDirectMessageModal';
import { reachabilityBlock } from '@/lib/messagingAudience';

interface Row {
  name: string;
  reason: string;
}

/**
 * "Who can receive messages" — a plain answer for staff: how many drivers can
 * be reached in the app right now, and the name + reason for everyone who
 * can't be. Uses the same reachabilityBlock rule as the per-name badges.
 */
export default function MessageReachabilityCard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [reachable, setReachable] = useState(0);
  const [blocked, setBlocked] = useState<Row[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const list = await loadDMCandidates(true, user?.id ?? null, { includeDenied: true });
        const drivers = list.filter(c => c.kind === 'driver');

        const rows: Row[] = [];
        let ok = 0;
        for (const d of drivers) {
          const reason = reachabilityBlock(d.lifecycle, d.accountStatus, !!d.user_id);
          if (reason) rows.push({ name: d.name, reason });
          else ok++;
        }
        rows.sort((a, b) => a.name.localeCompare(b.name));
        if (!cancelled) { setReachable(ok); setBlocked(rows); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  return (
    <Card className="mt-3">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Who can receive messages</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-xs text-foreground/80">
              <CheckCircle2 className="h-4 w-4 text-status-complete" />
              <span><strong>{reachable}</strong> driver{reachable !== 1 ? 's' : ''} can be messaged in the app today.</span>
            </div>
            {blocked.length > 0 ? (
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                  Not reachable ({blocked.length})
                </p>
                <div className="max-h-64 overflow-y-auto rounded-md border border-border divide-y divide-border/60">
                  {blocked.map(r => (
                    <div key={`${r.name}-${r.reason}`} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="text-xs truncate">{r.name}</span>
                      <span className="text-[11px] text-muted-foreground shrink-0 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />{r.reason}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-2">Everyone on the roster can be reached.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
