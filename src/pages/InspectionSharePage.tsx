import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, FileText, Loader2, ShieldCheck, ExternalLink, Download } from 'lucide-react';
import logo from '@/assets/supertransport-logo.png';

interface DocInfo {
  id: string;
  name: string;
  file_url: string | null;
  expires_at: string | null;
}

export default function InspectionSharePage() {
  const { token } = useParams<{ token: string }>();
  const [doc, setDoc] = useState<DocInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    (async () => {
      const { data, error } = await supabase.rpc('get_inspection_doc_by_token', {
        p_token: token,
      });
      if (error || !data || (Array.isArray(data) && data.length === 0)) {
        setNotFound(true);
      } else {
        const row = Array.isArray(data) ? data[0] : data;
        setDoc(row as DocInfo);
      }
      setLoading(false);
    })();
  }, [token]);

  // iOS Safari does NOT render PDFs inside <iframe> elements — the embed is
  // a blank white box. Roadside officers must be able to open/download the
  // document directly, so we always surface a prominent CTA on iOS.
  const isIOS = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) ||
      (ua.includes('Macintosh') && 'ontouchend' in document);
  }, []);

  const isPdfFile = (url: string | null | undefined) => {
    if (!url) return false;
    return /\.pdf(\?|#|$)/i.test(url);
  };

  const expiryBadge = () => {
    if (!doc?.expires_at) return null;
    const days = Math.ceil((new Date(doc.expires_at).getTime() - Date.now()) / 86400000);
    if (days < 0) return <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 border border-red-300 rounded-full px-3 py-1 font-semibold"><AlertTriangle className="h-3.5 w-3.5" />Expired</span>;
    if (days <= 30) return <span className="inline-flex items-center gap-1 text-xs bg-yellow-100 text-yellow-800 border border-yellow-300 rounded-full px-3 py-1 font-semibold"><AlertTriangle className="h-3.5 w-3.5" />Expiring Soon — {days}d</span>;
    return <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 border border-green-300 rounded-full px-3 py-1 font-semibold"><ShieldCheck className="h-3.5 w-3.5" />Valid</span>;
  };

  return (
    <div className="min-h-dvh bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-black text-white px-4 py-3 flex items-center gap-3">
        <img src={logo} alt="SuperTransport" className="h-7 object-contain" />
        <div className="flex flex-col">
          <span className="text-xs font-bold tracking-widest text-yellow-400 uppercase">SuperTransport</span>
          <span className="text-[10px] text-gray-400 leading-none">Roadside Document Viewer</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-400">
          <ShieldCheck className="h-3.5 w-3.5 text-green-400" />
          Secure Link
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-start p-4 pt-8">
        {loading && (
          <div className="flex flex-col items-center gap-3 py-16 text-gray-500">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Loading document…</p>
          </div>
        )}

        {!loading && notFound && (
          <div className="max-w-sm w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-8 flex flex-col items-center gap-4 text-center">
            <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Document Not Found</h2>
            <p className="text-sm text-gray-500">This link is invalid or the document has been removed. Please request a new share link from the driver.</p>
          </div>
        )}

        {!loading && doc && (
          <div className="w-full max-w-2xl flex flex-col gap-4">
            {/* Document card */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-gray-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-gray-900 leading-tight">{doc.name}</h2>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {expiryBadge()}
                  {doc.expires_at && (
                    <span className="text-xs text-gray-500">
                      Expires: {new Date(doc.expires_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Always provide a reliable download/open CTA up-front. iOS Safari
                cannot render PDFs in <iframe>, so the button is the primary
                interaction for officers on those devices. */}
            {doc.file_url ? (
              <>
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {isIOS && isPdfFile(doc.file_url)
                        ? 'Tap to open the document'
                        : 'Open or download the document'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Opens in your device's PDF viewer for full-screen reading and sharing.
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-black text-white text-sm font-semibold px-4 py-2.5 min-h-11 hover:bg-gray-800 transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open
                    </a>
                    <a
                      href={doc.file_url}
                      download={doc.name}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white text-gray-900 text-sm font-semibold px-4 py-2.5 min-h-11 hover:bg-gray-50 transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      Save
                    </a>
                  </div>
                </div>

                {/* Inline preview — works on desktop/Android; iOS Safari will show
                    a blank box for PDFs, but the CTA above is the reliable path. */}
                {!isIOS && (
                  <div
                    className="hidden sm:block bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
                    style={{ height: 'calc(100dvh - 320px)', minHeight: 400 }}
                  >
                    <iframe
                      src={`${doc.file_url}#toolbar=1`}
                      className="w-full h-full"
                      title={doc.name}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 flex flex-col items-center gap-3 text-center">
                <FileText className="h-10 w-10 text-gray-300" />
                <p className="text-gray-500 text-sm">No file has been uploaded for this document yet.</p>
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
