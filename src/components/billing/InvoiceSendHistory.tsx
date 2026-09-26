import { formatBytes, sentDate, type InvoiceSendRow } from '@/lib/invoiceSend';
import { Badge } from '@/components/ui/badge';

/** The invoice's send history: date, who, to and CC, attachments, status. */
export default function InvoiceSendHistory({ rows }: { rows: InvoiceSendRow[] }) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">Not sent yet.</p>;
  return (
    <ul className="space-y-2 text-sm" aria-label="Send history">
      {rows.map(r => (
        <li key={r.id} className="rounded-md border p-2 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{sentDate(r.sent_at)}</span>
            <span className="text-muted-foreground">by {r.sender_name ?? 'Unknown'}</span>
            <Badge variant={r.status === 'sent' ? 'secondary' : 'destructive'}>{r.status === 'sent' ? 'Sent' : 'Failed'}</Badge>
            {r.is_test && <Badge variant="outline">Test</Badge>}
          </div>
          <div className="text-muted-foreground">To: {r.to_emails.join(', ')}</div>
          {r.cc_emails.length > 0 && <div className="text-muted-foreground">CC: {r.cc_emails.join(', ')}</div>}
          <div className="text-muted-foreground">
            {r.attachments.map(a => `${a.name} (${formatBytes(a.bytes)})`).join(' · ')}
          </div>
          {r.error && <div className="text-destructive text-xs">{r.error}</div>}
        </li>
      ))}
    </ul>
  );
}
