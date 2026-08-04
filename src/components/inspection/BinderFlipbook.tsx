import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X, ChevronLeft, ChevronRight, MoreVertical, Mail, MessageSquare,
  QrCode, Loader2, FileText, AlertTriangle, CheckSquare, Square, ImageOff, List, CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { pdfToImage } from '@/lib/pdfToImage';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { InspectionDocument, DriverUpload, getExpiryStatus, formatDaysHuman, daysUntilExpiry } from './InspectionBinderTypes';
import { buildShareBodies, resolveShortUrl, type ShareItem } from '@/lib/binderShareFormat';
import { withTimeout } from '@/lib/withTimeout';
import { getEdgeFunctionErrorMessage } from '@/lib/edgeFunctionError';
import logo from '@/assets/supertransport-logo.png';

export interface FlipbookPage {
  id: string;
  title: string;
  subtitle?: string;
  fileUrl: string | null;
  fileName?: string | null;
  shareToken?: string | null;
  expiresAt?: string | null;
  kind: 'cover' | 'doc' | 'upload';
  /** Storage path for on-the-fly re-signing if `fileUrl` has expired. */
  filePath?: string | null;
  /** Storage bucket the `filePath` lives in. Defaults to 'inspection-documents'. */
  bucket?: string | null;
}

/** Decode a Supabase signed-URL JWT and return its `exp` (epoch seconds) or null. */
function getSignedUrlExp(url: string): number | null {
  try {
    const u = new URL(url);
    const token = u.searchParams.get('token');
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = JSON.parse(atob(padded));
    return typeof json.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}

interface Props {
  pages: FlipbookPage[];
  driverName: string;
  unitNumber: string | null;
  initialIndex?: number;
  onClose: () => void;
}

function isImage(url: string | null, name?: string | null) {
  if (!url) return false;
  const test = (name || url).toLowerCase().split('?')[0];
  return /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(test);
}
function isPdf(url: string | null, name?: string | null) {
  if (!url) return false;
  const test = (name || url).toLowerCase().split('?')[0];
  return /\.pdf$/i.test(test);
}
/**
 * Detect file_url values that aren't fetchable as-is (bare storage paths like
 * "applications/foo.jpg" that would 404 when used as <img src>).
 */
function isBadSource(url: string | null) {
  if (!url) return false;
  return !/^https?:\/\//i.test(url) && !url.startsWith('data:') && !url.startsWith('blob:');
}

function PageRenderer({ page }: { page: FlipbookPage }) {
  const [pdfImage, setPdfImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The URL we actually render (may be a freshly re-signed version of page.fileUrl).
  const [effectiveUrl, setEffectiveUrl] = useState<string | null>(page.fileUrl);

  // Resolve the URL to render: if the saved signed URL is expired (or about to
  // expire) and we have a filePath, request a fresh signed URL on the fly.
  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      if (!page.fileUrl) {
        setEffectiveUrl(null);
        return;
      }
      const exp = getSignedUrlExp(page.fileUrl);
      const nowSecs = Math.floor(Date.now() / 1000);
      // Only attempt re-sign for our own signed URLs that have a filePath fallback.
      if (exp !== null && exp <= nowSecs + 30 && page.filePath) {
        const bucket = page.bucket || 'inspection-documents';
        const { data } = await supabase.storage
          .from(bucket)
          .createSignedUrl(page.filePath, 60 * 60 * 24 * 365 * 5);
        if (!cancelled) setEffectiveUrl(data?.signedUrl ?? page.fileUrl);
      } else {
        setEffectiveUrl(page.fileUrl);
      }
    };
    resolve();
    return () => { cancelled = true; };
  }, [page.fileUrl, page.filePath, page.bucket]);

  useEffect(() => {
    let cancelled = false;
    setPdfImage(null);
    setError(null);
    if (effectiveUrl && isPdf(effectiveUrl, page.fileName)) {
      setLoading(true);
      pdfToImage(effectiveUrl)
        .then(img => { if (!cancelled) setPdfImage(img); })
        .catch(err => { if (!cancelled) setError(err.message || 'Failed to render PDF'); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }
    return () => { cancelled = true; };
  }, [effectiveUrl, page.fileName]);

  if (page.kind === 'cover') {
    return null; // handled outside
  }

  if (!effectiveUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full text-center px-6 gap-3">
        <div className="h-16 w-16 rounded-2xl bg-muted/40 flex items-center justify-center">
          <ImageOff className="h-7 w-7 text-muted-foreground/60" />
        </div>
        <p className="text-sm font-semibold text-foreground">Not yet uploaded</p>
        <p className="text-xs text-muted-foreground max-w-xs">This document slot is empty. Once it's uploaded, it will appear here.</p>
      </div>
    );
  }

  // Bad source (bare path saved before the URL-signing fix) — surface a clear,
  // actionable message instead of a silent blank.
  if (isBadSource(effectiveUrl)) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full text-center px-6 gap-3">
        <div className="h-16 w-16 rounded-2xl bg-warning/15 flex items-center justify-center">
          <AlertTriangle className="h-7 w-7 text-warning" />
        </div>
        <p className="text-sm font-semibold text-foreground">Source link broken</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          This document was saved with an outdated reference. Please re-upload it from the
          Inspection Binder tab so it can be displayed here.
        </p>
      </div>
    );
  }

  if (isImage(effectiveUrl, page.fileName)) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-black/5">
        <img src={effectiveUrl} alt={page.title} className="max-h-full max-w-full object-contain select-none" draggable={false} />
      </div>
    );
  }

  if (isPdf(effectiveUrl, page.fileName)) {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-xs">Rendering page…</p>
        </div>
      );
    }
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
          <AlertTriangle className="h-7 w-7 text-warning" />
          <p className="text-sm font-medium text-foreground">Could not render PDF</p>
          <a href={effectiveUrl} target="_blank" rel="noreferrer" className="text-xs text-gold underline">Open in new tab</a>
        </div>
      );
    }
    if (pdfImage) {
      return (
        <div className="flex items-center justify-center h-full w-full bg-black/5">
          <img src={pdfImage} alt={page.title} className="max-h-full max-w-full object-contain select-none" draggable={false} />
        </div>
      );
    }
  }

  // Unknown type fallback
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
      <FileText className="h-8 w-8 text-muted-foreground/60" />
      <p className="text-sm font-medium text-foreground">{page.fileName || 'Document'}</p>
      <a href={effectiveUrl} target="_blank" rel="noreferrer" className="text-xs text-gold underline">Open in new tab</a>
    </div>
  );
}

