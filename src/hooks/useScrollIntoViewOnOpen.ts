import { useEffect, useRef, RefObject } from 'react';

interface Options {
  /** Pixels to leave above the element (accounts for sticky headers). Default 80. */
  offset?: number;
  /** Scroll behavior. Auto-falls back to 'auto' when prefers-reduced-motion is set. */
  behavior?: ScrollBehavior;
  /**
   * Scroll container. 'auto' walks parents to find the nearest scrollable ancestor,
   * falling back to window. 'window' forces window scroll. A ref forces that element.
   */
  container?: 'auto' | 'window' | RefObject<HTMLElement>;
}

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el?.parentElement ?? null;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    const overflowY = style.overflowY;
    if (
      (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export function scrollElementIntoViewWithOffset(
  el: HTMLElement | null,
  options: Options = {},
): void {
  if (!el) return;

  const {
    offset = 80,
    behavior = 'smooth',
    container = 'auto',
  } = options;

  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const effectiveBehavior: ScrollBehavior = prefersReduced ? 'auto' : behavior;

  let scrollEl: HTMLElement | Window | null = null;
  if (container === 'window') {
    scrollEl = window;
  } else if (container === 'auto') {
    scrollEl = findScrollParent(el) ?? window;
  } else if (container && 'current' in container) {
    scrollEl = container.current;
  }
  if (!scrollEl) return;

  if (scrollEl === window) {
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: effectiveBehavior });
  } else {
    const parent = scrollEl as HTMLElement;
    const top =
      el.getBoundingClientRect().top -
      parent.getBoundingClientRect().top +
      parent.scrollTop -
      offset;
    parent.scrollTo({ top: Math.max(0, top), behavior: effectiveBehavior });
  }
}

/**
 * Scrolls the returned ref's element into view (top-aligned, minus offset) when
 * `open` transitions from false to true. Does nothing on collapse or on initial
 * mount. Handles both window and internal scroll containers (drawers, modals).
 */
export function useScrollIntoViewOnOpen<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  options: Options = {},
): RefObject<T> {
  const ref = useRef<T>(null);
  const prevOpenRef = useRef(open);
  const hasMountedRef = useRef(false);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;

    // Skip the very first effect run so sections that mount already-open don't scroll.
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    // Only react to false → true transitions.
    if (!open || wasOpen) return;

    const el = ref.current;
    if (!el) return;

    const {
      offset = 80,
      behavior = 'smooth',
      container = 'auto',
    } = options;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const effectiveBehavior: ScrollBehavior = prefersReduced ? 'auto' : behavior;

    // Double-RAF so the expanded content has laid out before we measure.
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        scrollElementIntoViewWithOffset(el, { offset, behavior: effectiveBehavior, container });
      });
      // Store raf2 on the parent so cleanup cancels both.
      (raf1 as unknown as { _child?: number })._child = raf2;
    });

    return () => {
      cancelAnimationFrame(raf1);
      const child = (raf1 as unknown as { _child?: number })._child;
      if (child) cancelAnimationFrame(child);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return ref;
}

export default useScrollIntoViewOnOpen;