import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useBinderOrder } from '@/hooks/useBinderOrder';
import { useDriverOptionalDocs } from '@/hooks/useDriverOptionalDocs';
import {
  FileText, Truck, Shield, CheckSquare, Square, Send, Mail, MessageSquare,
  Upload, Loader2, AlertTriangle, Clock, X, QrCode, List, BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import logo from '@/assets/supertransport-logo.png';
import {
  InspectionDocument, DriverUpload,
  COMPANY_WIDE_DOCS, PER_DRIVER_DOCS, getExpiryStatus, filterOptionalDocs,
} from './InspectionBinderTypes';
import { DocRow, ExpiryBadge, FilePreviewModal, bucketForBinderDoc } from './DocRow';
import BinderFlipbook, { FlipbookPage } from './BinderFlipbook';

interface Props {
  userId: string;
  operatorId: string | null;
}

type UploadCategory = 'roadside_inspection_report' | 'repairs_maintenance_receipt' | 'miscellaneous';

const UPLOAD_SECTIONS: { key: UploadCategory; label: string; desc: string }[] = [
  { key: 'roadside_inspection_report', label: 'Roadside Inspection Reports', desc: 'Upload DOT/CVSA inspection reports you receive at roadside.' },
  { key: 'repairs_maintenance_receipt', label: 'Repairs & Maintenance Receipts', desc: 'Upload repair receipts and maintenance records for your truck.' },
  { key: 'miscellaneous', label: 'Miscellaneous Documents', desc: 'Upload any other documents such as repair invoices, permits, or one-off records.' },
];

function DriverUploadRow({ upload, onPreview }: { upload: DriverUpload; onPreview: (url: string, name: string) => void }) {
  const statusBadge: Record<DriverUpload['status'], JSX.Element> = {
    pending_review: <span className="text-[10px] bg-info/10 text-info border border-info/30 rounded-full px-2 py-0.5 font-semibold inline-flex items-center gap-1"><Clock className="h-3 w-3" />Pending Review</span>,
    reviewed: <span className="text-[10px] bg-status-complete/10 text-status-complete border border-status-complete/30 rounded-full px-2 py-0.5 font-semibold inline-flex items-center gap-1"><CheckSquare className="h-3 w-3" />Reviewed</span>,
    needs_attention: <span className="text-[10px] bg-destructive/10 text-destructive border border-destructive/30 rounded-full px-2 py-0.5 font-semibold inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Needs Attention</span>,
  };

  return (
    <div className="flex items-center gap-3 px-3 py-3 rounded-xl border border-border bg-card">
      <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
        <FileText className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{upload.file_name ?? 'Document'}</p>
        <p className="text-xs text-muted-foreground">{new Date(upload.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {statusBadge[upload.status]}
        {upload.file_url && (
          <button
            className="text-xs text-gold hover:underline"
            onClick={() => onPreview(upload.file_url!, upload.file_name ?? 'Document')}
          >
            View
          </button>
        )}
      </div>
    </div>
  );
}

export default function OperatorInspectionBinder({ userId, operatorId }: Props) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const { companyOrder, driverOrder } = useBinderOrder();
  const { enabled: enabledOptional } = useDriverOptionalDocs(userId);
  const visibleCompanyOrder = filterOptionalDocs(companyOrder, enabledOptional);
  const [companyDocs, setCompanyDocs] = useState<InspectionDocument[]>([]);
  const [perDriverDocs, setPerDriverDocs] = useState<InspectionDocument[]>([]);
  const [driverUploads, setDriverUploads] = useState<DriverUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [unitNumber, setUnitNumber] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [viewMode, setViewMode] = useState<'list' | 'pages'>('list');
  const [flipbookOpen, setFlipbookOpen] = useState(false);

  // In-app file preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>('');
  const [previewFilePath, setPreviewFilePath] = useState<string | null>(null);
  const [previewBucket, setPreviewBucket] = useState<string | null>(null);

  const fetchDocs = useCallback(async () => {
    const [companyRes, perDriverRes, uploadsRes] = await Promise.all([
      supabase
        .from('inspection_documents')
        .select('*')
        .eq('scope', 'company_wide')
        .eq('shared_with_fleet', true)
        .order('name'),
      supabase
        .from('inspection_documents')
        .select('*')
        .eq('scope', 'per_driver')
        .eq('driver_id', userId)
        .order('name'),
      supabase
        .from('driver_uploads')
        .select('*')
        .eq('driver_id', userId)
        .order('uploaded_at', { ascending: false }),
    ]);

    setCompanyDocs((companyRes.data ?? []) as InspectionDocument[]);
    setPerDriverDocs((perDriverRes.data ?? []) as InspectionDocument[]);
    setDriverUploads((uploadsRes.data ?? []) as DriverUpload[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchDocs();
    // Get unit number from onboarding status
    if (operatorId) {
      supabase.from('onboarding_status').select('unit_number').eq('operator_id', operatorId).maybeSingle()
        .then(({ data }) => setUnitNumber((data as any)?.unit_number ?? null));
    }
  }, [fetchDocs, operatorId]);

  const handleDriverUpload = async (category: UploadCategory, file: File) => {
    if (!user) return;
    setUploadingKey(category);
    try {
      const ext = file.name.split('.').pop();
      const path = `${userId}/${category}/${Date.now()}.${ext}`;
      const { error: storageErr } = await supabase.storage.from('driver-uploads').upload(path, file);
      if (storageErr) throw storageErr;

      const { data: urlData } = await supabase.storage.from('driver-uploads').createSignedUrl(path, 60 * 60 * 24 * 365);
      await supabase.from('driver_uploads').insert({
        driver_id: userId,
        category,
        file_url: urlData?.signedUrl ?? null,
        file_path: path,
        file_name: file.name,
      });

      toast({ title: 'Uploaded!', description: 'Your document has been submitted for review.' });
      fetchDocs();
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploadingKey(null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedDocs = [...companyDocs, ...perDriverDocs].filter(d => selected.has(d.id));

  const bulkShareText = () => {
    const links = selectedDocs.map(d => `${d.name}: ${window.location.origin}/inspect/${d.public_share_token}`).join('\n');
    window.open(`sms:?body=${encodeURIComponent(`Roadside Documents — SuperTransport\n\n${links}`)}`);
  };

  const bulkShareEmail = () => {
    const body = selectedDocs.map(d => `${d.name}: ${window.location.origin}/inspect/${d.public_share_token}`).join('\n');
    window.open(`mailto:?subject=${encodeURIComponent('Roadside Documents — SuperTransport')}&body=${encodeURIComponent(body)}`);
  };

  const driverName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Driver';

  // Lookup helper
  const findCompanyDoc = (name: string) => companyDocs.find(d => d.name === name) ?? null;
  const findDriverDoc = (name: string) => perDriverDocs.find(d => d.name === name) ?? null;

  // Section header reusable
  const SectionHeader = ({ title, icon }: { title: string; icon: React.ReactNode }) => (
    <div className="flex items-center gap-2 mb-3">
      <div className="h-7 w-7 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">{icon}</div>
      <h3 className="text-sm font-bold text-foreground tracking-wide uppercase">{title}</h3>
      <div className="flex-1 h-px bg-border" />
    </div>
  );

  // Count expiring/expired docs for the summary
  const expiryAlerts = [...companyDocs, ...perDriverDocs].filter(d => {
    const s = getExpiryStatus(d.expires_at);
    return s === 'expired' || s === 'expiring_soon';
  }).length;

  return (
    <div className="space-y-6">
      {/* ─── COVER PAGE ─── */}
      <div className="relative overflow-hidden rounded-2xl border border-surface-dark-border bg-surface-dark text-surface-dark-foreground shadow-lg">
        {/* Gold accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-gold via-gold-light to-gold opacity-80" />
        <div className="p-6">
          <div className="flex items-start gap-4">
            <img src={logo} alt="SuperTransport" className="h-12 object-contain opacity-95" />
            <div>
              <p className="text-xs text-gold font-bold tracking-widest uppercase">Digital Inspection Binder</p>
              <h1 className="text-xl font-black text-surface-dark-foreground leading-tight mt-0.5">{driverName}</h1>
              <p className="text-xs text-surface-dark-muted mt-0.5">Professional Driver</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="bg-surface-dark-card rounded-xl px-3 py-2.5 border border-surface-dark-border">
              <p className="text-[10px] text-surface-dark-muted uppercase tracking-wider font-medium">Truck Unit</p>
              <p className="text-base font-bold text-surface-dark-foreground">{unitNumber ?? '—'}</p>
            </div>
            <div className="bg-surface-dark-card rounded-xl px-3 py-2.5 border border-surface-dark-border">
              <p className="text-[10px] text-surface-dark-muted uppercase tracking-wider font-medium">USDOT</p>
              <p className="text-base font-bold text-surface-dark-foreground">2309365</p>
            </div>
            <div className="bg-surface-dark-card rounded-xl px-3 py-2.5 border border-surface-dark-border">
              <p className="text-[10px] text-surface-dark-muted uppercase tracking-wider font-medium">MC No.</p>
              <p className="text-base font-bold text-surface-dark-foreground">788425</p>
            </div>
            <div className={`rounded-xl px-3 py-2.5 border ${expiryAlerts > 0 ? 'bg-destructive/10 border-destructive/30' : 'bg-status-complete/10 border-status-complete/30'}`}>
              <p className="text-[10px] text-surface-dark-muted uppercase tracking-wider font-medium">Alerts</p>
              <p className={`text-base font-bold ${expiryAlerts > 0 ? 'text-destructive' : 'text-status-complete'}`}>
                {expiryAlerts > 0 ? `${expiryAlerts} Expiring` : 'All Clear ✓'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── VIEW MODE + SELECT CONTROLS ─── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          <button
            onClick={() => setViewMode('list')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              viewMode === 'list' ? 'bg-gold text-surface-dark' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <List className="h-3.5 w-3.5" /> List
          </button>
          <button
            onClick={() => { setViewMode('pages'); setFlipbookOpen(true); }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              viewMode === 'pages' ? 'bg-gold text-surface-dark' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" /> Pages
          </button>
        </div>
        <Button
          variant={selectMode ? 'default' : 'outline'}
          size="sm"
          className={`gap-1.5 text-xs ${selectMode ? 'bg-gold text-surface-dark hover:bg-gold-light' : ''}`}
          onClick={() => { setSelectMode(v => !v); setSelected(new Set()); }}
        >
          {selectMode ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
          {selectMode ? 'Cancel Select' : 'Select Documents'}
        </Button>
        {selectMode && (
          <span className="text-xs text-muted-foreground">{selected.size} selected</span>
        )}
      </div>

      {/* ─── DOCUMENT SECTIONS ─── */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {/* My Documents */}
          <div>
            <SectionHeader title="My Documents" icon={<FileText className="h-3.5 w-3.5 text-gold" />} />
            <div className="space-y-2">
              {driverOrder.map((key) => {
                const spec = PER_DRIVER_DOCS.find(d => d.key === key);
                if (!spec) return null;
                const doc = findDriverDoc(key);
                return (
                  <DocRow
                    key={key}
                    name={key}
                    doc={doc}
                    hasExpiry={spec.hasExpiry}
                    selected={doc ? selected.has(doc.id) : false}
                    selectMode={selectMode}
                    onToggleSelect={() => doc && toggleSelect(doc.id)}
                    canUpload={false}
                  />
                );
              })}
            </div>
          </div>

          {/* Company Documents */}
          <div>
            <SectionHeader title="Company Documents" icon={<Shield className="h-3.5 w-3.5 text-gold" />} />
            {companyDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8 rounded-xl border border-dashed border-border text-center">
                <Shield className="h-7 w-7 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">No company documents are currently shared with the fleet</p>
                <p className="text-xs text-muted-foreground/60">Your coordinator will share company-wide documents here when available.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {visibleCompanyOrder.map((key) => {
                  const spec = COMPANY_WIDE_DOCS.find(d => d.key === key);
                  if (!spec) return null;
                  const doc = findCompanyDoc(key);
                  if (!doc) return null;
                  return (
                    <DocRow
                      key={key}
                      name={key}
                      doc={doc}
                      hasExpiry={spec.hasExpiry}
                      selected={selected.has(doc.id)}
                      selectMode={selectMode}
                      onToggleSelect={() => toggleSelect(doc.id)}
                      canUpload={false}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* My Uploads */}
          <div>
            <SectionHeader title="My Uploads" icon={<Upload className="h-3.5 w-3.5 text-gold" />} />
            <div className="space-y-6">
              {UPLOAD_SECTIONS.map(({ key, label, desc }) => {
                const myUploads = driverUploads.filter(u => u.category === key);
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{label}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                      <div>
                        <input
                          ref={el => { fileRefs.current[key] = el; }}
                          type="file"
                          accept=".pdf"
                          className="hidden"
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) handleDriverUpload(key, f);
                            e.target.value = '';
                          }}
                        />
                        <Button
                          size="sm"
                          className="bg-gold text-surface-dark hover:bg-gold-light gap-1.5 text-xs"
                          disabled={uploadingKey === key}
                          onClick={() => fileRefs.current[key]?.click()}
                        >
                          {uploadingKey === key
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Upload className="h-3.5 w-3.5" />
                          }
                          Upload PDF
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {myUploads.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground text-xs border border-dashed border-border rounded-xl">
                          No documents uploaded yet
                        </div>
                      ) : (
                        myUploads.map(u => <DriverUploadRow key={u.id} upload={u} onPreview={(url, name) => { setPreviewUrl(url); setPreviewName(name); setPreviewFilePath((u as any).file_path ?? null); setPreviewBucket('driver-uploads'); }} />)
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── LOG REMINDER BANNER ─── */}
      <div className="flex items-start gap-3 bg-warning/10 border border-warning/30 rounded-xl px-4 py-3.5">
        <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
        <p className="text-sm text-warning-foreground/80 leading-relaxed">
          <span className="font-bold text-warning">Reminder:</span> Always carry at least <strong>8 days of paper log pages</strong> in your vehicle.
        </p>
      </div>

      {/* ─── BULK ACTION BAR ─── */}
      {selectMode && selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-surface-dark border border-surface-dark-border text-surface-dark-foreground rounded-2xl px-4 py-3 shadow-2xl animate-fade-in">
          <span className="text-xs font-medium text-surface-dark-muted mr-1">{selected.size} doc{selected.size > 1 ? 's' : ''}</span>
          <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-surface-dark-foreground hover:bg-surface-dark-card" onClick={bulkShareText}>
            <MessageSquare className="h-3.5 w-3.5" /> Text
          </Button>
          <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-surface-dark-foreground hover:bg-surface-dark-card" onClick={bulkShareEmail}>
            <Mail className="h-3.5 w-3.5" /> Email
          </Button>
          <button onClick={() => { setSelectMode(false); setSelected(new Set()); }} className="ml-1 text-surface-dark-muted hover:text-surface-dark-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {previewUrl && (
        <FilePreviewModal
          url={previewUrl}
          name={previewName}
          onClose={() => { setPreviewUrl(null); setPreviewFilePath(null); setPreviewBucket(null); }}
          bucketName={previewBucket ?? undefined}
          filePath={previewFilePath ?? undefined}
          onSaved={() => fetchDocs()}
        />
      )}

      {flipbookOpen && (() => {
        const pages: FlipbookPage[] = [
          {
            id: 'cover',
            title: 'Cover Page',
            kind: 'cover',
            fileUrl: null,
          },
          ...driverOrder.map((key): FlipbookPage | null => {
            const spec = PER_DRIVER_DOCS.find(d => d.key === key);
            if (!spec) return null;
            const doc = findDriverDoc(key);
            return {
              id: `d-${key}`,
              title: key,
              subtitle: 'My Document',
              fileUrl: doc?.file_url ?? null,
              fileName: doc?.file_url ?? null,
              shareToken: doc?.public_share_token ?? null,
              expiresAt: doc?.expires_at ?? null,
              filePath: doc?.file_path ?? null,
              bucket: bucketForBinderDoc(doc?.file_path),
              kind: 'doc' as const,
            };
          }).filter(Boolean) as FlipbookPage[],
          ...visibleCompanyOrder.map((key): FlipbookPage | null => {
            const spec = COMPANY_WIDE_DOCS.find(d => d.key === key);
            if (!spec) return null;
            const doc = findCompanyDoc(key);
            return {
              id: `c-${key}`,
              title: key,
              subtitle: 'Company Document',
              fileUrl: doc?.file_url ?? null,
              fileName: doc?.file_url ?? null,
              shareToken: doc?.public_share_token ?? null,
              expiresAt: doc?.expires_at ?? null,
              filePath: doc?.file_path ?? null,
              bucket: bucketForBinderDoc(doc?.file_path),
              kind: 'doc' as const,
            };
          }).filter(Boolean) as FlipbookPage[],
          ...driverUploads.map((u): FlipbookPage => ({
            id: `u-${u.id}`,
            title: u.file_name || 'Upload',
            subtitle: UPLOAD_SECTIONS.find(s => s.key === u.category)?.label || 'Upload',
            fileUrl: u.file_url,
            fileName: u.file_name,
            shareToken: null,
            expiresAt: null,
            filePath: u.file_path ?? null,
            bucket: 'driver-uploads',
            kind: 'upload',
          })),
        ];
        return (
          <BinderFlipbook
            pages={pages}
            driverName={driverName}
            unitNumber={unitNumber}
            onClose={() => { setFlipbookOpen(false); setViewMode('list'); }}
          />
        );
      })()}
    </div>
  );
}
