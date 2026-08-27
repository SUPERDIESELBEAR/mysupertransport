import { useEffect, useState } from 'react';
import RateConInboxPage from '@/pages/dispatch/RateConInboxPage';
import RateConInboxBadge from '@/components/dispatch/RateConInboxBadge';

const base = {
  from_address: 'tenders@bluegrace.test',
  received_at: '2026-08-27T14:02:00.000Z',
  attachment_filename: 'ratecon.pdf',
  attachment_storage_path: null,
  attachment_mime_type: 'application/pdf',
  attachment_page_count: 1,
  parse_error: null,
  parse_status: 'ok',
  parsed: {},
  verbatim_checks: [],
  text_layer: '',
  text_layer_available: true,
  sender_allowed: true,
  broker_load_number: 'BG-55012',
  matched_load_id: null,
  dismissed_by: null,
  dismiss_reason: null,
  updated_at: null,
  dismissed_at: null,
};

const ROWS = [
  { ...base, id: 'a', subject: 'Rate confirmation — BG-55012', status: 'parsed' },
  {
    ...base, id: 'b', subject: 'Rate confirmation — BG-55012 (resend)',
    status: 'dismissed',
    dismiss_reason: 'Duplicate of queue item BG-55012 (identical attachment).',
    received_at: '2026-08-27T14:20:00.000Z',
  },
  {
    ...base, id: 'c', subject: 'Tender needs manual retrieval',
    status: 'needs_manual', parse_status: 'failed',
    parse_error: 'no attachment on the email', parsed: null,
    broker_load_number: null, received_at: '2026-08-27T13:10:00.000Z',
  },
  {
    ...base, id: 'd', subject: 'Newsletter — market update',
    status: 'dismissed', dismissed_by: 'staff-uuid',
    dismiss_reason: 'Not a rate con.', received_at: '2026-08-26T09:00:00.000Z',
  },
];

export default function InboxShot() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const real = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('rate_con_ingest_queue')) {
        const head = (init?.method ?? 'GET').toUpperCase() === 'HEAD';
        const counted = ROWS.filter(r => ['received', 'pending_parse', 'parsed', 'needs_manual'].includes(r.status));
        return new Response(head ? null : JSON.stringify(ROWS), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'content-range': `0-${ROWS.length - 1}/${counted.length}`,
          },
        });
      }
      return real(input as RequestInfo, init);
    };
    setReady(true);
    return () => { window.fetch = real; };
  }, []);
  if (!ready) return null;
  return (
    <div className="p-8">
      <div className="mb-4 flex items-center gap-2 text-sm text-foreground">
        <span>Rate Con Inbox</span>
        <RateConInboxBadge />
      </div>
      <RateConInboxPage />
    </div>
  );
}
