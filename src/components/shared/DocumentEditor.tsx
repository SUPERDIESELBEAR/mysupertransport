import { useState, useEffect, useCallback, useRef } from 'react';
import FilerobotImageEditor, { TABS, TOOLS } from 'react-filerobot-image-editor';
import { X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Configure PDF.js worker
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface DocumentEditorProps {
  fileUrl: string;
  fileName: string;
  /** Storage bucket name for saving edited file */
  bucketName?: string;
  /** Storage file path for saving edited file */
  filePath?: string;
  onSave?: (newUrl: string) => void;
  onClose: () => void;
}

/** Renders a single PDF page to a data URL */
async function renderPdfPage(pdfUrl: string, pageNum: number): Promise<{ dataUrl: string; totalPages: number }> {
  const response = await fetch(pdfUrl);
  const arrayBuffer = await response.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(pageNum);
  const scale = 2; // High resolution
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
  return { dataUrl: canvas.toDataURL('image/png'), totalPages: pdf.numPages };
}

function isPdf(fileName: string, url: string): boolean {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return true;
  try {
    const u = new URL(url);
    if (u.pathname.toLowerCase().endsWith('.pdf')) return true;
  } catch {}
  return false;
}

export function DocumentEditor({ fileUrl, fileName, bucketName, filePath, onSave, onClose }: DocumentEditorProps) {
  const { toast } = useToast();
  const [imageSource, setImageSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pdfPage, setPdfPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isPdfFile, setIsPdfFile] = useState(false);
  const editorRef = useRef<any>(null);

  // Load the image (or PDF page as image)
  const loadSource = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      if (isPdf(fileName, fileUrl)) {
        setIsPdfFile(true);
        const { dataUrl, totalPages: tp } = await renderPdfPage(fileUrl, page);
        setTotalPages(tp);
        setPdfPage(page);
        setImageSource(dataUrl);
      } else {
        setIsPdfFile(false);
        // Fetch image as blob to avoid CORS issues
        const res = await fetch(fileUrl);
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        setImageSource(dataUrl);
      }
    } catch (err) {
      console.error('Failed to load document for editing:', err);
      toast({ title: 'Error', description: 'Could not load document for editing.', variant: 'destructive' });
      onClose();
    } finally {
      setLoading(false);
    }
  }, [fileUrl, fileName, toast, onClose]);

  useEffect(() => {
    loadSource(1);
  }, [loadSource]);

  const handleSave = useCallback(async (editedImageObject: any) => {
    setSaving(true);
    try {
      const { imageBase64 } = editedImageObject;
      // Convert base64 to blob
      const response = await fetch(imageBase64);
      const blob = await response.blob();

      if (bucketName && filePath) {
        // Build edited file path
        const ext = isPdfFile ? '.png' : (filePath.match(/\.\w+$/) || ['.png'])[0];
        const basePath = filePath.replace(/\.\w+$/, '');
        const editedPath = isPdfFile
          ? `${basePath}_page${pdfPage}_edited${ext}`
          : `${basePath}_edited${ext}`;

        const { error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(editedPath, blob, { upsert: true, contentType: blob.type });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(editedPath);

        // For private buckets, create a signed URL
        const { data: signedData } = await supabase.storage
          .from(bucketName)
          .createSignedUrl(editedPath, 60 * 60 * 24 * 365); // 1 year

        const newUrl = signedData?.signedUrl || urlData?.publicUrl || '';

        toast({ title: 'Document saved', description: isPdfFile ? `Page ${pdfPage} saved as edited image.` : 'Edited version saved successfully.' });
        onSave?.(newUrl);
      } else {
        // No bucket info — download locally
        const a = document.createElement('a');
        a.href = imageBase64;
        const editedName = fileName.replace(/(\.\w+)$/, '_edited$1');
        a.download = isPdfFile ? `${fileName}_page${pdfPage}_edited.png` : editedName;
        a.click();
        toast({ title: 'Downloaded', description: 'Edited file downloaded to your device.' });
      }
      onClose();
    } catch (err: any) {
      console.error('Save error:', err);
      toast({ title: 'Save failed', description: err.message || 'Could not save edited document.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [bucketName, filePath, fileName, isPdfFile, pdfPage, toast, onSave, onClose]);

  const goToPage = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages) {
      loadSource(page);
    }
  }, [totalPages, loadSource]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-surface-dark border-b border-surface-dark-border" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-surface-dark-foreground truncate max-w-[30vw]">
            Edit: {fileName}
          </span>
          {isPdfFile && (
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                disabled={pdfPage <= 1 || loading}
                onClick={() => goToPage(pdfPage - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground font-mono">
                Page {pdfPage} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                disabled={pdfPage >= totalPages || loading}
                onClick={() => goToPage(pdfPage + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Editor */}
      <div className="flex-1 relative">
        {(loading || saving) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 z-20">
            <Loader2 className="h-8 w-8 text-gold animate-spin" />
            <span className="text-sm text-muted-foreground">
              {saving ? 'Saving…' : 'Loading document…'}
            </span>
          </div>
        )}
        {imageSource && !loading && (
          <FilerobotImageEditor
            source={imageSource}
            onSave={(editedImageObject: any) => handleSave(editedImageObject)}
            onClose={onClose}
            annotationsCommon={{
              fill: '#ff0000',
            }}
            Text={{ text: 'Text' }}
            Rotate={{ angle: 90, componentType: 'slider' }}
            Crop={{
              presetsItems: [
                { titleKey: 'Letter (8.5x11)', ratio: 8.5 / 11 },
                { titleKey: 'Legal (8.5x14)', ratio: 8.5 / 14 },
                { titleKey: 'Square', ratio: 1 },
              ],
            }}
            tabsIds={[TABS.ADJUST, TABS.FINETUNE, TABS.FILTERS, TABS.RESIZE, TABS.ANNOTATE]}
            defaultTabId={TABS.ADJUST}
            defaultToolId={TOOLS.CROP}
            savingPixelRatio={2}
            previewPixelRatio={window.devicePixelRatio}
          />
        )}
      </div>
    </div>
  );
}
