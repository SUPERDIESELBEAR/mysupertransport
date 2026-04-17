import { useState, useEffect, useCallback, useRef, type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent } from 'react';
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

/* ─── helpers ─── */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

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

/* ─── crop region type ─── */
interface CropRect {
  /** All values in % of displayed image (0-100) */
  left: number;
  top: number;
  right: number;
  bottom: number;
}

type Edge = 'top' | 'bottom' | 'left' | 'right' | 'tl' | 'tr' | 'bl' | 'br';

const MIN_SIZE = 5; // minimum crop region in %

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/* ─── component ─── */

export function DocumentEditor({ fileUrl, fileName, bucketName, filePath, onSave, onClose }: DocumentEditorProps) {
  const { toast } = useToast();
  const [originalSource, setOriginalSource] = useState<string | null>(null);
  const [imageSource, setImageSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [rotationTotal, setRotationTotal] = useState(0);

  // Crop region — percentages from each edge
  const [crop, setCrop] = useState<CropRect>({ left: 0, top: 0, right: 0, bottom: 0 });
  const [dragging, setDragging] = useState<Edge | null>(null);
  const dragStart = useRef<{ x: number; y: number; crop: CropRect } | null>(null);

  const hasCrop = crop.left > 0.5 || crop.top > 0.5 || crop.right > 0.5 || crop.bottom > 0.5;

  /* ─── download ─── */
  const downloadBlob = useCallback(async (): Promise<Blob> => {
    // If fileUrl is a data URL (e.g. from PDF-to-image conversion), decode it directly
    if (fileUrl.startsWith('data:')) {
      const res = await fetch(fileUrl);
      return await res.blob();
    }
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
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [downloadBlob]);

  /* ─── rotation ─── */
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
    setCrop({ left: 0, top: 0, right: 0, bottom: 0 });
  }, [originalSource, rotationTotal]);

  const handleReset = () => {
    setRotationTotal(0);
    setImageSource(originalSource);
    setCrop({ left: 0, top: 0, right: 0, bottom: 0 });
  };

  /* ─── drag helpers ─── */
  const getPointerPos = (e: MouseEvent | Touch) => {
    const img = imgRef.current;
    if (!img) return { px: 0, py: 0 };
    const rect = img.getBoundingClientRect();
    return {
      px: ((e.clientX - rect.left) / rect.width) * 100,
      py: ((e.clientY - rect.top) / rect.height) * 100,
    };
  };

  const startDrag = (edge: Edge, clientX: number, clientY: number) => {
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    dragStart.current = {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
      crop: { ...crop },
    };
    setDragging(edge);
  };

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: globalThis.MouseEvent | globalThis.TouchEvent) => {
      e.preventDefault();
      const point = 'touches' in e ? e.touches[0] : e;
      const pos = getPointerPos(point);
      const start = dragStart.current;
      if (!start) return;

      const dx = pos.px - start.x;
      const dy = pos.py - start.y;
      const c = { ...start.crop };

      if (dragging === 'left' || dragging === 'tl' || dragging === 'bl') {
        c.left = clamp(start.crop.left + dx, 0, 100 - c.right - MIN_SIZE);
      }
      if (dragging === 'right' || dragging === 'tr' || dragging === 'br') {
        c.right = clamp(start.crop.right - dx, 0, 100 - c.left - MIN_SIZE);
      }
      if (dragging === 'top' || dragging === 'tl' || dragging === 'tr') {
        c.top = clamp(start.crop.top + dy, 0, 100 - c.bottom - MIN_SIZE);
      }
      if (dragging === 'bottom' || dragging === 'bl' || dragging === 'br') {
        c.bottom = clamp(start.crop.bottom - dy, 0, 100 - c.top - MIN_SIZE);
      }

      setCrop(c);
    };

    const onUp = () => {
      setDragging(null);
      dragStart.current = null;
    };

    window.addEventListener('mousemove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [dragging]);

  /* ─── save (canvas crop) ─── */
  const handleSave = useCallback(async () => {
    const img = imgRef.current;
    if (!img) return;
    setSaving(true);
    try {
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      const sx = (crop.left / 100) * nw;
      const sy = (crop.top / 100) * nh;
      const sw = nw - sx - (crop.right / 100) * nw;
      const sh = nh - sy - (crop.bottom / 100) * nh;

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sw));
      canvas.height = Math.max(1, Math.round(sh));
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png', 1)
      );

      if (bucketName && filePath) {
        // Overwrite the original file in-place
        const { error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(filePath, blob, { upsert: true, contentType: 'image/png' });
        if (uploadError) throw uploadError;
        // Generate a fresh long-lived signed URL (5 years) so the saved
        // reference doesn't silently expire and break the flipbook/preview.
        const { data: signedData } = await supabase.storage
          .from(bucketName)
          .createSignedUrl(filePath, 60 * 60 * 24 * 365 * 5);
        const newUrl = signedData?.signedUrl || '';
        toast({ title: 'Document saved', description: 'Edited version saved successfully.' });
        await onSave?.(newUrl);
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
      toast({ title: 'Save failed', description: err?.message || 'Could not save.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [crop, bucketName, filePath, fileName, toast, onSave, onClose]);

  /* ─── handle helpers for mouse/touch on edges ─── */
  const onEdgeMouseDown = (edge: Edge) => (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startDrag(edge, e.clientX, e.clientY);
  };
  const onEdgeTouchStart = (edge: Edge) => (e: ReactTouchEvent) => {
    e.stopPropagation();
    const t = e.touches[0];
    startDrag(edge, t.clientX, t.clientY);
  };

  const handleStyle = 'absolute bg-white border-2 border-primary rounded-sm z-10';
  const HANDLE = 10; // px

  /* ─── render ─── */
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black/95" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-surface-dark border-b border-surface-dark-border shrink-0"
        onClick={(e) => e.stopPropagation()}>
        <span className="text-sm font-semibold text-surface-dark-foreground truncate max-w-[40vw]">
          Edit: {fileName}
        </span>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Editor area */}
      <div ref={containerRef} className="flex-1 relative overflow-auto flex items-center justify-center p-4">
        {(loading || saving) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 z-20">
            <Loader2 className="h-8 w-8 text-gold animate-spin" />
            <span className="text-sm text-muted-foreground">{saving ? 'Saving…' : 'Loading document…'}</span>
          </div>
        )}

        {loadError && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/90 z-20">
            <AlertTriangle className="h-10 w-10 text-yellow-400" />
            <p className="text-sm text-white text-center max-w-sm">Could not load this document for editing.</p>
            <Button variant="outline" size="sm" onClick={onClose}>Close Editor</Button>
          </div>
        )}

        {imageSource && !loading && !loadError && (
          <div className="relative inline-block select-none" style={{ cursor: dragging ? 'grabbing' : 'default' }}>
            {/* The image */}
            <img
              ref={imgRef}
              src={imageSource}
              alt={fileName}
              draggable={false}
              style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 160px)', objectFit: 'contain', display: 'block' }}
            />

            {/* Dim overlay outside crop region */}
            {/* Top strip */}
            <div className="absolute left-0 right-0 top-0 bg-black/60 pointer-events-none"
              style={{ height: `${crop.top}%` }} />
            {/* Bottom strip */}
            <div className="absolute left-0 right-0 bottom-0 bg-black/60 pointer-events-none"
              style={{ height: `${crop.bottom}%` }} />
            {/* Left strip */}
            <div className="absolute left-0 bg-black/60 pointer-events-none"
              style={{ top: `${crop.top}%`, bottom: `${crop.bottom}%`, width: `${crop.left}%` }} />
            {/* Right strip */}
            <div className="absolute right-0 bg-black/60 pointer-events-none"
              style={{ top: `${crop.top}%`, bottom: `${crop.bottom}%`, width: `${crop.right}%` }} />

            {/* Crop border */}
            <div className="absolute border-2 border-dashed border-white/80 pointer-events-none"
              style={{
                left: `${crop.left}%`,
                top: `${crop.top}%`,
                right: `${crop.right}%`,
                bottom: `${crop.bottom}%`,
              }} />

            {/* Edge handles */}
            {/* Top edge */}
            <div
              className="absolute left-1/2 -translate-x-1/2 cursor-n-resize"
              style={{ top: `${crop.top}%`, marginTop: -HANDLE / 2, width: 40, height: HANDLE }}
              onMouseDown={onEdgeMouseDown('top')}
              onTouchStart={onEdgeTouchStart('top')}
            >
              <div className="w-full h-1 bg-white rounded-full mt-1" />
            </div>
            {/* Bottom edge */}
            <div
              className="absolute left-1/2 -translate-x-1/2 cursor-s-resize"
              style={{ bottom: `${crop.bottom}%`, marginBottom: -HANDLE / 2, width: 40, height: HANDLE }}
              onMouseDown={onEdgeMouseDown('bottom')}
              onTouchStart={onEdgeTouchStart('bottom')}
            >
              <div className="w-full h-1 bg-white rounded-full mt-1" />
            </div>
            {/* Left edge */}
            <div
              className="absolute top-1/2 -translate-y-1/2 cursor-w-resize"
              style={{ left: `${crop.left}%`, marginLeft: -HANDLE / 2, width: HANDLE, height: 40 }}
              onMouseDown={onEdgeMouseDown('left')}
              onTouchStart={onEdgeTouchStart('left')}
            >
              <div className="h-full w-1 bg-white rounded-full ml-1" />
            </div>
            {/* Right edge */}
            <div
              className="absolute top-1/2 -translate-y-1/2 cursor-e-resize"
              style={{ right: `${crop.right}%`, marginRight: -HANDLE / 2, width: HANDLE, height: 40 }}
              onMouseDown={onEdgeMouseDown('right')}
              onTouchStart={onEdgeTouchStart('right')}
            >
              <div className="h-full w-1 bg-white rounded-full ml-1" />
            </div>

            {/* Corner handles */}
            {/* Top-left */}
            <div
              className={`${handleStyle} cursor-nw-resize`}
              style={{ left: `${crop.left}%`, top: `${crop.top}%`, width: HANDLE, height: HANDLE, marginLeft: -HANDLE / 2, marginTop: -HANDLE / 2 }}
              onMouseDown={onEdgeMouseDown('tl')}
              onTouchStart={onEdgeTouchStart('tl')}
            />
            {/* Top-right */}
            <div
              className={`${handleStyle} cursor-ne-resize`}
              style={{ right: `${crop.right}%`, top: `${crop.top}%`, width: HANDLE, height: HANDLE, marginRight: -HANDLE / 2, marginTop: -HANDLE / 2 }}
              onMouseDown={onEdgeMouseDown('tr')}
              onTouchStart={onEdgeTouchStart('tr')}
            />
            {/* Bottom-left */}
            <div
              className={`${handleStyle} cursor-sw-resize`}
              style={{ left: `${crop.left}%`, bottom: `${crop.bottom}%`, width: HANDLE, height: HANDLE, marginLeft: -HANDLE / 2, marginBottom: -HANDLE / 2 }}
              onMouseDown={onEdgeMouseDown('bl')}
              onTouchStart={onEdgeTouchStart('bl')}
            />
            {/* Bottom-right */}
            <div
              className={`${handleStyle} cursor-se-resize`}
              style={{ right: `${crop.right}%`, bottom: `${crop.bottom}%`, width: HANDLE, height: HANDLE, marginRight: -HANDLE / 2, marginBottom: -HANDLE / 2 }}
              onMouseDown={onEdgeMouseDown('br')}
              onTouchStart={onEdgeTouchStart('br')}
            />
          </div>
        )}
      </div>

      {/* Bottom toolbar */}
      {imageSource && !loading && !loadError && (
        <div className="shrink-0 bg-surface-dark border-t border-surface-dark-border px-4 py-3"
          onClick={(e) => e.stopPropagation()}>
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
              <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
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
