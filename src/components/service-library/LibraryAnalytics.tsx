import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, CheckCircle2, Bookmark, HelpCircle, BookOpen, Eye } from 'lucide-react';
import type { Service } from './ServiceLibraryTypes';

interface ResourceStat {
  id: string;
  title: string;
  completion_count: number;
  bookmark_count: number;
  view_count: number;
}

interface AnalyticsData {
  service_id: string;
  total_start_here: number;
  drivers_completed_all: number;
  resource_stats: ResourceStat[];
  open_help_requests: number;
  total_views: number;
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
        { data: views },
      ] = await Promise.all([
        supabase.from('service_resources').select('id, service_id, title, is_start_here').eq('is_visible', true),
        supabase.from('service_resource_completions').select('resource_id, user_id'),
        supabase.from('service_resource_bookmarks').select('resource_id'),
        supabase.from('service_help_requests').select('service_id, status'),
        supabase.from('service_resource_views').select('resource_id'),
      ]);

      // Build view count map
      const viewCountMap: Record<string, number> = {};
      (views ?? []).forEach((v: any) => {
        viewCountMap[v.resource_id] = (viewCountMap[v.resource_id] ?? 0) + 1;
      });

      const analytics: AnalyticsData[] = services.map(svc => {
        const svcResources = (resources ?? []).filter((r: any) => r.service_id === svc.id);
        const startHereResources = svcResources.filter((r: any) => r.is_start_here);

        const allUserIds = new Set((completions ?? []).map((c: any) => c.user_id));
        let driversCompletedAll = 0;
        allUserIds.forEach(uid => {
          const completedSet = new Set(
            (completions ?? []).filter((c: any) => c.user_id === uid).map((c: any) => c.resource_id)
          );
          if (startHereResources.every((r: any) => completedSet.has(r.id))) driversCompletedAll++;
        });

        const resource_stats: ResourceStat[] = svcResources.map((r: any) => ({
          id: r.id,
          title: r.title,
          completion_count: (completions ?? []).filter((c: any) => c.resource_id === r.id).length,
          bookmark_count: (bookmarks ?? []).filter((b: any) => b.resource_id === r.id).length,
          view_count: viewCountMap[r.id] ?? 0,
        })).sort((a, b) => b.view_count - a.view_count);

        const total_views = resource_stats.reduce((sum, r) => sum + r.view_count, 0);

        const open_help_requests = (helpRequests ?? []).filter(
          (h: any) => h.service_id === svc.id && h.status === 'Open'
        ).length;

        return {
          service_id: svc.id,
          total_start_here: startHereResources.length,
          drivers_completed_all: driversCompletedAll,
          resource_stats,
          open_help_requests,
          total_views,
        };
      });

      setData(analytics);
    } finally {
      setLoading(false);
    }
  }, [services]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  if (loading) {
    return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}</div>;
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

        // Top 5 by views for the Most Viewed table
        const topViewed = analytics.resource_stats.slice(0, 5);
        const maxViews = Math.max(1, ...topViewed.map(r => r.view_count));

        return (
          <div key={svc.id} className="p-4 rounded-xl border border-border bg-card space-y-4">
            {/* Service header */}
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

            {/* Stat tiles — now 4 columns */}
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center p-3 rounded-lg bg-muted/40">
                <div className="flex items-center justify-center text-status-complete mb-1">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <p className="text-lg font-bold text-foreground">{analytics.drivers_completed_all}</p>
                <p className="text-xs text-muted-foreground leading-tight">Completed all steps</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/40">
                <div className="flex items-center justify-center text-primary mb-1">
                  <Bookmark className="h-4 w-4" />
                </div>
                <p className="text-lg font-bold text-foreground">
                  {analytics.resource_stats.reduce((sum, r) => sum + r.bookmark_count, 0)}
                </p>
                <p className="text-xs text-muted-foreground leading-tight">Total bookmarks</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/40">
                <div className="flex items-center justify-center text-accent-foreground mb-1">
                  <Eye className="h-4 w-4 text-blue-500" />
                </div>
                <p className="text-lg font-bold text-foreground">{analytics.total_views}</p>
                <p className="text-xs text-muted-foreground leading-tight">Total views</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/40">
                <div className="flex items-center justify-center text-destructive mb-1">
                  <HelpCircle className="h-4 w-4" />
                </div>
                <p className="text-lg font-bold text-foreground">{analytics.open_help_requests}</p>
                <p className="text-xs text-muted-foreground leading-tight">Open help requests</p>
              </div>
            </div>

            {/* Most Viewed Resources table */}
            {topViewed.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Most Viewed Resources</p>
                </div>
                <div className="space-y-2">
                  {topViewed.map((r, idx) => (
                    <div key={r.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs text-muted-foreground/60 w-4 shrink-0 text-right">{idx + 1}</span>
                          <p className="text-foreground truncate">{r.title}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1 text-blue-500 font-medium">
                            <Eye className="h-3 w-3" />{r.view_count}
                          </span>
                          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-status-complete" />{r.completion_count}</span>
                          <span className="flex items-center gap-1"><Bookmark className="h-3 w-3 text-primary" />{r.bookmark_count}</span>
                        </div>
                      </div>
                      {/* View bar */}
                      <div className="ml-6 h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-500/60 transition-all"
                          style={{ width: `${Math.round((r.view_count / maxViews) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
