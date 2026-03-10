import { useRef, useCallback } from 'react';

interface SwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  /** Minimum horizontal distance (px) to count as a swipe. Default: 60 */
  threshold?: number;
  /** Max vertical drift allowed as a ratio of horizontal distance. Default: 0.5 */
  maxVerticalRatio?: number;
  /** CSS selector for elements that should NOT trigger navigation (e.g. canvas). */
  excludeSelector?: string;
}

/**
 * Returns ref + touch handlers to attach to a container element.
 * Swipe left  → onSwipeLeft  (go forward)
 * Swipe right → onSwipeRight (go back)
 *
 * Distinguishes horizontal swipes from vertical scrolling using a ratio check
 * so normal page scrolling is unaffected.
 */
export function useSwipeGesture<T extends HTMLElement = HTMLDivElement>({
  onSwipeLeft,
  onSwipeRight,
  threshold = 60,
  maxVerticalRatio = 0.55,
  excludeSelector = 'canvas, input[type="range"], select',
}: SwipeOptions = {}) {
  const ref = useRef<T>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    // Don't hijack touches that originate on excluded elements
    if (excludeSelector) {
      const target = e.target as Element;
      if (target.closest(excludeSelector)) return;
    }
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    tracking.current = true;
  }, [excludeSelector]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!tracking.current) return;
    tracking.current = false;

    const dx = e.changedTouches[0].clientX - startX.current;
    const dy = e.changedTouches[0].clientY - startY.current;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Must exceed threshold AND be more horizontal than vertical
    if (absDx < threshold) return;
    if (absDy / absDx > maxVerticalRatio) return;

    if (dx < 0) {
      onSwipeLeft?.();
    } else {
      onSwipeRight?.();
    }
  }, [onSwipeLeft, onSwipeRight, threshold, maxVerticalRatio]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!tracking.current) return;
    const dx = Math.abs(e.touches[0].clientX - startX.current);
    const dy = Math.abs(e.touches[0].clientY - startY.current);
    // If vertical movement is dominant early, cancel swipe tracking
    // so native scroll can take over without interruption
    if (dy > dx * 1.5 && dy > 10) {
      tracking.current = false;
    }
  }, []);

  return { ref, onTouchStart, onTouchEnd, onTouchMove };
}