function CoverPage({ driverName, unitNumber, totalPages }: { driverName: string; unitNumber: string | null; totalPages: number }) {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full px-6 py-8 bg-surface-dark text-surface-dark-foreground">
      <img src={logo} alt="SuperTransport" className="h-16 object-contain mb-6 opacity-95" />
      <p className="text-[10px] text-gold font-bold tracking-[0.25em] uppercase">Digital Inspection Binder</p>
      <h1 className="text-2xl font-black mt-2 text-center">{driverName}</h1>
      <p className="text-xs text-surface-dark-muted mt-1">Professional Driver</p>
      <div className="mt-8 grid grid-cols-2 gap-3 w-full max-w-sm">
        <div className="bg-surface-dark-card rounded-xl px-3 py-3 border border-surface-dark-border text-center">
          <p className="text-[10px] text-surface-dark-muted uppercase tracking-wider">Truck Unit</p>
          <p className="text-base font-bold mt-0.5">{unitNumber ?? '—'}</p>
        </div>
        <div className="bg-surface-dark-card rounded-xl px-3 py-3 border border-surface-dark-border text-center">
          <p className="text-[10px] text-surface-dark-muted uppercase tracking-wider">Pages</p>
          <p className="text-base font-bold mt-0.5">{totalPages - 1}</p>
        </div>
        <div className="bg-surface-dark-card rounded-xl px-3 py-3 border border-surface-dark-border text-center">
          <p className="text-[10px] text-surface-dark-muted uppercase tracking-wider">USDOT</p>
          <p className="text-base font-bold mt-0.5">2309365</p>
        </div>
        <div className="bg-surface-dark-card rounded-xl px-3 py-3 border border-surface-dark-border text-center">
          <p className="text-[10px] text-surface-dark-muted uppercase tracking-wider">MC No.</p>
          <p className="text-base font-bold mt-0.5">788425</p>
        </div>
      </div>
      <p className="text-[11px] text-surface-dark-muted mt-8 text-center max-w-xs">
        Swipe left or use the arrows to flip through your binder.
      </p>
    </div>
  );
}

