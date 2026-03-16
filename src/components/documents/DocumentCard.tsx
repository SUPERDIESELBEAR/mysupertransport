import { Clock, CheckCircle2, Pin, AlertTriangle, BookOpen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DriverDocument, CATEGORY_COLORS } from './DocumentHubTypes';

interface DocumentCardProps {
  doc: DriverDocument;
  acknowledgment: { document_version: number } | null;
  onView: (doc: DriverDocument) => void;
}

export default function DocumentCard({ doc, acknowledgment, onView }: DocumentCardProps) {
  const isAcknowledged = !!acknowledgment && acknowledgment.document_version === doc.version;
  const isUpdated = !!acknowledgment && acknowledgment.document_version < doc.version;

  return (
    <div
      className={`relative bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-3 ${
        doc.is_pinned ? 'border-gold/40 ring-1 ring-gold/20' : 'border-border'
      }`}
    >
      {/* Pin indicator */}
      {doc.is_pinned && (
        <span className="absolute top-3 right-3 text-gold" title="Pinned">
          <Pin className="h-3.5 w-3.5 fill-gold" />
        </span>
      )}

      {/* Header badges */}
      <div className="flex flex-wrap items-center gap-1.5 pr-6">
        <Badge className={`text-xs border font-medium ${CATEGORY_COLORS[doc.category]}`}>
          {doc.category}
        </Badge>
        {doc.is_required && (
          <Badge className="text-xs border bg-destructive/10 text-destructive border-destructive/30 font-medium gap-1">
            <AlertTriangle className="h-3 w-3" /> Required
          </Badge>
        )}
        {isUpdated && (
          <Badge className="text-xs border bg-status-progress/10 text-status-progress border-status-progress/30 font-medium">
            Updated
          </Badge>
        )}
      </div>

      {/* Title + description */}
      <div className="flex-1">
        <h3 className="font-semibold text-foreground text-sm leading-snug mb-1">{doc.title}</h3>
        {doc.description && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{doc.description}</p>
        )}
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {doc.estimated_read_minutes && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            ~{doc.estimated_read_minutes} min read
          </span>
        )}
        <span className="flex items-center gap-1">
          <BookOpen className="h-3 w-3" />
          v{doc.version}
        </span>
        <span className="ml-auto">
          {new Date(doc.updated_at).toLocaleDateString()}
        </span>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-border/60">
        {isAcknowledged ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-status-complete">
            <CheckCircle2 className="h-4 w-4" />
            Acknowledged
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {doc.is_required ? 'Acknowledgment required' : 'Tap to read'}
          </span>
        )}
        <Button size="sm" onClick={() => onView(doc)} className="text-xs h-8">
          View Document
        </Button>
      </div>
    </div>
  );
}
