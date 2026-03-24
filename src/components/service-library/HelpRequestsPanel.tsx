import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useDemoMode } from '@/hooks/useDemoMode';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { ServiceHelpRequest, HelpRequestStatus } from './ServiceLibraryTypes';
import { HelpCircle, MessageSquare, Clock } from 'lucide-react';

const STATUS_COLORS: Record<HelpRequestStatus, string> = {
  Open: 'bg-destructive/10 text-destructive border-destructive/30',
  'In Progress': 'bg-status-progress/10 text-status-progress border-status-progress/30',
  Resolved: 'bg-status-complete/10 text-status-complete border-status-complete/30',
};

export default function HelpRequestsPanel() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<ServiceHelpRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<HelpRequestStatus | 'All'>('All');

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('service_help_requests')
      .select(`
        *,
        services(name),
        service_resources(title)
      `)
      .order('created_at', { ascending: false });

    if (data) {
      const enriched: ServiceHelpRequest[] = await Promise.all(
        data.map(async (r: any) => {
          // Get driver profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('user_id', r.user_id)
            .maybeSingle();
          return {
            ...r,
            service_name: r.services?.name ?? '—',
            resource_title: r.service_resources?.title ?? null,
            driver_name: profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'Unknown' : 'Unknown',
          };
        })
      );
      setRequests(enriched);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleStatusChange = async (requestId: string, status: HelpRequestStatus) => {
    const req = requests.find(r => r.id === requestId);
    const { error } = await supabase
      .from('service_help_requests')
      .update({ status })
      .eq('id', requestId);
    if (error) { toast({ title: 'Error', variant: 'destructive' }); return; }

    setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status } : r));

    // Notify the driver
    if (req) {
      await supabase.from('notifications').insert({
        user_id: req.user_id,
        title: `Help request ${status.toLowerCase()} — ${req.service_name}`,
        body: status === 'Resolved'
          ? `Your help request for ${req.service_name} has been resolved.`
          : `Your help request for ${req.service_name} is now in progress.`,
        type: 'service_help_update',
        channel: 'in_app',
        link: '/operator?tab=service-library',
      });
    }

    toast({ title: `Status updated to ${status}` });
  };

  const filtered = statusFilter === 'All' ? requests : requests.filter(r => r.status === statusFilter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          {(['All', 'Open', 'In Progress', 'Resolved'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                statusFilter === s
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-background text-muted-foreground border-border hover:border-foreground/40'
              }`}
            >
              {s}
              {s === 'Open' && requests.filter(r => r.status === 'Open').length > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-4 px-1 rounded-full bg-destructive text-white text-[9px] font-bold items-center justify-center">
                  {requests.filter(r => r.status === 'Open').length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <HelpCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No {statusFilter !== 'All' ? statusFilter.toLowerCase() + ' ' : ''}help requests.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(req => (
            <div key={req.id} className="p-4 rounded-xl border border-border bg-card space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge className={`text-xs border font-medium ${STATUS_COLORS[req.status]}`}>
                      {req.status}
                    </Badge>
                    <span className="text-sm font-semibold text-foreground">{req.service_name}</span>
                    {req.resource_title && (
                      <span className="text-xs text-muted-foreground">· {req.resource_title}</span>
                    )}
                  </div>
                  <p className="text-sm text-foreground font-medium">{req.driver_name}</p>
                  {req.message && (
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">"{req.message}"</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                    <Clock className="h-3 w-3" />
                    {new Date(req.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Select
                  value={req.status}
                  onValueChange={v => handleStatusChange(req.id, v as HelpRequestStatus)}
                >
                  <SelectTrigger className="w-40 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Open">Open</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