export default function BinderFlipbook({
  pages, driverName, unitNumber, initialIndex = 0, onClose,
}: Props) {
  const [index, setIndex] = useState(() => Math.min(initialIndex, Math.max(0, pages.length - 1)));
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [direction, setDirection] = useState<'next' | 'prev' | null>(null);
  const [showQR, setShowQR] = useState(false);
  const { toast } = useToast();
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailDocs, setEmailDocs] = useState<FlipbookPage[]>([]);
  const [emailRecipient, setEmailRecipient] = useState('');
  const [emailNote, setEmailNote] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState<{ to: string; count: number } | null>(null);
  const emailSentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (emailSentTimer.current) clearTimeout(emailSentTimer.current); }, []);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useRef(`binder-title-${Math.random().toString(36).slice(2)}`).current;

  const total = pages.length;
  const current = pages[index];

  const haptic = () => { try { (navigator as any).vibrate?.(10); } catch {} };

  const goNext = useCallback(() => {
    if (index < total - 1) {
      setDirection('next');
      setIndex(i => i + 1);
      haptic();
    }
  }, [index, total]);

  const goPrev = useCallback(() => {
    if (index > 0) {
      setDirection('prev');
      setIndex(i => i - 1);
      haptic();
    }
  }, [index]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, onClose]);

  // Lock body scroll
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, []);

  // Focus management: focus the dialog on open, restore focus on close,
  // and trap Tab inside the dialog so keyboard users don't escape into
  // the page behind the modal.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const node = dialogRef.current;
    if (node) {
      // Defer one frame so the portal contents are mounted before focusing.
      requestAnimationFrame(() => node.focus());
    }

    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !dialogRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', trap);
    return () => {
      window.removeEventListener('keydown', trap);
      // Restore focus on unmount (close).
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, []);

  const swipe = useSwipeGesture<HTMLDivElement>({
    onSwipeLeft: goNext,
    onSwipeRight: goPrev,
    excludeSelector: 'button, a, input, select, textarea, [role="menuitem"]',
  });

  const toggleSel = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const buildLink = (token: string) => `${window.location.origin}/inspect/${token}`;

  /** Resolve a page to a short URL when possible; fall back to the full URL. */
  const shortenPage = async (p: FlipbookPage): Promise<string> => {
    if (p.shareToken) {
      const full = buildLink(p.shareToken);
      return resolveShortUrl(supabase as any, window.location.origin, p.shareToken, full);
    }
    return p.fileUrl || '';
  };

  const openMailto = (subject: string, body: string) => {
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };
  const openSms = (body: string) => {
    window.open(`sms:?body=${encodeURIComponent(body)}`);
  };

  /** Build items for the currently viewed page (single or cover-wide). */
  const currentItems = async (): Promise<{ items: ShareItem[]; overflowUrl: string | null } | null> => {
    if (!current) return null;
    if (current.kind === 'cover') {
      const docs = pages.filter(p => p.shareToken);
      if (!docs.length) return null;
      const urls = await Promise.all(docs.map(shortenPage));
      return {
        items: docs.map((d, i) => ({ title: d.title, url: urls[i] })),
        overflowUrl: null,
      };
    }
    if (current.shareToken) {
      const url = await shortenPage(current);
      return { items: [{ title: current.title, url }], overflowUrl: null };
    }
    if (current.fileUrl) {
      return { items: [{ title: current.title, url: current.fileUrl }], overflowUrl: null };
    }
    return null;
  };

  /** Build items for the multi-select list, with a cover-share fallback URL for SMS overflow. */
  const selectedItems = async (): Promise<{ items: ShareItem[]; overflowUrl: string | null } | null> => {
    const docs = pages.filter(p => selected.has(p.id) && p.shareToken);
    if (!docs.length) return null;
    const urls = await Promise.all(docs.map(shortenPage));
    return {
      items: docs.map((d, i) => ({ title: d.title, url: urls[i] })),
      overflowUrl: null,
    };
  };

  const allItems = async (): Promise<{ items: ShareItem[]; overflowUrl: string | null } | null> => {
    const docs = pages.filter(p => p.shareToken);
    if (!docs.length) return null;
    const urls = await Promise.all(docs.map(shortenPage));
    return {
      items: docs.map((d, i) => ({ title: d.title, url: urls[i] })),
      overflowUrl: null,
    };
  };

  /**
   * Compute the share payload for the CURRENT page, branching by kind:
   *  - cover  → binder-wide list of all shareable pages
   *  - upload → the signed fileUrl (uploads have no /inspect token)
   *  - doc    → the per-doc /inspect/{token} URL
   */
  const currentShare = useMemo(() => {
    if (!current) return null;
    if (current.kind === 'cover') {
      const docs = pages.filter(p => p.shareToken);
      if (!docs.length) return null;
      const lines = docs.map(d => `${d.title}: ${buildLink(d.shareToken!)}`);
      // If only one shareable doc, encode that URL directly for a cleaner QR.
      const qrData = docs.length === 1
        ? buildLink(docs[0].shareToken!)
        : `${driverName} — Digital Inspection Binder\n\n${lines.join('\n')}`;
      return {
        subject: `${driverName} — Digital Inspection Binder`,
        body: lines.join('\n'),
        qrData,
        ephemeral: false,
      };
    }
    if (current.shareToken) {
      const url = buildLink(current.shareToken);
      return {
        subject: 'Roadside Document — SuperTransport',
        body: `${current.title}: ${url}`,
        qrData: url,
        ephemeral: false,
      };
    }
    if (current.fileUrl) {
      return {
        subject: 'Roadside Document — SuperTransport',
        body: `${current.title}: ${current.fileUrl}`,
        qrData: current.fileUrl,
        ephemeral: true,
      };
    }
    return null;
  }, [current, pages, driverName]);

  const shareVia = async (
    load: () => Promise<{ items: ShareItem[]; overflowUrl: string | null } | null>,
    channel: 'email' | 'sms',
  ) => {
    const payload = await load();
    if (!payload) return;
    const { subject, body } = buildShareBodies({
      items: payload.items,
      driverName,
      unitNumber,
      channel,
      overflowUrl: payload.overflowUrl,
    });
    if (channel === 'email') openMailto(subject, body);
    else openSms(body);
  };

  const shareCurrentText = () => { void shareVia(currentItems, 'sms'); };
  const shareSelectedText = () => { void shareVia(selectedItems, 'sms'); };

  /**
   * Email now goes through the `send-binder-share` edge function so the
   * recipient gets a branded HTML message with per-document View buttons
   * instead of a `mailto:` blob of raw URLs.
   */
  const emailPagesFor = (scope: 'current' | 'selected' | 'all'): FlipbookPage[] => {
    if (scope === 'all') return pages.filter(p => p.shareToken);
    if (scope === 'selected') return pages.filter(p => selected.has(p.id) && p.shareToken);
    if (!current) return [];
    if (current.kind === 'cover') return pages.filter(p => p.shareToken);
    return current.shareToken || current.fileUrl ? [current] : [];
  };

  const openEmailShare = (scope: 'current' | 'selected' | 'all') => {
    const docs = emailPagesFor(scope);
    if (!docs.length) return;
    setEmailDocs(docs);
    setEmailNote('');
    setEmailError(null);
    setEmailSent(null);
    if (emailSentTimer.current) { clearTimeout(emailSentTimer.current); emailSentTimer.current = null; }
    setEmailOpen(true);
  };

  const sendEmailShare = async () => {
    if (!emailDocs.length) return;
    const to = emailRecipient.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) {
      setEmailError('Enter a valid recipient email address.');
      return;
    }
    setEmailError(null);
    setEmailSent(null);
    setEmailSending(true);
    try {
      const { data, error } = await withTimeout(
        supabase.functions.invoke('send-binder-share', {
        body: {
          recipientEmail: to,
          driverName,
          unitNumber,
          note: emailNote.trim() || null,
          items: emailDocs.map(d => ({
            token: d.shareToken ?? null,
            url: d.shareToken ? null : d.fileUrl,
            title: d.title,
          })),
        },
        }),
        45000,
        'Sending the email',
      );
      if (error) throw error;
      if (data && (data as { error?: string }).error) throw new Error((data as { error: string }).error);
      toast({ title: 'Documents sent', description: `${emailDocs.length} document${emailDocs.length === 1 ? '' : 's'} emailed to ${to}.` });
      setEmailSent({ to, count: emailDocs.length });
      if (emailSentTimer.current) clearTimeout(emailSentTimer.current);
      emailSentTimer.current = setTimeout(() => {
        setEmailOpen(false);
        setEmailSent(null);
        setSelectMode(false);
        setSelected(new Set());
      }, 2000);
    } catch (err) {
      const message = await getEdgeFunctionErrorMessage(
        err,
        err instanceof Error ? err.message : 'Please try again.',
      );
      setEmailError(`${message} You can still use “Use my mail app instead”.`);
    } finally {
      setEmailSending(false);
    }
  };

  /** Offline / no-signal escape hatch: hand off to the device mail app. */
  const emailFallbackMailto = () => {
    const scopeLoad = async () => {
      const docs = emailDocs;
      if (!docs.length) return null;
      const urls = await Promise.all(docs.map(shortenPage));
      return { items: docs.map((d, i) => ({ title: d.title, url: urls[i] })), overflowUrl: null };
    };
    void shareVia(scopeLoad, 'email');
  };

  const expiryBadge = useMemo(() => {
    if (!current?.expiresAt) return null;
    const status = getExpiryStatus(current.expiresAt);
    const days = daysUntilExpiry(current.expiresAt);
    if (status === null || days === null) return null;
    const cls = status === 'expired'
      ? 'bg-destructive/15 text-destructive border-destructive/30'
      : status === 'expiring_soon'
      ? 'bg-warning/15 text-warning border-warning/30'
      : 'bg-status-complete/15 text-status-complete border-status-complete/30';
    const label = status === 'expired' ? `Expired ${formatDaysHuman(days)} ago` : `${formatDaysHuman(days)} left`;
    return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>;
  }, [current?.expiresAt]);

  const qrSrc = currentShare
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentShare.qrData)}`
    : null;

  const overlay = (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="fixed inset-0 z-[100] bg-background flex flex-col outline-none"
    >
      <h2 id={titleId} className="sr-only">
        Inspection binder for {driverName}{unitNumber ? ` — Unit ${unitNumber}` : ''}
      </h2>
      {/* Top bar */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-border bg-card/95 backdrop-blur">
        <button
          onClick={onClose}
          className="h-9 px-2.5 rounded-full hover:bg-muted flex items-center gap-1 text-foreground text-xs font-medium"
          aria-label="Close binder and return to list view"
        >
          <ChevronLeft className="h-4 w-4" />
          List View
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground truncate">{current?.title || 'Binder'}</p>
            {expiryBadge}
          </div>
          <p className="text-[11px] text-muted-foreground">Page {index + 1} of {total}</p>
        </div>
        {selectMode && (
          <span className="text-[11px] text-muted-foreground">{selected.size} selected</span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-9 w-9 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground" aria-label="Actions">
              <MoreVertical className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 z-[110]">
            {!selectMode ? (
              <>
                <DropdownMenuItem onClick={() => openEmailShare('current')} disabled={!currentShare}>
                  <Mail className="h-4 w-4 mr-2" /> Email this page
                </DropdownMenuItem>
                <DropdownMenuItem onClick={shareCurrentText} disabled={!currentShare}>
                  <MessageSquare className="h-4 w-4 mr-2" /> Text this page
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowQR(true)} disabled={!currentShare}>
                  <QrCode className="h-4 w-4 mr-2" /> Show QR code
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => openEmailShare('all')}>
                  <Mail className="h-4 w-4 mr-2" /> Email all docs
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setSelectMode(true); setSelected(new Set()); }}>
                  <CheckSquare className="h-4 w-4 mr-2" /> Select multiple
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onClose}>
                  <List className="h-4 w-4 mr-2" /> Switch to List View
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem onClick={() => openEmailShare('selected')} disabled={selected.size === 0}>
                  <Mail className="h-4 w-4 mr-2" /> Email selected ({selected.size})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={shareSelectedText} disabled={selected.size === 0}>
                  <MessageSquare className="h-4 w-4 mr-2" /> Text selected ({selected.size})
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { setSelectMode(false); setSelected(new Set()); }}>
                  <Square className="h-4 w-4 mr-2" /> Cancel selection
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Page area */}
      <div
        ref={swipe.ref}
        onTouchStart={swipe.onTouchStart}
        onTouchMove={swipe.onTouchMove}
        onTouchEnd={swipe.onTouchEnd}
        className="flex-1 relative overflow-hidden bg-muted/20"
      >
        {/* Selection toggle for current doc */}
        {selectMode && current?.shareToken && (
          <button
            onClick={() => toggleSel(current.id)}
            className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-card/95 border border-border rounded-full px-3 py-1.5 text-xs font-semibold shadow-md"
          >
            {selected.has(current.id)
              ? <CheckSquare className="h-4 w-4 text-gold" />
              : <Square className="h-4 w-4 text-muted-foreground" />}
            {selected.has(current.id) ? 'Selected' : 'Select page'}
          </button>
        )}

        <div
          key={current?.id ?? index}
          className={`absolute inset-0 ${direction === 'next' ? 'animate-slide-in-right' : direction === 'prev' ? 'animate-slide-in-left' : ''}`}
        >
          {current?.kind === 'cover'
            ? <CoverPage driverName={driverName} unitNumber={unitNumber} totalPages={total} />
            : current ? <PageRenderer page={current} /> : null}
        </div>

        {/* Side nav arrows (desktop) */}
        <button
          onClick={goPrev}
          disabled={index === 0}
          className="hidden md:flex absolute top-1/2 -translate-y-1/2 left-3 h-12 w-12 rounded-full bg-card/90 border border-border shadow-lg items-center justify-center text-foreground hover:bg-card disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <button
          onClick={goNext}
          disabled={index === total - 1}
          className="hidden md:flex absolute top-1/2 -translate-y-1/2 right-3 h-12 w-12 rounded-full bg-card/90 border border-border shadow-lg items-center justify-center text-foreground hover:bg-card disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Next page"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      {/* Bottom bar: mobile arrows + dot indicator */}
      <div className="shrink-0 border-t border-border bg-card/95 backdrop-blur px-3 py-2.5">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={goPrev}
            disabled={index === 0}
            className="md:hidden gap-1 text-xs"
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <div className="flex-1 flex items-center justify-center gap-1.5 overflow-x-auto py-1">
            {pages.map((p, i) => (
              <button
                key={p.id}
                onClick={() => { setDirection(i > index ? 'next' : 'prev'); setIndex(i); }}
                className={`shrink-0 transition-all rounded-full ${
                  i === index
                    ? 'h-2 w-6 bg-gold'
                    : 'h-2 w-2 bg-muted-foreground/30 hover:bg-muted-foreground/60'
                }`}
                aria-label={`Go to page ${i + 1}: ${p.title}`}
              />
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={goNext}
            disabled={index === total - 1}
            className="md:hidden gap-1 text-xs"
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* QR overlay */}
      {showQR && qrSrc && (
        <div
          className="fixed inset-0 z-[110] bg-background/95 flex flex-col items-center justify-center p-6"
          onClick={() => setShowQR(false)}
        >
          <div className="bg-card border border-border rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-4 max-w-sm" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold text-foreground text-center">{current?.title}</p>
            <img src={qrSrc} alt="QR code" className="h-64 w-64" />
            <p className="text-xs text-muted-foreground text-center">
              {current?.kind === 'cover'
                ? 'Scan to see every document in this binder.'
                : 'Officer can scan this QR to open the document.'}
            </p>
            {currentShare?.ephemeral && (
              <p className="text-[10px] text-muted-foreground text-center">
                Link expires in ~1 hour — rescan if needed.
              </p>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowQR(false)} className="text-xs">Close</Button>
          </div>
        </div>
      )}

      {/* Email share */}
      <Dialog open={emailOpen} onOpenChange={(o) => {
        if (!emailSending) {
          setEmailOpen(o);
          if (!o) setEmailError(null);
        }
      }}>
        <DialogContent className="max-w-md z-[120]">
          <DialogHeader>
            <DialogTitle>Email roadside {emailDocs.length === 1 ? 'document' : 'documents'}</DialogTitle>
            <DialogDescription>
              Sends a clean, branded SUPERTRANSPORT email with a secure View button for each document.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {emailError && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">Could not send the email</p>
                  <p className="mt-0.5 text-xs leading-relaxed">{emailError}</p>
                </div>
              </div>
            )}
            <div className="rounded-lg border border-border bg-muted/30 p-3 max-h-40 overflow-y-auto">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Including ({emailDocs.length})
              </p>
              <ul className="space-y-1">
                {emailDocs.map(d => (
                  <li key={d.id} className="text-xs text-foreground truncate">• {d.title}</li>
                ))}
              </ul>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="binder-share-email" className="text-xs">Recipient email</Label>
              <Input
                id="binder-share-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="officer@example.gov"
                value={emailRecipient}
                onChange={(e) => setEmailRecipient(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="binder-share-note" className="text-xs">Note (optional)</Label>
              <Textarea
                id="binder-share-note"
                rows={3}
                maxLength={600}
                placeholder="Anything the recipient should know…"
                value={emailNote}
                onChange={(e) => setEmailNote(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              disabled={emailSending}
              onClick={() => { setEmailOpen(false); emailFallbackMailto(); }}
            >
              Use my mail app instead
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={emailSending} onClick={() => setEmailOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={sendEmailShare} disabled={emailSending} className="gap-1.5">
                {emailSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {emailSending ? 'Sending…' : 'Send email'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  return createPortal(overlay, document.body);
}
