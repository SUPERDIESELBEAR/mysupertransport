import { useState, useEffect, useCallback, useRef } from 'react';

const COOLDOWN_MS = 60 * 60 * 1000; // 60 minutes

function readStorage(key: string) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as { cooldownUntil: number | null; lastSentAt: number | null };
  } catch {
    return null;
  }
}

function writeStorage(key: string, cooldownUntil: number | null, lastSentAt: number | null) {
  try {
    localStorage.setItem(key, JSON.stringify({ cooldownUntil, lastSentAt }));
  } catch {
    // ignore quota errors
  }
}

/**
 * Provides a 60-minute cooldown after bulk reminders are sent.
 * State is persisted to localStorage so it survives page refreshes.
 *
 * @param storageKey  Unique key per bulk-action instance (e.g. 'bulk-reminder-drivers')
 *
 * Returns:
 *  - isCoolingDown: true while cooldown is active
 *  - minutesLeft: minutes remaining (rounds up, minimum 1)
 *  - lastSentAt: Date when the last bulk send was triggered (persists after cooldown)
 *  - lastSentLabel: relative "Xm ago" string
 *  - startCooldown(): call this after a successful bulk send
 */
export function useBulkReminderCooldown(storageKey: string = 'bulk-reminder-default') {
  const [cooldownUntil, setCooldownUntilState] = useState<number | null>(() => {
    const saved = readStorage(storageKey);
    if (!saved) return null;
    // If the persisted cooldown has already expired, discard it
    return saved.cooldownUntil && saved.cooldownUntil > Date.now() ? saved.cooldownUntil : null;
  });

  const [lastSentAt, setLastSentAtState] = useState<Date | null>(() => {
    const saved = readStorage(storageKey);
    return saved?.lastSentAt ? new Date(saved.lastSentAt) : null;
  });

  const [now, setNow] = useState(() => Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick every 60s to keep minutesLeft + "X ago" text fresh
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const t = Date.now();
      setNow(t);
      // Auto-clear cooldown once expired
      setCooldownUntilState(prev => {
        if (prev !== null && t >= prev) return null;
        return prev;
      });
    }, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const setCooldownUntil = useCallback((until: number | null, sentAt: number | null) => {
    setCooldownUntilState(until);
    writeStorage(storageKey, until, sentAt);
  }, [storageKey]);

  const startCooldown = useCallback(() => {
    const t = Date.now();
    const until = t + COOLDOWN_MS;
    setCooldownUntilState(until);
    setLastSentAtState(new Date(t));
    setNow(t);
    writeStorage(storageKey, until, t);
  }, [storageKey]);

  // When cooldown expires mid-session, clear it from storage too
  useEffect(() => {
    if (cooldownUntil !== null && now >= cooldownUntil) {
      const saved = readStorage(storageKey);
      if (saved) writeStorage(storageKey, null, saved.lastSentAt);
    }
  }, [cooldownUntil, now, storageKey]);

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
