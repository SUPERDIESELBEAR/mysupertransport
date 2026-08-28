import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, FileUp, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getDbErrorMessage, logDbError } from '@/lib/dbError';
import {
  evaluateLoadPaperwork, waivedSummary,
  type PaperworkDocumentInput, type PaperworkExceptionInput,
  type PaperworkRequirement, type PaperworkStatus,
} from '@/lib/loadPaperwork';
import {
  uploadLoadDocument, validateLoadDocumentFile, type LoadDocumentType,
} from '@/lib/loadDocuments';

/**
 * Paperwork upload from the driver's load card.
 *
 * The list is NOT re-derived here. src/lib/loadPaperwork.ts already owns which
 * documents a load owes and how hard it owes them; this reads its answer, so
 * the driver, the dispatcher and the office can never disagree about what is
 * outstanding.
 *
 * Required and expected are shown separately because they mean different
 * things: required holds the load, expected is chased and never blocks.
 *
 * Camera first — he is photographing paper in a cab, not choosing a file — with
 * file selection kept alongside for the times he already has a PDF.
 *
 * Guided loadout photo capture is NOT here. That is Pass 3.
 */

interface Props {
  loadId: string;
  loadType: string | null;
  onUploaded?: () => void;
}

function RequirementRow({
  req, loadId, busy, onPick,
}: {
  req: PaperworkRequirement;
  loadId: string;
  busy: boolean;
  onPick: (documentType: LoadDocumentType, file: File) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
      <p className="text-sm text-foreground min-w-0 leading-snug">{req.label}</p>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => cameraRef.current?.click()}
          aria-label={`Take a photo for ${req.label}`}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          aria-label={`Choose a file for ${req.label}`}
        >
          <FileUp className="h-3.5 w-3.5" />
        </Button>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          data-testid={`camera-${loadId}-${req.documentType}`}
          onChange={e => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onPick(req.documentType, f);
          }}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          data-testid={`file-${loadId}-${req.documentType}`}
          onChange={e => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onPick(req.documentType, f);
          }}
        />
      </div>
    </div>
  );
}

export function LoadPaperworkUpload({ loadId, loadType, onUploaded }: Props) {
  const { toast } = useToast();
  const [status, setStatus] = useState<PaperworkStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: docs }, { data: excs }] = await Promise.all([
      supabase.from('load_documents').select('document_type, photo_label').eq('load_id', loadId),
      supabase.from('document_exceptions').select('document_type, status').eq('load_id', loadId),
    ]);
    setStatus(evaluateLoadPaperwork(
      loadType,
      (docs ?? []) as PaperworkDocumentInput[],
      (excs ?? []) as PaperworkExceptionInput[],
    ));
  }, [loadId, loadType]);

  useEffect(() => { void load(); }, [load]);

  const handlePick = async (documentType: LoadDocumentType, file: File) => {
    const check = validateLoadDocumentFile(file);
    if (!check.valid) {
      toast({ title: 'Cannot upload that file', description: check.error, variant: 'destructive' });
      return;
    }
    setBusy(documentType);
    try {
      await uploadLoadDocument({ loadId, documentType, file });
      toast({ title: 'Uploaded' });
      await load();
      onUploaded?.();
    } catch (err) {
      logDbError('[LoadPaperworkUpload] upload failed', err, { loadId, documentType });
      toast({
        title: 'Upload failed',
        description: getDbErrorMessage(err, 'The file was not saved.'),
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  if (!status) return null;

  const waived = status.satisfied.map(waivedSummary).filter(Boolean) as string[];

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-foreground">Paperwork for this load</p>

      {status.outstandingRequired.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Required</p>
          {status.outstandingRequired.map(req => (
            <RequirementRow
              key={`req-${req.documentType}-${req.photoLabel ?? ''}`}
              req={req}
              loadId={loadId}
              busy={busy === req.documentType}
              onPick={handlePick}
            />
          ))}
        </div>
      )}

      {status.outstandingExpected.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Expected — send it when you have it
          </p>
          {status.outstandingExpected.map(req => (
            <RequirementRow
              key={`exp-${req.documentType}-${req.photoLabel ?? ''}`}
              req={req}
              loadId={loadId}
              busy={busy === req.documentType}
              onPick={handlePick}
            />
          ))}
        </div>
      )}

      {status.outstandingRequired.length === 0 && status.outstandingExpected.length === 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-status-complete" />
          Nothing outstanding on this load.
        </p>
      )}

      {waived.map(w => (
        <p key={w} className="text-[11px] text-muted-foreground leading-snug">{w}</p>
      ))}
    </div>
  );
}
