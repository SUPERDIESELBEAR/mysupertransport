import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { FilePreviewModal } from '@/components/inspection/DocRow';
import { DateInput } from '@/components/ui/date-input';
import { useToast } from '@/hooks/use-toast';
import { validateFile, MAX_FILE_SIZE_BYTES } from '@/lib/validateFile';
import { downloadBlob } from '@/lib/downloadBlob';
import { Upload, Trash2, Eye, Download, FileText, ChevronDown, Loader2, AlertTriangle, CheckCircle2, Clock, FolderOpen } from 'lucide-react';
import { differenceInDays, parseISO, startOfDay, format } from 'date-fns';

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'form_2290', label: 'IRS Form 2290' },
  { value: 'truck_photos', label: 'Truck Photos' },
  { value: 'truck_title', label: 'Truck Title' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'other', label: 'Other' },
];

const CATEGORY_LABEL_MAP: Record<string, string> = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]));

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

interface DriverVaultCardProps {
  operatorId: string;
  operatorName?: string;
  readOnly?: boolean;
  defaultCollapsed?: boolean;
}

function expiryBadge(expiresAt: string | null) {
  if (!expiresAt) return null;
  const days = differenceInDays(startOfDay(parseISO(expiresAt)), startOfDay(new Date()));
  if (days < 0) return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Expired</Badge>;
  if (days <= 30) return <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] px-1.5 py-0">{days}d left</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] px-1.5 py-0">Valid</Badge>;
}

