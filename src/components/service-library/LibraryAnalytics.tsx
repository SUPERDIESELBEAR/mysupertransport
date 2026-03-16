import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, CheckCircle2, Bookmark, HelpCircle, BookOpen } from 'lucide-react';
import type { Service } from './ServiceLibraryTypes';

interface AnalyticsData {
  service_id: string;
  total_start_here: number;
  drivers_completed_all: number;
  resource_stats: { id: string; title: string; completion_count: number; bookmark_count: number }[];
  open_help_requests: number;
}

export default function LibraryAnalytics({ services }: { services: Service[] }) {
  const [data, setData] = useState<AnalyticsData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const [
        { data: resources },
        { data: completions },
        { data: bookmarks },
        { data: helpRequests },
      ] = await Promise.all([
        supabase.from('service_resources').select('id, service_id, title, is_start_here').eq('is_visible', true),
        supabase.from('service_resource_completions').select('resource_id, user_id'),
        supabase.from('service_resource_bookmarks').select('resource_id'),
        supabase.from('service_help_requests').select('service_id, status'),
      ]);

      const analytics: AnalyticsData[] = services.map(svc => {
        const svcResources = (resources ?? []).filter((r: any) => r.service_id === svc.id);
        const startHereResources = svcResources.filter((r: any) => r.is_start_here);

        // Count drivers who completed all start-here items
        const allUserIds = new Set((completions ?? []).map((c: any) => c.user_id));
        let driversCompletedAll = 0;
        allUserIds.forEach(uid => {
          const completedSet = new Set(
            (completions ?? []).filter((c: any) => c.user_id === uid).map((c: any) => c.resource_id)
          );
          if (startHereResources.every((r: any) => completedSet.has(r.id))) driversCompletedAll++;
        });

        const resource_stats = svcResources.map((r: any) => ({
          id: r.id,
          title: r.title,
          completion_count: (completions ?? []).filter((c: any) => c.resource_id === r.id).length,
          bookmark_count: (bookmarks ?? []).filter((b: any) => b.resource_id === r.id).length,
        })).sort((a, b) => b.completion_count - a.completion_count);

        const open_help_requests = (helpRequests ?? []).filter(
          (h: any) => h.service_id === svc.id && h.status === 'Open'
        ).length;

        return {
          service_id: svc.id,
          total_start_here: startHereResources.length,
          drivers_completed_all: driversCompletedAll,
          resource_stats,
          open_help_requests,
        };
      });

      setData(analytics);
    } finally {
      setLoading(false);
    }
  }, [services]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  if (loading) {
    return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>;
  }

  if (services.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p>No services to analyze yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Per-service engagement metrics across all drivers.</p>
      {services.map(svc => {
        const analytics = data.find(d => d.service_id === svc.id);
        if (!analytics) return null;
        const topResources = analytics.resource_stats.slice(0, 3);

        return (
          <div key={svc.id} className="p-4 rounded-xl border border-border bg-card space-y-3">
            <div className="flex items-center gap-3">
              {svc.logo_url ? (
                <img src={svc.logo_url} alt="" className="h-8 w-8 rounded-lg object-contain bg-muted shrink-0" />
              ) : (
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <p className="font-semibold text-foreground text-sm">{svc.name}</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-lg bg-muted/40">
                <div className="flex items-center justify-center gap-1.5 text-status-complete mb-1">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <p className="text-lg font-bold text-foreground">{analytics.drivers_completed_all}</p>
                <p className="text-xs text-muted-foreground">Completed all steps</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/40">
                <div className="flex items-center justify-center gap-1.5 text-primary mb-1">
                  <Bookmark className="h-4 w-4" />
                </div>
                <p className="text-lg font-bold text-foreground">
                  {analytics.resource_stats.reduce((sum, r) => sum + r.bookmark_count, 0)}
                </p>
                <p className="text-xs text-muted-foreground">Total bookmarks</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/40">
                <div className="flex items-center justify-center gap-1.5 text-destructive mb-1">
                  <HelpCircle className="h-4 w-4" />
                </div>
                <p className="text-lg font-bold text-foreground">{analytics.open_help_requests}</p>
                <p className="text-xs text-muted-foreground">Open help requests</p>
              </div>
            </div>

            {topResources.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Top Resources</p>
                {topResources.map(r => (
                  <div key={r.id} className="flex items-center justify-between gap-3 text-sm">
                    <p className="text-foreground truncate flex-1">{r.title}</p>
                    <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />{r.completion_count}</span>
                      <span className="flex items-center gap-1"><Bookmark className="h-3 w-3" />{r.bookmark_count}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
