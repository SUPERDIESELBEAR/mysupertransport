import { useState, useRef } from 'react';
import { FileText, Upload, ExternalLink, Share2, QrCode, Loader2, CheckCircle2, AlertTriangle, Clock, X, Mail, MessageSquare, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { QRCodeSVG } from 'qrcode.react';
import { InspectionDocument, getExpiryStatus, daysUntilExpiry } from './InspectionBinderTypes';
import { useToast } from '@/hooks/use-toast';

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

/** Generic in-app file preview modal — no new tab required */
export function FilePreviewModal({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 bg-surface-dark border-b border-surface-dark-border" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-gold" />
          <span className="text-sm font-semibold text-surface-dark-foreground truncate max-w-[60vw]">{name}</span>
        </div>
        <div className="flex items-center gap-2">
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" onClick={e => e.stopPropagation()} title="Open in new tab">
            <ExternalLink className="h-4 w-4" />
          </a>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="flex-1" onClick={e => e.stopPropagation()}>
        <iframe src={`${url}#toolbar=0`} className="w-full h-full" title={name} />
      </div>
    </div>
  );
}

function PDFModal({ doc, onClose }: { doc: InspectionDocument; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 bg-surface-dark border-b border-surface-dark-border" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-gold" />
          <span className="text-sm font-semibold text-surface-dark-foreground">{doc.name}</span>
          <ExpiryBadge expiresAt={doc.expires_at} />
        </div>
        <div className="flex items-center gap-2">
          {doc.file_url && (
            <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" onClick={e => e.stopPropagation()}>
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="flex-1" onClick={e => e.stopPropagation()}>
        {doc.file_url ? (
          <iframe src={`${doc.file_url}#toolbar=0`} className="w-full h-full" title={doc.name} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">No file available.</div>
        )}
      </div>
    </div>
  );
}

export function DocRow({ doc, name, hasExpiry, selected, selectMode, onToggleSelect, onUpload, isUploading, canUpload }: DocRowProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);

  const hasFile = !!doc?.file_url;

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
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  title="Share / QR"
                  onClick={() => setShareOpen(true)}
                >
                  <QrCode className="h-4 w-4" />
                </Button>
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
