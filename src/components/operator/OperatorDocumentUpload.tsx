import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileText, CheckCircle2, Loader2, ExternalLink, AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { validateFile } from '@/lib/validateFile';

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
  { key: 'registration', label: 'Vehicle Registration', description: 'Current registration document', required: false, accept: '.pdf,.jpg,.jpeg,.png' },
  { key: 'insurance_cert', label: 'Insurance Certificate', description: 'Proof of commercial insurance', required: false, accept: '.pdf,.jpg,.jpeg,.png' },
  { key: 'other', label: 'Other Document', description: 'Any other requested document', required: false, accept: '.pdf,.jpg,.jpeg,.png,.doc,.docx' },
];

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
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

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
    setUploading(slot.key);

    try {
      const ext = file.name.split('.').pop();
      const path = `${operatorId}/${slot.key}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('operator-documents')
        .upload(path, file, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('operator-documents')
        .getPublicUrl(path);

      // Use signed URL approach since bucket is private
      const { data: signedData } = await supabase.storage
        .from('operator-documents')
        .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year

      const fileUrl = signedData?.signedUrl ?? urlData?.publicUrl;

      await supabase.from('operator_documents').insert({
        operator_id: operatorId,
        document_type: slot.key as any,
        file_name: file.name,
        file_url: fileUrl,
      });

      // Notification to staff is handled server-side via DB trigger

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
                  {/* Icon */}
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                    reviewStatus === 'received' ? 'bg-status-complete/10' :
                    reviewStatus === 'pending' ? 'bg-info/10' :
                    uploaded.length > 0 ? 'bg-status-complete/10' : 'bg-secondary'
                  }`}>
                    {reviewStatus === 'received'
                      ? <CheckCircle2 className="h-5 w-5 text-status-complete" />
                      : reviewStatus === 'pending'
                      ? <Clock className="h-5 w-5 text-info" />
                      : uploaded.length > 0
                      ? <CheckCircle2 className="h-5 w-5 text-status-complete" />
                      : <FileText className="h-5 w-5 text-muted-foreground" />
                    }
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-foreground text-sm">{slot.label}</p>
                      {slot.required && <span className="text-[10px] bg-gold/15 text-gold-muted px-1.5 py-0.5 rounded font-medium">Required</span>}
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
                    <p className="text-xs text-muted-foreground mt-0.5">{slot.description}</p>

                    {/* Uploaded files */}
                    {uploaded.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {uploaded.map(doc => (
                          <div key={doc.id} className="flex items-center gap-2 text-xs">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-muted-foreground truncate max-w-[200px]">{doc.file_name ?? 'document'}</span>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-muted-foreground">{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                            {doc.file_url && (
                              <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                                className="text-gold hover:underline flex items-center gap-0.5 ml-auto shrink-0">
                                View <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Upload button */}
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
                      className={`text-xs gap-1.5 ${uploaded.length === 0 ? 'bg-gold text-surface-dark hover:bg-gold-light' : ''}`}
                    >
                      {isUploading
                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</>
                        : <><Upload className="h-3.5 w-3.5" /> {uploaded.length > 0 ? 'Add More' : 'Upload'}</>
                      }
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Accepted formats: PDF, JPG, PNG · Max 20MB per file
      </p>
    </div>
  );
}
