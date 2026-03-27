import { useState, useRef, useCallback, useEffect } from 'react';
import { FileText, Upload, ExternalLink, Share2, QrCode, Loader2, CheckCircle2, AlertTriangle, Clock, X, Mail, MessageSquare, Copy, Check, Printer, Download, ZoomIn, ZoomOut, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { QRCodeSVG } from 'qrcode.react';
import { InspectionDocument, getExpiryStatus, daysUntilExpiry } from './InspectionBinderTypes';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DocumentEditor } from '@/components/shared/DocumentEditor';

interface DocRowProps {
  doc: InspectionDocument | null;
  name: string;
  hasExpiry: boolean;
  selected: boolean;
  selectMode: boolean;
  onToggleSelect: () => void;
  onUpload?: (file: File) => Promise<void>;
  isUploading?: boolean;
  canUpload?: boolean;
  /** When true, the Upload/Replace button is disabled with a tooltip explaining it's managed from Company Docs */
  isManagedByCompany?: boolean;
  /** When true, show Edit button in the file preview modal */
  canEdit?: boolean;
  /** Storage bucket name for saving edits */
  editBucketName?: string;
  /** Storage file path for saving edits */
  editFilePath?: string;
  /** Called after an edit is saved with the new URL */
  onEditSave?: (newUrl: string) => void;
}

export function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
  const status = getExpiryStatus(expiresAt);
  const days = daysUntilExpiry(expiresAt);
  if (!status) return null;
  if (status === 'expired') return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-destructive/10 text-destructive border border-destructive/30 rounded-full px-2 py-0.5 font-semibold shrink-0">
      <AlertTriangle className="h-3 w-3" /> Expired
    </span>
  );
  if (status === 'expiring_soon') return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-warning/10 text-warning border border-warning/30 rounded-full px-2 py-0.5 font-semibold shrink-0">
      <Clock className="h-3 w-3" /> Expiring {days}d
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-status-complete/10 text-status-complete border border-status-complete/30 rounded-full px-2 py-0.5 font-semibold shrink-0">
      <CheckCircle2 className="h-3 w-3" /> Valid
    </span>
  );
}

/** Shown for uploaded docs that have no expiry date to track */
export function OnFileBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-info/10 text-info border border-info/30 rounded-full px-2 py-0.5 font-semibold shrink-0">
      <CheckCircle2 className="h-3 w-3" /> On File
    </span>
  );
}

function ShareModal({ doc, onClose }: { doc: InspectionDocument; onClose: () => void }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const shareUrl = `${window.location.origin}/inspect/${doc.public_share_token}`;

  const copy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Link copied!', description: 'Share link is in your clipboard.' });
  };

  const shareText = () => {
    const sms = `sms:?body=${encodeURIComponent(`Here's my ${doc.name} for inspection: ${shareUrl}`)}`;
    window.open(sms);
  };

  const shareEmail = () => {
    const mailto = `mailto:?subject=${encodeURIComponent(`${doc.name} — SuperTransport`)}&body=${encodeURIComponent(`Please find my ${doc.name} at the following secure link:\n\n${shareUrl}\n\nUSDOT No. 2309365 | MC No. 788425`)}`;
    window.open(mailto);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-0 sm:px-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-sm bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 space-y-4 shadow-xl animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-foreground text-base">Share Document</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{doc.name}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        {/* QR Code */}
        <div className="flex flex-col items-center gap-2 bg-white rounded-xl p-4 border border-border">
          <QRCodeSVG value={shareUrl} size={140} level="M" />
          <p className="text-xs text-muted-foreground text-center">Inspector scans this to view the document instantly</p>
        </div>

        {/* Share options */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={shareText}
            className="flex flex-col items-center gap-1.5 p-3 bg-secondary rounded-xl hover:bg-accent/20 transition-colors text-xs text-foreground font-medium"
          >
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
            Text
          </button>
          <button
            onClick={shareEmail}
            className="flex flex-col items-center gap-1.5 p-3 bg-secondary rounded-xl hover:bg-accent/20 transition-colors text-xs text-foreground font-medium"
          >
            <Mail className="h-5 w-5 text-muted-foreground" />
            Email
          </button>
          <button
            onClick={copy}
            className="flex flex-col items-center gap-1.5 p-3 bg-secondary rounded-xl hover:bg-accent/20 transition-colors text-xs text-foreground font-medium"
          >
            {copied ? <Check className="h-5 w-5 text-status-complete" /> : <Copy className="h-5 w-5 text-muted-foreground" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        {/* Link display */}
        <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
          <span className="text-xs text-muted-foreground truncate flex-1 font-mono">{shareUrl}</span>
          <button onClick={copy} className="shrink-0 text-muted-foreground hover:text-foreground">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Appends ?download=false so Supabase storage serves the file inline (not as attachment) */
function toInlineUrl(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set('download', 'false');
    return u.toString();
  } catch {
    return url;
  }
}

const ZOOM_STEPS = [50, 75, 100, 125, 150, 175, 200];
const DEFAULT_ZOOM_IDX = 2; // 100%

/** Fetches a remote URL as a blob object URL to bypass X-Frame-Options restrictions */
function useBlobUrl(remoteUrl: string) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setBlobUrl(null);
    setError(false);

    fetch(remoteUrl)
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.blob();
      })
      .then(blob => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [remoteUrl]);

  return { blobUrl, error };
}

