import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FilePreviewModal } from '@/components/inspection/DocRow';
import { formatDaysHuman } from '@/components/inspection/InspectionBinderTypes';
import { downloadBlob } from '@/lib/downloadBlob';
import { ChevronDown, Download, Eye, FileText, FolderClosed, HardDrive, Loader2, Package } from 'lucide-react';
import { differenceInDays, format, parseISO, startOfDay } from 'date-fns';
import { groupDocumentsByType } from './documentFolders';
import EquipmentReturnCard from './EquipmentReturnCard';
import SignedAssignmentSheetsCard from './SignedAssignmentSheetsCard';

interface VaultDoc {
  id: string;
  operator_id: string;
  category: string;
  label: string;
  file_url: string | null;
  file_path: string | null;
  file_name: string | null;
  expires_at: string | null;
  uploaded_at: string;
  notes: string | null;
}

interface Props {
  operatorId: string;
}

function expiryBadge(expiresAt: string | null) {
  if (!expiresAt) return null;
  const days = differenceInDays(startOfDay(parseISO(expiresAt)), startOfDay(new Date()));
  if (days < 0) return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Expired</Badge>;
  if (days <= 30) return <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] px-1.5 py-0">{formatDaysHuman(days)} left</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] px-1.5 py-0">Valid</Badge>;
}

interface FolderShellProps {
  name: string;
  count: number;
  icon?: React.ReactNode;
  actionNeeded?: boolean;
  expiredCount?: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function FolderShell({ name, count, icon, actionNeeded, expiredCount = 0, open, onToggle, children }: FolderShellProps) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
          {icon ?? <FolderClosed className="h-4 w-4" />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-foreground truncate">{name}</span>
        </span>
        <span className="text-[11px] text-muted-foreground shrink-0">({count})</span>
        {expiredCount > 0 && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 shrink-0">{expiredCount} expired</Badge>
        )}
        {actionNeeded && (
          <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] px-1.5 py-0 shrink-0">Action needed</Badge>
        )}
        <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {/* Children stay mounted so embedded cards can report their counts. */}
      <div className={open ? 'px-4 pb-4' : 'hidden'}>{children}</div>
    </div>
  );
}

export default function MyDocumentsFolders({ operatorId }: Props) {
  const [docs, setDocs] = useState<VaultDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<{ folderKey: string; index: number } | null>(null);

  const [sheetSummary, setSheetSummary] = useState({ count: 0, actionNeeded: false });
  const [returnSummary, setReturnSummary] = useState({ count: 0, actionNeeded: false });
  const onSheetSummary = useCallback((s: { count: number; actionNeeded: boolean }) => setSheetSummary(s), []);
  const onReturnSummary = useCallback((s: { count: number; actionNeeded: boolean }) => setReturnSummary(s), []);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('driver_vault_documents')
      .select('*')
      .eq('operator_id', operatorId)
      .order('uploaded_at', { ascending: false });
    if (!error && data) {
      const withUrls = await Promise.all(
        (data as VaultDoc[]).map(async (doc) => {
          if (!doc.file_path) return doc;
          const { data: signed } = await supabase.storage
            .from('operator-documents')
            .createSignedUrl(doc.file_path, 3600);
          return { ...doc, file_url: signed?.signedUrl ?? doc.file_url };
        }),
      );
      setDocs(withUrls);
    }
    setLoading(false);
  }, [operatorId]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const folders = useMemo(() => groupDocumentsByType(docs), [docs]);

  const toggle = (key: string) => setOpenKeys(prev => ({ ...prev, [key]: !prev[key] }));

  if (loading) {
    return (
      <div className="py-10 text-center text-muted-foreground text-xs">
        <Loader2 className="h-5 w-5 mx-auto animate-spin mb-2" /> Loading your documents…
      </div>
    );
  }

  const nothingAtAll = folders.length === 0 && sheetSummary.count === 0 && returnSummary.count === 0;

  return (
    <>
      <div className="space-y-2">
        {folders.map(folder => {
          const expiredCount = folder.docs.filter(d =>
            d.expires_at && differenceInDays(startOfDay(parseISO(d.expires_at)), startOfDay(new Date())) < 0,
          ).length;
          return (
            <FolderShell
              key={folder.key}
              name={folder.name}
              count={folder.docs.length}
              expiredCount={expiredCount}
              open={!!openKeys[folder.key]}
              onToggle={() => toggle(folder.key)}
            >
              <div className="divide-y divide-border">
                {folder.docs.map(doc => (
                  <div key={doc.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{doc.label}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {doc.file_name} · {format(new Date(doc.uploaded_at), 'MMM d, yyyy')}
                        {doc.notes && ` · ${doc.notes}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {expiryBadge(doc.expires_at)}
                      {doc.file_url && (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            aria-label={`View ${doc.label}`}
                            onClick={() => setPreviewDoc({ url: doc.file_url!, name: doc.label })}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            aria-label={`Download ${doc.label}`}
                            onClick={() => downloadBlob(doc.file_url!, doc.file_name || doc.label)}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </FolderShell>
          );
        })}

        {/* Signed Assignment Sheets folder */}
        <div className={sheetSummary.count === 0 ? 'hidden' : ''}>
          <FolderShell
            name="Signed Assignment Sheets"
            count={sheetSummary.count}
            icon={<HardDrive className="h-4 w-4" />}
            actionNeeded={sheetSummary.actionNeeded}
            open={!!openKeys['osas']}
            onToggle={() => toggle('osas')}
          >
            <SignedAssignmentSheetsCard operatorId={operatorId} embedded onSummary={onSheetSummary} />
          </FolderShell>
        </div>

        {/* Equipment Return folder */}
        <div className={returnSummary.count === 0 ? 'hidden' : ''}>
          <FolderShell
            name="Equipment Return"
            count={returnSummary.count}
            icon={<Package className="h-4 w-4" />}
            actionNeeded={returnSummary.actionNeeded}
            open={!!openKeys['equipment-return']}
            onToggle={() => toggle('equipment-return')}
          >
            <EquipmentReturnCard operatorId={operatorId} embedded onSummary={onReturnSummary} />
          </FolderShell>
        </div>

        {nothingAtAll && (
          <div className="rounded-2xl border border-border bg-card py-10 text-center text-muted-foreground text-xs">
            <FolderClosed className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>No documents on file yet.</p>
          </div>
        )}
      </div>

      {(() => {
        if (!preview) return null;
        const activeFolder = folders.find(f => f.key === preview.folderKey);
        if (!activeFolder) return null;
        const safeIndex = Math.min(preview.index, activeFolder.docs.length - 1);
        const activeDoc = activeFolder.docs[safeIndex];
        if (!activeDoc?.file_url) return null;
        const total = activeFolder.docs.length;
        return (
          <FilePreviewModal
            url={activeDoc.file_url}
            name={activeDoc.label}
            onClose={() => setPreview(null)}
            bucketName="operator-documents"
            filePath={activeDoc.file_path ?? undefined}
            onPrev={safeIndex > 0 ? () => setPreview({ folderKey: preview.folderKey, index: safeIndex - 1 }) : undefined}
            onNext={safeIndex < total - 1 ? () => setPreview({ folderKey: preview.folderKey, index: safeIndex + 1 }) : undefined}
            counter={total > 1 ? `${safeIndex + 1} of ${total}` : undefined}
          />
        );
      })()}
    </>
  );
}