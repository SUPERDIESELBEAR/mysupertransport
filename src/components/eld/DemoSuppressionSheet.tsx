import { useEffect, useState } from 'react';
import { X, MailWarning, ChevronUp } from 'lucide-react';
import {
  DEMO_SUPPRESSED_EVENT, type DemoSuppressionDetail,
} from '@/lib/eld/demoSuppression';
import { Button } from '@/components/ui/button';

interface Entry extends DemoSuppressionDetail {
  id: string;
  at: string;
}

/**
 * The "this would have been sent" record for demo drivers.
 *
 * Persistent rather than a toast: a suppressed send is the demonstration. A
 * notice that disappears after nine seconds leaves the session looking like
 * nothing happened, which is the exact failure suppression-must-be-visible was
 * written to prevent. Dismissible, and re-openable from the pill afterwards.
 */
export default function DemoSuppressionSheet() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    function onSuppressed(e: Event) {
      const detail = (e as CustomEvent<DemoSuppressionDetail>).detail;
      if (!detail?.what) return;
      setEntries((prev) => [
        { ...detail, id: `${Date.now()}-${prev.length}`, at: new Date().toLocaleTimeString() },
        ...prev,
      ].slice(0, 12));
      setOpen(true);
    }
    window.addEventListener(DEMO_SUPPRESSED_EVENT, onSuppressed);
    return () => window.removeEventListener(DEMO_SUPPRESSED_EVENT, onSuppressed);
  }, []);

  if (entries.length === 0) return null;

  if (!open) {
    return (
      <button
        type="button"
        data-testid="demo-suppression-pill"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-medium text-foreground shadow-lg"
      >
        <MailWarning className="h-4 w-4 text-primary" />
        Demo — {entries.length} send{entries.length === 1 ? '' : 's'} held back
        <ChevronUp className="h-3 w-3" />
      </button>
    );
  }

  return (
    <div
      data-testid="demo-suppression-sheet"
      className="fixed bottom-4 right-4 z-[60] w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-card shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MailWarning className="h-4 w-4 text-primary" />
          Demo mode — nothing was sent
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          aria-label="Hide suppressed sends"
          onClick={() => setOpen(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ul className="max-h-72 divide-y divide-border overflow-y-auto">
        {entries.map((entry) => (
          <li key={entry.id} className="px-3 py-2 text-xs" data-testid="demo-suppression-entry">
            <p className="font-medium text-foreground">{entry.what}</p>
            {entry.to?.length ? (
              <p className="mt-1 text-muted-foreground">
                Would have gone to: <span className="break-all">{entry.to.join(', ')}</span>
              </p>
            ) : null}
            {entry.subject ? (
              <p className="text-muted-foreground">Subject: {entry.subject}</p>
            ) : null}
            {entry.attachment ? (
              <p className="text-muted-foreground">Attachment: {entry.attachment}</p>
            ) : null}
            {entry.note ? <p className="text-muted-foreground">{entry.note}</p> : null}
            <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{entry.at}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