/** Generic in-app file preview modal — no new tab required */
export function FilePreviewModal({ url, name, onClose, onEdit }: { url: string; name: string; onClose: () => void; onEdit?: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM_IDX);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const handleLoad = useCallback(() => setLoaded(true), []);
  const { blobUrl, error } = useBlobUrl(toInlineUrl(url));

  const zoom = ZOOM_STEPS[zoomIdx];
  const canZoomIn = zoomIdx < ZOOM_STEPS.length - 1;
  const canZoomOut = zoomIdx > 0;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handlePrint = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    iframeRef.current?.contentWindow?.print();
  }, []);

  const scale = zoom / 100;
  const isLoading = !blobUrl && !error;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface-dark border-b border-surface-dark-border" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-gold" />
          <span className="text-sm font-semibold text-surface-dark-foreground truncate max-w-[40vw]">{name}</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Zoom controls */}
          <button
            onClick={e => { e.stopPropagation(); setZoomIdx(i => Math.max(0, i - 1)); }}
            disabled={!canZoomOut}
            className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); setZoomIdx(DEFAULT_ZOOM_IDX); }}
            className="h-8 px-2 rounded text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors min-w-[44px] text-center"
            title="Reset zoom"
          >
            {zoom}%
          </button>
          <button
            onClick={e => { e.stopPropagation(); setZoomIdx(i => Math.min(ZOOM_STEPS.length - 1, i + 1)); }}
            disabled={!canZoomIn}
            className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          {/* Divider */}
          <span className="w-px h-5 bg-white/15 mx-1" />
          {onEdit && (
            <button
              onClick={e => { e.stopPropagation(); onEdit(); }}
              className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
              title="Edit document"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={handlePrint}
            disabled={!loaded}
            className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Print document"
          >
            <Printer className="h-4 w-4" />
          </button>
          <a
            href={url}
            download={name}
            className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            onClick={e => e.stopPropagation()}
            title="Download document"
          >
            <Download className="h-4 w-4" />
          </a>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            onClick={e => e.stopPropagation()}
            title="Open in new tab"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            title="Close (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Document area */}
      <div className="flex-1 relative overflow-auto" onClick={e => e.stopPropagation()}>
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 z-10">
            <Loader2 className="h-8 w-8 text-gold animate-spin" />
            <span className="text-sm text-muted-foreground">Loading document…</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
            <span className="text-sm text-muted-foreground">Could not load document inline.</span>
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-gold underline">Open in new tab</a>
          </div>
        )}
        {blobUrl && (
          <div
            style={{
              width: `${scale * 100}%`,
              height: `${scale * 100}%`,
              minWidth: scale <= 1 ? '100%' : undefined,
              minHeight: scale <= 1 ? '100%' : undefined,
            }}
          >
            <iframe
              ref={iframeRef}
              src={`${blobUrl}#toolbar=0`}
              style={{ width: `${100 / scale}%`, height: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: 'top left', transition: 'transform 0.2s ease-out' }}
              className={`transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
              title={name}
              onLoad={handleLoad}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PDFModal({ doc, onClose, onEdit }: { doc: InspectionDocument; onClose: () => void; onEdit?: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM_IDX);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const handleLoad = useCallback(() => setLoaded(true), []);
  const { blobUrl, error } = useBlobUrl(doc.file_url ? toInlineUrl(doc.file_url) : '');

  const zoom = ZOOM_STEPS[zoomIdx];
  const canZoomIn = zoomIdx < ZOOM_STEPS.length - 1;
  const canZoomOut = zoomIdx > 0;
  const scale = zoom / 100;
  const isLoading = !!doc.file_url && !blobUrl && !error;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handlePrint = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    iframeRef.current?.contentWindow?.print();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 bg-surface-dark border-b border-surface-dark-border" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-gold" />
          <span className="text-sm font-semibold text-surface-dark-foreground">{doc.name}</span>
          <ExpiryBadge expiresAt={doc.expires_at} />
        </div>
        <div className="flex items-center gap-1">
          {/* Zoom controls */}
          <button
            onClick={e => { e.stopPropagation(); setZoomIdx(i => Math.max(0, i - 1)); }}
            disabled={!canZoomOut}
            className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); setZoomIdx(DEFAULT_ZOOM_IDX); }}
            className="h-8 px-2 rounded text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors min-w-[44px] text-center"
            title="Reset zoom"
          >
            {zoom}%
          </button>
          <button
            onClick={e => { e.stopPropagation(); setZoomIdx(i => Math.min(ZOOM_STEPS.length - 1, i + 1)); }}
            disabled={!canZoomIn}
            className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <span className="w-px h-5 bg-white/15 mx-1" />
          {onEdit && (
            <button
              onClick={e => { e.stopPropagation(); onEdit(); }}
              className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
              title="Edit document"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {doc.file_url && (
            <>
              <button
                onClick={handlePrint}
                disabled={!loaded}
                className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Print document"
              >
                <Printer className="h-4 w-4" />
              </button>
              <a
                href={doc.file_url}
                download={doc.name}
                className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                onClick={e => e.stopPropagation()}
                title="Download document"
              >
                <Download className="h-4 w-4" />
              </a>
              <a
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                onClick={e => e.stopPropagation()}
                title="Open in new tab"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </>
          )}
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            title="Close (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="flex-1 relative overflow-auto" onClick={e => e.stopPropagation()}>
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 z-10">
            <Loader2 className="h-8 w-8 text-gold animate-spin" />
            <span className="text-sm text-muted-foreground">Loading document…</span>
          </div>
        )}
        {error && doc.file_url && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
            <span className="text-sm text-muted-foreground">Could not load document inline.</span>
            <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-gold underline">Open in new tab</a>
          </div>
        )}
        {!doc.file_url && (
          <div className="flex items-center justify-center h-full text-muted-foreground">No file available.</div>
        )}
        {blobUrl && (
          <div
            style={{
              width: `${scale * 100}%`,
              height: `${scale * 100}%`,
              minWidth: scale <= 1 ? '100%' : undefined,
              minHeight: scale <= 1 ? '100%' : undefined,
            }}
          >
            <iframe
              ref={iframeRef}
              src={`${blobUrl}#toolbar=0`}
              style={{ width: `${100 / scale}%`, height: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: 'top left', transition: 'transform 0.2s ease-out' }}
              className={`transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
              title={doc.name}
              onLoad={handleLoad}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function DocRow({ doc, name, hasExpiry, selected, selectMode, onToggleSelect, onUpload, isUploading, canUpload, isManagedByCompany, canEdit, editBucketName, editFilePath, onEditSave }: DocRowProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const { toast } = useToast();

  const hasFile = !!doc?.file_url;

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!doc) return;
    const shareUrl = `${window.location.origin}/inspect/${doc.public_share_token}`;
    await navigator.clipboard.writeText(shareUrl);
    setLinkCopied(true);
    toast({ title: 'Share link copied!', description: doc.name });
    setTimeout(() => setLinkCopied(false), 2000);
  };

  return (
    <>
      <div
        className={`flex items-center gap-3 px-3 py-3 rounded-xl border transition-colors cursor-pointer ${
          selected ? 'bg-gold/10 border-gold/40' : 'bg-card border-border hover:bg-secondary/50'
        }`}
        onClick={() => { if (selectMode) onToggleSelect(); else if (hasFile) setPdfOpen(true); }}
      >
        {/* Checkbox */}
        {selectMode && (
          <button
            className={`h-5 w-5 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
              selected ? 'bg-gold border-gold' : 'border-border bg-card'
            }`}
            onClick={e => { e.stopPropagation(); onToggleSelect(); }}
          >
            {selected && <Check className="h-3 w-3 text-surface-dark" />}
          </button>
        )}

        {/* Icon */}
        <div className={`h-8 w-8 rounded-lg shrink-0 flex items-center justify-center ${hasFile ? 'bg-gold/10' : 'bg-secondary'}`}>
          <FileText className={`h-4 w-4 ${hasFile ? 'text-gold-muted' : 'text-muted-foreground'}`} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium text-foreground leading-tight">{name}</span>
            {!hasFile && (
              <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-2 py-0.5 border border-border font-medium shrink-0">Awaiting Upload</span>
            )}
            {hasFile && hasExpiry && doc?.expires_at && (
              <ExpiryBadge expiresAt={doc.expires_at} />
            )}
            {hasFile && hasExpiry && !doc?.expires_at && (
              <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-2 py-0.5 font-medium shrink-0">No expiry set</span>
            )}
            {hasFile && !hasExpiry && (
              <OnFileBadge />
            )}
          </div>
          {hasFile && doc?.expires_at && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Expires {new Date(doc.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          )}
        </div>

        {/* Actions */}
        {!selectMode && (
          <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
            {hasFile && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5 text-xs gap-1"
                  onClick={() => setPdfOpen(true)}
                >
                  Open
                </Button>
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={handleCopyLink}
                      >
                        {linkCopied
                          ? <Check className="h-4 w-4 text-status-complete" />
                          : <Copy className="h-4 w-4" />
                        }
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {linkCopied ? 'Copied!' : 'Copy share link'}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => setShareOpen(true)}
                      >
                        <QrCode className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">Share / QR code</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </>
            )}
            {canUpload && onUpload && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) onUpload(f);
                    e.target.value = '';
                  }}
                />
                {isManagedByCompany ? (
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-not-allowed">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2.5 text-xs gap-1 opacity-40 pointer-events-none"
                            disabled
                          >
                            <Upload className="h-3.5 w-3.5" />
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        Managed from Company Docs
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <Button
                    size="sm"
                    variant={hasFile ? 'ghost' : 'default'}
                    className={`h-8 px-2.5 text-xs gap-1 ${!hasFile ? 'bg-gold text-surface-dark hover:bg-gold-light' : ''}`}
                    disabled={isUploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isUploading
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Upload className="h-3.5 w-3.5" />
                    }
                    {hasFile ? '' : 'Upload'}
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {shareOpen && doc && <ShareModal doc={doc} onClose={() => setShareOpen(false)} />}
      {pdfOpen && doc && <PDFModal doc={doc} onClose={() => setPdfOpen(false)} />}
    </>
  );
}

export { ShareModal, PDFModal };
