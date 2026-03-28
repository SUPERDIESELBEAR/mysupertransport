import { useEffect, useRef, useState, useCallback } from 'react';

interface UseIdleTimeoutOptions {
  /** Time of inactivity before warning is shown (ms). Default: 25 minutes */
  idleMs?: number;
  /** Time user has to respond to the warning before auto sign-out (ms). Default: 5 minutes */
  warningMs?: number;
  onSignOut: () => void;
}

interface IdleState {
  showWarning: boolean;
  secondsLeft: number;
}

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll', 'click'];

export function useIdleTimeout({
  idleMs = 120 * 60 * 1000,     // 120 minutes idle before warning
  warningMs = 5 * 60 * 1000,    // 5 minute countdown
  onSignOut,
}: UseIdleTimeoutOptions): IdleState & { resetIdle: () => void } {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(Math.floor(warningMs / 1000));

  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsLeftRef = useRef(Math.floor(warningMs / 1000));

  const clearTimers = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (countdownTimer.current) clearInterval(countdownTimer.current);
  }, []);

  const startCountdown = useCallback(() => {
    setShowWarning(true);
    secondsLeftRef.current = Math.floor(warningMs / 1000);
    setSecondsLeft(secondsLeftRef.current);

    countdownTimer.current = setInterval(() => {
      secondsLeftRef.current -= 1;
      setSecondsLeft(secondsLeftRef.current);
      if (secondsLeftRef.current <= 0) {
        clearTimers();
        onSignOut();
      }
    }, 1000);
  }, [warningMs, onSignOut, clearTimers]);

  const resetIdle = useCallback(() => {
    clearTimers();
    setShowWarning(false);
    secondsLeftRef.current = Math.floor(warningMs / 1000);
    setSecondsLeft(secondsLeftRef.current);

    idleTimer.current = setTimeout(startCountdown, idleMs);
  }, [clearTimers, idleMs, warningMs, startCountdown]);

  useEffect(() => {
    // Start idle timer on mount
    idleTimer.current = setTimeout(startCountdown, idleMs);

    // Activity listeners reset the idle timer
    const handleActivity = () => {
      // Don't reset if warning is already showing — let the user click "Stay signed in"
      if (!showWarning) resetIdle();
    };

    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, handleActivity));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { showWarning, secondsLeft, resetIdle };
}
