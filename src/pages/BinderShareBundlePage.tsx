// Public "flipbook" viewer for a shared set of roadside documents. One link,
// every document, paged one at a time. Individual /inspect/{token} links keep
// working — this is an addition, not a replacement.
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertTriangle, ChevronLeft, ChevronRight, Download, ExternalLink,
  FileText, Loader2, ShieldCheck,
} from 'lucide-react';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import logo from '@/assets/supertransport-logo.png';

interface BundleDoc {
  share_token: string;
  id: string;
  name: string;
  file_url: string | null;
  expires_at: string | null;
}

const isPdfFile = (url?: string | null) => !!url && /\.pdf(\?|#|$)/i.test(url);
const isImageFile = (url?: string | null) =>
  !!url && /\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?)(\?|#|$)/i.test(url);

export default function BinderShareBundlePage() {
  const { token } = useParams<{ token: string }>();
  const [docs, setDocs] = useState<BundleDoc[]>([]);
  const [meta, setMeta] = useState<{ driver_name: string | null; unit_number: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    (async () => {
      const [{ data: rows, error }, { data: metaRows }] = await Promise.all([
        supabase.rpc('resolve_share_bundle', { p_token: token }),
        supabase.rpc('get_share_bundle_meta', { p_token: token }),
      ]);
      const list = (Array.isArray(rows) ? rows : []) as BundleDoc[];
      if (error || list.length === 0) setNotFound(true);
      else setDocs(list);
      const m = Array.isArray(metaRows) ? metaRows[0] : metaRows;
      if (m) setMeta(m as { driver_name: string | null; unit_number: string | null });
      setLoading(false);
    })();
  }, [token]);

  const current = docs[index] ?? null;

  const goPrev = () => setIndex(i => (i > 0 ? i - 1 : i));
  const goNext = () => setIndex(i => (i < docs.length - 1 ? i + 1 : i));

  const swipe = useSwipeGesture<HTMLDivElement>({
    onSwipeLeft: goNext,
    onSwipeRight: goPrev,
    excludeSelector: 'button, a, input, select, textarea',
  });

  const isIOS = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document);
  }, []);

  const expiryBadge = (expires: string | null) => {
    if (!expires) return null;
    const days = Math.ceil((new Date(expires).getTime() - Date.now()) / 86400000);
    if (days < 0) return <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 border border-red-300 rounded-full px-3 py-1 font-semibold"><AlertTriangle className="h-3.5 w-3.5" />Expired</span>;
    if (days <= 30) return <span className="inline-flex items-center gap-1 text-xs bg-yellow-100 text-yellow-800 border border-yellow-300 rounded-full px-3 py-1 font-semibold"><AlertTriangle className="h-3.5 w-3.5" />Expiring Soon — {days}d</span>;
    return <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 border border-green-300 rounded-full px-3 py-1 font-semibold"><ShieldCheck className="h-3.5 w-3.5" />Valid</span>;
  };

  return (
    <div className="min-h-dvh bg-gray-50 flex flex-col">
      <div className="bg-black text-white px-4 py-3 flex items-center gap-3">
        <img src={logo} alt="SuperTransport" className="h-7 object-contain" />
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-bold tracking-widest text-yellow-400 uppercase">SuperTransport</span>
          <span className="text-[10px] text-gray-400 leading-none truncate">
            {meta?.driver_name
              ? `${meta.driver_name}${meta.unit_number ? ` · Unit ${meta.unit_number}` : ''}`
              : 'Roadside Document Viewer'}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-400 shrink-0">
          <ShieldCheck className="h-3.5 w-3.5 text-green-400" />
          Secure Link
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-start p-4 pt-6">
        {loading && (
          <div className="flex flex-col items-center gap-3 py-16 text-gray-500">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Loading documents…</p>
          </div>
        )}

        {!loading && notFound && (
          <div className="max-w-sm w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-8 flex flex-col items-center gap-4 text-center">
            <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Documents Not Available</h2>
            <p className="text-sm text-gray-500">This link is invalid or has expired. Please request a new share link from the driver.</p>
          </div>
        )}

        {!loading && current && (
          <div className="w-full max-w-3xl flex flex-col gap-4" {...swipe}>
            {/* Pager */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 flex items-center gap-3">
              <button
                type="button"
                onClick={goPrev}
                disabled={index === 0}
                className="inline-flex items-center gap-1 rounded-xl border border-gray-300 px-3 py-2 min-h-11 text-sm font-semibold text-gray-900 disabled:opacity-40 hover:bg-gray-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </button>
              <div className="flex-1 text-center text-sm font-semibold text-gray-700">
                {index + 1} of {docs.length}
              </div>
              <button
                type="button"
                onClick={goNext}
                disabled={index === docs.length - 1}
                className="inline-flex items-center gap-1 rounded-xl border border-gray-300 px-3 py-2 min-h-11 text-sm font-semibold text-gray-900 disabled:opacity-40 hover:bg-gray-50"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Jump strip */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {docs.map((d, i) => (
                <button
                  type="button"
                  key={d.share_token}
                  onClick={() => setIndex(i)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    i === index
                      ? 'bg-black text-white border-black'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                  }`}
                >
                  {i + 1}. {d.name}
                </button>
              ))}
            </div>

            {/* Document card */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-gray-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-gray-900 leading-tight">{current.name}</h2>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {expiryBadge(current.expires_at)}
                  {current.expires_at && (
                    <span className="text-xs text-gray-500">
                      Expires: {new Date(current.expires_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {current.file_url ? (
              <>
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">Open or download this document</p>
                    <p className="text-xs text-gray-500 mt-0.5">Opens in your device's viewer for full-screen reading and sharing.</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <a
                      href={current.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-black text-white text-sm font-semibold px-4 py-2.5 min-h-11 hover:bg-gray-800 transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open
                    </a>
                    <a
                      href={current.file_url}
                      download={current.name}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white text-gray-900 text-sm font-semibold px-4 py-2.5 min-h-11 hover:bg-gray-50 transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      Save
                    </a>
                  </div>
                </div>

                {!isIOS && isImageFile(current.file_url) && (
                  <div className="hidden sm:flex bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden p-3 items-center justify-center">
                    <a href={current.file_url} target="_blank" rel="noopener noreferrer" className="block w-full">
                      <img
                        src={current.file_url}
                        alt={current.name}
                        className="w-full object-contain mx-auto"
                        style={{ maxHeight: 'calc(100dvh - 420px)' }}
                      />
                    </a>
                  </div>
                )}

                {!isIOS && isPdfFile(current.file_url) && (
                  <div
                    className="hidden sm:block bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
                    style={{ height: 'calc(100dvh - 420px)', minHeight: 400 }}
                  >
                    <iframe src={`${current.file_url}#toolbar=1`} className="w-full h-full" title={current.name} />
                  </div>
                )}
              </>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 flex flex-col items-center gap-3 text-center">
                <FileText className="h-10 w-10 text-gray-300" />
                <p className="text-gray-500 text-sm">No file has been uploaded for this document.</p>
              </div>
            )}

            <p className="text-center text-xs text-gray-400 pb-4">
              USDOT No. 2309365 · MC No. 788425 · SUPERTRANSPORT
            </p>
          </div>
        )}
      </div>
    </div>
  );
}