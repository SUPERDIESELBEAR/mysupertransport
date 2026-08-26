import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, Loader2, Trash2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { getDbErrorMessage, logDbError } from '@/lib/dbError';
import { formatEnumLabel } from '@/lib/loadFormat';
import { formatDateTime, type LoadDetail } from '@/lib/loadDetail';
import { STOP_TYPE_LABELS, type LoadType, type StopType } from '@/lib/loadRateMath';
import {
  DOCUMENT_TYPE_ORDER, LOADOUT_PHOTO_TYPES, createDocumentSignedUrl, deleteLoadDocument,
  fetchLoadDocumentExceptions, fetchLoadDocuments, formatFileSize, isImageDocument, validateLoadDocumentFile,
  type LoadDocument, type LoadDocumentType,
} from '@/lib/loadDocuments';
import { evaluateLoadPaperwork, waivedSummary, type PaperworkRequirement, type PaperworkStatus } from '@/lib/loadPaperwork';
import DocumentThumbnail from './DocumentThumbnail';

import DocumentExceptionsList from './DocumentExceptionsList';
import LoadoutGalleries from './LoadoutGallery';
import UploadDocumentsDialog from './UploadDocumentsDialog';

const CHANNEL_LABELS: Record<string, string> = {
  driver_app: 'Driver app',
  email_forward: 'Email',
  office_upload: 'Office upload',
  fax_forward: 'Fax',
  system_generated: 'System',
};

/**
 * Signed URLs are minted only when a user activates an action. A page left open
 * for an hour must never hand out a link that was created at render time.
 */
