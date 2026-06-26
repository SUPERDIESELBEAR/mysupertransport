import { useEffect, useState } from "react";
import { AlertCircle, Check, Cloud, CloudOff, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { UnsavedStatus } from "@/hooks/useUnsavedChanges";

interface Props {
  status: UnsavedStatus;
  lastSavedAt?: Date | null;
  onRetry?: () => void;
  className?: string;
}

function formatRelative(d: Date): string {
  const secs = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Inline status badge for the unsaved-changes hook.
 * Has an aria-live polite region so screen readers announce save state.
 */
export function UnsavedStatusPill({ status, lastSavedAt, onRetry, className }: Props) {
  // Re-render every 10s while showing "saved · Xs ago" so the relative time stays fresh.
  const [, force] = useState(0);
  useEffect(() => {
    if (status !== "saved") return;
    const id = window.setInterval(() => force((n) => n + 1), 10000);
    return () => window.clearInterval(id);
  }, [status]);

  if (status === "idle") return null;

  const base =
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium tracking-wide";

  let content: React.ReactNode = null;
  let tone = "";

  switch (status) {
    case "dirty":
      tone = "border-gold/50 bg-gold/10 text-gold";
      content = (<><Cloud className="h-3 w-3" aria-hidden /> Unsaved changes</>);
      break;
    case "saving":
      tone = "border-border bg-muted text-muted-foreground";
      content = (<><Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Saving…</>);
      break;
    case "saved":
      tone = "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
      content = (
        <>
          <Check className="h-3 w-3" aria-hidden />
          All changes saved{lastSavedAt ? ` · ${formatRelative(lastSavedAt)}` : ""}
        </>
      );
      break;
    case "error":
      tone = "border-destructive/50 bg-destructive/10 text-destructive";
      content = (
        <>
          <AlertCircle className="h-3 w-3" aria-hidden /> Save failed
          {onRetry && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-1 h-5 px-1.5 py-0 text-xs text-destructive hover:bg-destructive/20"
              onClick={onRetry}
            >
              <RefreshCw className="mr-1 h-3 w-3" aria-hidden /> Retry
            </Button>
          )}
        </>
      );
      break;
    case "invalid":
      tone = "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400";
      content = (<><AlertCircle className="h-3 w-3" aria-hidden /> Waiting to save — fix errors</>);
      break;
    case "demo":
      tone = "border-border bg-muted text-muted-foreground";
      content = (<><CloudOff className="h-3 w-3" aria-hidden /> Demo mode — changes not saved</>);
      break;
  }

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(base, tone, className)}
    >
      {content}
    </span>
  );
}
