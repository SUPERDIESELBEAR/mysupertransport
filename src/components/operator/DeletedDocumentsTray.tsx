import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Loader2, RotateCcw, Trash2, FileText, ChevronDown, History } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  listDeletedOperatorDocuments,
  restoreOperatorDocument,
  hardDeleteOperatorDocument,
  type OperatorDocumentRow,
} from '@/lib/operatorDocuments';

interface Props {
  operatorId: string;
  /** Called after any successful restore/purge so the parent can refresh its doc lists. */
  onChanged?: () => void;
}

export default function DeletedDocumentsTray({ operatorId, onChanged }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<OperatorDocumentRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmPurge, setConfirmPurge] = useState<OperatorDocumentRow | null>(null);

  const load = useCallback(async () => {
    if (!operatorId) return;
    setLoading(true);
    try {
      setRows(await listDeletedOperatorDocuments(operatorId));
    } catch (err: any) {
      toast({ title: 'Could not load deleted documents', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [operatorId, toast]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Initial count load (so the badge appears without expanding)
  useEffect(() => {
    load();
  }, [load]);

  const handleRestore = async (row: OperatorDocumentRow) => {
    setBusyId(row.id);
    try {
      await restoreOperatorDocument(row.id);
      toast({ title: 'Document restored', description: row.file_name ?? row.document_type });
      setRows(prev => prev.filter(r => r.id !== row.id));
      onChanged?.();
    } catch (err: any) {
      toast({ title: 'Restore failed', description: err?.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const handlePurge = async (row: OperatorDocumentRow) => {
    setBusyId(row.id);
    try {
      await hardDeleteOperatorDocument({ id: row.id, file_url: row.file_url });
      toast({ title: 'Document permanently deleted' });
      setRows(prev => prev.filter(r => r.id !== row.id));
      onChanged?.();
    } catch (err: any) {
      toast({ title: 'Permanent delete failed', description: err?.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
      setConfirmPurge(null);
    }
  };

  if (!loading && rows.length === 0 && !open) return null;

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/40 border border-border rounded-lg hover:bg-muted/60 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Recently Deleted Documents</span>
          {rows.length > 0 && (
            <span className="text-[11px] bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-medium">
              {rows.length}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">(last 30 days)</span>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-2 border border-border rounded-lg bg-white p-3">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No documents deleted in the last 30 days.</p>
          ) : (
            <ul className="space-y-1.5">
              {rows.map(row => (
                <li key={row.id} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-muted/40">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{row.file_name ?? row.document_type}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {row.document_type} · deleted {row.deleted_at ? format(new Date(row.deleted_at), 'MMM d, yyyy h:mm a') : '—'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => handleRestore(row)}
                    className="flex items-center gap-1 text-[11px] text-gold hover:text-gold-light font-medium px-2 py-1 rounded hover:bg-gold/10 disabled:opacity-50"
                  >
                    {busyId === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                    Restore
                  </button>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => setConfirmPurge(row)}
                    className="flex items-center gap-1 text-[11px] text-destructive/70 hover:text-destructive font-medium px-2 py-1 rounded hover:bg-destructive/10 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete permanently
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-muted-foreground mt-2 px-1">
            Documents are permanently removed 30 days after deletion.
          </p>
        </div>
      )}

      <AlertDialog open={!!confirmPurge} onOpenChange={o => { if (!o) setConfirmPurge(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{confirmPurge?.file_name ?? confirmPurge?.document_type}</span> will
              be removed from storage and cannot be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmPurge && handlePurge(confirmPurge)}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}