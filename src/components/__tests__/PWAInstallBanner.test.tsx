import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import PWAInstallBanner from "../PWAInstallBanner";

// Helper: make matchMedia return matches:true for the standalone query.
function setStandalone(standalone: boolean) {
  (window.matchMedia as unknown) = (query: string) => ({
    matches: standalone && query.includes("standalone"),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
}

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const IOS_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function fireBeforeInstallPrompt() {
  const evt: any = new Event("beforeinstallprompt");
  evt.prompt = vi.fn().mockResolvedValue(undefined);
  evt.userChoice = Promise.resolve({ outcome: "dismissed" });
  window.dispatchEvent(evt);
}

describe("PWAInstallBanner — hide once installed", () => {
  beforeEach(() => {
    localStorage.clear();
    setStandalone(false);
    setUserAgent(ANDROID_UA);
    // Pretend we're on a real host, not a preview iframe.
    Object.defineProperty(window, "location", {
      value: { ...window.location, hostname: "mysupertransport.lovable.app", assign: vi.fn() },
      configurable: true,
    });
  });

  afterEach(() => cleanup());

  it("renders nothing if the app is already standalone on mount", () => {
    setStandalone(true);
    const { container } = render(<PWAInstallBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("disappears immediately when `appinstalled` fires while visible", async () => {
    render(<PWAInstallBanner />);
    await act(async () => {
      fireBeforeInstallPrompt();
    });
    expect(screen.getByText("Install SUPERDRIVE")).toBeInTheDocument();

    await act(async () => {
      window.dispatchEvent(new Event("appinstalled"));
    });

    expect(screen.queryByText("Install SUPERDRIVE")).not.toBeInTheDocument();
    expect(localStorage.getItem("superdrive-pwa-dismissed")).toBe("1");
  });

  it("hides on visibilitychange once display-mode flips to standalone (iOS path)", async () => {
    setUserAgent(IOS_SAFARI_UA);
    render(<PWAInstallBanner />);
    // iOS card is shown on mount (no beforeinstallprompt needed).
    expect(screen.getByText("Install SUPERDRIVE")).toBeInTheDocument();

    setStandalone(true);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.queryByText("Install SUPERDRIVE")).not.toBeInTheDocument();
    expect(localStorage.getItem("superdrive-pwa-dismissed")).toBe("1");
  });
});