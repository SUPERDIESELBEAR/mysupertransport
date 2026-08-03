import { useState, useRef, useEffect } from 'react';
import { Upload, CheckCircle2, Loader2, X, AlertCircle, Camera } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ApplicationFormData } from './types';
import { FormField } from './FormField';
import { validateFile } from '@/lib/validateFile';
import { uploadToBucket } from '@/lib/uploadWithAuth';
import { retakeReasonLabel, type RetakeRequestMap, type RetakeDocumentKey } from '@/lib/applicationDocumentRetake';

interface Props {
  data: ApplicationFormData;
  onChange: (field: keyof ApplicationFormData, value: any) => void;
  errors: Partial<Record<keyof ApplicationFormData, string>>;
  /** Slots staff asked the applicant to re-upload. */
  retakeRequests?: RetakeRequestMap;
}

interface FileUploadProps {
  label: string;
  hint?: string;
  value: string;
  onUploaded: (url: string) => void;
  accept?: string;
  required?: boolean;
  error?: string;
  retakeNotice?: { reason?: string | null; note?: string | null } | null;
}

function FileUploader({ label, hint, value, onUploaded, accept = 'image/*,application/pdf', required, error, retakeNotice }: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [canCapture, setCanCapture] = useState(false);

  // Only offer "Take Photo" on devices with a real camera-first input (phones/tablets)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    setCanCapture(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  const handleFile = async (file: File) => {
    setUploadError('');

    // ── Validate before uploading ─────────────────────────────────────────
    const { valid, error: validationError } = validateFile(file);
    if (!valid) {
      setUploadError(validationError!);
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const draftToken = localStorage.getItem('supertransport_draft_token') || '';
      const folder = draftToken ? `applications/${draftToken}` : 'applications';
      const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr, authUid } = await uploadToBucket(
        'application-documents',
        path,
        file,
        { upsert: false, requireSession: false },
      );
      if (upErr) {
        console.error('[Step7Documents] upload failed', { authUid, message: upErr.message });
        throw upErr;
      }
      onUploaded(path);
    } catch (e: unknown) {
      setUploadError(
        e instanceof Error
          ? e.message
          : "We couldn't upload that file. Please check your connection and try again.",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <FormField label={label} required={required} error={error || uploadError} hint={hint}>
      {retakeNotice && !value && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-status-progress/40 bg-status-progress/10 p-3">
          <AlertCircle className="h-4 w-4 text-status-progress shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-xs leading-relaxed text-foreground">
            <p className="font-semibold">Please upload this one again</p>
            <p className="mt-0.5">{retakeReasonLabel(retakeNotice.reason)}</p>
            {retakeNotice.note && <p className="mt-1 text-muted-foreground">{retakeNotice.note}</p>}
          </div>
        </div>
      )}
      {value ? (
        <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
          <span className="text-sm text-green-700 font-medium flex-1">File uploaded successfully</span>
          <button
            type="button"
            onClick={() => { onUploaded(''); if (inputRef.current) inputRef.current.value = ''; }}
            className="text-muted-foreground hover:text-destructive transition-colors inline-flex items-center justify-center h-11 w-11 rounded-md shrink-0"
            aria-label="Remove uploaded file"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${canCapture ? '' : 'cursor-pointer hover:border-gold/50 hover:bg-gold/5'} ${(error || uploadError) ? 'border-destructive' : 'border-border'}`}
          onClick={canCapture ? undefined : () => inputRef.current?.click()}
          onKeyDown={canCapture ? undefined : (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          role={canCapture ? undefined : 'button'}
          tabIndex={canCapture ? undefined : 0}
          aria-label={canCapture ? undefined : `Upload ${label}. Tap or press Enter to choose a file, or drag and drop.`}
          aria-busy={uploading}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 text-gold animate-spin" />
              <p className="text-sm text-muted-foreground">Uploading…</p>
            </div>
          ) : canCapture ? (
            <div className="flex flex-col items-center gap-3">
              <div className="flex flex-wrap items-center justify-center gap-2 w-full">
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  className="inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-lg bg-gold text-primary-foreground text-sm font-semibold flex-1 min-w-[9rem] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
                  aria-label={`Take a photo of ${label} with your camera`}
                >
                  <Camera className="h-4 w-4" aria-hidden="true" /> Take Photo
                </button>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-lg border border-border bg-background text-foreground text-sm font-semibold flex-1 min-w-[9rem] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
                  aria-label={`Choose an existing file for ${label}`}
                >
                  <Upload className="h-4 w-4" aria-hidden="true" /> Choose File
                </button>
              </div>
              <p className="text-xs text-muted-foreground">JPG, PNG, or PDF · Max 10 MB</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">Tap to upload or drag & drop</p>
              <p className="text-xs text-muted-foreground">JPG, PNG, or PDF · Max 10 MB</p>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={handleChange}
            className="hidden"
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleChange}
            className="hidden"
          />
        </div>
      )}
    </FormField>
  );
}

export default function Step7Documents({ data, onChange, errors, retakeRequests }: Props) {
  const notice = (key: RetakeDocumentKey) => retakeRequests?.[key] ?? null;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground mb-1">Document Uploads</h2>
        <p className="text-sm text-muted-foreground">
          Upload clear photos or scans of the following documents. JPG, PNG, and PDF files are accepted.
        </p>
      </div>

      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800">
          <strong>File requirements:</strong> PDF, JPG, or PNG only · Maximum 10 MB per file
        </p>
      </div>

      <FileUploader
        label="Front of Driver's License"
        hint="Photo must be clear and all text readable"
        value={data.dl_front_url}
        onUploaded={url => onChange('dl_front_url', url)}
        required
        error={errors.dl_front_url}
        retakeNotice={notice('dl_front_url')}
      />
      <FileUploader
        label="Rear of Driver's License"
        hint="Photo must be clear and all text readable"
        value={data.dl_rear_url}
        onUploaded={url => onChange('dl_rear_url', url)}
        required
        error={errors.dl_rear_url}
        retakeNotice={notice('dl_rear_url')}
      />
      <FileUploader
        label="Medical Certificate (Short Form)"
        hint="Must be current and not expired"
        value={data.medical_cert_url}
        onUploaded={url => onChange('medical_cert_url', url)}
        required
        error={errors.medical_cert_url}
        retakeNotice={notice('medical_cert_url')}
      />
    </div>
  );
}
