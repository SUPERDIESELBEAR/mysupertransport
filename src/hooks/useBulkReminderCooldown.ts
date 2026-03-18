import { useState, useEffect, useCallback, useRef } from 'react';

const COOLDOWN_MS = 60 * 60 * 1000; // 60 minutes

/**
 * Provides a 60-minute cooldown after bulk reminders are sent.
 * Returns:
 *  - isCoolingDown: true while cooldown is active
 *  - minutesLeft: minutes remaining (rounds up, minimum 1)
 *  - lastSentAt: Date when the last bulk send was triggered (persists after cooldown)
 *  - startCooldown(): call this after a successful bulk send
 */
export function useBulkReminderCooldown() {
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick every 60s to keep minutesLeft + "X ago" text fresh
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const t = Date.now();
      setNow(t);
      // Auto-clear cooldown once expired
      if (cooldownUntil !== null && t >= cooldownUntil) {
        setCooldownUntil(null);
      }
    }, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [cooldownUntil]);

  const startCooldown = useCallback(() => {
    const t = Date.now();
    const until = t + COOLDOWN_MS;
    setCooldownUntil(until);
    setLastSentAt(new Date(t));
    setNow(t);
  }, []);

  const isCoolingDown = cooldownUntil !== null && now < cooldownUntil;
  const minutesLeft = isCoolingDown && cooldownUntil
    ? Math.ceil((cooldownUntil - now) / 60_000)
    : 0;

  // "X ago" label for lastSentAt
  const lastSentLabel = lastSentAt
    ? (() => {
        const mins = Math.floor((now - lastSentAt.getTime()) / 60_000);
        if (mins < 1) return 'just now';
        if (mins === 1) return '1m ago';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        return hrs === 1 ? '1h ago' : `${hrs}h ago`;
      })()
    : null;

  return { isCoolingDown, minutesLeft, lastSentAt, lastSentLabel, startCooldown };
}
