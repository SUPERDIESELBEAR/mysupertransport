import { useState, useRef } from 'react';
import { Upload, CheckCircle2, Loader2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ApplicationFormData } from './types';
import { FormField } from './FormField';

interface Props {
  data: ApplicationFormData;
  onChange: (field: keyof ApplicationFormData, value: any) => void;
  errors: Partial<Record<keyof ApplicationFormData, string>>;
}

interface FileUploadProps {
  label: string;
  hint?: string;
  value: string;
  onUploaded: (url: string) => void;
  accept?: string;
  required?: boolean;
  error?: string;
}

function FileUploader({ label, hint, value, onUploaded, accept = 'image/*,application/pdf', required, error }: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    setUploadError('');
    try {
      const ext = file.name.split('.').pop();
      const path = `applications/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('application-documents')
        .upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage
        .from('application-documents')
        .getPublicUrl(path);
      onUploaded(publicUrl || path);
    } catch (e: any) {
      setUploadError(e.message || 'Upload failed. Please try again.');
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
      {value ? (
        <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
          <span className="text-sm text-green-700 font-medium flex-1">File uploaded successfully</span>
          <button
            type="button"
            onClick={() => { onUploaded(''); if (inputRef.current) inputRef.current.value = ''; }}
            className="text-muted-foreground hover:text-destructive transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors hover:border-gold/50 hover:bg-gold/5 ${error ? 'border-destructive' : 'border-border'}`}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 text-gold animate-spin" />
              <p className="text-sm text-muted-foreground">Uploading…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Tap to upload or drag & drop</p>
              <p className="text-xs text-muted-foreground">JPG, PNG, or PDF</p>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={handleChange}
            className="hidden"
          />
        </div>
      )}
    </FormField>
  );
}

export default function Step7Documents({ data, onChange, errors }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground mb-1">Document Uploads</h2>
        <p className="text-sm text-muted-foreground">
          Upload clear photos or scans of the following documents. JPG, PNG, and PDF files are accepted.
        </p>
      </div>

      <FileUploader
        label="Front of Driver's License"
        hint="Photo must be clear and all text readable"
        value={data.dl_front_url}
        onUploaded={url => onChange('dl_front_url', url)}
        required
        error={errors.dl_front_url}
      />
      <FileUploader
        label="Rear of Driver's License"
        hint="Photo must be clear and all text readable"
        value={data.dl_rear_url}
        onUploaded={url => onChange('dl_rear_url', url)}
        required
        error={errors.dl_rear_url}
      />
      <FileUploader
        label="Medical Certificate (Short Form)"
        hint="Must be current and not expired"
        value={data.medical_cert_url}
        onUploaded={url => onChange('medical_cert_url', url)}
        required
        error={errors.medical_cert_url}
      />
    </div>
  );
}
