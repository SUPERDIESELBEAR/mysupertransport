import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileText, CheckCircle2, Loader2, Eye, AlertCircle, Clock, Camera, Image, Shield, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { validateFile } from '@/lib/validateFile';
import TruckPhotoGuideModal from '@/components/operator/TruckPhotoGuideModal';
import { FilePreviewModal } from '@/components/inspection/DocRow';
interface DocumentSlot {
  key: string;
  label: string;
  description: string;
  required: boolean;
  accept: string;
}

const DOCUMENT_SLOTS: DocumentSlot[] = [
  { key: 'form_2290', label: 'Form 2290', description: 'Heavy Highway Vehicle Use Tax Return', required: true, accept: '.pdf,.jpg,.jpeg,.png' },
  { key: 'truck_title', label: 'Truck Title', description: 'Vehicle title document', required: true, accept: '.pdf,.jpg,.jpeg,.png' },
  { key: 'truck_photos', label: 'Truck Photos', description: 'Clear exterior photos of the truck', required: true, accept: '.jpg,.jpeg,.png,.heic' },
  { key: 'truck_inspection', label: 'Truck Inspection Report', description: 'DOT vehicle inspection certificate', required: true, accept: '.pdf,.jpg,.jpeg,.png' },
  { key: 'other', label: 'Other Document', description: 'Any other requested document', required: false, accept: '.pdf,.jpg,.jpeg,.png,.doc,.docx' },
];

const REGISTRATION_SLOT: DocumentSlot = {
  key: 'registration',
  label: 'Vehicle Registration',
  description: 'Current vehicle registration (cab card)',
  required: true,
  accept: '.pdf,.jpg,.jpeg,.png',
};

const PHYSICAL_DAMAGE_SLOT: DocumentSlot = {
  key: 'insurance_cert',
  label: 'Physical Damage Insurance Certificate',
  description: 'Copy of your own Physical Damage insurance policy certificate',
  required: true,
  accept: '.pdf,.jpg,.jpeg,.png',
};

const PE_RECEIPT_SLOT: DocumentSlot = {
  key: 'pe_receipt',
  label: 'PE Screening Receipt',
  description: 'Photo or scan of your drug screening receipt from the testing facility',
  required: false,
  accept: '.pdf,.jpg,.jpeg,.png,.heic',
};

interface UploadedDoc {
  id: string;
  document_type: string;
  file_name: string | null;
  file_url: string | null;
  uploaded_at: string;
}

interface Props {
  operatorId: string;
  uploadedDocs: UploadedDoc[];
  onboardingStatus: Record<string, string | null>;
  onUploadComplete: () => void;
}

