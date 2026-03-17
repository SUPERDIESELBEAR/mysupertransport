import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  Upload, Trash2, Calendar, Loader2, FileText, Globe, User,
  CheckCircle2, AlertTriangle, Clock, Eye, RotateCcw, Users,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  InspectionDocument, DriverUpload,
  COMPANY_WIDE_DOCS, PER_DRIVER_DOCS,
} from './InspectionBinderTypes';
import { ExpiryBadge } from './DocRow';

interface OperatorOption {
  userId: string;
  operatorId: string;
  name: string;
}

interface Props {
  // If provided, scoped to a specific operator
  operatorUserId?: string;
  operatorName?: string;
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

export default function InspectionBinderAdmin({ operatorUserId, operatorName }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [companyDocs, setCompanyDocs] = useState<InspectionDocument[]>([]);
  const [perDriverDocs, setPerDriverDocs] = useState<InspectionDocument[]>([]);
  const [driverUploads, setDriverUploads] = useState<DriverUpload[]>([]);
  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>(operatorUserId ?? '');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InspectionDocument | null>(null);
  const [activeTab, setActiveTab] = useState<'company' | 'driver' | 'uploads'>('company');
  const [expiryEditing, setExpiryEditing] = useState<string | null>(null);
  const [expiryValue, setExpiryValue] = useState('');

  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Fetch operator list (for non-scoped admin)
  useEffect(() => {
    if (operatorUserId) return;
    (async () => {
      const { data } = await supabase
        .from('operators')
        .select('id, user_id, applications(first_name, last_name), profiles(first_name, last_name)')
        .order('created_at');
      if (!data) return;
      const opts = (data as any[]).map(op => ({
        userId: op.user_id,
        operatorId: op.id,
        name: (() => {
          const app = Array.isArray(op.applications) ? op.applications[0] : op.applications;
          const prof = Array.isArray(op.profiles) ? op.profiles[0] : op.profiles;
          const fn = app?.first_name ?? prof?.first_name ?? '';
          const ln = app?.last_name ?? prof?.last_name ?? '';
          return [fn, ln].filter(Boolean).join(' ') || op.user_id.slice(0, 8);
        })(),
      }));
      setOperators(opts);
    })();
  }, [operatorUserId]);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const [cRes, pdRes, duRes] = await Promise.all([
      supabase.from('inspection_documents').select('*').eq('scope', 'company_wide').order('name'),
      selectedDriverId
        ? supabase.from('inspection_documents').select('*').eq('scope', 'per_driver').eq('driver_id', selectedDriverId).order('name')
        : Promise.resolve({ data: [] as InspectionDocument[] }),
      selectedDriverId
        ? supabase.from('driver_uploads').select('*').eq('driver_id', selectedDriverId).order('uploaded_at', { ascending: false })
        : Promise.resolve({ data: [] as DriverUpload[] }),
    ]);
    setCompanyDocs((cRes.data ?? []) as InspectionDocument[]);
    setPerDriverDocs((pdRes.data ?? []) as InspectionDocument[]);
    setDriverUploads((duRes.data ?? []) as DriverUpload[]);
    setLoading(false);
  }, [selectedDriverId]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const handleUpload = async (docName: string, scope: 'company_wide' | 'per_driver', file: File, existingId?: string) => {
    if (!user) return;
    const driverId = scope === 'per_driver' ? selectedDriverId : null;
    if (scope === 'per_driver' && !driverId) {
      toast({ title: 'Select a driver first', variant: 'destructive' });
      return;
    }
    setUploading(docName);
    try {
      const ext = file.name.split('.').pop();
      const folder = scope === 'company_wide' ? 'company' : `driver/${driverId}`;
      const path = `${folder}/${docName.replace(/\s+/g, '-').toLowerCase()}/${Date.now()}.${ext}`;
      const { error: storageErr } = await supabase.storage.from('inspection-documents').upload(path, file, { upsert: false });
      if (storageErr) throw storageErr;

      const { data: urlData } = await supabase.storage.from('inspection-documents').createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      const fileUrl = urlData?.signedUrl ?? null;

      if (existingId) {
        await supabase.from('inspection_documents').update({ file_url: fileUrl, file_path: path, uploaded_at: new Date().toISOString(), uploaded_by: user.id }).eq('id', existingId);
      } else {
        await supabase.from('inspection_documents').insert({
          name: docName, scope, driver_id: driverId, file_url: fileUrl, file_path: path, uploaded_by: user.id,
        });
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
    toast({ title: 'Status updated', description: `Upload marked as ${UPLOAD_STATUS_LABELS[status]}.` });
    fetchDocs();
  };

  const selectedDriverName = operatorName ?? operators.find(o => o.userId === selectedDriverId)?.name ?? '';

  const toggleFleetShare = async (doc: InspectionDocument) => {
    const newVal = !doc.shared_with_fleet;
    await supabase.from('inspection_documents').update({ shared_with_fleet: newVal }).eq('id', doc.id);
    toast({ title: newVal ? 'Shared with fleet' : 'Removed from fleet', description: `${doc.name} is now ${newVal ? 'visible to all drivers' : 'hidden from drivers'}.` });
    fetchDocs();
  };

  const AdminDocRow = ({ docName, scope, hasExpiry }: { docName: string; scope: 'company_wide' | 'per_driver'; hasExpiry: boolean }) => {
    const doc = scope === 'company_wide' ? companyDocs.find(d => d.name === docName) : perDriverDocs.find(d => d.name === docName);
    const key = `${scope}-${docName}`;
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
                {!doc?.file_url && (
                  <Badge variant="secondary" className="text-[10px]">No file</Badge>
                )}
                {doc?.file_url && hasExpiry && <ExpiryBadge expiresAt={doc.expires_at} />}
                {doc?.shared_with_fleet && (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-info/10 text-info border border-info/30 rounded-full px-2 py-0.5 font-semibold">
                    <Users className="h-3 w-3" />Fleet
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {doc?.file_url && (
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0"><Eye className="h-3.5 w-3.5" /></Button>
                  </a>
                )}
                {doc && (
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(doc)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
                <input
                  ref={el => { fileRefs.current[key] = el; }}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(docName, scope, f, doc?.id);
                    e.target.value = '';
                  }}
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

            {/* Fleet share toggle — only for company-wide docs that have a file */}
            {scope === 'company_wide' && doc?.file_url && (
              <div className="flex items-center justify-between pt-2 border-t border-border/50 mt-2">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Share with all fleet drivers</span>
                </div>
                <Switch
                  checked={doc.shared_with_fleet}
                  onCheckedChange={() => toggleFleetShare(doc)}
                />
              </div>
            )}

            {/* Expiry editor */}
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

  const sharedCount = companyDocs.filter(d => d.shared_with_fleet).length;
  const totalCompany = COMPANY_WIDE_DOCS.length;

  const tabs = [
    {
      key: 'company' as const,
      label: 'Company Docs',
      icon: <Globe className="h-3.5 w-3.5" />,
      badge: `${sharedCount} of ${totalCompany} shared`,
      badgeActive: sharedCount > 0,
    },
    { key: 'driver' as const, label: 'Driver Docs', icon: <User className="h-3.5 w-3.5" /> },
    { key: 'uploads' as const, label: 'Driver Uploads', icon: <Upload className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-gold/10 flex items-center justify-center shrink-0">
          <FileText className="h-4 w-4 text-gold" />
        </div>
        <div>
          <h2 className="text-base font-bold text-foreground">Inspection Binder</h2>
          {selectedDriverName && <p className="text-xs text-muted-foreground">{selectedDriverName}</p>}
        </div>
      </div>

      {/* Driver selector (non-scoped) */}
      {!operatorUserId && (
        <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a driver to manage their binder…" />
          </SelectTrigger>
          <SelectContent>
            {operators.map(op => (
              <SelectItem key={op.userId} value={op.userId}>{op.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary rounded-xl p-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg transition-colors ${
              activeTab === t.key ? 'bg-card text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : (
        <>
          {/* Company Docs tab */}
          {activeTab === 'company' && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">These documents apply to all drivers. Uploading here updates every driver's binder.</p>
              {COMPANY_WIDE_DOCS.map(({ key, hasExpiry }) => (
                <AdminDocRow key={key} docName={key} scope="company_wide" hasExpiry={hasExpiry} />
              ))}
            </div>
          )}

          {/* Driver Docs tab */}
          {activeTab === 'driver' && (
            <div className="space-y-3">
              {!selectedDriverId && (
                <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
                  Select a driver above to manage their personal documents.
                </div>
              )}
              {selectedDriverId && PER_DRIVER_DOCS.map(({ key, hasExpiry }) => (
                <AdminDocRow key={key} docName={key} scope="per_driver" hasExpiry={hasExpiry} />
              ))}
            </div>
          )}

          {/* Driver Uploads tab */}
          {activeTab === 'uploads' && (
            <div className="space-y-3">
              {!selectedDriverId && (
                <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
                  Select a driver above to view their uploaded documents.
                </div>
              )}
              {selectedDriverId && driverUploads.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
                  No uploads from this driver yet.
                </div>
              )}
              {driverUploads.map(upload => (
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
                      {/* Top row: name + status badge + view */}
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
                            <a href={upload.file_url} target="_blank" rel="noopener noreferrer">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Inline action buttons */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {upload.status !== 'reviewed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1.5 text-xs border-status-complete/50 text-status-complete hover:bg-status-complete/10 hover:text-status-complete hover:border-status-complete"
                            onClick={() => updateUploadStatus(upload.id, 'reviewed')}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Mark Reviewed
                          </Button>
                        )}
                        {upload.status !== 'needs_attention' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1.5 text-xs border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive"
                            onClick={() => updateUploadStatus(upload.id, 'needs_attention')}
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Needs Attention
                          </Button>
                        )}
                        {upload.status !== 'pending_review' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => updateUploadStatus(upload.id, 'pending_review')}
                          >
                            <RotateCcw className="h-3 w-3" />
                            Reset
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deleteTarget?.name}</strong> from {deleteTarget?.scope === 'company_wide' ? 'all driver binders' : 'this driver\'s binder'}. This cannot be undone.
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
    </div>
  );
}
