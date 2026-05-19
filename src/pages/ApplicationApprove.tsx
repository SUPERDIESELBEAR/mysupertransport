import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Download } from 'lucide-react';
import { toast } from 'sonner';
import { formatValue, getFieldDef } from '@/lib/applicationCorrections';
import { diffEmployers } from '@/lib/applicationDiff';
import { downloadCorrectionSummaryPdf } from '@/lib/correctionSummaryPdf';
import type { EmployerRecord } from '@/components/application/types';

interface CorrectionData {
  request_id: string;
  application_id: string;
  applicant_first_name: string | null;
  applicant_last_name: string | null;
  requested_by_staff_name: string | null;
  reason_for_changes: string;
  courtesy_message: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';
  sent_at: string;
  expires_at: string;
  fields: { id: string; field_path: string; field_label: string; old_value: unknown; new_value: unknown; }[];
}

interface SectionSummary {
  section: string;
  count: number;
  detail: string;
  anchor: string;
}

function sectionAnchor(section: string): string {
  return 'sec-' + section.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function buildSectionSummaries(fields: CorrectionData['fields']): SectionSummary[] {
  const map = new Map<string, { count: number; parts: string[] }>();
  for (const f of fields) {
    const def = getFieldDef(f.field_path);
    const section = def?.section || 'Other';
    const entry = map.get(section) || { count: 0, parts: [] };
    if (f.field_path === 'employers') {
      const oldList = Array.isArray(f.old_value) ? (f.old_value as EmployerRecord[]) : [];
      const newList = Array.isArray(f.new_value) ? (f.new_value as EmployerRecord[]) : [];
      const rows = diffEmployers(oldList, newList);
      const added = rows.filter((r) => r.kind === 'added').length;
      const removed = rows.filter((r) => r.kind === 'removed').length;
      const edited = rows.filter((r) => r.kind === 'edited').length;
      const empCount = added + removed + edited;
      entry.count += empCount;
      const bits: string[] = [];
      if (added) bits.push(`${added} added`);
      if (edited) bits.push(`${edited} edited`);
      if (removed) bits.push(`${removed} removed`);
      if (bits.length) entry.parts.push(`Employment: ${bits.join(', ')}`);
    } else {
      entry.count += 1;
      entry.parts.push(f.field_label);
    }
    map.set(section, entry);
  }
  return Array.from(map.entries()).map(([section, v]) => ({
    section,
    count: v.count,
    detail: v.parts.join(' · '),
    anchor: sectionAnchor(section),
  }));
}

function ChangeSummaryPanel({ fields }: { fields: CorrectionData['fields'] }) {
  const summaries = buildSectionSummaries(fields);
  const total = summaries.reduce((s, x) => s + x.count, 0);
  if (!summaries.length) return null;
  return (
    <div className="border border-gold/60 bg-gold/5 rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-3 gap-3">
        <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">Summary of changes</h2>
        <span className="text-xs font-semibold text-foreground">
          {total} {total === 1 ? 'field' : 'fields'} across {summaries.length} {summaries.length === 1 ? 'section' : 'sections'}
        </span>
      </div>
      <ul className="divide-y divide-gold/30">
        {summaries.map((s) => (
          <li key={s.section} className="py-2 flex items-start justify-between gap-3">
            <a href={`#${s.anchor}`} className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground hover:underline">{s.section}</div>
              <div className="text-xs text-muted-foreground truncate">{s.detail}</div>
            </a>
            <span className="shrink-0 inline-flex items-center justify-center min-w-[2rem] h-6 px-2 rounded-full bg-gold text-foreground text-xs font-bold">
              {s.count}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground mt-3">
        Review each highlighted change below, then sign to approve all at once.
      </p>
    </div>
  );
}

function fmtEmployerField(k: keyof EmployerRecord, v: string | undefined): string {
  if (v === undefined || v === null || v === '') return '(empty)';
  if (k === 'cmv_position') return v === 'yes' ? 'CMV: Yes' : v === 'no' ? 'CMV: No' : v;
  return String(v);
}

function EmployerCard({ emp, label, tone }: { emp: EmployerRecord; label: string; tone: 'added' | 'removed' }) {
  const isAdded = tone === 'added';
  return (
    <div className={`border rounded-lg p-3 ${isAdded ? 'border-gold bg-gold/10' : 'border-rose-200 bg-rose-50'}`}>
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="text-sm font-semibold text-foreground">
          {emp.name || '(unnamed employer)'} · {emp.city}{emp.state ? `, ${emp.state}` : ''}
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${isAdded ? 'bg-gold text-foreground' : 'bg-rose-600 text-white'}`}>
          {label}
        </span>
      </div>
      <div className={`text-xs grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 ${!isAdded ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
        <div><strong>Position:</strong> {emp.position || '(empty)'}</div>
        <div><strong>CMV:</strong> {emp.cmv_position || '(empty)'}</div>
        <div><strong>Dates:</strong> {emp.start_date || '?'} – {emp.end_date || '?'}</div>
        <div className="sm:col-span-2"><strong>Reason:</strong> {emp.reason_leaving || '(empty)'}</div>
      </div>
    </div>
  );
}

function EmployersDiffCard({ oldList, newList }: { oldList: EmployerRecord[]; newList: EmployerRecord[] }) {
  const rows = diffEmployers(oldList, newList);
  return (
    <div className="border border-gold/50 bg-gold/5 rounded-lg p-3">
      <div className="text-sm font-semibold text-foreground mb-3">Employment history</div>
      <div className="space-y-2">
        {rows.map((r, i) => {
          if (r.kind === 'added' && r.next) {
            return <EmployerCard key={`a-${i}`} emp={r.next} label="Added by staff" tone="added" />;
          }
          if (r.kind === 'removed' && r.old) {
            return <EmployerCard key={`r-${i}`} emp={r.old} label="Removed" tone="removed" />;
          }
          if (r.kind === 'edited' && r.old && r.next) {
            return (
              <div key={`e-${i}`} className="border border-gold/60 bg-white rounded-lg p-3">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="text-sm font-semibold text-foreground">
                    {r.next.name || '(unnamed employer)'}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-gold text-foreground">
                    Edited
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {r.changedFields.map((cf) => (
                    <div key={String(cf)} className="bg-gold/5 border border-gold/30 rounded px-2 py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{String(cf)}</div>
                      <div className="line-through text-muted-foreground">{fmtEmployerField(cf, r.old?.[cf] as string)}</div>
                      <div className="font-semibold text-foreground">{fmtEmployerField(cf, r.next?.[cf] as string)}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          // unchanged — collapse summary
          if (r.kind === 'unchanged' && r.next) {
            return (
              <div key={`u-${i}`} className="text-xs text-muted-foreground px-3 py-1.5 border border-dashed border-border rounded">
                Unchanged: {r.next.name} · {r.next.start_date} – {r.next.end_date}
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

export default function ApplicationApprove() {
  const { token = '' } = useParams<{ token: string }>();
  const [data, setData] = useState<CorrectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signedName, setSignedName] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<'approved' | 'rejected' | null>(null);
  const sigCanvas = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    (async () => {
      const { data: rows, error: err } = await supabase.rpc('get_application_correction_by_token', { p_token: token });
      if (err || !rows || (rows as unknown[]).length === 0) {
        setError('This correction link is invalid or has been removed.');
      } else {
        setData((rows as unknown as CorrectionData[])[0]);
      }
      setLoading(false);
    })();
  }, [token]);

  // Simple signature pad
  useEffect(() => {
    const c = sigCanvas.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#0D0D0D';
    const pos = (e: PointerEvent) => { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) }; };
    const down = (e: PointerEvent) => { drawing.current = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    const move = (e: PointerEvent) => { if (!drawing.current) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
    const up = () => { drawing.current = false; };
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [data]);

  const clearSig = () => { const c = sigCanvas.current; if (!c) return; const ctx = c.getContext('2d'); ctx?.clearRect(0,0,c.width,c.height); };

  const handleDownloadPdf = () => {
    if (!data) return;
    try {
      downloadCorrectionSummaryPdf({
        applicantName: [data.applicant_first_name, data.applicant_last_name].filter(Boolean).join(' '),
        staffName: data.requested_by_staff_name,
        reason: data.reason_for_changes,
        courtesyMessage: data.courtesy_message,
        sentAt: data.sent_at,
        fields: data.fields,
      });
    } catch (err) {
      toast.error((err as { message?: string })?.message || 'Could not generate PDF');
    }
  };

  const submit = async (action: 'approve' | 'reject') => {
    if (action === 'approve' && signedName.trim().length < 2) {
      toast.error('Please type your full name to sign.');
      return;
    }
    setSubmitting(true);
    try {
      let signatureUrl: string | null = null;
      if (action === 'approve' && sigCanvas.current) {
        signatureUrl = sigCanvas.current.toDataURL('image/png');
      }
      const { error: err } = await supabase.functions.invoke('respond-application-correction', {
        body: {
          token,
          action,
          signed_name: signedName.trim(),
          signature_url: signatureUrl,
          rejection_reason: rejectReason.trim(),
        },
      });
      if (err) throw err;
      setDone(action === 'approve' ? 'approved' : 'rejected');
    } catch (err) {
      toast.error((err as { message?: string })?.message || 'Submission failed');
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  if (error || !data) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center"><AlertTriangle className="h-10 w-10 mx-auto text-amber-500 mb-3" /><h1 className="text-xl font-bold mb-2">Link unavailable</h1><p className="text-sm text-muted-foreground">{error || 'Not found.'}</p></div>
    </div>
  );

  const fullName = [data.applicant_first_name, data.applicant_last_name].filter(Boolean).join(' ');

  if (done) return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-secondary/30">
      <div className="max-w-md text-center bg-white rounded-lg shadow p-8">
        {done === 'approved' ? <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500 mb-3" /> : <XCircle className="h-12 w-12 mx-auto text-rose-500 mb-3" />}
        <h1 className="text-xl font-bold mb-2">{done === 'approved' ? 'Approved — thank you' : 'Changes rejected'}</h1>
        <p className="text-sm text-muted-foreground">
          {done === 'approved'
            ? 'Your e-signature has been recorded and the corrections are now applied to your application.'
            : 'We\'ve let our team know. They will reach out if any next steps are needed.'}
        </p>
      </div>
    </div>
  );

  if (data.status !== 'pending') return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center"><AlertTriangle className="h-10 w-10 mx-auto text-amber-500 mb-3" /><h1 className="text-xl font-bold mb-2">No longer active</h1><p className="text-sm text-muted-foreground">This correction request has been {data.status}.</p></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-secondary/30 p-4 md:p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow">
        <div className="border-b border-border p-5">
          <h1 className="text-xl font-bold text-foreground">Approve corrections to your application</h1>
          <p className="text-sm text-muted-foreground mt-1">Hi {fullName || 'there'} — {data.requested_by_staff_name || 'our team'} has prepared the following changes for your approval.</p>
        </div>

        <div className="p-5 space-y-5">
          <div className="bg-amber-50 border-l-4 border-amber-400 rounded p-3">
            <div className="text-xs font-bold text-amber-900 uppercase tracking-wide mb-1">Reason for changes</div>
            <p className="text-sm text-foreground whitespace-pre-wrap">{data.reason_for_changes}</p>
            {data.courtesy_message && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{data.courtesy_message}</p>}
          </div>

          <div>
            <h2 className="text-sm font-bold text-foreground mb-2">Proposed changes ({data.fields.length})</h2>
            <div className="mb-4">
              <ChangeSummaryPanel fields={data.fields} />
            </div>
            <div className="space-y-5">
              {(() => {
                const groups = new Map<string, typeof data.fields>();
                for (const f of data.fields) {
                  const section = getFieldDef(f.field_path)?.section || 'Other';
                  const arr = groups.get(section) || [];
                  arr.push(f);
                  groups.set(section, arr);
                }
                return Array.from(groups.entries()).map(([section, items]) => (
                  <section key={section} id={sectionAnchor(section)} className="scroll-mt-4 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground border-b border-border pb-1">
                      {section}
                    </h3>
                    {items.map((f) => {
                      if (f.field_path === 'employers') {
                  return (
                    <EmployersDiffCard
                      key={f.id}
                      oldList={Array.isArray(f.old_value) ? (f.old_value as EmployerRecord[]) : []}
                      newList={Array.isArray(f.new_value) ? (f.new_value as EmployerRecord[]) : []}
                    />
                  );
                }
                const def = getFieldDef(f.field_path);
                return (
                  <div key={f.id} className="border border-gold/50 bg-gold/5 rounded-lg p-3">
                    <div className="text-sm font-semibold text-foreground mb-2">{f.field_label}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Was</div>
                        <div className="bg-muted/40 border border-border rounded px-2 py-1.5 line-through text-muted-foreground break-words">
                          {formatValue(f.old_value, def?.kind)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Will become</div>
                        <div className="bg-white border border-gold rounded px-2 py-1.5 font-semibold text-foreground break-words">
                          {formatValue(f.new_value, def?.kind)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
                    })}
                  </section>
                ));
              })()}
            </div>
          </div>

          {!showReject ? (
            <>
              <div className="border border-border rounded p-4 space-y-3">
                <h3 className="text-sm font-bold">Approve & sign</h3>
                <div className="flex items-start gap-2 bg-gold/5 border border-gold/40 rounded p-2.5">
                  <Download className="h-4 w-4 text-foreground mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground font-semibold">Want a copy before you sign?</p>
                    <p className="text-[11px] text-muted-foreground">
                      Download a PDF of every proposed change and the reason your staff member provided.
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={handleDownloadPdf} className="shrink-0">
                    <Download className="h-3.5 w-3.5 mr-1.5" /> PDF
                  </Button>
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block">Type your full legal name</label>
                  <Input value={signedName} onChange={(e) => setSignedName(e.target.value)} placeholder={fullName || 'Your full name'} />
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block">Sign below</label>
                  <canvas ref={sigCanvas} width={600} height={140} className="border border-border rounded bg-white w-full touch-none" />
                  <button type="button" onClick={clearSig} className="text-xs text-muted-foreground underline mt-1">Clear</button>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button onClick={() => submit('approve')} disabled={submitting} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />} Approve & sign
                  </Button>
                  <Button variant="outline" onClick={() => setShowReject(true)} disabled={submitting}>Reject</Button>
                </div>
              </div>
            </>
          ) : (
            <div className="border border-border rounded p-4 space-y-3">
              <h3 className="text-sm font-bold">Reject these changes</h3>
              <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} placeholder="Optional: tell us why so we can follow up." maxLength={500} />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowReject(false)} disabled={submitting}>Back</Button>
                <Button onClick={() => submit('reject')} disabled={submitting} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />} Confirm reject
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}