import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

// Same-origin app page that fetches an operator's QPassport PDF from the
// download-qpassport edge function (using a signed token) and:
//   1. Renders the PDF inline in an <iframe> (via a blob URL — same-origin to
//      the iframe so the browser's native PDF viewer takes over).
//   2. Auto-downloads a copy of the PDF on load. Because the blob is created
//      same-origin, the `download` attribute is honored (cross-origin would
//      have been ignored by the browser).
// A header "Download" button repeats step 2 on demand.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

type ErrorInfo = { title: string; message: string };

export default function QPassportView() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const attachmentBlobRef = useRef<Blob | null>(null);
  const objectUrlsRef = useRef<string[]>([]);

  function trackObjectUrl(url: string) {
    objectUrlsRef.current.push(url);
    return url;
  }

  async function fetchBlob(mode: "inline" | "attachment"): Promise<Blob> {
    const url = `${SUPABASE_URL}/functions/v1/download-qpassport?token=${encodeURIComponent(token)}&mode=${mode}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const titleMatch = text.match(/<title>([^<]+)<\/title>/i);
      const pMatch = text.match(/<p>([^<]+)<\/p>/i);
      throw {
        title: titleMatch?.[1] ?? "Unable to load QPassport",
        message: pMatch?.[1] ?? `The link may have expired (status ${res.status}).`,
      } as ErrorInfo;
    }
    return await res.blob();
  }

  function triggerDownload(blob: Blob) {
    const url = trackObjectUrl(URL.createObjectURL(blob));
    const a = document.createElement("a");
    a.href = url;
    a.download = "QPassport.pdf";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  useEffect(() => {
    if (!token) {
      setError({ title: "Missing link token", message: "This link is incomplete. Please open your portal to view your QPassport." });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [inlineBlob, attachmentBlob] = await Promise.all([
          fetchBlob("inline"),
          fetchBlob("attachment"),
        ]);
        if (cancelled) return;
        attachmentBlobRef.current = attachmentBlob;
        setIframeUrl(trackObjectUrl(URL.createObjectURL(inlineBlob)));
        triggerDownload(attachmentBlob);
      } catch (e) {
        if (cancelled) return;
        const info = (e && typeof e === "object" && "title" in e) ? (e as ErrorInfo) : { title: "Something went wrong", message: "We could not load your QPassport." };
        setError(info);
      }
    })();
    return () => {
      cancelled = true;
      objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      objectUrlsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleManualDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      const blob = attachmentBlobRef.current ?? (await fetchBlob("attachment"));
      attachmentBlobRef.current = blob;
      triggerDownload(blob);
    } catch (e) {
      const info = (e && typeof e === "object" && "title" in e) ? (e as ErrorInfo) : { title: "Download failed", message: "Please try again." };
      setError(info);
    } finally {
      setDownloading(false);
    }
  }

  if (error) {
    return (
      <div style={{ minHeight: "100dvh", background: "#0D0D0D", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" }}>
        <div style={{ maxWidth: 480, textAlign: "center", background: "#1a1a1a", padding: 32, borderRadius: 12, border: "1px solid #2a2a2a" }}>
          <h1 style={{ margin: "0 0 12px", fontSize: 20 }}>{error.title}</h1>
          <p style={{ color: "#bdbdbd", lineHeight: 1.5, margin: "0 0 24px" }}>{error.message}</p>
          <a href="https://mysupertransport.lovable.app/operator?tab=progress#qpassport" style={{ display: "inline-block", background: "#C9A84C", color: "#0D0D0D", textDecoration: "none", fontWeight: 600, padding: "12px 20px", borderRadius: 8 }}>
            Open My Portal
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "#0D0D0D", color: "#fff", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", background: "#1a1a1a", borderBottom: "1px solid #2a2a2a", position: "sticky", top: 0, zIndex: 2 }}>
        <div style={{ fontWeight: 600, fontSize: 15, letterSpacing: ".2px" }}>QPassport</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={handleManualDownload}
            disabled={downloading || !iframeUrl}
            style={{ background: "#C9A84C", color: "#0D0D0D", fontWeight: 600, padding: "8px 14px", borderRadius: 6, border: 0, fontSize: 13, cursor: downloading ? "wait" : "pointer", opacity: downloading || !iframeUrl ? 0.7 : 1 }}
          >
            {downloading ? "Downloading…" : "Download"}
          </button>
          <a
            href="https://mysupertransport.lovable.app/operator?tab=progress#qpassport"
            style={{ background: "transparent", color: "#C9A84C", border: "1px solid #C9A84C", textDecoration: "none", fontWeight: 600, padding: "8px 14px", borderRadius: 6, fontSize: 13 }}
          >
            Open My Portal
          </a>
        </div>
      </header>
      <div style={{ flex: 1, minHeight: 0, background: "#0D0D0D" }}>
        {iframeUrl ? (
          <iframe src={iframeUrl} title="QPassport" style={{ width: "100%", height: "100%", border: 0, background: "#0D0D0D" }} />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#bdbdbd" }}>
            Loading QPassport…
          </div>
        )}
      </div>
    </div>
  );
}