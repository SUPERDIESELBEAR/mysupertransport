import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/loadDetail';
import { formatEnumLabel } from '@/lib/loadFormat';
import {
  EXCEPTION_REASON_LABELS, type LoadDocument, type LoadDocumentException,
} from '@/lib/loadDocuments';
import ResolveExceptionDialog from './ResolveExceptionDialog';

const STATUS_CLASSES: Record<string, string> = {
  pending: 'border-destructive/40 bg-destructive/10 text-destructive',
  approved: 'border-status-complete/40 bg-status-complete/10 text-status-complete',
  resolved: 'border-status-complete/40 bg-status-complete/10 text-status-complete',
  denied: 'border-warning/45 bg-warning/15 text-warning',
};

/** Resolution notes may carry internal commentary — staff only, same as internal notes. */
export default function DocumentExceptionsList({
  loadId, exceptions, documents, canResolve, canSeeInternal,
}: {
  loadId: string;
  exceptions: LoadDocumentException[];
  documents: LoadDocument[];
  canResolve: boolean;
  canSeeInternal: boolean;
}) {
  const [active, setActive] = useState<LoadDocumentException | null>(null);
  if (!exceptions.length) return null;

  const pending = exceptions.filter(e => e.status === 'pending');
  const closed = exceptions.filter(e => e.status !== 'pending');
  const ordered = [...pending, ...closed];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">Document Exceptions</h3>
        {pending.length ? (
          <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-[10px] text-destructive">
            {pending.length} unresolved
          </Badge>
        ) : null}
      </div>

      <ul className="space-y-2">
        {ordered.map(ex => (
          <li
            key={ex.id}
            className={cn(
              'rounded-lg border p-3',
              ex.status === 'pending' ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-background',
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              {ex.status === 'pending' ? <AlertTriangle className="h-4 w-4 text-destructive" /> : null}
              <span className="text-sm font-semibold text-foreground">
                {formatEnumLabel(ex.document_type)} missing
              </span>
              <Badge variant="outline" className={cn('text-[10px]', STATUS_CLASSES[ex.status])}>
                {formatEnumLabel(ex.status)}
              </Badge>
              {canResolve && ex.status === 'pending' ? (
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => setActive(ex)}>
                  Resolve
                </Button>
              ) : null}
            </div>

            <p className="mt-1.5 text-sm text-foreground">{EXCEPTION_REASON_LABELS[ex.reason]}</p>
            {ex.driver_notes ? (
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{ex.driver_notes}</p>
            ) : null}
            {ex.ebol_reference_number ? (
              <p className="mt-1 text-xs text-muted-foreground">
                eBOL reference: <span className="font-mono text-foreground">{ex.ebol_reference_number}</span>
              </p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              Reported {formatDateTime(ex.reported_at)}
              {ex.reported_by_name ? ` by ${ex.reported_by_name}` : ''}
            </p>

            {canSeeInternal && ex.status !== 'pending' ? (
              <div className="mt-2 rounded-md border border-border bg-muted/40 p-2">
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Resolution Notes
                  </p>
                  <Badge variant="outline" className="border-border bg-muted text-[10px] text-muted-foreground">
                    Staff only
                  </Badge>
                </div>
                {ex.resolution_notes ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{ex.resolution_notes}</p>
                ) : null}
                {ex.resolving_document_name ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Satisfied by: {ex.resolving_document_name}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  {ex.resolved_at ? `Closed ${formatDateTime(ex.resolved_at)}` : 'Closed'}
                  {ex.resolved_by_name ? ` by ${ex.resolved_by_name}` : ''}
                </p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {active ? (
        <ResolveExceptionDialog
          loadId={loadId}
          exception={active}
          documents={documents}
          open
          onOpenChange={v => { if (!v) setActive(null); }}
        />
      ) : null}
    </div>
  );
}
