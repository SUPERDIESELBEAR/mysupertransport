/**
 * OperatorBinderPanel
 * A compact, driver-scoped Inspection Binder embedded inside OperatorDetailPanel.
 * Shows: Per-Driver Docs (CDL, Med Cert, DOT Inspections, Lease Agreement) + Driver Uploads.
 * Company-wide docs are omitted here — they're managed in the standalone Inspection Binder tab.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useDemoMode } from '@/hooks/useDemoMode';
import {
  Upload, Trash2, Calendar, Loader2, FileText, User,
  CheckCircle2, AlertTriangle, Clock, Eye, RotateCcw, FolderOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { InspectionDocument, DriverUpload, PER_DRIVER_DOCS, COMPANY_WIDE_DOCS } from './InspectionBinderTypes';
import { ExpiryBadge, FilePreviewModal } from './DocRow';

interface Props {
  /** auth.uid() of the operator/driver */
  driverUserId: string;
  operatorName: string;
}

const UPLOAD_STATUS_LABELS: Record<string, string> = {
  pending_review: 'Pending Review',
  reviewed: 'Reviewed',
  needs_attention: 'Needs Attention',
};

function UploadStatusBadge({ status }: { status: string }) {
  if (status === 'reviewed') return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-status-complete/10 text-status-complete border border-status-complete/30 rounded-full px-2 py-0.5 font-semibold">
      <CheckCircle2 className="h-3 w-3" />Reviewed
    </span>
  );
  if (status === 'needs_attention') return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-destructive/10 text-destructive border border-destructive/30 rounded-full px-2 py-0.5 font-semibold">
      <AlertTriangle className="h-3 w-3" />Needs Attention
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-info/10 text-info border border-info/30 rounded-full px-2 py-0.5 font-semibold">
      <Clock className="h-3 w-3" />Pending Review
    </span>
  );
}

