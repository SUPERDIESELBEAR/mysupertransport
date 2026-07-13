import { useEffect, useRef } from "react";
import { appendBackButtonTrace } from "@/lib/navTrace";

/**
 * Pop our virtual history entry ONLY if the URL is still where we pushed it.
 * If the router (or user) already navigated elsewhere, calling history.back()
 * would rewind that real navigation — the exact bug that snapped drivers
 * back to the Status page after tapping CTAs.
 */
function safePopVirtualEntry(pushedHref: string | null, reason: string) {
  if (typeof window === "undefined") return;
  const currentHref = window.location.href;
  if (pushedHref && currentHref === pushedHref) {
    appendBackButtonTrace({ event: "fired-back", reason, href: currentHref });
    window.history.back();
  } else {
    appendBackButtonTrace({
      event: "skipped-back",
      reason,
      pushedHref,
      currentHref,
    });
  }
}

/**
 * Pushes a virtual history entry when a modal/drawer opens.
 * If the user presses the phone's hardware back button, the
 * popstate event fires and we call `onClose` instead of
 * letting the browser navigate away (which would close the app).
 *
 * When the modal is closed normally (X, overlay click, ESC),
 * we pop the virtual entry so the history stack stays clean.
 */
export function useBackButton(isOpen: boolean, onClose: () => void) {
  const closeFnRef = useRef(onClose);
  closeFnRef.current = onClose;

  const pushedRef = useRef(false);
  const pushedHrefRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      // If modal just closed normally and we still have a pushed entry, pop it
      if (pushedRef.current) {
        pushedRef.current = false;
        const href = pushedHrefRef.current;
        pushedHrefRef.current = null;
        safePopVirtualEntry(href, "isOpen-false");
      }
      return;
    }

    // Push a virtual history entry
    window.history.pushState({ modalOpen: true }, "");
    pushedRef.current = true;
    pushedHrefRef.current = window.location.href;

    const handlePopState = () => {
      // The virtual entry was popped (user pressed back)
      pushedRef.current = false;
      pushedHrefRef.current = null;
      closeFnRef.current();
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      // If the modal unmounted while still "open" (e.g., parent set
      // previewDoc=null without first toggling isOpen=false), pop the
      // virtual history entry we pushed so the back stack stays clean
      // and no lingering popstate handlers can interfere with the page.
      if (pushedRef.current) {
        pushedRef.current = false;
        const href = pushedHrefRef.current;
        pushedHrefRef.current = null;
        safePopVirtualEntry(href, "unmount");
      }
    };
  }, [isOpen]);
}
