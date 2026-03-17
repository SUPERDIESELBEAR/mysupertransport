import { useState, useMemo } from 'react';
import { ArrowLeft, Phone, Mail, MessageSquare, Clock, CheckCircle2, Circle,
  BookmarkCheck, Bookmark, AlertTriangle, ExternalLink, ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import ResourceTypeBadge from './ResourceTypeBadge';
import HelpRequestModal from './HelpRequestModal';
import type { Service, ServiceResource, ResourceType } from './ServiceLibraryTypes';
import { ALL_RESOURCE_TYPES } from './ServiceLibraryTypes';
import { differenceInDays, parseISO } from 'date-fns';
import { getYouTubeVideoId } from '@/components/documents/DocumentHubTypes';

interface ServiceDetailPageProps {
  service: Service;
  onBack: () => void;
  onOpenResource: (resource: ServiceResource) => void;
  onCompletion: (resourceId: string, completed: boolean) => void;
  onBookmark: (resourceId: string, bookmarked: boolean) => void;
}

export default function ServiceDetailPage({
  service, onBack, onOpenResource, onCompletion, onBookmark,
}: ServiceDetailPageProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [helpOpen, setHelpOpen] = useState(false);
  const [checklistExpanded, setChecklistExpanded] = useState(true);

  const resources = service.resources ?? [];
  const startHereItems = resources.filter(r => r.is_start_here);
  const completedCount = startHereItems.filter(r => r.is_completed).length;
  const totalCount = startHereItems.length;
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const resourcesByType = useMemo(() => {
    const byType: Partial<Record<ResourceType, ServiceResource[]>> = {};
    resources.filter(r => !r.is_start_here).forEach(r => {
      if (!byType[r.resource_type]) byType[r.resource_type] = [];
      byType[r.resource_type]!.push(r);
    });
    return byType;
  }, [resources]);

  const handleToggleComplete = async (resource: ServiceResource) => {
    if (!user) return;
    try {
      if (resource.is_completed) {
        await supabase.from('service_resource_completions')
          .delete()
          .eq('resource_id', resource.id)
          .eq('user_id', user.id);
        onCompletion(resource.id, false);
      } else {
        await supabase.from('service_resource_completions').insert({
          resource_id: resource.id, user_id: user.id,
        });
        onCompletion(resource.id, true);
      }
    } catch {
      toast({ title: 'Error', description: 'Could not update completion.', variant: 'destructive' });
    }
  };

  const handleToggleBookmark = async (resource: ServiceResource) => {
    if (!user) return;
    try {
      if (resource.is_bookmarked) {
        await supabase.from('service_resource_bookmarks')
          .delete()
          .eq('resource_id', resource.id)
          .eq('user_id', user.id);
        onBookmark(resource.id, false);
      } else {
        await supabase.from('service_resource_bookmarks').insert({
          resource_id: resource.id, user_id: user.id,
        });
        onBookmark(resource.id, true);
      }
    } catch {
      toast({ title: 'Error', description: 'Could not update bookmark.', variant: 'destructive' });
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <HelpRequestModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        serviceId={service.id}
        serviceName={service.name}
      />

      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Service Library
      </button>

      {/* Service header */}
      <div className="flex items-start gap-4">
        {service.logo_url ? (
          <img src={service.logo_url} alt={service.name} className="h-16 w-16 rounded-2xl object-contain bg-muted border border-border shrink-0" />
        ) : (
          <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center shrink-0 border border-border">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-foreground">{service.name}</h1>
          {service.description && (
            <p className="text-muted-foreground mt-1 leading-relaxed">{service.description}</p>
          )}
        </div>
      </div>

      {/* Support Contact Card */}
      {(service.support_phone || service.support_email || service.support_chat_url || service.support_hours) && (
        <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
          <h3 className="font-semibold text-foreground text-sm">Support Contact</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {service.support_phone && (
              <a href={`tel:${service.support_phone}`} className="flex items-center gap-2.5 text-sm text-foreground hover:text-primary transition-colors group">
                <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
                </div>
                {service.support_phone}
              </a>
            )}
            {service.support_email && (
              <a href={`mailto:${service.support_email}`} className="flex items-center gap-2.5 text-sm text-foreground hover:text-primary transition-colors group">
                <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
                </div>
                {service.support_email}
              </a>
            )}
            {service.support_chat_url && (
              <a href={service.support_chat_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 text-sm text-foreground hover:text-primary transition-colors group">
                <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
                </div>
                Live Chat
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </a>
            )}
            {service.support_hours && (
              <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Clock className="h-3.5 w-3.5" />
                </div>
                {service.support_hours}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Known Issues */}
      {service.known_issues_notes && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-warning mb-1">Tips & Known Issues</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{service.known_issues_notes}</p>
            </div>
          </div>
        </div>
      )}

      {/* Getting Started Checklist */}
      {startHereItems.length > 0 && (
        <div className={`rounded-xl border-2 p-4 space-y-3 transition-colors ${pct === 100 ? 'border-status-complete/40 bg-status-complete/5' : 'border-primary/30 bg-primary/5'}`}>
          <button
            className="w-full flex items-center justify-between gap-3"
            onClick={() => setChecklistExpanded(v => !v)}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${pct === 100 ? 'bg-status-complete/20' : 'bg-primary/15'}`}>
                {pct === 100
                  ? <CheckCircle2 className="h-4 w-4 text-status-complete" />
                  : <span className="text-xs font-bold text-primary">{pct}%</span>
                }
              </div>
              <div className="text-left min-w-0">
                <p className={`font-semibold text-sm ${pct === 100 ? 'text-status-complete' : 'text-foreground'}`}>
                  Getting Started Checklist
                </p>
                <p className="text-xs text-muted-foreground">{completedCount} of {totalCount} steps complete</p>
              </div>
            </div>
            {checklistExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
          </button>

          {/* Progress bar */}
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? 'bg-status-complete' : 'bg-primary'}`}
              style={{ width: `${pct}%` }}
            />
          </div>

          {checklistExpanded && (
            <div className="space-y-2 pt-1">
              {startHereItems.map(r => (
                <div key={r.id} className="flex items-center gap-3 group">
                  <button
                    onClick={() => handleToggleComplete(r)}
                    className="shrink-0 transition-colors"
                  >
                    {r.is_completed
                      ? <CheckCircle2 className="h-5 w-5 text-status-complete" />
                      : <Circle className="h-5 w-5 text-muted-foreground/50 group-hover:text-primary" />
                    }
                  </button>
                  <button
                    onClick={() => onOpenResource(r)}
                    className={`flex-1 text-left text-sm transition-colors hover:text-primary ${r.is_completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                  >
                    {r.title}
                  </button>
                  {r.estimated_minutes && (
                    <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                      <Clock className="h-3 w-3" />{r.estimated_minutes}m
                    </span>
                  )}
                  <button
                    onClick={() => handleToggleBookmark(r)}
                    className="shrink-0 text-muted-foreground/40 hover:text-primary transition-colors"
                  >
                    {r.is_bookmarked
                      ? <Bookmark className="h-3.5 w-3.5 text-primary fill-primary" />
                      : <Bookmark className="h-3.5 w-3.5" />
                    }
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Resources by type */}
      {(ALL_RESOURCE_TYPES as ResourceType[]).map(type => {
        const typeResources = resourcesByType[type];
        if (!typeResources || typeResources.length === 0) return null;
        return (
          <div key={type} className="space-y-2">
            <h3 className="font-semibold text-foreground text-sm">{type}</h3>
            {typeResources.map(r => (
              <ResourceRow
                key={r.id}
                resource={r}
                onClick={() => onOpenResource(r)}
                onToggleComplete={() => handleToggleComplete(r)}
                onToggleBookmark={() => handleToggleBookmark(r)}
              />
            ))}
          </div>
        );
      })}

      {resources.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No resources added to this service yet.</p>
        </div>
      )}
    </div>
  );
}

function ResourceRow({ resource, onClick, onToggleComplete, onToggleBookmark }: {
  resource: ServiceResource;
  onClick: () => void;
  onToggleComplete: () => void;
  onToggleBookmark: () => void;
}) {
  const isOutdated = resource.last_verified_at
    ? differenceInDays(new Date(), parseISO(resource.last_verified_at)) > 90
    : false;

  const isTutorialVideo = resource.resource_type === 'Tutorial Video';
  const ytId = isTutorialVideo && resource.url ? getYouTubeVideoId(resource.url) : null;
  const thumbUrl = ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:border-primary/30 transition-all group">
      <button onClick={onToggleComplete} className="shrink-0">
        {resource.is_completed
          ? <CheckCircle2 className="h-5 w-5 text-status-complete" />
          : <Circle className="h-5 w-5 text-muted-foreground/40 group-hover:text-muted-foreground" />
        }
      </button>
      {thumbUrl && (
        <button onClick={onClick} className="shrink-0 relative rounded-lg overflow-hidden w-16 h-10 bg-muted">
          <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-colors">
            <div className="w-5 h-5 rounded-full bg-white/90 flex items-center justify-center">
              <svg className="w-2.5 h-2.5 text-foreground fill-current ml-0.5" viewBox="0 0 8 10"><path d="M0 0l8 5-8 5V0z" /></svg>
            </div>
          </div>
        </button>
      )}
      <button onClick={onClick} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          {resource.is_start_here && (
            <Badge className="text-xs border bg-primary/10 text-primary border-primary/30 font-medium">⭐</Badge>
          )}
          {isOutdated && (
            <Badge className="text-xs border bg-warning/10 text-warning border-warning/30 font-medium gap-1">
              <AlertTriangle className="h-2.5 w-2.5" /> Outdated
            </Badge>
          )}
          <p className={`text-sm font-medium ${resource.is_completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
            {resource.title}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {resource.estimated_minutes && (
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{resource.estimated_minutes} min</span>
          )}
        </div>
      </button>
      <button onClick={onToggleBookmark} className="shrink-0 text-muted-foreground/40 hover:text-primary transition-colors">
        {resource.is_bookmarked
          ? <Bookmark className="h-4 w-4 text-primary fill-primary" />
          : <Bookmark className="h-4 w-4" />
        }
      </button>
    </div>
  );
}
