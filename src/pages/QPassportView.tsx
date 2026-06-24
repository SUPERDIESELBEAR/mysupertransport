import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

// Same-origin app page that fetches an operator's QPassport from the
// download-qpassport edge function (signed token) and:
//   1. Renders the QPassport as a STATIC IMAGE on the page.
//      - If the file is an image, displays it directly.
//      - If the file is a PDF, renders the first page to a canvas via pdf.js
//        and shows the resulting image.
//   2. Auto-downloads the original file. The header "Download" button
//      repeats the download on demand (works on mobile where auto-download
//      may be blocked).

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

type ErrorInfo = { title: string; message: string };

function fnUrl(token: string, mode: "inline" | "attachment") {
  return `${SUPABASE_URL}/functions/v1/download-qpassport?token=${encodeURIComponent(token)}&mode=${mode}`;
}

async function renderPdfFirstPageToDataUrl(bytes: ArrayBuffer): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
  return canvas.toDataURL("image/png");
}

export default function QPassportView() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const attachmentRef = useRef<{ blob: Blob; filename: string } | null>(null);
  const objectUrlsRef = useRef<string[]>([]);

  function track(url: string) {
    objectUrlsRef.current.push(url);
    return url;
  }

  function filenameFromDisposition(disposition: string | null, contentType: string): string {
    const m = disposition?.match(/filename="?([^";]+)"?/i);
    if (m?.[1]) return m[1];
    if (contentType.startsWith("image/")) {
      const ext = contentType.split("/")[1].split(";")[0];
      return `QPassport.${ext}`;
    }
    return "QPassport.pdf";
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = track(URL.createObjectURL(blob));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  useEffect(() => {
    if (!token) {
      setError({
        title: "Missing link token",
        message: "This link is incomplete. Please open your portal to view your QPassport.",
      });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(fnUrl(token, "inline"), { cache: "no-store" });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          const titleMatch = text.match(/<title>([^<]+)<\/title>/i);
          const pMatch = text.match(/<p>([^<]+)<\/p>/i);
          throw {
            title: titleMatch?.[1] ?? "Unable to load QPassport",
            message: pMatch?.[1] ?? `The link may have expired (status ${res.status}).`,
          } as ErrorInfo;
        }
        const contentType = res.headers.get("Content-Type") ?? "application/octet-stream";
        const disposition = res.headers.get("Content-Disposition");
        const buf = await res.arrayBuffer();
        if (cancelled) return;

        const isImage = contentType.startsWith("image/");
        const blob = new Blob([buf], { type: contentType });
        const filename = filenameFromDisposition(disposition, contentType);
        attachmentRef.current = { blob, filename };

        if (isImage) {
          setImageUrl(track(URL.createObjectURL(blob)));
        } else {
          // PDF (or unknown) → render first page as static image.
          const dataUrl = await renderPdfFirstPageToDataUrl(buf.slice(0));
          if (cancelled) return;
          setImageUrl(dataUrl);
        }

        // Best-effort auto-download. Mobile browsers may block; the header
        // Download button is the user-initiated fallback.
        try {
          triggerDownload(blob, filename);
        } catch {
          /* ignore */
        }
      } catch (e) {
        if (cancelled) return;
        const info =
          e && typeof e === "object" && "title" in (e as object)
            ? (e as ErrorInfo)
            : { title: "Something went wrong", message: "We could not load your QPassport." };
        setError(info);
      }
    })();
    return () => {
      cancelled = true;
      objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      objectUrlsRef.current = [];
    };
  }, [token]);

  async function handleManualDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      let payload = attachmentRef.current;
      if (!payload) {
        const res = await fetch(fnUrl(token, "attachment"), { cache: "no-store" });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const contentType = res.headers.get("Content-Type") ?? "application/octet-stream";
        const disposition = res.headers.get("Content-Disposition");
        const buf = await res.arrayBuffer();
        payload = {
          blob: new Blob([buf], { type: contentType }),
          filename: filenameFromDisposition(disposition, contentType),
        };
        attachmentRef.current = payload;
      }
      triggerDownload(payload.blob, payload.filename);
    } catch {
      setError({ title: "Download failed", message: "Please try again." });
    } finally {
      setDownloading(false);
    }
  }

  if (error) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={{ margin: "0 0 12px", fontSize: 20 }}>{error.title}</h1>
          <p style={{ color: "#bdbdbd", lineHeight: 1.5, margin: "0 0 24px" }}>{error.message}</p>
          <a href="https://mysupertransport.lovable.app/operator?tab=progress#qpassport" style={primaryBtn}>
            Open My Portal
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", background: "#0D0D0D", color: "#fff", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" }}>
      <header style={headerStyle}>
        <div style={{ fontWeight: 600, fontSize: 15, letterSpacing: ".2px" }}>QPassport</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={handleManualDownload}
            disabled={downloading || !imageUrl}
            style={{ ...primaryBtn, padding: "8px 14px", fontSize: 13, border: 0, cursor: downloading ? "wait" : "pointer", opacity: downloading || !imageUrl ? 0.7 : 1 }}
          >
            {downloading ? "Downloading…" : "Download"}
          </button>
          <a
            href="https://mysupertransport.lovable.app/operator?tab=progress#qpassport"
            style={{ ...secondaryBtn, padding: "8px 14px", fontSize: 13 }}
          >
            Open My Portal
          </a>
        </div>
      </header>
      <div style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16 }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="QPassport"
            style={{ maxWidth: "100%", height: "auto", borderRadius: 8, boxShadow: "0 4px 24px rgba(0,0,0,.5)", background: "#fff" }}
          />
        ) : (
          <div style={{ color: "#bdbdbd", padding: 40 }}>Loading QPassport…</div>
        )}
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "#0D0D0D",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
};

const cardStyle: React.CSSProperties = {
  maxWidth: 480,
  textAlign: "center",
  background: "#1a1a1a",
  padding: 32,
  borderRadius: 12,
  border: "1px solid #2a2a2a",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "12px 16px",
  background: "#1a1a1a",
  borderBottom: "1px solid #2a2a2a",
  position: "sticky",
  top: 0,
  zIndex: 2,
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  background: "#C9A84C",
  color: "#0D0D0D",
  textDecoration: "none",
  fontWeight: 600,
  padding: "12px 20px",
  borderRadius: 8,
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  background: "transparent",
  color: "#C9A84C",
  border: "1px solid #C9A84C",
  textDecoration: "none",
  fontWeight: 600,
  padding: "12px 20px",
  borderRadius: 8,
};