export default function OperatorBinderPanel({ driverUserId, operatorName }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [perDriverDocs, setPerDriverDocs] = useState<InspectionDocument[]>([]);
  const [driverUploads, setDriverUploads] = useState<DriverUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InspectionDocument | null>(null);
  const [activeTab, setActiveTab] = useState<'driver' | 'uploads'>('driver');
  const [expiryEditing, setExpiryEditing] = useState<string | null>(null);
  const [expiryValue, setExpiryValue] = useState('');

  // In-app file preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>('');

  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const [pdRes, duRes] = await Promise.all([
      supabase.from('inspection_documents').select('*').eq('scope', 'per_driver').eq('driver_id', driverUserId).order('name'),
      supabase.from('driver_uploads').select('*').eq('driver_id', driverUserId).order('uploaded_at', { ascending: false }),
    ]);
    setPerDriverDocs((pdRes.data ?? []) as InspectionDocument[]);
    setDriverUploads((duRes.data ?? []) as DriverUpload[]);
    setLoading(false);
  }, [driverUserId]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // Pending upload count for badge
  const pendingCount = driverUploads.filter(u => u.status === 'pending_review').length;

  // Company-wide docs shared to this driver (company doc names present in per_driver scope)
  const companyDocNames = new Set(COMPANY_WIDE_DOCS.map(d => d.key));
  const sharedFromCompanyDocs = perDriverDocs.filter(d => companyDocNames.has(d.name as any) && d.file_url);
  const sharedFromCompanyCount = sharedFromCompanyDocs.length;

  const handleUpload = async (docName: string, file: File, existingId?: string) => {
    if (!user) return;
    setUploading(docName);
    try {
      const ext = file.name.split('.').pop();
      const path = `driver/${driverUserId}/${docName.replace(/\s+/g, '-').toLowerCase()}/${Date.now()}.${ext}`;
      const { error: storageErr } = await supabase.storage.from('inspection-documents').upload(path, file, { upsert: false });
      if (storageErr) throw storageErr;
      const { data: urlData } = await supabase.storage.from('inspection-documents').createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      const fileUrl = urlData?.signedUrl ?? null;
      if (existingId) {
        await supabase.from('inspection_documents').update({ file_url: fileUrl, file_path: path, uploaded_at: new Date().toISOString(), uploaded_by: user.id }).eq('id', existingId);
      } else {
        await supabase.from('inspection_documents').insert({ name: docName, scope: 'per_driver', driver_id: driverUserId, file_url: fileUrl, file_path: path, uploaded_by: user.id });
      }
      toast({ title: 'Uploaded!', description: `${docName} has been uploaded.` });
      fetchDocs();
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(null);
    }
  };

  const handleDelete = async (doc: InspectionDocument) => {
    await supabase.from('inspection_documents').delete().eq('id', doc.id);
    if (doc.file_path) await supabase.storage.from('inspection-documents').remove([doc.file_path]);
    toast({ title: 'Deleted', description: `${doc.name} removed.` });
    fetchDocs();
    setDeleteTarget(null);
  };

  const saveExpiry = async (id: string) => {
    await supabase.from('inspection_documents').update({ expires_at: expiryValue || null }).eq('id', id);
    toast({ title: 'Expiry updated' });
    setExpiryEditing(null);
    fetchDocs();
  };

  const updateUploadStatus = async (uploadId: string, status: 'pending_review' | 'reviewed' | 'needs_attention') => {
    await supabase.from('driver_uploads').update({ status, reviewed_at: new Date().toISOString(), reviewed_by: user?.id }).eq('id', uploadId);
    toast({ title: 'Status updated', description: `Marked as ${UPLOAD_STATUS_LABELS[status]}.` });
    fetchDocs();
  };

  const DocRow = ({ docName, hasExpiry }: { docName: string; hasExpiry: boolean }) => {
    const doc = perDriverDocs.find(d => d.name === docName);
    const key = `per_driver-${docName}`;
    return (
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className={`h-9 w-9 rounded-lg shrink-0 flex items-center justify-center ${doc?.file_url ? 'bg-gold/10' : 'bg-secondary'}`}>
            <FileText className={`h-4 w-4 ${doc?.file_url ? 'text-gold-muted' : 'text-muted-foreground'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-medium text-foreground">{docName}</span>
                {!doc?.file_url && <Badge variant="secondary" className="text-[10px]">No file</Badge>}
                {doc?.file_url && hasExpiry && <ExpiryBadge expiresAt={doc.expires_at} />}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {doc?.file_url && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => { setPreviewUrl(doc.file_url!); setPreviewName(docName); }}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                )}
                {doc && (
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(doc)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
                <input
                  ref={el => { fileRefs.current[key] = el; }}
                  type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(docName, f, doc?.id); e.target.value = ''; }}
                />
                <Button
                  size="sm"
                  className={`h-8 gap-1.5 text-xs ${!doc?.file_url ? 'bg-gold text-surface-dark hover:bg-gold-light' : ''}`}
                  variant={doc?.file_url ? 'outline' : 'default'}
                  disabled={uploading === docName}
                  onClick={() => fileRefs.current[key]?.click()}
                >
                  {uploading === docName ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  {doc?.file_url ? 'Replace' : 'Upload'}
                </Button>
              </div>
            </div>
            {hasExpiry && (
              <div className="mt-2 flex items-center gap-2">
                {expiryEditing === doc?.id ? (
                  <>
                    <Input type="date" value={expiryValue} onChange={e => setExpiryValue(e.target.value)} className="h-7 text-xs w-36" />
                    <Button size="sm" className="h-7 text-xs" onClick={() => saveExpiry(doc!.id)}>Save</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setExpiryEditing(null)}>Cancel</Button>
                  </>
                ) : (
                  <button
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => { if (doc) { setExpiryEditing(doc.id); setExpiryValue(doc.expires_at ?? ''); } }}
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    {doc?.expires_at ? `Expires ${new Date(doc.expires_at).toLocaleDateString()}` : 'Set expiry date'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-border">
        <div className="h-9 w-9 rounded-xl bg-gold/10 flex items-center justify-center shrink-0">
          <FolderOpen className="h-4 w-4 text-gold" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground">Inspection Binder</h3>
          <p className="text-xs text-muted-foreground">Per-driver documents &amp; uploads for {operatorName}</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Tabs */}
        <TooltipProvider>
          <div className="flex gap-1 bg-secondary rounded-xl p-1">
            {/* Driver Docs tab */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setActiveTab('driver')}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg transition-colors ${
                    activeTab === 'driver' ? 'bg-card text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <User className="h-3.5 w-3.5" />
                  Driver Docs
                  {sharedFromCompanyCount > 0 && (
                    <span className="ml-0.5 inline-flex items-center justify-center h-4 min-w-[1rem] px-1 rounded-full text-[10px] font-bold bg-info/15 text-info border border-info/30">
                      {sharedFromCompanyCount} from company
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              {sharedFromCompanyCount > 0 && (
                <TooltipContent side="bottom" className="text-left space-y-1 max-w-[200px]">
                  <p className="font-bold text-xs">Shared from company:</p>
                  <ul className="space-y-0.5">
                    {sharedFromCompanyDocs.map(d => (
                      <li key={d.id} className="text-xs text-muted-foreground leading-tight">• {d.name}</li>
                    ))}
                  </ul>
                </TooltipContent>
              )}
            </Tooltip>

            {/* Driver Uploads tab */}
            <button
              onClick={() => setActiveTab('uploads')}
              className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg transition-colors ${
                activeTab === 'uploads' ? 'bg-card text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              Driver Uploads
              {pendingCount > 0 && (
                <span className="ml-0.5 inline-flex items-center justify-center h-4 min-w-[1rem] px-1 rounded-full text-[10px] font-bold bg-destructive text-destructive-foreground">
                  {pendingCount}
                </span>
              )}
            </button>
          </div>
        </TooltipProvider>

        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        ) : (
          <>
            {/* Driver Docs */}
            {activeTab === 'driver' && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Personal documents for this driver. CDL, Med Cert, DOT Inspections, and Lease Agreement.</p>
                {PER_DRIVER_DOCS.map(({ key, hasExpiry }) => (
                  <DocRow key={key} docName={key} hasExpiry={hasExpiry} />
                ))}
              </div>
            )}

            {/* Driver Uploads */}
            {activeTab === 'uploads' && (
              <div className="space-y-3">
                {driverUploads.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
                    No uploads from this driver yet.
                  </div>
                ) : (
                  driverUploads.map(upload => (
                    <div
                      key={upload.id}
                      className={cn(
                        'bg-card border rounded-xl p-4 transition-colors',
                        upload.status === 'reviewed' && 'border-status-complete/40 bg-status-complete/5',
                        upload.status === 'needs_attention' && 'border-destructive/40 bg-destructive/5',
                        upload.status === 'pending_review' && 'border-info/30',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          'h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
                          upload.status === 'reviewed' && 'bg-status-complete/10',
                          upload.status === 'needs_attention' && 'bg-destructive/10',
                          upload.status === 'pending_review' && 'bg-info/10',
                        )}>
                          <FileText className={cn(
                            'h-4 w-4',
                            upload.status === 'reviewed' && 'text-status-complete',
                            upload.status === 'needs_attention' && 'text-destructive',
                            upload.status === 'pending_review' && 'text-info',
                          )} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{upload.file_name ?? 'Document'}</p>
                              <p className="text-xs text-muted-foreground capitalize">
                                {upload.category.replace(/_/g, ' ')} · {new Date(upload.uploaded_at).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <UploadStatusBadge status={upload.status} />
                              {upload.file_url && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                  onClick={() => { setPreviewUrl(upload.file_url!); setPreviewName(upload.file_name ?? 'Document'); }}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                          {/* Inline action buttons */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {upload.status !== 'reviewed' && (
                              <Button
                                size="sm" variant="outline"
                                className="h-7 gap-1.5 text-xs border-status-complete/50 text-status-complete hover:bg-status-complete/10 hover:text-status-complete hover:border-status-complete"
                                onClick={() => updateUploadStatus(upload.id, 'reviewed')}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />Mark Reviewed
                              </Button>
                            )}
                            {upload.status !== 'needs_attention' && (
                              <Button
                                size="sm" variant="outline"
                                className="h-7 gap-1.5 text-xs border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive"
                                onClick={() => updateUploadStatus(upload.id, 'needs_attention')}
                              >
                                <AlertTriangle className="h-3.5 w-3.5" />Needs Attention
                              </Button>
                            )}
                            {upload.status !== 'pending_review' && (
                              <Button
                                size="sm" variant="ghost"
                                className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => updateUploadStatus(upload.id, 'pending_review')}
                              >
                                <RotateCcw className="h-3 w-3" />Reset
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deleteTarget?.name}</strong> from this driver's binder. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && handleDelete(deleteTarget)} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {previewUrl && (
        <FilePreviewModal url={previewUrl} name={previewName} onClose={() => setPreviewUrl(null)} />
      )}
    </div>
  );
}
