import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { validateFile, normalizeMobileCaptureFile } from '@/lib/validateFile';
import { FilePreviewModal } from '@/components/inspection/DocRow';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Upload,
  CheckCircle2,
  Camera,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Eye,
  X,
} from 'lucide-react';

interface PhotoSlot {
  key: string;
  label: string;
  hint: string;
  
  example: string;
}

const PHOTO_SLOTS: PhotoSlot[] = [
  {
    key: 'truck_photos_front',
    label: 'Front',
    hint: 'Face the truck straight-on. Full front bumper, grille, and both headlights must be clearly visible.',
    
    example: 'Stand ~20 ft in front, centered',
  },
  {
    key: 'truck_photos_driver_side',
    label: 'Driver Side',
    hint: 'Full profile from the driver (left) side. Capture the entire truck length — cab to rear axle.',
    
    example: 'Stand perpendicular, ~30 ft away',
  },
  {
    key: 'truck_photos_rear',
    label: 'Rear',
    hint: 'Capture the full rear — doors, rear lights, mud flaps, and any visible frame/hitch.',
    
    example: 'Stand ~20 ft behind, centered',
  },
  {
    key: 'truck_photos_passenger_side',
    label: 'Passenger Side',
    hint: 'Full profile from the passenger (right) side. Capture the entire truck length — cab to rear axle.',
    
    example: 'Stand perpendicular, ~30 ft away',
  },
  {
    key: 'truck_photos_ps_steer_tire',
    label: 'PS Steer Tire',
    hint: 'Passenger-side front steer tire. Capture the full tire and wheel — tread depth and sidewall must be visible.',
    example: 'Crouch to tire level, ~3 ft away',
  },
  {
    key: 'truck_photos_ds_steer_tire',
    label: 'DS Steer Tire',
    hint: 'Driver-side front steer tire. Capture the full tire and wheel — tread depth and sidewall must be visible.',
    example: 'Crouch to tire level, ~3 ft away',
  },
  {
    key: 'truck_photos_ds_front_drive',
    label: 'DS Front Drive Tires',
    hint: 'Driver-side front drive axle tires (inner & outer). Both tires and the full wheel assembly should be visible.',
    example: 'Stand back slightly to capture both tires',
  },
  {
    key: 'truck_photos_ds_rear_drive',
    label: 'DS Rear Drive Tires',
    hint: 'Driver-side rear drive axle tires (inner & outer). Both tires and the full wheel assembly should be visible.',
    example: 'Stand back slightly to capture both tires',
  },
  {
    key: 'truck_photos_ps_front_drive',
    label: 'PS Front Drive Tires',
    hint: 'Passenger-side front drive axle tires (inner & outer). Both tires and the full wheel assembly should be visible.',
    example: 'Stand back slightly to capture both tires',
  },
  {
    key: 'truck_photos_ps_rear_drive',
    label: 'PS Rear Drive Tires',
    hint: 'Passenger-side rear drive axle tires (inner & outer). Both tires and the full wheel assembly should be visible.',
    example: 'Stand back slightly to capture both tires',
  },
];

interface UploadedPhoto {
  slotKey: string;
  fileName: string;
  fileUrl: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  operatorId: string;
  onComplete: () => void;
  /** Slot labels (e.g. "Front", "DS Steer Tire") already uploaded — used to mark steps complete on open. */
  alreadyUploadedLabels?: string[];
}

