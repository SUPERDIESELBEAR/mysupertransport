import { useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'compliance_alert_window_days';
export const COMPLIANCE_WINDOW_OPTIONS = [30, 60, 90] as const;
export type ComplianceWindowDays = (typeof COMPLIANCE_WINDOW_OPTIONS)[number];
export const DEFAULT_COMPLIANCE_WINDOW: ComplianceWindowDays = 30;

const EVENT_NAME = 'compliance-window-change';

function readStored(): ComplianceWindowDays {
  if (typeof window === 'undefined') return DEFAULT_COMPLIANCE_WINDOW;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const n = raw ? Number(raw) : NaN;
  return (COMPLIANCE_WINDOW_OPTIONS as readonly number[]).includes(n)
    ? (n as ComplianceWindowDays)
    : DEFAULT_COMPLIANCE_WINDOW;
}

/**
 * Per-staff-user compliance alert visibility window (days).
 * Stored in localStorage; changes broadcast across all open surfaces in the
 * same tab (custom event) and other tabs (storage event).
 *
 * "Expired" and "Critical (≤7d)" tiers always show — only the upper bound of
 * the "Warning" tier respects this value.
 */
export function useComplianceWindow() {
  const [windowDays, setWindowDaysState] = useState<ComplianceWindowDays>(readStored);

  useEffect(() => {
    const sync = () => setWindowDaysState(readStored());
    window.addEventListener('storage', sync);
    window.addEventListener(EVENT_NAME, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(EVENT_NAME, sync);
    };
  }, []);

  const setWindowDays = useCallback((value: ComplianceWindowDays) => {
    window.localStorage.setItem(STORAGE_KEY, String(value));
    window.dispatchEvent(new Event(EVENT_NAME));
    setWindowDaysState(value);
  }, []);

  return { windowDays, setWindowDays };
}