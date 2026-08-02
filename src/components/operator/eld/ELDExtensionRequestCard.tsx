import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { FileText, Loader2, ShieldCheck } from 'lucide-react';
import {
  EXTENSION_REQUEST_SELECT, openExtensionRequestPdf, type ExtensionRequestRow,
} from '@/lib/eld/extensionRequest';

/**
 * Driver-side view of the carrier's FMCSA extension filing. Drafts are invisible
 * here by policy — the driver sees a filing only once it has actually been filed,
 * so the dashboard can never promise relief that was never requested.
 */
export default function ELDExtensionRequestCard({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<ExtensionRequestRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('eld_extension_requests')
        .select(EXTENSION_REQUEST_SELECT)
        .eq('event_id', eventId)
        .in('status', ['submitted', 'granted', 'denied'])
        .order('created_at', { ascending: false });
      if (!cancelled) setRows((data as unknown as ExtensionRequestRow[]) ?? []);
    })();
    return () => { cancelled = true; };
  }, [eventId]);

  if (rows.length === 0) return null;

  async function view(row: ExtensionRequestRow) {
    if (!row.pdf_path) { toast.info('The filing PDF is not available yet.'); return; }
    setBusy(true);
    const url = await openExtensionRequestPdf(row.pdf_path);
    setBusy(false);
    if (!url) { toast.error('Could not open the filing right now.'); return; }
    window.open(url, '_blank', 'noopener');
  }

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="text-sm font-semibold text-foreground">
        <ShieldCheck className="mr-1 inline h-4 w-4" /> FMCSA repair extension
      </div>
      {rows.map((r) => (
        <div key={r.id} className="space-y-2 text-xs">
          <p className="text-muted-foreground">
            {r.status === 'granted' && r.granted_through
              ? `FMCSA granted an extension through ${new Date(`${r.granted_through}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}. Keep using paper logs until the repair is done.`
              : r.status === 'denied'
                ? 'FMCSA denied the extension. The original 8-day repair deadline still applies.'
                : `The carrier filed an extension request on ${r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : '—'} and is waiting on FMCSA.`}
          </p>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => view(r)}>
            {busy ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <FileText className="mr-2 h-3 w-3" />}
            Show this to an officer
          </Button>
        </div>
      ))}
    </div>
  );
}