import { useState } from 'react';
import { ArrowLeft, Clock, CheckCircle2, AlertTriangle, BookOpen, FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DriverDocument, CATEGORY_COLORS } from './DocumentHubTypes';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DocumentViewerProps {
  doc: DriverDocument;
  userId: string;
  acknowledgment: { id: string; document_version: number } | null;
  onBack: () => void;
  onAcknowledged: () => void;
}

export default function DocumentViewer({ doc, userId, acknowledgment, onBack, onAcknowledged }: DocumentViewerProps) {
  const { toast } = useToast();
  const [acknowledging, setAcknowledging] = useState(false);

  const isAcknowledged = !!acknowledgment && acknowledgment.document_version === doc.version;
  const isUpdated = !!acknowledgment && acknowledgment.document_version < doc.version;
  const isPdf = doc.content_type === 'pdf';

  const handleAcknowledge = async () => {
    setAcknowledging(true);
    const { error } = await supabase.from('document_acknowledgments').insert({
      document_id: doc.id,
      user_id: userId,
      document_version: doc.version,
    });
    setAcknowledging(false);

    if (error) {
      toast({ title: 'Error', description: 'Could not save acknowledgment. Please try again.', variant: 'destructive' });
      return;
    }

    toast({ title: 'Document acknowledged ✓', description: `You have acknowledged "${doc.title}".` });
    onAcknowledged();
  };

  return (
    <div className="animate-fade-in">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Document Hub
      </button>

      <div className="max-w-2xl mx-auto">
        {/* Updated banner */}
        {isUpdated && (
          <div className="flex items-start gap-3 bg-status-progress/10 border border-status-progress/30 rounded-xl px-4 py-3 mb-6">
            <AlertTriangle className="h-4 w-4 text-status-progress mt-0.5 shrink-0" />
            <p className="text-sm text-status-progress leading-relaxed">
              <span className="font-semibold">This document has been updated</span> since you last acknowledged it.
              Please re-read and re-acknowledge below.
            </p>
          </div>
        )}

        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Badge className={`text-xs border font-medium ${CATEGORY_COLORS[doc.category]}`}>
              {doc.category}
            </Badge>
            {doc.is_required && (
              <Badge className="text-xs border bg-destructive/10 text-destructive border-destructive/30 font-medium gap-1">
                <AlertTriangle className="h-3 w-3" /> Required
              </Badge>
            )}
            {isPdf && (
              <Badge className="text-xs border bg-secondary text-secondary-foreground border-border font-medium gap-1">
                <FileText className="h-3 w-3" /> PDF
              </Badge>
            )}
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-2">{doc.title}</h1>
          {doc.description && (
            <p className="text-muted-foreground text-base leading-relaxed mb-3">{doc.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {doc.estimated_read_minutes && (
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                ~{doc.estimated_read_minutes} min read
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <BookOpen className="h-4 w-4" />
              Version {doc.version}
            </span>
            <span>Last updated {new Date(doc.updated_at).toLocaleDateString()}</span>
          </div>
        </div>

        <hr className="border-border mb-8" />

        {/* Body — PDF or rich text */}
        {isPdf ? (
          doc.pdf_url ? (
            <div className="rounded-xl overflow-hidden border border-border bg-muted/20">
              <iframe
                src={doc.pdf_url}
                title={doc.title}
                className="w-full"
                style={{ height: '620px' }}
              />
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>PDF not available.</p>
            </div>
          )
        ) : doc.body ? (
          <div
            className="prose prose-sm max-w-none text-foreground
              prose-headings:font-bold prose-headings:text-foreground
              prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
              prose-p:text-foreground prose-p:leading-relaxed
              prose-li:text-foreground prose-li:leading-relaxed
              prose-blockquote:border-l-4 prose-blockquote:border-gold/40 prose-blockquote:text-muted-foreground prose-blockquote:pl-4 prose-blockquote:italic
              prose-hr:border-border
              prose-strong:text-foreground prose-strong:font-semibold
              [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
            dangerouslySetInnerHTML={{ __html: doc.body }}
          />
        ) : (
          <div className="py-12 text-center text-muted-foreground">
            <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No content has been added to this document yet.</p>
          </div>
        )}

        {/* Acknowledgment footer */}
        <div className="mt-12 border-t border-border pt-8">
          {isAcknowledged ? (
            <div className="flex items-center justify-center gap-2 py-4 bg-status-complete/10 border border-status-complete/30 rounded-xl">
              <CheckCircle2 className="h-5 w-5 text-status-complete" />
              <span className="font-medium text-status-complete">You have acknowledged this document (v{doc.version})</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-muted-foreground max-w-md">
                By clicking below, you confirm that you have{isPdf ? ' opened and' : ''} read and understood this document.
              </p>
              <Button
                onClick={handleAcknowledge}
                disabled={acknowledging}
                size="lg"
                className="gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                {acknowledging ? 'Saving…' : 'I have read and understood this document'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