export default function OperatorDocumentUpload({ operatorId, uploadedDocs, onboardingStatus, onUploadComplete }: Props) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState<string | null>(null);
  const [showPhotoGuide, setShowPhotoGuide] = useState(false);
  const [docPreview, setDocPreview] = useState<{ url: string; name: string } | null>(null);
  const [decalPhotoDs, setDecalPhotoDs] = useState<string | null>(onboardingStatus.decal_photo_ds_url ?? null);
  const [decalPhotoPs, setDecalPhotoPs] = useState<string | null>(onboardingStatus.decal_photo_ps_url ?? null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const decalDsRef = useRef<HTMLInputElement | null>(null);
  const decalPsRef = useRef<HTMLInputElement | null>(null);

  const getUploaded = (key: string) => uploadedDocs.filter(d => d.document_type === key);

  // Derive review status badge for doc slots that are tracked in onboarding_status
  const getReviewStatus = (key: string): 'received' | 'pending' | null => {
    const val = onboardingStatus[key];
    if (val === 'received') return 'received';
    const uploaded = uploadedDocs.filter(d => d.document_type === key);
    if (uploaded.length > 0 && val === 'requested') return 'pending';
    return null;
  };

  const handleUpload = async (slot: DocumentSlot, file: File) => {
    if (!file) return;

    const allowDocs = slot.key === 'other';
    const { valid, error: validationError } = validateFile(file, allowDocs);
    if (!valid) {
      toast({ title: 'Invalid file', description: validationError, variant: 'destructive' });
      return;
    }

    setUploading(slot.key);

    try {
      const ext = file.name.split('.').pop();
      const path = `${operatorId}/${slot.key}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('operator-documents')
        .upload(path, file, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: signedData } = await supabase.storage
        .from('operator-documents')
        .createSignedUrl(path, 60 * 60 * 24 * 365);

      const { data: urlData } = supabase.storage.from('operator-documents').getPublicUrl(path);
      const fileUrl = signedData?.signedUrl ?? urlData?.publicUrl;

      const { error: insertError } = await supabase.from('operator_documents').insert({
        operator_id: operatorId,
        document_type: slot.key as any,
        file_name: file.name,
        file_url: fileUrl,
      });
      if (insertError) throw insertError;

      // ── Auto-sync to Inspection Binder for select doc types ──────────
      // Drops a copy into existing per-driver binder sections so it appears
      // automatically in the operator's Inspection Binder.
      const binderName =
        slot.key === 'truck_inspection' ? 'Periodic DOT Inspections' :
        slot.key === 'registration'     ? 'IRP Registration (cab card)' :
        null;

      if (binderName) {
        try {
          // Look up the operator's auth user_id (binder is keyed by driver_id = user_id)
          const { data: opRow } = await supabase
            .from('operators')
            .select('user_id')
            .eq('id', operatorId)
            .maybeSingle();

          if (opRow?.user_id) {
            await supabase.from('inspection_documents').insert({
              name: binderName,
              scope: 'per_driver',
              driver_id: opRow.user_id,
              file_url: fileUrl,
              file_path: path,
              uploaded_by: opRow.user_id,
              expires_at: null,
            });
          }
        } catch {
          // Non-critical — primary upload already succeeded
        }
      }

      // For PE receipt, fire a notification to staff
      if (slot.key === 'pe_receipt') {
        try {
          const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
          await supabase.functions.invoke('send-notification', {
            body: { type: 'pe_receipt_uploaded', operator_id: operatorId },
          });
        } catch {
          // non-critical — don't block the upload success
        }
      }

      // For truck photos uploaded outside the guided flow, bump onboarding
      // status off 'not_started' so the operator's Stage 2 substep reflects
      // progress immediately. Don't downgrade a staff 'received' mark.
      if (slot.key === 'truck_photos') {
        try {
          const { data: osRow } = await supabase
            .from('onboarding_status')
            .select('truck_photos')
            .eq('operator_id', operatorId)
            .maybeSingle();
          if (osRow && osRow.truck_photos !== 'received') {
            await supabase
              .from('onboarding_status')
              .update({ truck_photos: 'requested' })
              .eq('operator_id', operatorId);
          }
        } catch {
          // non-critical
        }
      }

      toast({ title: 'Document uploaded', description: `${slot.label} has been submitted for review.` });
      onUploadComplete();
    } catch (err: unknown) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setUploading(null);
    }
  };

  const handleDecalPhoto = async (side: 'ds' | 'ps', file: File) => {
    const { valid, error: validationError } = validateFile(file, false);
    if (!valid) {
      toast({ title: 'Invalid file', description: validationError, variant: 'destructive' });
      return;
    }

    const key = `decal_photo_${side}`;
    setUploading(key);

    try {
      const ext = file.name.split('.').pop();
      const path = `${operatorId}/decal_photos/${side}_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('operator-documents')
        .upload(path, file, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: signedData } = await supabase.storage
        .from('operator-documents')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5); // 5-year URL

      const { data: urlData } = supabase.storage.from('operator-documents').getPublicUrl(path);
      const fileUrl = signedData?.signedUrl ?? urlData?.publicUrl;

      // Update onboarding_status with the photo URL
      const column = side === 'ds' ? 'decal_photo_ds_url' : 'decal_photo_ps_url';
      const { error: updateError } = await supabase
        .from('onboarding_status')
        .update({ [column]: fileUrl })
        .eq('operator_id', operatorId);

      if (updateError) throw updateError;

      if (side === 'ds') setDecalPhotoDs(fileUrl ?? null);
      else setDecalPhotoPs(fileUrl ?? null);

      const sideLabel = side === 'ds' ? 'Driver Side' : 'Passenger Side';
      toast({ title: 'Photo uploaded', description: `Decal ${sideLabel} photo submitted.` });
    } catch (err: unknown) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setUploading(null);
    }
  };

  const decalApplied = onboardingStatus.decal_applied === 'yes';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Document Uploads</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Upload your required onboarding documents. Staff will review and confirm each one.
        </p>
      </div>

      <div className="bg-accent/10 border border-accent/30 rounded-xl p-4">
        <div className="flex gap-2.5">
          <AlertCircle className="h-4 w-4 text-gold shrink-0 mt-0.5" />
          <p className="text-xs text-foreground/70 leading-relaxed">
            <strong>Important:</strong> Missouri registration requires Form 2290, Truck Title, and a signed ICA Agreement to be submitted together. Upload all three before your onboarding coordinator submits to the state.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {DOCUMENT_SLOTS.map(slot => {
          const uploaded = getUploaded(slot.key);
          const isUploading = uploading === slot.key;
          const reviewStatus = getReviewStatus(slot.key);

          return (
            <div key={slot.key} className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                    reviewStatus === 'received' ? 'bg-status-complete/10' :
                    reviewStatus === 'pending' ? 'bg-info/10' :
                    uploaded.length > 0 ? 'bg-status-complete/10' : 'bg-secondary'
                  }`}>
                    {reviewStatus === 'received'
                      ? <CheckCircle2 className="h-4 w-4 text-status-complete" />
                      : reviewStatus === 'pending'
                      ? <Clock className="h-4 w-4 text-info" />
                      : uploaded.length > 0
                      ? <CheckCircle2 className="h-4 w-4 text-status-complete" />
                      : <FileText className="h-4 w-4 text-muted-foreground" />
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <p className="font-medium text-foreground text-sm leading-tight">{slot.label}</p>
                        {slot.required && <span className="text-[10px] bg-gold/15 text-gold-muted px-1.5 py-0.5 rounded font-medium">Required</span>}
                        {reviewStatus === 'received' && (
                          <span className="text-[10px] bg-status-complete/15 text-status-complete px-1.5 py-0.5 rounded font-semibold flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Received
                          </span>
                        )}
                        {reviewStatus === 'pending' && slot.key !== 'truck_photos' && (
                          <span className="text-[10px] bg-info/10 text-info px-1.5 py-0.5 rounded font-semibold flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Pending Review
                          </span>
                        )}
                        {reviewStatus === 'pending' && slot.key === 'truck_photos' && (() => {
                          const distinctSlotsUploaded = new Set(
                            uploaded
                              .map(d => (d.file_name ?? '').split(' — ')[0].trim())
                              .filter(Boolean)
                          ).size;
                          if (distinctSlotsUploaded >= 10) {
                            return (
                              <span className="text-[10px] bg-gold/15 text-gold-muted px-1.5 py-0.5 rounded font-semibold flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Awaiting coordinator review
                              </span>
                            );
                          }
                          return (
                            <span className="text-[10px] bg-info/10 text-info px-1.5 py-0.5 rounded font-semibold flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {distinctSlotsUploaded} of 10 uploaded
                            </span>
                          );
                        })()}
                        {!reviewStatus && uploaded.length > 0 && (
                          <span className="text-[10px] bg-status-complete/15 text-status-complete px-1.5 py-0.5 rounded font-medium">Submitted</span>
                        )}
                      </div>
                      {slot.key !== 'truck_photos' && (
                        <div className="shrink-0">
                          <input
                            ref={el => { fileInputRefs.current[slot.key] = el; }}
                            type="file"
                            accept={slot.accept}
                            className="hidden"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) handleUpload(slot, file);
                              e.target.value = '';
                            }}
                          />
                          <Button
                            size="sm"
                            variant={uploaded.length > 0 ? 'outline' : 'default'}
                            disabled={isUploading}
                            onClick={() => fileInputRefs.current[slot.key]?.click()}
                            className={`text-xs gap-1.5 h-9 px-3 min-w-[80px] ${uploaded.length === 0 ? 'bg-gold text-surface-dark hover:bg-gold-light' : ''}`}
                          >
                            {isUploading
                              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /><span>Uploading…</span></>
                              : <><Upload className="h-3.5 w-3.5" /><span>{uploaded.length > 0 ? 'Add More' : 'Upload'}</span></>
                            }
                          </Button>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground mt-0.5">{slot.description}</p>

                    {slot.key === 'truck_photos' && (() => {
                      const REQUIRED_PHOTO_COUNT = 10;
                      // Count distinct truck-photo slots uploaded (file_name prefix encodes the slot label)
                      const distinctSlotsUploaded = new Set(
                        uploaded
                          .map(d => (d.file_name ?? '').split(' — ')[0].trim())
                          .filter(Boolean)
                      ).size;
                      const isReceivedByStaff = reviewStatus === 'received';
                      const photosComplete = distinctSlotsUploaded >= REQUIRED_PHOTO_COUNT;

                      // Staff-side override: photos received via email and uploaded/confirmed by coordinator
                      if (isReceivedByStaff) {
                        return (
                          <div className="mt-2 p-3 rounded-lg bg-status-complete/10 border border-status-complete/30">
                            <div className="flex items-start gap-2">
                              <CheckCircle2 className="h-4 w-4 text-status-complete shrink-0 mt-0.5" />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-status-complete leading-tight">
                                  Received by coordinator ✓
                                </p>
                                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                                  Your truck photos have been received and filed by your onboarding coordinator. No further action needed.
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div className="mt-2 space-y-2">
                          {/* Progress chip — required count */}
                          <div className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md font-medium ${
                            photosComplete
                              ? 'bg-status-complete/15 text-status-complete'
                              : 'bg-warning/15 text-warning'
                          }`}>
                            <Camera className="h-3 w-3" />
                            <span>{distinctSlotsUploaded} of {REQUIRED_PHOTO_COUNT} required photos uploaded</span>
                          </div>
                          {!photosComplete && distinctSlotsUploaded > 0 && (
                            <p className="text-[11px] text-warning/90 leading-snug">
                              All 10 photos are required. Tap below to capture the missing shots.
                            </p>
                          )}
                          <Button
                            size="sm"
                            className="text-xs gap-1.5 h-9 px-4 bg-gold text-surface-dark hover:bg-gold-light"
                            onClick={() => setShowPhotoGuide(true)}
                          >
                            <Camera className="h-3.5 w-3.5" />
                            {distinctSlotsUploaded === 0
                              ? 'Take Truck Photos (10 Required)'
                              : photosComplete
                              ? 'Review / Replace Photos'
                              : `Continue Truck Photos (${REQUIRED_PHOTO_COUNT - distinctSlotsUploaded} left)`}
                          </Button>
                        </div>
                      );
                    })()}

                    {uploaded.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {uploaded.map(doc => (
                          <div key={doc.id} className="flex items-center gap-1.5 text-xs flex-wrap">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-muted-foreground truncate min-w-0 flex-1">{doc.file_name ?? 'document'}</span>
                            <span className="text-muted-foreground shrink-0">{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                            {doc.file_url && (
                              <button
                                onClick={() => setDocPreview({ url: doc.file_url!, name: doc.file_name ?? 'document' })}
                                className="text-gold hover:underline flex items-center gap-0.5 shrink-0 text-xs">
                                View <Eye className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Vehicle Registration Upload (own registration only) ──────── */}
      {onboardingStatus.registration_status === 'own_registration' && (() => {
        const slot = REGISTRATION_SLOT;
        const uploaded = getUploaded(slot.key);
        const isUploading = uploading === slot.key;
        const reviewStatus = getReviewStatus(slot.key);
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-gold" />
              <h3 className="font-semibold text-foreground text-sm">Vehicle Registration</h3>
              <span className="text-[10px] bg-gold/15 text-gold-muted px-1.5 py-0.5 rounded font-medium">Required</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Since you have your own registration, please upload a current copy so your coordinator can verify it and file it in your inspection binder.
            </p>
            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                    reviewStatus === 'received' ? 'bg-status-complete/10' :
                    reviewStatus === 'pending' ? 'bg-info/10' :
                    uploaded.length > 0 ? 'bg-status-complete/10' : 'bg-secondary'
                  }`}>
                    {reviewStatus === 'received'
                      ? <CheckCircle2 className="h-4 w-4 text-status-complete" />
                      : reviewStatus === 'pending'
                      ? <Clock className="h-4 w-4 text-info" />
                      : uploaded.length > 0
                      ? <CheckCircle2 className="h-4 w-4 text-status-complete" />
                      : <FileText className="h-4 w-4 text-muted-foreground" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <p className="font-medium text-foreground text-sm leading-tight">{slot.label}</p>
                        <span className="text-[10px] bg-gold/15 text-gold-muted px-1.5 py-0.5 rounded font-medium">Required</span>
                        {reviewStatus === 'received' && (
                          <span className="text-[10px] bg-status-complete/15 text-status-complete px-1.5 py-0.5 rounded font-semibold flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Received
                          </span>
                        )}
                        {reviewStatus === 'pending' && (
                          <span className="text-[10px] bg-info/10 text-info px-1.5 py-0.5 rounded font-semibold flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Pending Review
                          </span>
                        )}
                        {!reviewStatus && uploaded.length > 0 && (
                          <span className="text-[10px] bg-status-complete/15 text-status-complete px-1.5 py-0.5 rounded font-medium">Submitted</span>
                        )}
                      </div>
                      <div className="shrink-0">
                        <input
                          ref={el => { fileInputRefs.current[slot.key] = el; }}
                          type="file"
                          accept={slot.accept}
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) handleUpload(slot, file);
                            e.target.value = '';
                          }}
                        />
                        <Button
                          size="sm"
                          variant={uploaded.length > 0 ? 'outline' : 'default'}
                          disabled={isUploading}
                          onClick={() => fileInputRefs.current[slot.key]?.click()}
                          className={`text-xs gap-1.5 h-9 px-3 min-w-[80px] ${uploaded.length === 0 ? 'bg-gold text-surface-dark hover:bg-gold-light' : ''}`}
                        >
                          {isUploading
                            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /><span>Uploading…</span></>
                            : <><Upload className="h-3.5 w-3.5" /><span>{uploaded.length > 0 ? 'Add More' : 'Upload'}</span></>
                          }
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{slot.description}</p>
                    {uploaded.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {uploaded.map(doc => (
                          <div key={doc.id} className="flex items-center gap-1.5 text-xs flex-wrap">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-muted-foreground truncate min-w-0 flex-1">{doc.file_name ?? 'document'}</span>
                            <span className="text-muted-foreground shrink-0">{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                            {doc.file_url && (
                              <button
                                onClick={() => setDocPreview({ url: doc.file_url!, name: doc.file_name ?? 'document' })}
                                className="text-gold hover:underline flex items-center gap-0.5 shrink-0 text-xs">
                                View <Eye className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Physical Damage Insurance Upload (own policy only) ───────── */}
      {onboardingStatus.insurance_policy_type === 'own_policy' && (() => {
        const slot = PHYSICAL_DAMAGE_SLOT;
        const uploaded = getUploaded(slot.key);
        const isUploading = uploading === slot.key;
        const reviewStatus = getReviewStatus(slot.key);
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-gold" />
              <h3 className="font-semibold text-foreground text-sm">Physical Damage Insurance</h3>
              <span className="text-[10px] bg-gold/15 text-gold-muted px-1.5 py-0.5 rounded font-medium">Required</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Since you have your own Physical Damage policy, please upload a copy of your insurance certificate here so your coordinator can verify it.
            </p>
            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                    reviewStatus === 'received' ? 'bg-status-complete/10' :
                    reviewStatus === 'pending' ? 'bg-info/10' :
                    uploaded.length > 0 ? 'bg-status-complete/10' : 'bg-secondary'
                  }`}>
                    {reviewStatus === 'received'
                      ? <CheckCircle2 className="h-4 w-4 text-status-complete" />
                      : reviewStatus === 'pending'
                      ? <Clock className="h-4 w-4 text-info" />
                      : uploaded.length > 0
                      ? <CheckCircle2 className="h-4 w-4 text-status-complete" />
                      : <FileText className="h-4 w-4 text-muted-foreground" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <p className="font-medium text-foreground text-sm leading-tight">{slot.label}</p>
                        <span className="text-[10px] bg-gold/15 text-gold-muted px-1.5 py-0.5 rounded font-medium">Required</span>
                        {reviewStatus === 'received' && (
                          <span className="text-[10px] bg-status-complete/15 text-status-complete px-1.5 py-0.5 rounded font-semibold flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Received
                          </span>
                        )}
                        {reviewStatus === 'pending' && (
                          <span className="text-[10px] bg-info/10 text-info px-1.5 py-0.5 rounded font-semibold flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Pending Review
                          </span>
                        )}
                        {!reviewStatus && uploaded.length > 0 && (
                          <span className="text-[10px] bg-status-complete/15 text-status-complete px-1.5 py-0.5 rounded font-medium">Submitted</span>
                        )}
                      </div>
                      <div className="shrink-0">
                        <input
                          ref={el => { fileInputRefs.current[slot.key] = el; }}
                          type="file"
                          accept={slot.accept}
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) handleUpload(slot, file);
                            e.target.value = '';
                          }}
                        />
                        <Button
                          size="sm"
                          variant={uploaded.length > 0 ? 'outline' : 'default'}
                          disabled={isUploading}
                          onClick={() => fileInputRefs.current[slot.key]?.click()}
                          className={`text-xs gap-1.5 h-9 px-3 min-w-[80px] ${uploaded.length === 0 ? 'bg-gold text-surface-dark hover:bg-gold-light' : ''}`}
                        >
                          {isUploading
                            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /><span>Uploading…</span></>
                            : <><Upload className="h-3.5 w-3.5" /><span>{uploaded.length > 0 ? 'Add More' : 'Upload'}</span></>
                          }
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{slot.description}</p>
                    {uploaded.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {uploaded.map(doc => (
                          <div key={doc.id} className="flex items-center gap-1.5 text-xs flex-wrap">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-muted-foreground truncate min-w-0 flex-1">{doc.file_name ?? 'document'}</span>
                            <span className="text-muted-foreground shrink-0">{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                            {doc.file_url && (
                              <button
                                onClick={() => setDocPreview({ url: doc.file_url!, name: doc.file_name ?? 'document' })}
                                className="text-gold hover:underline flex items-center gap-0.5 shrink-0 text-xs">
                                View <Eye className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── PE Screening Receipt Upload ──────────────────────────────── */}
      {(onboardingStatus.pe_screening === 'scheduled' || onboardingStatus.pe_screening === 'results_in') && (() => {
        const slot = PE_RECEIPT_SLOT;
        const uploaded = getUploaded(slot.key);
        const isUploading = uploading === slot.key;
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-gold" />
              <h3 className="font-semibold text-foreground text-sm">PE Screening Receipt</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              After completing your drug screening, you'll receive a receipt from the testing facility. Please upload a photo or scan of that receipt here.
            </p>
            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${uploaded.length > 0 ? 'bg-status-complete/10' : 'bg-secondary'}`}>
                    {uploaded.length > 0
                      ? <CheckCircle2 className="h-4 w-4 text-status-complete" />
                      : <Camera className="h-4 w-4 text-muted-foreground" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <p className="font-medium text-foreground text-sm leading-tight">{slot.label}</p>
                        {!uploaded.length && (
                          <span className="text-[10px] bg-gold/15 text-gold-muted px-1.5 py-0.5 rounded font-medium">Action Required</span>
                        )}
                        {uploaded.length > 0 && (
                          <span className="text-[10px] bg-status-complete/15 text-status-complete px-1.5 py-0.5 rounded font-medium">Submitted</span>
                        )}
                      </div>
                      <div className="shrink-0">
                        <input
                          ref={el => { fileInputRefs.current[slot.key] = el; }}
                          type="file"
                          accept={slot.accept}
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) handleUpload(slot, file);
                            e.target.value = '';
                          }}
                        />
                        <Button
                          size="sm"
                          variant={uploaded.length > 0 ? 'outline' : 'default'}
                          disabled={isUploading}
                          onClick={() => fileInputRefs.current[slot.key]?.click()}
                          className={`text-xs gap-1.5 h-9 px-3 min-w-[80px] ${uploaded.length === 0 ? 'bg-gold text-surface-dark hover:bg-gold-light' : ''}`}
                        >
                          {isUploading
                            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /><span>Uploading…</span></>
                            : <><Upload className="h-3.5 w-3.5" /><span>{uploaded.length > 0 ? 'Add More' : 'Upload'}</span></>
                          }
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{slot.description}</p>
                    {uploaded.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {uploaded.map(doc => (
                          <div key={doc.id} className="flex items-center gap-1.5 text-xs flex-wrap">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-muted-foreground truncate min-w-0 flex-1">{doc.file_name ?? 'receipt'}</span>
                            <span className="text-muted-foreground shrink-0">{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                            {doc.file_url && (
                              <button
                                onClick={() => setDocPreview({ url: doc.file_url!, name: doc.file_name ?? 'receipt' })}
                                className="text-gold hover:underline flex items-center gap-0.5 shrink-0 text-xs">
                                View <Eye className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Decal Install Photos ─────────────────────────────────────── */}
      {decalApplied && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Image className="h-4 w-4 text-gold" />
            <h3 className="font-semibold text-foreground text-sm">Decal Install Photos</h3>
            <span className="text-[10px] bg-gold/15 text-gold-muted px-1.5 py-0.5 rounded font-medium">Required</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Now that your decal has been applied, please upload a photo of each side of the truck showing the installed decal.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {/* Driver Side */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Driver Side</p>
                {decalPhotoDs && <CheckCircle2 className="h-4 w-4 text-status-complete" />}
              </div>
              {decalPhotoDs ? (
                <a href={decalPhotoDs} target="_blank" rel="noopener noreferrer">
                  <img src={decalPhotoDs} alt="Decal Driver Side" className="w-full aspect-video object-cover rounded-lg border border-border hover:opacity-90 transition-opacity" />
                </a>
              ) : (
                <div className="w-full aspect-video rounded-lg border border-dashed border-border bg-muted/30 flex items-center justify-center">
                  <Camera className="h-6 w-6 text-muted-foreground/50" />
                </div>
              )}
              <input
                ref={decalDsRef}
                type="file"
                accept=".jpg,.jpeg,.png,.heic"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleDecalPhoto('ds', file);
                  e.target.value = '';
                }}
              />
              <Button
                size="sm"
                variant={decalPhotoDs ? 'outline' : 'default'}
                disabled={uploading === 'decal_photo_ds'}
                onClick={() => decalDsRef.current?.click()}
                className={`w-full text-xs gap-1.5 ${!decalPhotoDs ? 'bg-gold text-surface-dark hover:bg-gold-light' : ''}`}
              >
                {uploading === 'decal_photo_ds'
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</>
                  : <><Upload className="h-3.5 w-3.5" /> {decalPhotoDs ? 'Replace Photo' : 'Upload Photo'}</>
                }
              </Button>
            </div>

            {/* Passenger Side */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Passenger Side</p>
                {decalPhotoPs && <CheckCircle2 className="h-4 w-4 text-status-complete" />}
              </div>
              {decalPhotoPs ? (
                <a href={decalPhotoPs} target="_blank" rel="noopener noreferrer">
                  <img src={decalPhotoPs} alt="Decal Passenger Side" className="w-full aspect-video object-cover rounded-lg border border-border hover:opacity-90 transition-opacity" />
                </a>
              ) : (
                <div className="w-full aspect-video rounded-lg border border-dashed border-border bg-muted/30 flex items-center justify-center">
                  <Camera className="h-6 w-6 text-muted-foreground/50" />
                </div>
              )}
              <input
                ref={decalPsRef}
                type="file"
                accept=".jpg,.jpeg,.png,.heic"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleDecalPhoto('ps', file);
                  e.target.value = '';
                }}
              />
              <Button
                size="sm"
                variant={decalPhotoPs ? 'outline' : 'default'}
                disabled={uploading === 'decal_photo_ps'}
                onClick={() => decalPsRef.current?.click()}
                className={`w-full text-xs gap-1.5 ${!decalPhotoPs ? 'bg-gold text-surface-dark hover:bg-gold-light' : ''}`}
              >
                {uploading === 'decal_photo_ps'
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</>
                  : <><Upload className="h-3.5 w-3.5" /> {decalPhotoPs ? 'Replace Photo' : 'Upload Photo'}</>
                }
              </Button>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Accepted formats: PDF, JPG, PNG · Max 10 MB per file
      </p>

      <TruckPhotoGuideModal
        open={showPhotoGuide}
        onClose={() => setShowPhotoGuide(false)}
        operatorId={operatorId}
        onComplete={onUploadComplete}
        alreadyUploadedLabels={Array.from(new Set(
          getUploaded('truck_photos')
            .map(d => (d.file_name ?? '').split(' — ')[0].trim())
            .filter(Boolean)
        ))}
      />

      {docPreview && (
        <FilePreviewModal
          url={docPreview.url}
          name={docPreview.name}
          onClose={() => setDocPreview(null)}
          bucketName="operator-documents"
          onSaved={() => onUploadComplete()}
        />
      )}
    </div>
  );
}
