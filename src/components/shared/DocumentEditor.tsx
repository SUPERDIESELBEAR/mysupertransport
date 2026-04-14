import { useState, useEffect, useCallback, useRef } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { X, RotateCw, RotateCcw, Crop as CropIcon, Loader2, AlertTriangle, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DocumentEditorProps {
  fileUrl: string;
  fileName: string;
  bucketName?: string;
  filePath?: string;
  onSave?: (newUrl: string) => void;
  onClose: () => void;
}

/** Load an image element from a source URL/data-URL */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Bake a 90° rotation into the image, returning a new data URL */
async function bakeRotation(src: string, degrees: number): Promise<string> {
  const img = await loadImage(src);
  const rad = (degrees * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const w = img.naturalWidth * cos + img.naturalHeight * sin;
  const h = img.naturalWidth * sin + img.naturalHeight * cos;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(w / 2, h / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return canvas.toDataURL('image/png');
}

/** Straight pixel crop — no rotation needed since it's pre-baked */
async function getCroppedImage(
  image: HTMLImageElement,
  pixelCrop: PixelCrop,
): Promise<Blob> {
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  const canvas = document.createElement('canvas');
  canvas.width = pixelCrop.width * scaleX;
  canvas.height = pixelCrop.height * scaleY;
  const ctx = canvas.getContext('2d')!;

  ctx.drawImage(
    image,
    pixelCrop.x * scaleX, pixelCrop.y * scaleY,
    pixelCrop.width * scaleX, pixelCrop.height * scaleY,
    0, 0,
    canvas.width, canvas.height,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')),
      'image/png',
      1,
    );
  });
}

export function DocumentEditor({ fileUrl, fileName, bucketName, filePath, onSave, onClose }: DocumentEditorProps) {
  const { toast } = useToast();
  const [originalSource, setOriginalSource] = useState<string | null>(null);
  const [imageSource, setImageSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [rotationTotal, setRotationTotal] = useState(0);

  const [crop, setCrop] = useState<Crop>({ unit: '%', x: 0, y: 0, width: 100, height: 100 });
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);

  /** Download blob from Supabase SDK (bypasses CORS) or fetch */
  const downloadBlob = useCallback(async (): Promise<Blob> => {
    if (bucketName && filePath) {
      const { data, error } = await supabase.storage.from(bucketName).download(filePath);
      if (error) throw error;
      if (!data || data.size === 0) throw new Error('Empty file');
      return data;
    }
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    return await res.blob();
  }, [bucketName, filePath, fileUrl]);

  // Load image on mount
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setLoadError(false);

    downloadBlob()
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setOriginalSource(objectUrl);
        setImageSource(objectUrl);
      })
      .catch((err) => {
        console.error('DocumentEditor load error:', err);
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [downloadBlob]);

  const resetCrop = () => {
    setCrop({ unit: '%', x: 0, y: 0, width: 100, height: 100 });
    setCompletedCrop(null);
  };

  const handleRotate = useCallback(async (dir: 90 | -90) => {
    if (!originalSource) return;
    const newTotal = (rotationTotal + dir + 360) % 360;
    setRotationTotal(newTotal);
    if (newTotal === 0) {
      setImageSource(originalSource);
    } else {
      const rotated = await bakeRotation(originalSource, newTotal);
      setImageSource(rotated);
    }
    resetCrop();
  }, [originalSource, rotationTotal]);

  const handleReset = () => {
    setRotationTotal(0);
    setImageSource(originalSource);
    resetCrop();
  };

  const handleSave = useCallback(async () => {
    if (!imgRef.current || !completedCrop) return;
    setSaving(true);
    try {
      const blob = await getCroppedImage(imgRef.current, completedCrop);

      if (bucketName && filePath) {
        const ext = (filePath.match(/\.\w+$/) || ['.png'])[0];
        const basePath = filePath.replace(/\.\w+$/, '');
        const editedPath = `${basePath}_edited${ext}`;

        const { error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(editedPath, blob, { upsert: true, contentType: 'image/png' });
        if (uploadError) throw uploadError;

        const { data: signedData } = await supabase.storage
          .from(bucketName)
          .createSignedUrl(editedPath, 60 * 60 * 24 * 365);

        const newUrl = signedData?.signedUrl || '';
        toast({ title: 'Document saved', description: 'Edited version saved successfully.' });
        onSave?.(newUrl);
      } else {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = fileName.replace(/(\.\w+)$/, '_edited$1');
        a.click();
        URL.revokeObjectURL(blobUrl);
        toast({ title: 'Downloaded', description: 'Edited file downloaded.' });
      }
      onClose();
    } catch (err: any) {
      console.error('Save error:', err);
      toast({
        title: 'Save failed',
        description: err?.message || 'Could not save edited document.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [completedCrop, bucketName, filePath, fileName, toast, onSave, onClose]);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black/95">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 bg-surface-dark border-b border-surface-dark-border shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-sm font-semibold text-surface-dark-foreground truncate max-w-[40vw]">
          Edit: {fileName}
        </span>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Editor area */}
      <div className="flex-1 relative overflow-auto flex items-center justify-center p-4">
        {(loading || saving) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 z-20">
            <Loader2 className="h-8 w-8 text-gold animate-spin" />
            <span className="text-sm text-muted-foreground">
              {saving ? 'Saving…' : 'Loading document…'}
            </span>
          </div>
        )}

        {loadError && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/90 z-20">
            <AlertTriangle className="h-10 w-10 text-yellow-400" />
            <p className="text-sm text-white text-center max-w-sm">
              Could not load this document for editing.
            </p>
            <Button variant="outline" size="sm" onClick={onClose}>
              Close Editor
            </Button>
          </div>
        )}

        {imageSource && !loading && !loadError && (
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
            className="max-h-full"
          >
            <img
              ref={imgRef}
              src={imageSource}
              alt={fileName}
              style={{
                maxWidth: '100%',
                maxHeight: 'calc(100vh - 160px)',
                objectFit: 'contain',
              }}
              onLoad={() => resetCrop()}
            />
          </ReactCrop>
        )}
      </div>

      {/* Bottom toolbar */}
      {imageSource && !loading && !loadError && (
        <div
          className="shrink-0 bg-surface-dark border-t border-surface-dark-border px-4 py-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => handleRotate(-90)} title="Rotate left">
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleRotate(90)} title="Rotate right">
                <RotateCw className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={handleReset} title="Reset">
                <Undo2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !completedCrop}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CropIcon className="h-4 w-4 mr-1" />}
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DocumentEditor;
