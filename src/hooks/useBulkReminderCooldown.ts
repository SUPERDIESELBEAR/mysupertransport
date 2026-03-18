import { useState, useEffect, useCallback, useRef } from 'react';

const COOLDOWN_MS = 60 * 60 * 1000; // 60 minutes

/**
 * Provides a 60-minute cooldown after bulk reminders are sent.
 * Returns:
 *  - isCoolingDown: true while cooldown is active
 *  - minutesLeft: minutes remaining (rounds up, minimum 1)
 *  - startCooldown(): call this after a successful bulk send
 */
export function useBulkReminderCooldown() {
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick every 30s to keep minutesLeft fresh
  useEffect(() => {
    if (cooldownUntil === null) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = setInterval(() => {
      const t = Date.now();
      setNow(t);
      // Auto-clear once expired
      if (t >= cooldownUntil) {
        setCooldownUntil(null);
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [cooldownUntil]);

  const startCooldown = useCallback(() => {
    const until = Date.now() + COOLDOWN_MS;
    setCooldownUntil(until);
    setNow(Date.now());
  }, []);

  const isCoolingDown = cooldownUntil !== null && now < cooldownUntil;
  const minutesLeft = isCoolingDown && cooldownUntil
    ? Math.ceil((cooldownUntil - now) / 60_000)
    : 0;

  return { isCoolingDown, minutesLeft, startCooldown };
}