export default function DriverVaultCard({ operatorId, operatorName, readOnly = false, defaultCollapsed = false }: DriverVaultCardProps) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<VaultDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  // Upload form state
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState('other');
  const [uploadLabel, setUploadLabel] = useState('');
  const [uploadExpiry, setUploadExpiry] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // Preview / delete
  const [previewDoc, setPreviewDoc] = useState<{ url: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VaultDoc | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('driver_vault_documents')
      .select('*')
      .eq('operator_id', operatorId)
      .order('uploaded_at', { ascending: false });
    if (!error && data) {
      // Generate signed URLs for docs with file_path
      const withUrls = await Promise.all(
        (data as VaultDoc[]).map(async (doc) => {
          if (doc.file_path && !doc.file_url) {
            const { data: signed } = await supabase.storage
              .from('operator-documents')
              .createSignedUrl(doc.file_path, 3600);
            return { ...doc, file_url: signed?.signedUrl ?? null };
          }
          // Re-sign even existing paths for freshness
          if (doc.file_path) {
            const { data: signed } = await supabase.storage
              .from('operator-documents')
              .createSignedUrl(doc.file_path, 3600);
            return { ...doc, file_url: signed?.signedUrl ?? doc.file_url };
          }
          return doc;
        })
      );
      setDocs(withUrls);
    }
    setLoading(false);
  }, [operatorId]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const handleUpload = async () => {
    if (!uploadFile) return;
    const validation = validateFile(uploadFile);
    if (!validation.valid) {
      toast({ title: 'Invalid file', description: validation.error, variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const ext = uploadFile.name.split('.').pop()?.toLowerCase() || 'bin';
      const storagePath = `${operatorId}/vault/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: storageErr } = await supabase.storage
        .from('operator-documents')
        .upload(storagePath, uploadFile, { upsert: true });
      if (storageErr) throw storageErr;

      const label = uploadLabel.trim() || CATEGORY_LABEL_MAP[uploadCategory] || 'Document';

      const { error: insertErr } = await supabase
        .from('driver_vault_documents')
        .insert({
          operator_id: operatorId,
          category: uploadCategory,
          label,
          file_path: storagePath,
          file_name: uploadFile.name,
          expires_at: uploadExpiry || null,
          notes: uploadNotes.trim() || null,
        });
      if (insertErr) throw insertErr;

      toast({ title: 'Document uploaded' });
      setShowUpload(false);
      setUploadFile(null);
      setUploadCategory('other');
      setUploadLabel('');
      setUploadExpiry('');
      setUploadNotes('');
      fetchDocs();
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.file_path) {
        await supabase.storage.from('operator-documents').remove([deleteTarget.file_path]);
      }
      const { error } = await supabase.from('driver_vault_documents').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast({ title: 'Document deleted' });
      setDeleteTarget(null);
      fetchDocs();
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const expiredCount = docs.filter(d => {
    if (!d.expires_at) return false;
    return differenceInDays(startOfDay(parseISO(d.expires_at)), startOfDay(new Date())) < 0;
  }).length;

  const expiringCount = docs.filter(d => {
    if (!d.expires_at) return false;
    const days = differenceInDays(startOfDay(parseISO(d.expires_at)), startOfDay(new Date()));
    return days >= 0 && days <= 30;
  }).length;

  return (
    <>
      <div className="bg-white border border-border rounded-xl shadow-sm">
        <button onClick={() => setCollapsed(p => !p)} className="w-full flex items-center justify-between px-5 py-4 text-left">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-foreground text-sm">Driver Documents</h3>
            <span className="text-[11px] text-muted-foreground">({docs.length})</span>
            {expiredCount > 0 && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{expiredCount} expired</Badge>}
            {expiringCount > 0 && <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] px-1.5 py-0">{expiringCount} expiring</Badge>}
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        </button>

        {!collapsed && (
          <div className="px-5 pb-5 space-y-3">
            {/* Upload button (staff only) */}
            {!readOnly && (
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => setShowUpload(p => !p)} className="text-xs gap-1.5">
                  <Upload className="h-3.5 w-3.5" /> Upload Document
                </Button>
              </div>
            )}

            {/* Upload form */}
            {showUpload && !readOnly && (
              <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1 block">Category</Label>
                    <Select value={uploadCategory} onValueChange={v => { setUploadCategory(v); if (!uploadLabel.trim()) setUploadLabel(''); }}>
                      <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Label (optional)</Label>
                    <Input className="text-xs h-8" placeholder={CATEGORY_LABEL_MAP[uploadCategory] || 'Document'} value={uploadLabel} onChange={e => setUploadLabel(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Expiration Date (optional)</Label>
                    <DateInput value={uploadExpiry} onChange={setUploadExpiry} placeholder="MM/DD/YYYY" className="h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Notes (optional)</Label>
                    <Input className="text-xs h-8" placeholder="Optional notes" value={uploadNotes} onChange={e => setUploadNotes(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">File</Label>
                  <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif" className="text-xs h-8" onChange={e => setUploadFile(e.target.files?.[0] ?? null)} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setShowUpload(false)} className="text-xs">Cancel</Button>
                  <Button size="sm" onClick={handleUpload} disabled={!uploadFile || uploading} className="text-xs gap-1.5">
                    {uploading && <Loader2 className="h-3 w-3 animate-spin" />} Upload
                  </Button>
                </div>
              </div>
            )}

            {/* Document list */}
            {loading ? (
              <div className="text-center py-6 text-muted-foreground text-xs">
                <Loader2 className="h-5 w-5 mx-auto animate-spin mb-2" /> Loading…
              </div>
            ) : docs.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-xs">
                <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>No documents uploaded yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {docs.map(doc => (
                  <div key={doc.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{doc.label}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {doc.file_name} · {format(new Date(doc.uploaded_at), 'MMM d, yyyy')}
                        {doc.notes && ` · ${doc.notes}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {expiryBadge(doc.expires_at)}
                      {doc.file_url && (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setPreviewDoc({ url: doc.file_url!, name: doc.label })}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">View</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => downloadBlob(doc.file_url!, doc.file_name || doc.label)}>
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">Download</TooltipContent>
                          </Tooltip>
                          {!readOnly && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(doc)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">Delete</TooltipContent>
                            </Tooltip>
                          )}
                        </TooltipProvider>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Preview modal */}
      {previewDoc && <FilePreviewModal url={previewDoc.url} name={previewDoc.name} onClose={() => setPreviewDoc(null)} />}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete "{deleteTarget?.label}" from the vault.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
