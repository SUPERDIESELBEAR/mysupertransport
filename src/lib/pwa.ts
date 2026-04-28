/**
 * Shared helpers for PWA install flows (banner + /install-app step).
 */

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

/**
 * Detects common in-app browsers (webviews) where iOS PWAs cannot be installed.
 * Gmail, Facebook, Instagram, LinkedIn, Twitter/X, TikTok, Slack, Snapchat all
 * open links in their own webview that does NOT expose Safari's Share →
 * Add to Home Screen flow.
 */
export function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // Gmail (GSA = Google Search App, also used by Gmail iOS)
  if (/GSA\//i.test(ua)) return true;
  // Facebook / Messenger
  if (/(FBAN|FBAV|FB_IAB|FBIOS|MessengerForiOS)/i.test(ua)) return true;
  // Instagram
  if (/Instagram/i.test(ua)) return true;
  // LinkedIn
  if (/LinkedInApp/i.test(ua)) return true;
  // Twitter / X
  if (/Twitter/i.test(ua)) return true;
  // TikTok
  if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) return true;
  // Snapchat
  if (/Snapchat/i.test(ua)) return true;
  // Slack
  if (/Slack/i.test(ua)) return true;
  // Line
  if (/Line\//i.test(ua)) return true;
  // WeChat
  if (/MicroMessenger/i.test(ua)) return true;
  // Generic iOS WebView heuristic: iOS device but NOT Safari and NOT CriOS/FxiOS/EdgiOS
  if (isIOS()) {
    const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
    const isKnownBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
    if (!isSafari && !isKnownBrowser) return true;
  }
  return false;
}

/**
 * Best-effort copy to clipboard with a legacy fallback for in-app webviews
 * where the Clipboard API is sometimes blocked.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}