async function openDocument(doc: LoadDocument, mode: 'view' | 'download') {
  if (!doc.file_path) throw new Error('This document has no stored file.');
  const url = await createDocumentSignedUrl(doc.file_path);
  if (mode === 'view') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error('The file could not be downloaded.');
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = doc.document_name || 'document';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

/**
 * Outstanding paperwork, read from the pure predicate. Display only — no
 * actions, and nothing here writes load status. Where the predicate and the
 * hand-typed status disagree, both stay visible; neither is hidden.
 */
function OutstandingPaperwork({ paperwork }: { paperwork: PaperworkStatus }) {
  const pending = new Set(paperwork.pendingExceptions);
  const waived = paperwork.satisfied.map(waivedSummary).filter(Boolean) as string[];

  const nothingOutstanding =
    paperwork.complete && paperwork.outstandingExpected.length === 0;

  const item = (req: PaperworkRequirement) => (
    <li key={`${req.documentType}-${req.label}`} className="flex flex-wrap items-baseline gap-x-2">
      <span>{req.label}</span>
      {pending.has(req) ? (
        <span className="text-xs italic text-muted-foreground">Exception filed — awaiting review</span>
      ) : null}
    </li>
  );

  if (nothingOutstanding) {
    return (
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Paperwork complete.</p>
        {waived.map(line => (
          <p key={line} className="text-xs text-muted-foreground">{line}</p>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/40 p-3">
      <h3 className="text-sm font-semibold text-foreground">Outstanding paperwork</h3>

      {paperwork.outstandingRequired.length ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-warning">
            Required — outstanding
          </p>
          <ul className="mt-1 space-y-1 text-sm text-foreground">
            {paperwork.outstandingRequired.map(item)}
          </ul>
        </div>
      ) : null}

      {paperwork.outstandingExpected.length ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Expected — not received
          </p>
          <p className="text-xs text-muted-foreground">Chased, but does not hold the load.</p>
          <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
            {paperwork.outstandingExpected.map(item)}
          </ul>
        </div>
      ) : null}

      {waived.length ? (
        <div className="space-y-0.5">
          {waived.map(line => (
            <p key={line} className="text-xs text-muted-foreground">{line}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DocumentRow({

  doc, stopLabel, canDelete, onDelete,
}: {
  doc: LoadDocument;
  stopLabel: string | null;
  canDelete: boolean;
  onDelete: (doc: LoadDocument) => void;
}) {
  const [busy, setBusy] = useState<'view' | 'download' | null>(null);

  const run = async (mode: 'view' | 'download') => {
    setBusy(mode);
    try {
      await openDocument(doc, mode);
    } catch (err) {
      logDbError('openLoadDocument', err, { id: doc.id, mode });
      toast({
        title: 'Could not open the file',
        description: getDbErrorMessage(err, 'Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const size = formatFileSize(doc.file_size);

  return (
    <li className="flex items-start gap-3 rounded-md border border-border bg-background p-3">
      <DocumentThumbnail
        filePath={doc.file_path}
        alt={doc.document_name ?? 'Document'}
        isImage={isImageDocument(doc)}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{doc.document_name || 'Untitled document'}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {[
            CHANNEL_LABELS[doc.upload_channel] ?? formatEnumLabel(doc.upload_channel),
            doc.uploaded_by_name,
            formatDateTime(doc.uploaded_at),
            size,
          ].filter(Boolean).join(' · ')}
        </p>
        {stopLabel ? (
          <Badge variant="outline" className="mt-1.5 border-border bg-muted text-[10px] text-muted-foreground">
            {stopLabel}
          </Badge>
        ) : null}
        {doc.notes ? (
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">{doc.notes}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost" size="icon" className="h-8 w-8" aria-label={`View ${doc.document_name ?? 'document'}`}
          disabled={busy !== null} onClick={() => run('view')}
        >
          {busy === 'view' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost" size="icon" className="h-8 w-8" aria-label={`Download ${doc.document_name ?? 'document'}`}
          disabled={busy !== null} onClick={() => run('download')}
        >
          {busy === 'download' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </Button>
        {canDelete ? (
          <Button
            variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
            aria-label={`Delete ${doc.document_name ?? 'document'}`}
            onClick={() => onDelete(doc)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export default function DocumentsSection({
  load, canManage, canSeeInternal,
}: {
  load: LoadDetail;
  canManage: boolean;
  canSeeInternal: boolean;
}) {
  const qc = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[] | undefined>(undefined);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<LoadDocument | null>(null);

  const { data: documents, isLoading } = useQuery({
    queryKey: ['load-documents', load.id],
    queryFn: () => fetchLoadDocuments(load.id),
  });

  const { data: exceptions } = useQuery({
    queryKey: ['load-document-exceptions', load.id],
    queryFn: () => fetchLoadDocumentExceptions(load.id),
  });

  const deleteMutation = useMutation({
    mutationFn: (doc: LoadDocument) => deleteLoadDocument(doc),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['load-documents', load.id] });
      toast({ title: 'Document deleted' });
      setPendingDelete(null);
    },
    onError: (err) => {
      logDbError('deleteLoadDocument', err, { id: pendingDelete?.id });
      toast({
        title: 'Could not delete the document',
        description: getDbErrorMessage(err, 'Please try again.'),
        variant: 'destructive',
      });
    },
  });

  const stopLabels = useMemo(() => {
    const map = new Map<string, string>();
    load.stops.forEach(s => {
      map.set(
        s.id,
        `Stop ${s.stop_sequence ?? '?'} · ${STOP_TYPE_LABELS[s.stop_type as StopType]}${s.facility_name ? ` — ${s.facility_name}` : ''}`,
      );
    });
    return map;
  }, [load.stops]);

  const all = documents ?? [];
  const grouped = useMemo(() => {
    const byType = new Map<LoadDocumentType, LoadDocument[]>();
    all.forEach(doc => {
      if (LOADOUT_PHOTO_TYPES.includes(doc.document_type)) return;
      const list = byType.get(doc.document_type) ?? [];
      list.push(doc);
      byType.set(doc.document_type, list);
    });
    return DOCUMENT_TYPE_ORDER
      .filter(t => byType.has(t))
      .map(t => ({ type: t, docs: byType.get(t) as LoadDocument[] }));
  }, [all]);

  const isLoadout = (load.load_type as LoadType) === 'loadout';
  const listCount = all.filter(d => !LOADOUT_PHOTO_TYPES.includes(d.document_type)).length;

  // Called ONCE. Nothing below re-derives any part of this in JSX.
  const paperwork = useMemo(
    () => evaluateLoadPaperwork(load.load_type, all, exceptions ?? []),
    [load.load_type, all, exceptions],
  );


  function handleDragEnter(e: React.DragEvent) {
    if (!canManage) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  }

  function handleDragOver(e: React.DragEvent) {
    if (!canManage) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!canManage) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    if (!canManage) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;

    const accepted: File[] = [];
    files.forEach(file => {
      const check = validateLoadDocumentFile(file);
      if (!check.valid) {
        toast({ title: 'File not accepted', description: check.error, variant: 'destructive' });
        return;
      }
      accepted.push(file);
    });

    if (accepted.length) {
      setDroppedFiles(accepted);
      setUploadOpen(true);
    }
  }

  function openUpload() {
    setDroppedFiles(undefined);
    setUploadOpen(true);
  }

  function closeUpload(open: boolean) {
    setUploadOpen(open);
    if (!open) setDroppedFiles(undefined);
  }

  return (
    <section
      className={cn(
        'relative rounded-lg border border-border bg-card p-4 sm:p-5',
        canManage && isDragging && 'border-dashed border-primary bg-primary/5',
      )}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {canManage && isDragging ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-primary/5">
          <p className="text-sm font-medium text-foreground">Drop files to upload</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-foreground">Documents</h2>
        <span className="text-sm text-muted-foreground">({listCount})</span>
        {canManage ? (
          <>
            <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={openUpload}>
              <Upload className="h-4 w-4" />
              Upload
            </Button>
            <span className="hidden text-xs text-muted-foreground sm:inline">or drop files here</span>
          </>
        ) : null}
      </div>

      <div className="mt-4 space-y-5">
        {exceptions?.length ? (
          <DocumentExceptionsList
            loadId={load.id}
            exceptions={exceptions}
            documents={all.filter(d => !LOADOUT_PHOTO_TYPES.includes(d.document_type))}
            canResolve={canManage}
            canSeeInternal={canSeeInternal}
          />
        ) : null}

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {canManage
              ? 'No documents yet. Use the Upload button or drag and drop files here to add them.'
              : 'No documents have been attached to this load yet.'}
          </p>
        ) : (
          grouped.map(group => (
            <div key={group.type}>
              <h3 className="text-sm font-semibold text-foreground">
                {formatEnumLabel(group.type)}
                <span className="ml-1.5 font-normal text-muted-foreground">({group.docs.length})</span>
              </h3>
              <ul className="mt-2 space-y-2">
                {group.docs.map(doc => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    stopLabel={doc.load_stop_id ? stopLabels.get(doc.load_stop_id) ?? null : null}
                    canDelete={canManage}
                    onDelete={setPendingDelete}
                  />
                ))}
              </ul>
            </div>
          ))
        )}

        {isLoadout ? <LoadoutGalleries documents={all} /> : null}
      </div>

      {uploadOpen ? (
        <UploadDocumentsDialog load={load} open onOpenChange={closeUpload} initialFiles={droppedFiles} />
      ) : null}

      <AlertDialog open={!!pendingDelete} onOpenChange={v => { if (!v && !deleteMutation.isPending) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.document_name || 'This file'} will be removed from the load and from storage.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={e => { e.preventDefault(); if (pendingDelete) deleteMutation.mutate(pendingDelete); }}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
