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

/** Apply rotation then crop via canvas */
async function getCroppedImage(
  image: HTMLImageElement,
  pixelCrop: PixelCrop,
  rotation: number,
): Promise<Blob> {
  const radians = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));

  const bW = image.naturalWidth * cos + image.naturalHeight * sin;
  const bH = image.naturalWidth * sin + image.naturalHeight * cos;

  // Draw rotated full image
  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = bW;
  rotCanvas.height = bH;
  const rotCtx = rotCanvas.getContext('2d')!;
  rotCtx.translate(bW / 2, bH / 2);
  rotCtx.rotate(radians);
  rotCtx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);

  // Scale factor: displayed size vs natural size (after rotation)
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  // For rotation, the displayed bounding box also changes, but react-image-crop
  // gives us pixel coords relative to the displayed <img>. We need to map those
  // to the rotated canvas coordinates.
  // Since we rotate the underlying image and the crop is on the *displayed* image,
  // when rotation is 0 this is a straight 1:1 mapping scaled by scaleX/scaleY.
  // For rotated images we apply rotation on the canvas first, then crop.

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = pixelCrop.width * scaleX;
  cropCanvas.height = pixelCrop.height * scaleY;
  const cropCtx = cropCanvas.getContext('2d')!;

  // When rotation is 0, rotCanvas equals original image
  cropCtx.drawImage(
    rotCanvas,
    pixelCrop.x * scaleX, pixelCrop.y * scaleY,
    pixelCrop.width * scaleX, pixelCrop.height * scaleY,
    0, 0,
    cropCanvas.width, cropCanvas.height,
  );

  return new Promise<Blob>((resolve, reject) => {
    cropCanvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')),
      'image/png',
      1,
    );
  });
}

export function DocumentEditor({ fileUrl, fileName, bucketName, filePath, onSave, onClose }: DocumentEditorProps) {
  const { toast } = useToast();
  const [imageSource, setImageSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Crop state – percentage-based so it starts covering the full image
  const [crop, setCrop] = useState<Crop>({ unit: '%', x: 0, y: 0, width: 100, height: 100 });
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [rotation, setRotation] = useState(0);

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

  const handleRotateRight = () => setRotation((r) => (r + 90) % 360);
  const handleRotateLeft = () => setRotation((r) => (r - 90 + 360) % 360);
  const handleReset = () => {
    setCrop({ unit: '%', x: 0, y: 0, width: 100, height: 100 });
    setCompletedCrop(null);
    setRotation(0);
  };

  const handleSave = useCallback(async () => {
    if (!imgRef.current || !completedCrop) return;
    setSaving(true);
    try {
      const blob = await getCroppedImage(imgRef.current, completedCrop, rotation);

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
  }, [completedCrop, rotation, bucketName, filePath, fileName, toast, onSave, onClose]);

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
                transform: `rotate(${rotation}deg)`,
              }}
              onLoad={() => {
                // Reset crop to full image on load
                setCrop({ unit: '%', x: 0, y: 0, width: 100, height: 100 });
              }}
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
              <Button size="sm" variant="outline" onClick={handleRotateLeft} title="Rotate left">
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={handleRotateRight} title="Rotate right">
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
