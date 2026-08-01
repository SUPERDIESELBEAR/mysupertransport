/**
 * Officer email — pre-send sheet (Pass B §8).
 *
 * Deliberately NOT part of /roadside's module graph. The merge needs pdf-lib,
 * and roadsideImportGraph.test.ts forbids that library anywhere the officer
 * display screen can reach, statically or dynamically: the one screen that
 * must boot in seconds at a truck window does not get a megabyte of PDF
 * parser. /roadside links here instead.
 *
 * The merge itself is still fully offline — IndexedDB in, PDF out — and the
 * send goes through the sync queue, so a dead zone delays delivery rather than
 * failing it. Web Share / download is offered as the immediate alternative.
 */
import { useEffect, useMemo, useState } from 'react';
import { readLocalMeta, type LocalMeta } from '@/lib/eld/offline/db';
import { buildOfficerPacket, type OfficerPacket } from '@/lib/eld/offline/buildOfficerPacket';
import { queueOfficerPacket, shareOrDownloadPacket } from '@/lib/eld/offline/officerSend';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const GOLD = '#C9A84C';
const INK = '#0D0D0D';

interface LiveLink {
  token: string;
  storage_path: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
}

function bytesLabel(n: number): string {
  return n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}

export default function OfficerEmailSheet({ onClose }: { onClose?: () => void }) {
  const [meta, setMeta] = useState<LocalMeta | null>(null);
  const [packet, setPacket] = useState<OfficerPacket | null>(null);
  const [building, setBuilding] = useState(true);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [officerName, setOfficerName] = useState('');
  const [sending, setSending] = useState(false);
  const [queued, setQueued] = useState(false);
  const [links, setLinks] = useState<LiveLink[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const m = (await readLocalMeta()) ?? null;
        setMeta(m);
        setPacket(await buildOfficerPacket({ meta: m }));
      } catch (e) {
        setBuildError(e instanceof Error ? e.message : 'The packet could not be assembled on this device.');
      } finally {
        setBuilding(false);
      }
    })();
  }, []);

  async function loadLinks(operatorId: string) {
    const { data } = await supabase
      .from('officer_packet_links')
      .select('token, storage_path, created_at, share_tokens!inner(expires_at, revoked_at)')
      .eq('operator_id', operatorId)
      .order('created_at', { ascending: false })
      .limit(10);
    setLinks((data ?? []).map((r) => {
      const t = (r as unknown as { share_tokens: { expires_at: string | null; revoked_at: string | null } }).share_tokens;
      return {
        token: r.token as string,
        storage_path: r.storage_path as string,
        created_at: r.created_at as string,
        expires_at: t?.expires_at ?? null,
        revoked_at: t?.revoked_at ?? null,
      };
    }));
  }

  useEffect(() => {
    if (meta?.operator_id) void loadLinks(meta.operator_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta?.operator_id, queued]);

  const placeholders = useMemo(
    () => (packet?.dispositions ?? []).filter((d) => d.status === 'placeholder'),
    [packet],
  );

  async function send() {
    if (!packet || !meta?.operator_id) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error('Enter the officer\'s email address.');
      return;
    }
    setSending(true);
    try {
      await queueOfficerPacket({
        operatorId: meta.operator_id,
        officerEmail: email,
        officerName: officerName.trim() || null,
        packet,
      });
      setQueued(true);
      toast.success(
        navigator.onLine
          ? 'Sending the packet to the officer.'
          : 'Queued. The packet sends as soon as this device has signal.',
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The packet could not be queued.');
    } finally {
      setSending(false);
    }
  }

  async function revoke(token: string) {
    const { error } = await supabase.rpc('revoke_share_token', { p_token: token });
    if (error) {
      toast.error('The link could not be revoked. Try again when you have signal.');
      return;
    }
    toast.success('Link revoked. It will no longer open.');
    if (meta?.operator_id) void loadLinks(meta.operator_id);
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col bg-background">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: GOLD }}>
            Record of duty status
          </p>
          <h1 className="text-lg font-bold" style={{ color: INK }}>Email the packet to an officer</h1>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded border px-3 py-1.5 text-sm font-bold">
            Close
          </button>
        )}
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {building && <p className="text-sm text-muted-foreground">Assembling the eight-day packet on this device…</p>}

        {buildError && (
          <div className="rounded border p-3 text-sm" style={{ borderColor: '#C0392B', color: '#C0392B' }}>
            {buildError}
          </div>
        )}

        {packet && (
          <>
            <section className="rounded border p-3">
              <p className="text-sm font-bold" style={{ color: INK }}>
                {packet.window_start} → {packet.window_end} · {bytesLabel(packet.size)}
              </p>
              <ul className="mt-2 space-y-1 text-xs">
                {packet.dispositions.map((d) => (
                  <li key={d.log_date} className="flex flex-wrap justify-between gap-2">
                    <span style={{ color: INK }}>{d.log_date}</span>
                    <span style={{ color: d.status === 'embedded' ? '#2E7D4F' : '#8a6d1f' }}>
                      {d.status === 'embedded' ? 'Included' : `Placeholder — ${d.reason}`}
                    </span>
                  </li>
                ))}
              </ul>
              {placeholders.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {placeholders.length} of {packet.dispositions.length} days will be sent as a placeholder page
                  stating why the record is not included. No day is left out of the sequence.
                </p>
              )}
              {packet.downsampled_pass !== null && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Photographed pages were reduced in resolution so the file could be emailed. No day was omitted
                  and no page was replaced.
                </p>
              )}
              {packet.over_ceiling && (
                <p className="mt-2 text-xs" style={{ color: '#8a6d1f' }}>
                  Still too large to attach. The officer will receive a download link that expires in 4 hours,
                  logs every open, and can be revoked below.
                </p>
              )}
            </section>

            <section className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Officer email
                <input
                  type="email"
                  inputMode="email"
                  autoCapitalize="off"
                  autoCorrect="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded border px-3 py-2 text-base font-normal normal-case tracking-normal"
                  placeholder="officer@agency.gov"
                />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Officer name or badge (optional)
                <input
                  type="text"
                  value={officerName}
                  onChange={(e) => setOfficerName(e.target.value)}
                  className="mt-1 w-full rounded border px-3 py-2 text-base font-normal normal-case tracking-normal"
                />
              </label>
              <button
                type="button"
                onClick={send}
                disabled={sending}
                className="w-full rounded px-4 py-3 text-sm font-bold disabled:opacity-60"
                style={{ background: GOLD, color: INK }}
              >
                {sending ? 'Queuing…' : 'Send to officer'}
              </button>
              <button
                type="button"
                onClick={() => void shareOrDownloadPacket(packet)}
                className="w-full rounded border px-4 py-3 text-sm font-bold"
              >
                Share or download now (works offline)
              </button>
              {queued && (
                <p className="text-xs text-muted-foreground">
                  Queued. A copy also goes to the office; if that copy fails, the officer's copy is unaffected.
                </p>
              )}
            </section>
          </>
        )}

        {links.length > 0 && (
          <section className="rounded border p-3">
            <h2 className="text-sm font-bold" style={{ color: INK }}>Download links you have handed out</h2>
            <ul className="mt-2 space-y-2 text-xs">
              {links.map((l) => {
                const dead = !!l.revoked_at || (!!l.expires_at && new Date(l.expires_at) <= new Date());
                return (
                  <li key={l.token} className="flex items-center justify-between gap-3">
                    <span style={{ color: INK }}>
                      {new Date(l.created_at).toLocaleString('en-US')}
                      <br />
                      <span className="text-muted-foreground">
                        {l.revoked_at ? 'Revoked' : l.expires_at
                          ? `Expires ${new Date(l.expires_at).toLocaleTimeString('en-US')}`
                          : 'Active'}
                      </span>
                    </span>
                    {!dead && (
                      <button
                        type="button"
                        onClick={() => void revoke(l.token)}
                        className="rounded border px-3 py-1.5 font-bold"
                        style={{ borderColor: '#C0392B', color: '#C0392B' }}
                      >
                        Revoke now
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}