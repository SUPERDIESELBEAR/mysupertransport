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
  CheckCircle2, AlertTriangle, Clock, Eye, RotateCcw, FolderOpen, Plus, BookOpen,
} from 'lucide-react';
import { useBinderOrder } from '@/hooks/useBinderOrder';
import { useDriverOptionalDocs } from '@/hooks/useDriverOptionalDocs';
import BinderFlipbook, { FlipbookPage } from './BinderFlipbook';
import { DateInput } from '@/components/ui/date-input';
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
import { InspectionDocument, DriverUpload, PER_DRIVER_DOCS, COMPANY_WIDE_DOCS, parseLocalDate, filterOptionalDocs } from './InspectionBinderTypes';
import { ExpiryBadge, FilePreviewModal, bucketForBinderDoc, InspectedBadge, isInspectionDateDoc } from './DocRow';
import { syncInspectionBinderDateFromVehicleHub } from '@/lib/syncInspectionBinderDate';

type DriverUploadCategory = 'roadside_inspection_report' | 'repairs_maintenance_receipt' | 'miscellaneous';

const UPLOAD_CATEGORY_LABELS: Record<DriverUploadCategory, string> = {
  roadside_inspection_report: 'Roadside Inspection Report',
  repairs_maintenance_receipt: 'Repairs & Maintenance Receipt',
  miscellaneous: 'Miscellaneous',
};

