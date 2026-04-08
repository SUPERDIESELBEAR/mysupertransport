import { useEffect, useRef } from "react";

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

  useEffect(() => {
    if (!isOpen) {
      // If modal just closed normally and we still have a pushed entry, pop it
      if (pushedRef.current) {
        pushedRef.current = false;
        window.history.back();
      }
      return;
    }

    // Push a virtual history entry
    window.history.pushState({ modalOpen: true }, "");
    pushedRef.current = true;

    const handlePopState = () => {
      // The virtual entry was popped (user pressed back)
      pushedRef.current = false;
      closeFnRef.current();
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isOpen]);
}
