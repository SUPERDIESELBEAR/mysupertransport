import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Bookmark, ChevronRight, Star, BookOpen, CheckCircle2, Circle, Clock, AlertTriangle, X, History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import ResourceTypeBadge from './ResourceTypeBadge';
import ResourceViewer from './ResourceViewer';
import ServiceDetailPage from './ServiceDetailPage';
import type { Service, ServiceResource, ResourceType } from './ServiceLibraryTypes';
import { ALL_RESOURCE_TYPES } from './ServiceLibraryTypes';
import { differenceInDays, parseISO, formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

type LibraryView = 'home' | 'service' | 'resource' | 'bookmarks';

interface RecentView {
  resource: ServiceResource;
  service: Service | undefined;
  viewed_at: string;
}

export default function DriverServiceLibrary() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [view, setView] = useState<LibraryView>('home');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedResource, setSelectedResource] = useState<ServiceResource | null>(null);

  const [services, setServices] = useState<Service[]>([]);
  const [allResources, setAllResources] = useState<ServiceResource[]>([]);
  const [completions, setCompletions] = useState<Set<string>>(new Set());
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [recentViews, setRecentViews] = useState<RecentView[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ResourceType | 'All'>('All');

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [
        { data: svcs },
        { data: resources },
        { data: comps },
        { data: bmarks },
        { data: views },
      ] = await Promise.all([
        supabase.from('services').select('*').eq('is_visible', true).order('sort_order'),
        supabase.from('service_resources').select('*').eq('is_visible', true).order('sort_order'),
        supabase.from('service_resource_completions').select('resource_id').eq('user_id', user.id),
        supabase.from('service_resource_bookmarks').select('resource_id').eq('user_id', user.id),
        supabase.from('service_resource_views').select('resource_id, viewed_at').eq('user_id', user.id).order('viewed_at', { ascending: false }).limit(3),
      ]);

      const compSet = new Set((comps ?? []).map((c: any) => c.resource_id));
      const bmarkSet = new Set((bmarks ?? []).map((b: any) => b.resource_id));
      setCompletions(compSet);
      setBookmarks(bmarkSet);

      const enrichedResources: ServiceResource[] = (resources ?? []).map((r: any) => ({
        ...r,
        is_completed: compSet.has(r.id),
        is_bookmarked: bmarkSet.has(r.id),
      }));
      setAllResources(enrichedResources);

      // Enrich services with progress
      const enrichedServices: Service[] = (svcs ?? []).map((s: any) => {
        const svcResources = enrichedResources.filter(r => r.service_id === s.id);
        const startHere = svcResources.filter(r => r.is_start_here);
        const completedStartHere = startHere.filter(r => compSet.has(r.id));
        return {
          ...s,
          resources: svcResources,
          completion_count: completedStartHere.length,
          total_start_here: startHere.length,
        };
      });
      setServices(enrichedServices);

      // Build recent views list
      const recentViewsList: RecentView[] = (views ?? []).flatMap((v: any) => {
        const resource = enrichedResources.find(r => r.id === v.resource_id);
        if (!resource) return [];
        const service = enrichedServices.find(s => s.id === resource.service_id);
        return [{ resource, service, viewed_at: v.viewed_at }];
      });
      setRecentViews(recentViewsList);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Upsert a view record when a resource is opened
  const trackView = useCallback(async (resourceId: string) => {
    if (!user) return;
    await supabase
      .from('service_resource_views')
      .upsert({ user_id: user.id, resource_id: resourceId, viewed_at: new Date().toISOString() }, { onConflict: 'user_id,resource_id' });
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCompletion = (resourceId: string, completed: boolean) => {
    setCompletions(prev => {
      const next = new Set(prev);
      completed ? next.add(resourceId) : next.delete(resourceId);
      return next;
    });
    setAllResources(prev => prev.map(r => r.id === resourceId ? { ...r, is_completed: completed } : r));
    setServices(prev => prev.map(s => {
      const svcResources = (s.resources ?? []).map(r => r.id === resourceId ? { ...r, is_completed: completed } : r);
      const startHere = svcResources.filter(r => r.is_start_here);
      const completedSH = startHere.filter(r => completions.has(r.id) || (r.id === resourceId && completed));
      return { ...s, resources: svcResources, completion_count: completedSH.length, total_start_here: startHere.length };
    }));
    // Also update selectedService resources if open
    if (selectedService) {
      setSelectedService(prev => {
        if (!prev) return prev;
        const resources = (prev.resources ?? []).map(r => r.id === resourceId ? { ...r, is_completed: completed } : r);
        const startHere = resources.filter(r => r.is_start_here);
        const completedSH = startHere.filter(r => r.is_completed);
        return { ...prev, resources, completion_count: completedSH.length, total_start_here: startHere.length };
      });
    }
  };

  const handleBookmark = (resourceId: string, bookmarked: boolean) => {
    setBookmarks(prev => {
      const next = new Set(prev);
      bookmarked ? next.add(resourceId) : next.delete(resourceId);
      return next;
    });
    setAllResources(prev => prev.map(r => r.id === resourceId ? { ...r, is_bookmarked: bookmarked } : r));
    if (selectedService) {
      setSelectedService(prev => prev ? {
        ...prev,
        resources: (prev.resources ?? []).map(r => r.id === resourceId ? { ...r, is_bookmarked: bookmarked } : r),
      } : prev);
    }
  };

  // Global search filtering
  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const filtered: { service: Service; resource: ServiceResource }[] = [];
    services.forEach(svc => {
      (svc.resources ?? allResources.filter(r => r.service_id === svc.id)).forEach(r => {
        if (typeFilter !== 'All' && r.resource_type !== typeFilter) return;
        if (
          svc.name.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          (r.description ?? '').toLowerCase().includes(q) ||
          (r.body ?? '').toLowerCase().includes(q)
        ) {
          filtered.push({ service: svc, resource: r });
        }
      });
    });
    return filtered;
  }, [search, services, allResources, typeFilter]);

  const bookmarkedResources = useMemo(() => {
    return allResources.filter(r => r.is_bookmarked);
  }, [allResources]);

  const essentialServices = services.filter(s => s.is_new_driver_essential);

  const openResource = useCallback((res: ServiceResource, svc: Service | null) => {
    setSelectedResource(res);
    setSelectedService(svc);
    setView('resource');
    trackView(res.id);
    // Optimistically update recent views list
    setRecentViews(prev => {
      const filtered = prev.filter(v => v.resource.id !== res.id);
      const service = svc ?? services.find(s => s.id === res.service_id);
      return [{ resource: res, service, viewed_at: new Date().toISOString() }, ...filtered].slice(0, 3);
    });
  }, [trackView, services]);

  if (view === 'resource' && selectedResource && selectedService) {
    return (
      <ResourceViewer
        resource={{ ...selectedResource, is_completed: completions.has(selectedResource.id), is_bookmarked: bookmarks.has(selectedResource.id) }}
        service={selectedService}
        onBack={() => setView('service')}
        onCompletion={handleCompletion}
        onBookmark={handleBookmark}
      />
    );
  }

  if (view === 'service' && selectedService) {
    const enriched = {
      ...selectedService,
      resources: (selectedService.resources ?? []).map(r => ({
        ...r,
        is_completed: completions.has(r.id),
        is_bookmarked: bookmarks.has(r.id),
      })),
    };
    return (
      <ServiceDetailPage
        service={enriched}
        onBack={() => { setView('home'); setSelectedService(null); }}
        onOpenResource={res => openResource(res, selectedService)}
        onCompletion={handleCompletion}
        onBookmark={handleBookmark}
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Service Library</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Setup guides, tutorials, and support for every tool you use.</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setView('home')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            view !== 'bookmarks'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          <BookOpen className="h-4 w-4" />
          Browse Library
        </button>
        <button
          onClick={() => setView('bookmarks')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            view === 'bookmarks'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          <Bookmark className="h-4 w-4" />
          My Bookmarks
          {bookmarkedResources.length > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary">
              {bookmarkedResources.length}
            </span>
          )}
        </button>
      </div>

      {/* Bookmarks tab content */}
      {view === 'bookmarks' && (
        <div className="space-y-4">
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : bookmarkedResources.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                <Bookmark className="h-7 w-7 opacity-40" />
              </div>
              <p className="font-medium text-foreground mb-1">No bookmarks yet</p>
              <p className="text-sm">Tap the bookmark icon on any resource to save it here for quick access.</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{bookmarkedResources.length} saved resource{bookmarkedResources.length !== 1 ? 's' : ''}</p>
              {/* Group by service */}
              {(() => {
                const grouped: Record<string, { svc: Service | undefined; resources: ServiceResource[] }> = {};
                bookmarkedResources.forEach(r => {
                  const svc = services.find(s => s.id === r.service_id);
                  const key = r.service_id;
                  if (!grouped[key]) grouped[key] = { svc, resources: [] };
                  grouped[key].resources.push(r);
                });
                return Object.entries(grouped).map(([, { svc, resources }]) => (
                  <div key={svc?.id ?? 'unknown'} className="space-y-2">
                    <div className="flex items-center gap-2 py-1">
                      {svc?.logo_url ? (
                        <img src={svc.logo_url} alt="" className="h-5 w-5 rounded object-contain" />
                      ) : (
                        <BookOpen className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-sm font-semibold text-foreground">{svc?.name ?? 'Unknown Service'}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{resources.length} saved</span>
                    </div>
                    {resources.map(r => (
                      <ResourceCard
                        key={r.id}
                        resource={{ ...r, is_bookmarked: true, is_completed: completions.has(r.id) }}
                        service={svc}
                        onClick={() => {
                          setSelectedResource(r);
                          setSelectedService(svc ?? null);
                          setView('resource');
                        }}
                      />
                    ))}
                  </div>
                ));
              })()}
            </>
          )}
        </div>
      )}

      {view !== 'bookmarks' && (
        <>
          {/* Search + type filter */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search services, guides, tutorials…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-9"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {(['All', ...ALL_RESOURCE_TYPES] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    typeFilter === t
                      ? 'bg-foreground text-background border-foreground'
                      : 'bg-background text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {/* Search results */}
          {searchResults !== null && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{search}"
              </h2>
              {searchResults.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>No results found for "{search}".</p>
                </div>
              ) : (
                // Group by service
                (() => {
                  const grouped: Record<string, { service: Service; resources: ServiceResource[] }> = {};
                  searchResults.forEach(({ service, resource }) => {
                    if (!grouped[service.id]) grouped[service.id] = { service, resources: [] };
                    grouped[service.id].resources.push(resource);
                  });
                  return Object.values(grouped).map(({ service, resources }) => (
                    <div key={service.id} className="space-y-2">
                      <div className="flex items-center gap-2">
                        {service.logo_url && (
                          <img src={service.logo_url} alt="" className="h-5 w-5 rounded object-contain" />
                        )}
                        <p className="text-sm font-semibold text-foreground">{service.name}</p>
                      </div>
                      {resources.map(r => (
                        <ResourceCard
                          key={r.id}
                          resource={{ ...r, is_completed: completions.has(r.id), is_bookmarked: bookmarks.has(r.id) }}
                          service={service}
                          onClick={() => {
                            setSelectedResource(r);
                            setSelectedService(service);
                            setView('resource');
                          }}
                        />
                      ))}
                    </div>
                  ));
                })()
              )}
            </div>
          )}

          {searchResults === null && (
            <>
              {/* New Driver Essentials */}
              {!loading && essentialServices.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-primary fill-primary" />
                    <h2 className="text-base font-semibold text-foreground">New Driver Essentials</h2>
                  </div>
                  <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
                    {essentialServices.map(svc => (
                      <EssentialServiceCard
                        key={svc.id}
                        service={svc}
                        onClick={() => { setSelectedService(svc); setView('service'); }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* All Services */}
              <div className="space-y-3">
                <h2 className="text-base font-semibold text-foreground">All Services</h2>
                {loading ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="h-28 rounded-xl" />
                    ))}
                  </div>
                ) : services.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p>No services available yet. Check back soon.</p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {services.map(svc => (
                      <ServiceCard
                        key={svc.id}
                        service={svc}
                        onClick={() => { setSelectedService(svc); setView('service'); }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ServiceCard({ service, onClick }: { service: Service; onClick: () => void }) {
  const total = service.total_start_here ?? 0;
  const completed = service.completion_count ?? 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : null;

  return (
    <button
      onClick={onClick}
      className="text-left p-4 rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start gap-3">
        {service.logo_url ? (
          <img src={service.logo_url} alt={service.name} className="h-10 w-10 rounded-lg object-contain bg-muted shrink-0" />
        ) : (
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <BookOpen className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-sm leading-tight truncate">{service.name}</p>
          {service.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{service.description}</p>
          )}
          {pct !== null && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">{completed} of {total} steps complete</span>
                {pct === 100 && <CheckCircle2 className="h-3 w-3 text-status-complete" />}
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-status-complete transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0 mt-0.5" />
      </div>
    </button>
  );
}

function EssentialServiceCard({ service, onClick }: { service: Service; onClick: () => void }) {
  const total = service.total_start_here ?? 0;
  const completed = service.completion_count ?? 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : null;

  return (
    <button
      onClick={onClick}
      className="shrink-0 w-48 text-left p-4 rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-sm transition-all"
    >
      {service.logo_url ? (
        <img src={service.logo_url} alt={service.name} className="h-12 w-12 rounded-xl object-contain bg-muted mb-3" />
      ) : (
        <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-3">
          <Star className="h-6 w-6 text-primary" />
        </div>
      )}
      <p className="font-semibold text-foreground text-sm leading-tight">{service.name}</p>
      {pct !== null && (
        <div className="mt-2 space-y-1">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-status-complete transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground">{completed}/{total} steps</p>
        </div>
      )}
    </button>
  );
}

function ResourceCard({ resource, service, onClick }: { resource: ServiceResource; service?: Service; onClick: () => void }) {
  const isOutdated = resource.last_verified_at
    ? differenceInDays(new Date(), parseISO(resource.last_verified_at)) > 90
    : false;

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3.5 rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <ResourceTypeBadge type={resource.resource_type} />
            {resource.is_start_here && (
              <Badge className="text-xs border bg-primary/10 text-primary border-primary/30 font-medium">⭐ Start Here</Badge>
            )}
            {isOutdated && (
              <Badge className="text-xs border bg-warning/10 text-warning border-warning/30 font-medium gap-1">
                <AlertTriangle className="h-2.5 w-2.5" /> May be outdated
              </Badge>
            )}
          </div>
          <p className="font-medium text-foreground text-sm">{resource.title}</p>
          {resource.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{resource.description}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
            {resource.estimated_minutes && (
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{resource.estimated_minutes} min</span>
            )}
            {service && <span>{service.name}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {resource.is_bookmarked && <Bookmark className="h-3.5 w-3.5 text-primary fill-primary" />}
          {resource.is_completed
            ? <CheckCircle2 className="h-4 w-4 text-status-complete" />
            : <Circle className="h-4 w-4 text-muted-foreground/40" />
          }
        </div>
      </div>
    </button>
  );
}