const STAFF_UPLOAD_SECTIONS: { key: DriverUploadCategory; label: string }[] = [
  { key: 'roadside_inspection_report', label: 'Roadside Inspection Report' },
  { key: 'repairs_maintenance_receipt', label: 'Repairs & Maintenance Receipt' },
  { key: 'miscellaneous', label: 'Miscellaneous Document' },
];

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
  const { guardDemo } = useDemoMode();
  const { companyOrder, driverOrder } = useBinderOrder();
  const { enabled: enabledOptional } = useDriverOptionalDocs(driverUserId);
  const visibleCompanyOrder = filterOptionalDocs(companyOrder, enabledOptional);

  const [perDriverDocs, setPerDriverDocs] = useState<InspectionDocument[]>([]);
  const [companyDocs, setCompanyDocs] = useState<InspectionDocument[]>([]);
  const [driverUploads, setDriverUploads] = useState<DriverUpload[]>([]);
  const [unitNumber, setUnitNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InspectionDocument | null>(null);
  const [activeTab, setActiveTab] = useState<'driver' | 'uploads'>('driver');
  const [expiryEditing, setExpiryEditing] = useState<string | null>(null);
  const [expiryValue, setExpiryValue] = useState('');
  const [flipbookOpen, setFlipbookOpen] = useState(false);

  // In-app file preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>('');
  const [previewFilePath, setPreviewFilePath] = useState<string | null>(null);
  const [previewBucket, setPreviewBucket] = useState<string | null>(null);

  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const [pdRes, duRes, cwRes, opRes] = await Promise.all([
      supabase.from('inspection_documents').select('*').eq('scope', 'per_driver').eq('driver_id', driverUserId).order('name'),
      supabase.from('driver_uploads').select('*').eq('driver_id', driverUserId).order('uploaded_at', { ascending: false }),
      supabase.from('inspection_documents').select('*').eq('scope', 'company_wide').eq('shared_with_fleet', true).order('name'),
      supabase.from('operators').select('id, onboarding_status(unit_number)').eq('user_id', driverUserId).maybeSingle(),
    ]);
    setPerDriverDocs((pdRes.data ?? []) as InspectionDocument[]);
    setDriverUploads((duRes.data ?? []) as DriverUpload[]);
    setCompanyDocs((cwRes.data ?? []) as InspectionDocument[]);
    setUnitNumber((opRes.data as any)?.onboarding_status?.unit_number ?? null);
    setLoading(false);
  }, [driverUserId]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // Auto-populate "Periodic DOT Inspections" inspection date from the latest
  // Vehicle Hub record. Vehicle Hub is the source of truth.
  const syncedRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading) return;
    if (syncedRef.current === driverUserId) return;
    syncedRef.current = driverUserId;
    (async () => {
      const changed = await syncInspectionBinderDateFromVehicleHub(driverUserId);
      if (changed) fetchDocs();
    })();
  }, [loading, driverUserId, fetchDocs]);

  // Pending upload count for badge
  const pendingCount = driverUploads.filter(u => u.status === 'pending_review').length;

  // Company-wide docs shared to this driver (company doc names present in per_driver scope)
  const companyDocNames = new Set(COMPANY_WIDE_DOCS.map(d => d.key));
  const sharedFromCompanyDocs = perDriverDocs.filter(d => companyDocNames.has(d.name as any) && d.file_url);
  const sharedFromCompanyCount = sharedFromCompanyDocs.length;

  const handleUpload = async (docName: string, file: File, existingId?: string) => {
    if (!user) return;
    if (guardDemo()) return;
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
    if (guardDemo()) return;
    await supabase.from('inspection_documents').delete().eq('id', doc.id);
    if (doc.file_path) await supabase.storage.from('inspection-documents').remove([doc.file_path]);
    toast({ title: 'Deleted', description: `${doc.name} removed.` });
    fetchDocs();
    setDeleteTarget(null);
  };

  const saveExpiry = async (id: string) => {
    if (guardDemo()) return;
    await supabase.from('inspection_documents').update({ expires_at: expiryValue || null }).eq('id', id);
    toast({ title: 'Expiry updated' });
    setExpiryEditing(null);
    fetchDocs();
  };

  const updateUploadStatus = async (uploadId: string, status: 'pending_review' | 'reviewed' | 'needs_attention') => {
    if (guardDemo()) return;
    await supabase.from('driver_uploads').update({ status, reviewed_at: new Date().toISOString(), reviewed_by: user?.id }).eq('id', uploadId);
    toast({ title: 'Status updated', description: `Marked as ${UPLOAD_STATUS_LABELS[status]}.` });
    fetchDocs();
  };

  const staffUploadRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [staffUploading, setStaffUploading] = useState<string | null>(null);

  const handleStaffUpload = async (category: DriverUploadCategory, file: File) => {
    if (!user) return;
    if (guardDemo()) return;
    setStaffUploading(category);
    try {
      const ext = file.name.split('.').pop();
      const path = `${driverUserId}/${category}/${Date.now()}.${ext}`;
      const { error: storageErr } = await supabase.storage.from('driver-uploads').upload(path, file);
      if (storageErr) throw storageErr;
      const { data: urlData } = await supabase.storage.from('driver-uploads').createSignedUrl(path, 60 * 60 * 24 * 365);
      await supabase.from('driver_uploads').insert({
        driver_id: driverUserId,
        category,
        file_url: urlData?.signedUrl ?? null,
        file_path: path,
        file_name: file.name,
        status: 'reviewed',
      });
      toast({ title: 'Uploaded!', description: `${UPLOAD_CATEGORY_LABELS[category]} uploaded successfully.` });
      fetchDocs();
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setStaffUploading(null);
    }
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
                {doc?.file_url && hasExpiry && (
                  isInspectionDateDoc(docName)
                    ? <InspectedBadge inspectionDate={doc.expires_at} />
                    : <ExpiryBadge expiresAt={doc.expires_at} />
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {doc?.file_url && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => { setPreviewUrl(doc.file_url!); setPreviewName(docName); setPreviewFilePath(doc.file_path ?? null); setPreviewBucket(bucketForBinderDoc(doc.file_path)); }}
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
                    <DateInput value={expiryValue} onChange={v => setExpiryValue(v)} className="h-7 text-xs w-44" />
                    <Button size="sm" className="h-7 text-xs" onClick={() => saveExpiry(doc!.id)}>Save</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setExpiryEditing(null)}>Cancel</Button>
                  </>
                ) : (
                  <button
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => { if (doc) { setExpiryEditing(doc.id); setExpiryValue(doc.expires_at ?? ''); } }}
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    {doc?.expires_at
                      ? `${isInspectionDateDoc(docName) ? 'Inspection Date' : 'Expires'} ${parseLocalDate(doc.expires_at).toLocaleDateString()}`
                      : (isInspectionDateDoc(docName) ? 'Set inspection date' : 'Set expiry date')}
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
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-foreground">Inspection Binder</h3>
          <p className="text-xs text-muted-foreground">Per-driver documents &amp; uploads for {operatorName}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs shrink-0"
          onClick={() => setFlipbookOpen(true)}
          disabled={loading}
        >
          <BookOpen className="h-3.5 w-3.5" />
          Open Flipbook
        </Button>
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
                <p className="text-xs text-muted-foreground"><p className="text-xs text-muted-foreground">Personal documents for this driver. CDL, Med Cert, Periodic DOT Inspections, and Lease Agreement.</p></p>
                {PER_DRIVER_DOCS.map(({ key, hasExpiry }) => (
                  <DocRow key={key} docName={key} hasExpiry={hasExpiry} />
                ))}
              </div>
            )}

            {/* Driver Uploads */}
            {activeTab === 'uploads' && (
              <div className="space-y-4">
                {/* Staff Upload Section */}
                <div className="rounded-xl border border-border bg-secondary/40 p-3 space-y-2">
                  <p className="text-xs font-semibold text-foreground">Upload on behalf of driver</p>
                  <div className="flex flex-wrap gap-2">
                    {STAFF_UPLOAD_SECTIONS.map(({ key, label }) => (
                      <div key={key}>
                        <input
                          ref={el => { staffUploadRefs.current[key] = el; }}
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleStaffUpload(key, f); e.target.value = ''; }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1.5 text-xs"
                          disabled={staffUploading === key}
                          onClick={() => staffUploadRefs.current[key]?.click()}
                        >
                          {staffUploading === key
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Plus className="h-3 w-3" />
                          }
                          {label}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Uploads list */}
                {driverUploads.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
                    No uploads yet.
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
                              <p className="text-xs text-muted-foreground">
                                {UPLOAD_CATEGORY_LABELS[upload.category] ?? upload.category.replace(/_/g, ' ')} · {new Date(upload.uploaded_at).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <UploadStatusBadge status={upload.status} />
                              {upload.file_url && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                  onClick={() => { setPreviewUrl(upload.file_url!); setPreviewName(upload.file_name ?? 'Document'); setPreviewFilePath((upload as any).file_path ?? null); setPreviewBucket('driver-uploads'); }}
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
        <FilePreviewModal url={previewUrl} name={previewName} onClose={() => { setPreviewUrl(null); setPreviewFilePath(null); setPreviewBucket(null); }} bucketName={previewBucket ?? undefined} filePath={previewFilePath ?? undefined} onSaved={async () => { await fetchDocs(); }} />
      )}

      {flipbookOpen && (() => {
        const pages: FlipbookPage[] = [
          { id: 'cover', title: 'Cover', kind: 'cover', fileUrl: null },
        ];
        // Per-driver docs in admin-configured order
        for (const key of driverOrder) {
          const spec = PER_DRIVER_DOCS.find(d => d.key === key);
          if (!spec) continue;
          const doc = perDriverDocs.find(d => d.name === key);
          pages.push({
            id: `pd-${key}`,
            title: key,
            subtitle: 'Driver Document',
            kind: 'doc',
            fileUrl: doc?.file_url ?? null,
            fileName: doc?.file_url ?? null,
            shareToken: doc?.public_share_token ?? null,
            expiresAt: doc?.expires_at ?? null,
            filePath: doc?.file_path ?? null,
            bucket: bucketForBinderDoc(doc?.file_path),
          });
        }
        // Company docs in admin-configured order
        for (const key of visibleCompanyOrder) {
          const spec = COMPANY_WIDE_DOCS.find(d => d.key === key);
          if (!spec) continue;
          const doc = companyDocs.find(d => d.name === key);
          pages.push({
            id: `cw-${key}`,
            title: key,
            subtitle: 'Company Document',
            kind: 'doc',
            fileUrl: doc?.file_url ?? null,
            fileName: doc?.file_url ?? null,
            shareToken: doc?.public_share_token ?? null,
            expiresAt: doc?.expires_at ?? null,
            filePath: doc?.file_path ?? null,
            bucket: bucketForBinderDoc(doc?.file_path),
          });
        }
        // Driver uploads
        for (const up of driverUploads) {
          pages.push({
            id: `up-${up.id}`,
            title: up.file_name ?? 'Uploaded Document',
            subtitle: UPLOAD_CATEGORY_LABELS[up.category as DriverUploadCategory] ?? 'Upload',
            kind: 'upload',
            fileUrl: up.file_url ?? null,
            fileName: up.file_name ?? null,
            shareToken: null,
            expiresAt: null,
            filePath: up.file_path ?? null,
            bucket: 'driver-uploads',
          });
        }
        return (
          <BinderFlipbook
            pages={pages}
            driverName={operatorName}
            unitNumber={unitNumber}
            onClose={() => setFlipbookOpen(false)}
          />
        );
      })()}
    </div>
  );
}

