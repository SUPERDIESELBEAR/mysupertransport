import { useEffect, useState, type KeyboardEvent } from 'react';
import { Loader2, Paperclip, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import PacketPreviewButton from '@/components/billing/PacketPreviewButton';
import {
  formatBytes, previewSend, sendInvoice, type SendPreview, type SendResult,
} from '@/lib/invoiceSend';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  invoiceNumber: string;
  loadId: string;
  factorName: string;
  onSent?: (r: SendResult) => void;
}

function Chips({ label, values, onChange }: { label: string; values: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim().toLowerCase();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
  };
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1.5 rounded-md border p-2">
        {values.map(v => (
          <Badge key={v} variant="secondary" className="gap-1">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter(x => x !== v))}>
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <Input
          aria-label={`Add ${label} address`}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={add}
          placeholder="Add address"
          className="h-7 flex-1 min-w-[10rem] border-0 p-0 shadow-none focus-visible:ring-0"
        />
      </div>
    </div>
  );
}

/** "Send to {factor}": recipients editable for THIS send only; saved settings never change. */
export default function SendToFactorDialog({ open, onOpenChange, invoiceId, invoiceNumber, loadId, factorName, onSent }: Props) {
  const [preview, setPreview] = useState<SendPreview | null>(null);
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setPreview(null); setError(null); setMissing([]); setLoading(true);
    previewSend(invoiceId)
      .then(p => { setPreview(p); setTo(p.to); setCc(p.cc); })
      .catch((e: Error & { missing?: string[] }) => { setError(e.message); setMissing(e.missing ?? []); })
      .finally(() => setLoading(false));
  }, [open, invoiceId]);

  const send = async () => {
    setSending(true); setError(null);
    try {
      const r = await sendInvoice(invoiceId, to, cc);
      onSent?.(r);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setSending(false); }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!sending) onOpenChange(o); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send {invoiceNumber} to {factorName}</DialogTitle>
          <DialogDescription>One email for this invoice. Address changes apply to this send only.</DialogDescription>
        </DialogHeader>

        {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Building the packet…</div>}

        {error && (
          <div role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
            {missing.length > 0 ? (
              <>
                <p className="font-medium">Not ready to send. Missing before invoicing:</p>
                <ul className="list-disc pl-5">{missing.map(m => <li key={m}>{m}</li>)}</ul>
              </>
            ) : error}
          </div>
        )}

        {preview && (
          <div className="space-y-3">
            <Chips label="To" values={to} onChange={setTo} />
            <Chips label="CC" values={cc} onChange={setCc} />
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Attachments</div>
              <ul className="text-sm space-y-1">
                {preview.attachments.map(a => (
                  <li key={a.name} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5" />{a.name}</span>
                    <span className="text-muted-foreground tabular-nums">{formatBytes(a.bytes)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">Subject: {preview.subject}</p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <PacketPreviewButton loadId={loadId} />
          <Button onClick={send} disabled={!preview || sending || to.length === 0} className="gap-1.5">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
