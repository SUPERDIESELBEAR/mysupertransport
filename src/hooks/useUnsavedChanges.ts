import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDemoMode } from "@/hooks/useDemoMode";

export type UnsavedStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "error"
  | "invalid"
  | "demo";

export interface UseUnsavedChangesOptions {
  /** External dirty signal — true when the form has changes vs. its baseline. */
  dirty: boolean;
  /**
   * Called by guard() (and by auto-save, if enabled) to persist changes.
   * Must throw on failure so the hook can surface the "error" state.
   */
  onSave?: () => Promise<void> | void;
  /**
   * Called when the user chooses "Discard changes" from the dialog.
   * Use it to roll the form back to its baseline.
   */
  onDiscard?: () => void;
  /**
   * When true, runs onSave automatically after debounceMs of inactivity
   * (and on a hard flush interval). Used by content editors / broadcasts.
   */
  autoSave?: boolean;
  /** Debounce delay before auto-saving. Default 1500ms. */
  debounceMs?: number;
  /** Hard-flush interval — saves at least this often if still dirty. Default 15000ms. */
  flushIntervalMs?: number;
  /**
   * Returns false to block auto-save (e.g. required fields are invalid).
   * Surfaces as the "invalid" status so the pill can show "Waiting to save".
   */
  canAutoSave?: () => boolean;
  /** Stable scope key for the cross-tab BroadcastChannel banner. */
  scopeKey?: string;
  /** Called when another tab reports saving the same scope. */
  onExternalSave?: () => void;
  /** Cmd/Ctrl+S triggers onSave. Default true. */
  enableSaveShortcut?: boolean;
}

export interface GuardOptions {
  onSave?: () => Promise<void> | void;
  onDiscard?: () => void;
}

export interface PendingExit {
  proceed: () => Promise<void>;
  discard: () => void;
  cancel: () => void;
}

/**
 * Single source of truth for "unsaved changes" UX across the staff dashboard.
 *
 * Tier 2 (manual save): pass { dirty, onSave } and wrap exit actions with guard().
 * Tier 1 (auto-save):   add { autoSave: true } — debounces onSave and exposes
 *                        status transitions for the pill.
 *
 * Composes with:
 *  - window beforeunload (only attaches while dirty)
 *  - Cmd/Ctrl+S keyboard shortcut
 *  - BroadcastChannel('superdrive:record-saved') for cross-tab invalidation
 *  - useDemoMode (auto-save suppressed; manual save still routes through demo guard)
 */
export function useUnsavedChanges(opts: UseUnsavedChangesOptions) {
  const {
    dirty,
    onSave,
    onDiscard,
    autoSave = false,
    debounceMs = 1500,
    flushIntervalMs = 15000,
    canAutoSave,
    scopeKey,
    onExternalSave,
    enableSaveShortcut = true,
  } = opts;

  const { isDemo } = useDemoMode();
  const [status, setStatus] = useState<UnsavedStatus>(dirty ? "dirty" : "idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [pendingExit, setPendingExit] = useState<PendingExit | null>(null);

  const onSaveRef = useRef(onSave);
  const onDiscardRef = useRef(onDiscard);
  const canAutoSaveRef = useRef(canAutoSave);
  const dirtyRef = useRef(dirty);
  onSaveRef.current = onSave;
  onDiscardRef.current = onDiscard;
  canAutoSaveRef.current = canAutoSave;
  dirtyRef.current = dirty;

  // Demo never blocks navigation — nothing is actually being persisted.
  const effectiveDirty = !isDemo && dirty;

  useEffect(() => {
    if (isDemo && dirty) {
      setStatus("demo");
      return;
    }
    setStatus((prev) => {
      if (dirty) {
        if (prev === "saving") return prev;
        if (canAutoSaveRef.current && !canAutoSaveRef.current()) return "invalid";
        return "dirty";
      }
      if (prev === "saving" || prev === "saved") return prev;
      return "idle";
    });
  }, [dirty, isDemo]);

  const runSave = useCallback(
    async (override?: () => Promise<void> | void): Promise<boolean> => {
      const fn = override ?? onSaveRef.current;
      if (!fn) return true;
      setStatus("saving");
      try {
        await fn();
        setStatus("saved");
        setLastSavedAt(new Date());
        if (scopeKey && typeof BroadcastChannel !== "undefined") {
          try {
            const ch = new BroadcastChannel("superdrive:record-saved");
            ch.postMessage({ scope: scopeKey, at: Date.now() });
            ch.close();
          } catch {
            /* noop */
          }
        }
        return true;
      } catch (err) {
        console.error("[useUnsavedChanges] save failed:", err);
        setStatus("error");
        return false;
      }
    },
    [scopeKey]
  );

  // Auto-save debounce
  useEffect(() => {
    if (!autoSave || !dirty || isDemo) return;
    if (canAutoSaveRef.current && !canAutoSaveRef.current()) {
      setStatus("invalid");
      return;
    }
    const t = window.setTimeout(() => {
      void runSave();
    }, debounceMs);
    return () => window.clearTimeout(t);
  }, [autoSave, dirty, isDemo, debounceMs, runSave]);

  // Hard flush
  useEffect(() => {
    if (!autoSave || isDemo) return;
    const id = window.setInterval(() => {
      if (!dirtyRef.current) return;
      if (canAutoSaveRef.current && !canAutoSaveRef.current()) return;
      void runSave();
    }, flushIntervalMs);
    return () => window.clearInterval(id);
  }, [autoSave, isDemo, flushIntervalMs, runSave]);

  // beforeunload (only while dirty)
  useEffect(() => {
    if (!effectiveDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [effectiveDirty]);

  // Cmd/Ctrl+S
  useEffect(() => {
    if (!enableSaveShortcut || !onSave) return;
    const handler = (e: KeyboardEvent) => {
      const isSave = (e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S");
      if (!isSave) return;
      e.preventDefault();
      if (!dirtyRef.current) return;
      void runSave();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enableSaveShortcut, onSave, runSave]);

  // Cross-tab listener
  useEffect(() => {
    if (!scopeKey || typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel("superdrive:record-saved");
    const handler = (ev: MessageEvent) => {
      if (ev.data?.scope === scopeKey) onExternalSave?.();
    };
    ch.addEventListener("message", handler);
    return () => {
      ch.removeEventListener("message", handler);
      ch.close();
    };
  }, [scopeKey, onExternalSave]);

  const guard = useCallback(
    (action: () => void, options?: GuardOptions) => {
      if (!effectiveDirty) {
        action();
        return;
      }
      setPendingExit({
        proceed: async () => {
          const ok = await runSave(options?.onSave);
          if (ok) {
            setPendingExit(null);
            action();
          }
        },
        discard: () => {
          (options?.onDiscard ?? onDiscardRef.current)?.();
          setPendingExit(null);
          action();
        },
        cancel: () => setPendingExit(null),
      });
    },
    [effectiveDirty, runSave]
  );

  const retry = useCallback(() => {
    void runSave();
  }, [runSave]);

  return useMemo(
    () => ({
      status,
      lastSavedAt,
      dirty: effectiveDirty,
      pendingExit,
      guard,
      save: () => runSave(),
      retry,
    }),
    [status, lastSavedAt, effectiveDirty, pendingExit, guard, runSave, retry]
  );
}
