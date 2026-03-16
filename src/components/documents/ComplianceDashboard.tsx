import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, Bell, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DriverDocument } from './DocumentHubTypes';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DriverRow {
  user_id: string;
  name: string;
  email: string;
}

interface DocCompliance {
  doc: DriverDocument;
  acknowledged: string[];   // user_ids
  notAcknowledged: DriverRow[];
}

interface ComplianceDashboardProps {
  documents: DriverDocument[];
}

export default function ComplianceDashboard({ documents }: ComplianceDashboardProps) {
  const { toast } = useToast();
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [ackMap, setAckMap] = useState<Record<string, string[]>>({});  // doc_id → user_ids
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState<string | null>(null);

  const requiredDocs = documents.filter(d => d.is_required && d.is_visible);

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Fetch all operators with their profiles
    const { data: ops } = await supabase
      .from('operators')
      .select('user_id, profiles(first_name, last_name)')
      .limit(1000);

    const driverList: DriverRow[] = (ops ?? []).map((op: any) => {
      const profile = Array.isArray(op.profiles) ? op.profiles[0] : op.profiles;
      return {
        user_id: op.user_id,
        name: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Unknown Driver',
        email: '',
      };
    });
    setDrivers(driverList);

    // Fetch all acknowledgments for required docs
    if (requiredDocs.length > 0) {
      const { data: acks } = await supabase
        .from('document_acknowledgments')
        .select('document_id, user_id, document_version')
        .in('document_id', requiredDocs.map(d => d.id));

      // Build map: doc_id → user_ids (matching current version)
      const map: Record<string, string[]> = {};
      for (const doc of requiredDocs) {
        map[doc.id] = (acks ?? [])
          .filter(a => a.document_id === doc.id && a.document_version === doc.version)
          .map(a => a.user_id);
      }
      setAckMap(map);
    }

    setLoading(false);
  }, [requiredDocs.map(d => d.id).join(',')]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSendReminder = async (doc: DriverDocument, unacknowledgedUsers: DriverRow[]) => {
    setSending(doc.id);
    await Promise.all(
      unacknowledgedUsers.map(driver =>
        supabase.from('notifications').insert({
          user_id: driver.user_id,
          title: `Action required: ${doc.title}`,
          body: 'Please read and acknowledge this required document in the Document Hub.',
          type: 'document_reminder',
          channel: 'in_app',
          link: '/operator?tab=docs-hub',
        })
      )
    );
    setSending(null);
    toast({
      title: 'Reminders sent ✓',
      description: `Sent to ${unacknowledgedUsers.length} driver${unacknowledgedUsers.length !== 1 ? 's' : ''}.`,
    });
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
      </div>
    );
  }

  if (requiredDocs.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p>No required documents. Mark documents as "Required" to track acknowledgments here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {requiredDocs.map(doc => {
        const acknowledged = ackMap[doc.id] ?? [];
        const notAcknowledged = drivers.filter(d => !acknowledged.includes(d.user_id));
        const pct = drivers.length > 0 ? Math.round((acknowledged.length / drivers.length) * 100) : 0;
        const isExpanded = expanded[doc.id];

        return (
          <div key={doc.id} className="border border-border rounded-xl overflow-hidden bg-white">
            {/* Row */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground truncate">{doc.title}</p>
                <div className="flex items-center gap-3 mt-1">
                  {/* Progress bar */}
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[120px]">
                    <div
                      className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-status-complete' : pct > 50 ? 'bg-gold' : 'bg-destructive'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {acknowledged.length}/{drivers.length} ({pct}%)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {notAcknowledged.length > 0 ? (
                  <>
                    <Badge className="text-xs border bg-destructive/10 text-destructive border-destructive/30">
                      {notAcknowledged.length} pending
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs gap-1.5 h-8"
                      disabled={sending === doc.id}
                      onClick={() => handleSendReminder(doc, notAcknowledged)}
                    >
                      <Bell className="h-3.5 w-3.5" />
                      {sending === doc.id ? 'Sending…' : 'Remind'}
                    </Button>
                  </>
                ) : (
                  <Badge className="text-xs border bg-status-complete/10 text-status-complete border-status-complete/30 gap-1">
                    <CheckCircle2 className="h-3 w-3" /> All done
                  </Badge>
                )}

                <button
                  onClick={() => setExpanded(e => ({ ...e, [doc.id]: !e[doc.id] }))}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1"
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Expanded: drivers who have NOT acknowledged */}
            {isExpanded && notAcknowledged.length > 0 && (
              <div className="border-t border-border bg-secondary/30 px-4 py-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Pending ({notAcknowledged.length})
                </p>
                <div className="space-y-1.5">
                  {notAcknowledged.map(driver => (
                    <div key={driver.user_id} className="flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                      <span className="text-sm text-foreground">{driver.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isExpanded && notAcknowledged.length === 0 && (
              <div className="border-t border-border bg-status-complete/5 px-4 py-3">
                <p className="text-xs text-status-complete flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> All {drivers.length} drivers have acknowledged this document.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
