import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

const SCROLL_THRESHOLD = 300;
const VISIBILITY_OVERFLOW = 400;

/**
 * Resolve the actual scroll container for the current page.
 *
 * Portal shells (StaffLayout / ManagementLayout) render `<div class="h-screen overflow-hidden">`
 * with an inner `<main class="overflow-y-auto">`, so `window` never scrolls.
 * Public pages (login, application form) scroll the document itself.
 *
 * Strategy: prefer the first overflowing `<main>` element; otherwise fall back
 * to the document scrolling element.
 */
function resolveScrollContainer(): HTMLElement {
  const mains = Array.from(document.querySelectorAll("main")) as HTMLElement[];
  for (const main of mains) {
    const style = window.getComputedStyle(main);
    const canScroll = style.overflowY === "auto" || style.overflowY === "scroll";
    if (canScroll && main.scrollHeight > main.clientHeight + 1) {
      return main;
    }
  }
  // Window/document fallback
  return (document.scrollingElement as HTMLElement) || document.documentElement;
}

function isDocumentScroller(el: HTMLElement): boolean {
  return el === document.documentElement || el === document.body || el === document.scrollingElement;
}

export function ScrollJumpButton() {
  const [scrolledPast, setScrolledPast] = useState(false);
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLElement | null>(null);

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const isDoc = isDocumentScroller(el);
    const scrollTop = isDoc ? window.scrollY : el.scrollTop;
    const clientHeight = isDoc ? window.innerHeight : el.clientHeight;
    const maxScroll = el.scrollHeight - clientHeight;
    setVisible(maxScroll > VISIBILITY_OVERFLOW);
    setScrolledPast(scrollTop > SCROLL_THRESHOLD);
  }, []);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        measure();
        ticking = false;
      });
    };

    let attachedTarget: HTMLElement | Window | null = null;

    const attach = () => {
      const next = resolveScrollContainer();
      if (containerRef.current === next && attachedTarget) return;

      // Detach previous
      if (attachedTarget) {
        attachedTarget.removeEventListener("scroll", onScroll);
      }

      containerRef.current = next;
      const target: HTMLElement | Window = isDocumentScroller(next) ? window : next;
      target.addEventListener("scroll", onScroll, { passive: true });
      attachedTarget = target;
      measure();
    };

    attach();

    // Re-measure on resize (viewport or layout changes)
    window.addEventListener("resize", measure, { passive: true });

    // Watch for content-height changes inside the chosen container so we
    // refresh visibility when subviews swap or rows load in.
    const ro = new ResizeObserver(() => {
      // Container may have changed (e.g. <main> element re-mounted on route change)
      attach();
      measure();
    });
    if (containerRef.current) ro.observe(containerRef.current);

    // Watch for DOM mutations that might add/remove a <main> element
    const mo = new MutationObserver(() => attach());
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      if (attachedTarget) attachedTarget.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
      ro.disconnect();
      mo.disconnect();
    };
  }, [measure]);

  if (!visible) return null;

  const handleClick = () => {
    const el = containerRef.current;
    if (!el) return;
    const isDoc = isDocumentScroller(el);
    if (scrolledPast) {
      if (isDoc) window.scrollTo({ top: 0, behavior: "smooth" });
      else el.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      const target = el.scrollHeight;
      if (isDoc) window.scrollTo({ top: target, behavior: "smooth" });
      else el.scrollTo({ top: target, behavior: "smooth" });
    }
  };

  const Icon = scrolledPast ? ArrowUp : ArrowDown;
  const label = scrolledPast ? "Back to top" : "Jump to bottom";

  return (
    <button
      onClick={handleClick}
      aria-label={label}
      title={label}
      className={cn(
        "fixed bottom-6 right-6 z-40 flex items-center gap-1.5 rounded-full",
        "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]",
        "px-3 py-2 text-xs font-medium shadow-lg",
        "hover:opacity-90 transition-all duration-200",
        "animate-in fade-in-0 slide-in-from-bottom-2"
      )}
    >
      <Icon size={14} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
