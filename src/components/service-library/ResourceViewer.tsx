import { useState } from 'react';
import { ArrowLeft, Clock, Bookmark, BookmarkCheck, CheckCircle2,
  Circle, ExternalLink, AlertTriangle,
  FileText, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import ResourceTypeBadge from './ResourceTypeBadge';
import HelpRequestModal from './HelpRequestModal';
import type { Service, ServiceResource } from './ServiceLibraryTypes';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { differenceInDays, parseISO } from 'date-fns';
import { parseVideoEmbedUrl } from '@/components/documents/DocumentHubTypes';
import { FilePreviewModal } from '@/components/inspection/DocRow';

interface ResourceViewerProps {
  resource: ServiceResource;
  service: Service;
  onBack: () => void;
  onCompletion: (resourceId: string, completed: boolean) => void;
  onBookmark: (resourceId: string, bookmarked: boolean) => void;
}

export default function ResourceViewer({ resource, service, onBack, onCompletion, onBookmark }: ResourceViewerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [completingToggle, setCompletingToggle] = useState(false);
  const [bookmarkToggle, setBookmarkToggle] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [externalLinkOpen, setExternalLinkOpen] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);

  const isOutdated = resource.last_verified_at
    ? differenceInDays(new Date(), parseISO(resource.last_verified_at)) > 90
    : false;

  const handleToggleComplete = async () => {
    if (!user) return;
    setCompletingToggle(true);
    try {
      if (resource.is_completed) {
        await supabase.from('service_resource_completions')
          .delete()
          .eq('resource_id', resource.id)
          .eq('user_id', user.id);
        onCompletion(resource.id, false);
        toast({ title: 'Marked as not complete' });
      } else {
        await supabase.from('service_resource_completions').insert({
          resource_id: resource.id,
          user_id: user.id,
        });
        onCompletion(resource.id, true);
        toast({ title: 'Marked as complete ✓' });
      }
    } catch {
      toast({ title: 'Error', description: 'Could not update completion.', variant: 'destructive' });
    } finally {
      setCompletingToggle(false);
    }
  };

  const handleToggleBookmark = async () => {
    if (!user) return;
    setBookmarkToggle(true);
    try {
      if (resource.is_bookmarked) {
        await supabase.from('service_resource_bookmarks')
          .delete()
          .eq('resource_id', resource.id)
          .eq('user_id', user.id);
        onBookmark(resource.id, false);
        toast({ title: 'Bookmark removed' });
      } else {
        await supabase.from('service_resource_bookmarks').insert({
          resource_id: resource.id,
          user_id: user.id,
        });
        onBookmark(resource.id, true);
        toast({ title: 'Bookmarked ✓' });
      }
    } catch {
      toast({ title: 'Error', description: 'Could not update bookmark.', variant: 'destructive' });
    } finally {
      setBookmarkToggle(false);
    }
  };

  const handleExternalLink = (url: string) => {
    setPendingUrl(url);
    setExternalLinkOpen(true);
  };

  const renderContent = () => {
    const { resource_type, url, body } = resource;

    if (resource_type === 'Tutorial Video' && url) {
      const embedUrl = parseVideoEmbedUrl(url);
      if (embedUrl) {
        return (
          <div className="rounded-xl overflow-hidden border border-border aspect-video w-full">
            <iframe
              src={embedUrl}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
              title={resource.title}
            />
          </div>
        );
      }
    }

    if (resource_type === 'External Link' && url) {
      return (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="h-16 w-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
            <ExternalLink className="h-8 w-8 text-emerald-600" />
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Opens in a new tab</p>
            <p className="text-muted-foreground text-sm max-w-sm">{url}</p>
          </div>
          <Button onClick={() => handleExternalLink(url)} className="gap-2">
            <ExternalLink className="h-4 w-4" />
            Open Link
          </Button>
          {body && (
            <div
              className="mt-6 text-left prose prose-sm max-w-none text-foreground
                prose-headings:font-bold prose-headings:text-foreground
                prose-p:text-foreground prose-p:leading-relaxed
                prose-li:text-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
              dangerouslySetInnerHTML={{ __html: body }}
            />
          )}
        </div>
      );
    }

    if (resource_type === 'PDF' && url) {
      return (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">{resource.title}</p>
            <p className="text-muted-foreground text-sm">PDF Document</p>
          </div>
          <Button onClick={() => setPdfPreviewOpen(true)} className="gap-2">
            <FileText className="h-4 w-4" />
            View PDF
          </Button>
          {pdfPreviewOpen && (
            <FilePreviewModal url={url} name={resource.title} onClose={() => setPdfPreviewOpen(false)} />
          )}
        </div>
      );
    }

    if (body) {
      return (
        <div
          className="prose prose-sm max-w-none text-foreground
            prose-headings:font-bold prose-headings:text-foreground
            prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
            prose-p:text-foreground prose-p:leading-relaxed
            prose-li:text-foreground prose-li:leading-relaxed
            prose-blockquote:border-l-4 prose-blockquote:border-primary/40 prose-blockquote:text-muted-foreground prose-blockquote:pl-4 prose-blockquote:italic
            prose-hr:border-border
            prose-strong:text-foreground prose-strong:font-semibold
            [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
          dangerouslySetInnerHTML={{ __html: body }}
        />
      );
    }

    return (
      <div className="py-12 text-center text-muted-foreground">
        <HelpCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p>No content has been added to this resource yet.</p>
      </div>
    );
  };

  return (
    <div className="animate-fade-in">
      <HelpRequestModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        serviceId={service.id}
        serviceName={service.name}
        resourceId={resource.id}
        resourceTitle={resource.title}
      />
      <AlertDialog open={externalLinkOpen} onOpenChange={setExternalLinkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Opening external link</AlertDialogTitle>
            <AlertDialogDescription>
              This will open <span className="font-medium text-foreground break-all">{pendingUrl}</span> in a new browser tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (pendingUrl) window.open(pendingUrl, '_blank'); setExternalLinkOpen(false); }}>
              Open Link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {service.name}
      </button>

      <div className="max-w-3xl mx-auto space-y-6">
        {/* Outdated warning */}
        {isOutdated && (
          <div className="flex items-start gap-3 bg-warning/10 border border-warning/30 rounded-xl px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <p className="text-sm text-warning leading-relaxed">
              <span className="font-semibold">Link may be outdated.</span> This resource hasn't been verified in over 90 days. Please let your coordinator know if information is incorrect.
            </p>
          </div>
        )}

        {/* Header */}
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <ResourceTypeBadge type={resource.resource_type} />
            {resource.is_start_here && (
              <Badge className="text-xs border bg-primary/10 text-primary border-primary/30 font-medium gap-1">
                ⭐ Start Here
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">{resource.title}</h1>
          {resource.description && (
            <p className="text-muted-foreground text-base leading-relaxed mb-3">{resource.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {resource.estimated_minutes && (
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                ~{resource.estimated_minutes} min
              </span>
            )}
            {resource.last_verified_at && (
              <span>Verified {new Date(resource.last_verified_at).toLocaleDateString()}</span>
            )}
          </div>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={resource.is_completed ? 'default' : 'outline'}
            size="sm"
            onClick={handleToggleComplete}
            disabled={completingToggle}
            className="gap-2"
          >
            {resource.is_completed
              ? <><CheckCircle2 className="h-4 w-4" /> Completed</>
              : <><Circle className="h-4 w-4" /> Mark Complete</>
            }
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleBookmark}
            disabled={bookmarkToggle}
            className="gap-2"
          >
            {resource.is_bookmarked
              ? <><BookmarkCheck className="h-4 w-4" /> Bookmarked</>
              : <><Bookmark className="h-4 w-4" /> Bookmark</>
            }
          </Button>
        </div>

        <hr className="border-border" />

        {/* Content */}
        {renderContent()}

        {/* Help button */}
        <div className="pt-8 border-t border-border">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-muted/40 border border-border">
            <div>
              <p className="font-medium text-foreground text-sm">Having trouble with this?</p>
              <p className="text-xs text-muted-foreground mt-0.5">Let your coordinator know and they'll follow up.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)} className="gap-2 shrink-0">
              <HelpCircle className="h-4 w-4" />
              I need help with this
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