export default function TruckPhotoGuideModal({ open, onClose, operatorId, onComplete, alreadyUploadedLabels = [] }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState(0); // 0 = intro, 1-N = photo slots, N+1 = done
  const [uploaded, setUploaded] = useState<Record<string, UploadedPhoto>>({});
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState<{ url: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Track whether we've already seeded for this open cycle. Without this guard,
  // the parent passes a fresh `alreadyUploadedLabels` array reference on every
  // render, which would re-trigger the seed effect and wipe any photo the user
  // just uploaded inside the modal.
  const hasSeededRef = useRef(false);

  // Seed uploaded map from already-saved photos when modal opens, so users can
  // resume an in-progress session. Runs at most once per open cycle and MERGES
  // (does not overwrite) any in-session uploads.
  useEffect(() => {
    if (!open) {
      hasSeededRef.current = false;
      return;
    }
    if (hasSeededRef.current) return;
    hasSeededRef.current = true;
    setUploaded(prev => {
      const merged = { ...prev };
      PHOTO_SLOTS.forEach(slot => {
        if (alreadyUploadedLabels.includes(slot.label) && !merged[slot.key]) {
          merged[slot.key] = {
            slotKey: slot.key,
            fileName: 'Previously uploaded',
            fileUrl: '',
          };
        }
      });
      return merged;
    });
  }, [open, alreadyUploadedLabels]);

  const totalPhotoSteps = PHOTO_SLOTS.length;
  const currentSlot = step > 0 && step <= totalPhotoSteps ? PHOTO_SLOTS[step - 1] : null;
  const uploadedCount = Object.keys(uploaded).length;
  const allDone = step > totalPhotoSteps;

  const handleFileSelect = async (rawFile: File) => {
    if (!currentSlot) return;

    // Normalize first — Samsung Camera (and other mobile browsers) sometimes
    // produce files with blank MIME and/or no extension, which would otherwise
    // be rejected by validateFile().
    const file = normalizeMobileCaptureFile(rawFile);
    const { valid, error: validationError } = validateFile(file, false);
    if (!valid) {
      toast({ title: 'Invalid file', description: validationError, variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      // Derive extension from MIME type for reliability (camera files may lack extensions)
      const MIME_EXT: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/heic': 'heic',
        'image/heif': 'heif',
      };
      const extFromName = file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
      const ext = MIME_EXT[file.type] || extFromName || 'jpg';
      const path = `${operatorId}/truck_photos/${currentSlot.key}_${Date.now()}.${ext}`;

      // Wrap upload in 60s timeout so a hung request always fails loudly
      const uploadPromise = supabase.storage
        .from('operator-documents')
        .upload(path, file, { upsert: false });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Upload timed out — check your connection and try again.')), 60000)
      );
      const { error: uploadError } = (await Promise.race([uploadPromise, timeoutPromise])) as Awaited<typeof uploadPromise>;

      if (uploadError) throw uploadError;

      // Insert into operator_documents using the bare storage path. The path
      // alone is enough for downstream resolvers (FilePreviewModal, the staff
      // photo grid) to re-sign on demand, so we don't block the UI on a signed
      // URL round-trip here.
      const { error: insertError } = await supabase.from('operator_documents').insert({
        operator_id: operatorId,
        document_type: 'truck_photos' as any,
        file_name: `${currentSlot.label} — ${file.name}`,
        file_url: path,
      });

      if (insertError) throw insertError;

      // ✅ Mark slot as uploaded immediately. The fileUrl starts as the bare
      // storage path (no http://). The thumbnail render is guarded against
      // non-http URLs, so the slot still flips to its green "uploaded" state
      // and the Next Photo button activates regardless of signed-URL success.
      setUploaded(prev => ({
        ...prev,
        [currentSlot.key]: {
          slotKey: currentSlot.key,
          fileName: file.name,
          fileUrl: path,
        },
      }));

      toast({ title: `${currentSlot.label} uploaded ✓`, description: 'Photo saved. Move to the next shot.' });

      // Best-effort: upgrade to a long-lived signed URL so the inline thumbnail
      // can render. Failures here are non-fatal — the slot stays marked done.
      try {
        const { data: signedData } = await supabase.storage
          .from('operator-documents')
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        if (signedData?.signedUrl) {
          setUploaded(prev => ({
            ...prev,
            [currentSlot.key]: {
              ...(prev[currentSlot.key] ?? { slotKey: currentSlot.key, fileName: file.name, fileUrl: path }),
              fileUrl: signedData.signedUrl,
            },
          }));
          // Keep the DB row in sync so the staff grid resolves it without re-signing
          await supabase
            .from('operator_documents')
            .update({ file_url: signedData.signedUrl })
            .eq('operator_id', operatorId)
            .eq('document_type', 'truck_photos' as any)
            .eq('file_name', `${currentSlot.label} — ${file.name}`);
        }
      } catch (signErr) {
        console.warn('[TruckPhotoGuide] signed URL step failed (non-fatal):', signErr);
      }
    } catch (err: unknown) {
      console.error('[TruckPhotoGuide] upload failed:', err);
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleComplete = () => {
    onComplete();
    onClose();
    // Reset for next time
    setTimeout(() => { setStep(0); setUploaded({}); hasSeededRef.current = false; }, 300);
  };

  const handleClose = () => {
    onClose();
    setTimeout(() => { setStep(0); setUploaded({}); hasSeededRef.current = false; }, 300);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md w-full p-0 overflow-hidden max-h-[90dvh] overflow-y-auto [&>button:first-of-type]:hidden">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
          }}
        />

        {/* Progress bar */}
        {step > 0 && !allDone && (
          <div className="px-6 pt-5 pb-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-muted-foreground font-medium">
                Photo {step} of {totalPhotoSteps}
              </span>
              <span className="text-xs text-muted-foreground">
                {uploadedCount} uploaded
              </span>
            </div>
            <Progress value={(step / totalPhotoSteps) * 100} className="h-1.5" />
          </div>
        )}

        {/* ── Intro step ── */}
        {step === 0 && (
          <div className="p-6 space-y-5">
            <DialogHeader>
              <DialogTitle className="text-lg flex items-center gap-2">
                <Camera className="h-5 w-5 text-gold" />
                Truck Photo Guide
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                We need <strong>10 specific photos</strong> of your truck for your onboarding file. We'll walk you through each shot one at a time.
              </DialogDescription>
            </DialogHeader>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1 text-sm" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                className="flex-1 text-sm bg-[hsl(var(--gold-main))] text-surface-dark hover:bg-[hsl(var(--gold-light))] gap-1.5"
                onClick={() => setStep(1)}
              >
                Start Guide <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-2">
              {PHOTO_SLOTS.map((slot, i) => (
                <div key={slot.key} className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/40">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{slot.label}</p>
                    <p className="text-[11px] text-muted-foreground">{slot.example}</p>
                  </div>
                  {uploaded[slot.key] ? (
                    <CheckCircle2 className="h-4 w-4 text-status-complete shrink-0" />
                  ) : (
                    <span className="text-[11px] text-muted-foreground shrink-0">Step {i + 1}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Photo step ── */}
        {currentSlot && (
          <div className="p-6 space-y-4">
            <DialogHeader>
              <div className="flex items-start justify-between gap-2">
                <DialogTitle className="text-base flex items-center gap-2">
                  
                  {currentSlot.label}
                </DialogTitle>
                <button
                  onClick={handleClose}
                  className="text-muted-foreground hover:text-foreground transition-colors mt-0.5 shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </DialogHeader>

            {/* Instruction box */}
            <div className="p-3.5 rounded-xl bg-info/8 border border-info/25 space-y-1.5">
              <p className="text-xs font-semibold text-info uppercase tracking-wide">How to take this shot</p>
              <p className="text-sm text-foreground/80 leading-relaxed">{currentSlot.hint}</p>
              <p className="text-[11px] text-muted-foreground italic">{currentSlot.example}</p>
            </div>

            {/* Upload area */}
            {uploaded[currentSlot.key] ? (
              <div className="p-4 rounded-xl bg-status-complete/8 border border-status-complete/30 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-status-complete" />
                  <p className="text-sm font-medium text-status-complete">Photo uploaded!</p>
                </div>
                {uploaded[currentSlot.key].fileUrl?.startsWith('http') && (
                  <button
                    type="button"
                    onClick={() => setPreviewing({
                      url: uploaded[currentSlot.key].fileUrl,
                      name: `${currentSlot.label} — ${uploaded[currentSlot.key].fileName}`,
                    })}
                    className="block w-full overflow-hidden rounded-lg border border-status-complete/30 bg-secondary/40"
                  >
                    <img
                      src={uploaded[currentSlot.key].fileUrl}
                      alt={`${currentSlot.label} preview`}
                      className="w-full max-h-56 object-contain"
                      loading="lazy"
                    />
                  </button>
                )}
                <p className="text-xs text-muted-foreground truncate">{uploaded[currentSlot.key].fileName}</p>
                {uploaded[currentSlot.key].fileUrl?.startsWith('http') && (
                  <button
                    type="button"
                    onClick={() => setPreviewing({
                      url: uploaded[currentSlot.key].fileUrl,
                      name: `${currentSlot.label} — ${uploaded[currentSlot.key].fileName}`,
                    })}
                    className="inline-flex items-center gap-1 text-xs text-gold hover:text-gold-light font-medium"
                  >
                    <Eye className="h-3 w-3" /> View photo
                  </button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs gap-1.5 mt-1 border-muted-foreground/30 text-muted-foreground"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload className="h-3.5 w-3.5" /> Replace Photo
                </Button>
              </div>
            ) : (
              <button
                className="w-full border-2 border-dashed border-border hover:border-gold/50 rounded-xl p-6 flex flex-col items-center gap-2.5 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-7 w-7 text-gold animate-spin" />
                ) : (
                  <Camera className="h-7 w-7 text-muted-foreground group-hover:text-gold transition-colors" />
                )}
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">
                    {uploading ? 'Uploading…' : 'Tap to Take Photo'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">JPG, PNG, HEIC · Max 10 MB</p>
                </div>
              </button>
            )}

            {/* Nav buttons */}
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-xs"
                onClick={() => setStep(s => Math.max(0, s - 1))}
                disabled={uploading}
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </Button>
              <Button
                size="sm"
                className={`flex-1 text-xs gap-1.5 ${
                  uploaded[currentSlot.key]
                    ? 'bg-[hsl(var(--gold-main))] text-surface-dark hover:bg-[hsl(var(--gold-light))]'
                    : 'bg-secondary text-muted-foreground'
                }`}
                onClick={() => {
                  if (step >= totalPhotoSteps) setStep(totalPhotoSteps + 1);
                  else setStep(s => s + 1);
                }}
                disabled={uploading}
              >
                {step >= totalPhotoSteps ? 'Finish' : 'Next Photo'}
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Skip link */}
            {!uploaded[currentSlot.key] && (
              <button
                className="w-full text-center text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => {
                  if (step >= totalPhotoSteps) setStep(totalPhotoSteps + 1);
                  else setStep(s => s + 1);
                }}
                disabled={uploading}
              >
                Skip this photo for now
              </button>
            )}
          </div>
        )}

        {/* ── Done step ── */}
        {allDone && (
          <div className="p-6 space-y-5">
            <DialogHeader>
              <DialogTitle className="text-lg flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-status-complete" />
                Photos Submitted!
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                You uploaded <strong>{uploadedCount} of {totalPhotoSteps}</strong> required photos.{' '}
                {uploadedCount < totalPhotoSteps && 'You can come back to upload any missed shots from the Documents tab.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              {PHOTO_SLOTS.map(slot => (
                <div key={slot.key} className={`flex items-center gap-3 p-2.5 rounded-lg ${uploaded[slot.key] ? 'bg-status-complete/8 border border-status-complete/20' : 'bg-secondary/40'}`}>
                  
                  <p className="text-sm font-medium text-foreground flex-1">{slot.label}</p>
                  {uploaded[slot.key] ? (
                    <CheckCircle2 className="h-4 w-4 text-status-complete shrink-0" />
                  ) : (
                    <span className="text-[11px] text-muted-foreground shrink-0">Not uploaded</span>
                  )}
                </div>
              ))}
            </div>

            <Button
              className="w-full bg-[hsl(var(--gold-main))] text-surface-dark hover:bg-[hsl(var(--gold-light))] gap-1.5"
              onClick={handleComplete}
            >
              <CheckCircle2 className="h-4 w-4" /> Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
    {previewing && (
      <FilePreviewModal
        url={previewing.url}
        name={previewing.name}
        onClose={() => setPreviewing(null)}
      />
    )}
    </>
  );
}
