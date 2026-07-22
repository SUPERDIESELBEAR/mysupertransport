import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DobPicker } from '@/components/ui/dob-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, CheckCircle2 } from 'lucide-react';
import jsPDF from 'jspdf';
import { getEdgeFunctionErrorMessage } from '@/lib/edgeFunctionError';
import {
  AUTH_TITLE,
  AUTH_SUBTITLE,
  AUTH_PREAMBLE,
  AUTH_SECTIONS,
  AUTH_FOOTER,
  AUTH_RETENTION_NOTE,
  addOneYear,
} from '@/lib/passengerAuthContent';

interface AuthRow {
  id: string;
  driver_name: string;
  unit_number: string;
  status: string;
  executed_pdf_url?: string | null;
}

function SignaturePad({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = 140;
    c.width = w * ratio;
    c.height = h * ratio;
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0D0D0D';
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current!.toDataURL('image/png'));
  };
  const clear = () => {
    const c = canvasRef.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    onChange(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <Label>{label}</Label>
        <Button type="button" variant="ghost" size="sm" onClick={clear}>Clear</Button>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full h-[140px] bg-white border rounded-md touch-none"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      {!value && <p className="text-xs text-muted-foreground mt-1">Sign in the box above</p>}
    </div>
  );
}

async function buildPdf(opts: {
  driverName: string; unitNumber: string;
  passengerName: string; passengerAge: string;
  passengerRelationship: string; passengerRelationshipLabel: string; passengerDob: string;
  originCityState: string; destinationCityState: string;
  effectiveDate: string; expiresAt: string;
  passengerInitials: string; parentInitials: string;
  contractorReadAt: string;
  contractorTypedName: string; passengerTypedName: string;
  contractorSig: string; passengerSig: string | null;
  passengerWaived: boolean; waiverReason: string; isMinor: boolean;
}): Promise<string> {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const M = 54;
  const CONTENT_W = PAGE_W - M * 2;
  const BOTTOM = PAGE_H - M - 20;
  let y = M;

  const ensure = (needed: number) => {
    if (y + needed > BOTTOM) {
      addFooter();
      doc.addPage();
      y = M;
    }
  };
  const addFooter = () => {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(AUTH_FOOTER, PAGE_W / 2, PAGE_H - M / 2, { align: 'center' });
    doc.setTextColor(0);
  };
  const writeParagraph = (text: string, opts?: { size?: number; bold?: boolean; italic?: boolean; indent?: number; gap?: number }) => {
    const size = opts?.size ?? 10;
    const style = opts?.bold ? 'bold' : opts?.italic ? 'italic' : 'normal';
    const indent = opts?.indent ?? 0;
    doc.setFont('helvetica', style); doc.setFontSize(size);
    const wrapped = doc.splitTextToSize(text, CONTENT_W - indent) as string[];
    const lh = size * 1.25;
    for (const ln of wrapped) {
      ensure(lh);
      doc.text(ln, M + indent, y);
      y += lh;
    }
    y += opts?.gap ?? 4;
  };

  // Header
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text('SUPERTRANSPORT', PAGE_W / 2, y, { align: 'center' }); y += 14;
  doc.setFont('helvetica', 'italic'); doc.setFontSize(9);
  doc.text('positive. thinking. transport.', PAGE_W / 2, y, { align: 'center' }); y += 18;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(AUTH_TITLE, PAGE_W / 2, y, { align: 'center' }); y += 14;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(AUTH_SUBTITLE, PAGE_W / 2, y, { align: 'center' }); y += 16;

  writeParagraph(AUTH_PREAMBLE, { size: 9, italic: true, gap: 8 });

  // Section 1 with filled fields
  writeParagraph(AUTH_SECTIONS[0].heading, { size: 11, bold: true, gap: 4 });
  for (const p of AUTH_SECTIONS[0].paragraphs || []) writeParagraph(p, { gap: 4 });
  const fields: [string, string][] = [
    ['Passenger Name', opts.passengerName],
    ['Passenger Age', opts.passengerAge || '—'],
    ['Contractor / Driver Name', opts.contractorTypedName || opts.driverName],
    ['Unit No.', opts.unitNumber || '—'],
    ['Transportation Begins At', opts.originCityState || '—'],
    ['Transportation Ends At', opts.destinationCityState || '—'],
    ['Authorization Effective From', opts.effectiveDate],
    ['Expires', opts.expiresAt],
  ];
  for (const [k, v] of fields) {
    ensure(14);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(`${k}:`, M, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(v), M + 170, y);
    y += 14;
  }
  y += 6;

  // Sections 2-7
  for (let i = 1; i < AUTH_SECTIONS.length; i++) {
    const s = AUTH_SECTIONS[i];
    writeParagraph(s.heading, { size: 11, bold: true, gap: 4 });
    for (const p of s.paragraphs || []) writeParagraph(p, { gap: 4 });
    for (const b of s.bullets || []) writeParagraph(`•  ${b}`, { indent: 12, gap: 3 });
    // Stamp initials into section 4 acknowledgment
    if (i === 3) {
      ensure(16);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      doc.text(`Passenger Initials: ${opts.passengerInitials || '—'}`, M, y);
      if (opts.parentInitials) {
        doc.text(`Parent/Guardian Initials: ${opts.parentInitials}`, M + 260, y);
      }
      y += 16;
    }
  }

  // Contractor read acknowledgment
  y += 4;
  writeParagraph(
    `Contractor confirmed reading of this Passenger Authorization on ${opts.contractorReadAt}.`,
    { size: 9, italic: true, gap: 8 },
  );

  // Signatures
  ensure(40);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text('SIGNATURES', M, y); y += 16;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);

  const addSig = (label: string, typedName: string, sigDataUrl: string | null) => {
    ensure(90);
    doc.setFont('helvetica', 'bold');
    doc.text(label, M, y); y += 4;
    doc.setFont('helvetica', 'normal');
    if (sigDataUrl) {
      try { doc.addImage(sigDataUrl, 'PNG', M, y, 200, 50); } catch { /* noop */ }
    }
    y += 56;
    doc.text(`Printed Name: ${typedName || '—'}    Date: ${new Date().toLocaleDateString()}`, M, y);
    y += 6;
    doc.line(M, y, PAGE_W - M, y);
    y += 14;
  };

  const contractorLabel = opts.isMinor
    ? 'Contractor / Driver Signature (also acting as parent/guardian for minor passenger)'
    : 'Contractor / Driver Signature';
  addSig(contractorLabel, opts.contractorTypedName, opts.contractorSig);

  if (opts.isMinor) {
    ensure(30);
    doc.setFont('helvetica', 'bold'); doc.text('Passenger Signature', M, y); y += 14;
    doc.setFont('helvetica', 'italic');
    doc.text('MINOR PASSENGER — parent/guardian signature captured above (contractor).', M, y);
    y += 14;
    doc.line(M, y, PAGE_W - M, y); y += 14;
    doc.setFont('helvetica', 'normal');
  } else if (opts.passengerWaived) {
    ensure(50);
    doc.setFont('helvetica', 'bold'); doc.text('Passenger Signature', M, y); y += 14;
    doc.text('PASSENGER SIGNATURE WAIVED', M, y); y += 14;
    doc.setFont('helvetica', 'normal');
    const wrapped = doc.splitTextToSize(`Reason: ${opts.waiverReason}`, CONTENT_W) as string[];
    for (const ln of wrapped) { ensure(14); doc.text(ln, M, y); y += 14; }
    doc.text(`Contractor attested at signing on ${new Date().toLocaleDateString()}.`, M, y);
    y += 6;
    doc.line(M, y, PAGE_W - M, y); y += 14;
  } else {
    addSig('Passenger Signature', opts.passengerTypedName, opts.passengerSig);
  }

  y += 6;
  writeParagraph(AUTH_RETENTION_NOTE, { size: 8, italic: true, gap: 0 });

  addFooter();
  return doc.output('datauristring');
}

const RELATIONSHIP_OPTIONS: { value: string; label: string }[] = [
  { value: 'spouse', label: 'Spouse' },
  { value: 'minor_child', label: 'Minor Child (under 18)' },
  { value: 'adult_family', label: 'Adult Family Member' },
  { value: 'other', label: 'Other Authorized Rider' },
];

export default function PassengerAuthSign() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState<AuthRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const [passengerName, setPassengerName] = useState('');
  const [passengerAge, setPassengerAge] = useState('');
  const [passengerRelationship, setPassengerRelationship] = useState('');
  const [passengerDob, setPassengerDob] = useState('');
  const [originCityState, setOriginCityState] = useState('');
  const [destinationCityState, setDestinationCityState] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const expiresAt = effectiveDate ? addOneYear(effectiveDate) : '';
  const [contractorTypedName, setContractorTypedName] = useState('');
  const [passengerTypedName, setPassengerTypedName] = useState('');
  const [contractorSig, setContractorSig] = useState<string | null>(null);
  const [passengerSig, setPassengerSig] = useState<string | null>(null);
  const [passengerNotPresent, setPassengerNotPresent] = useState(false);
  const [waiverReason, setWaiverReason] = useState('');
  const [passengerInitials, setPassengerInitials] = useState('');
  const [parentInitials, setParentInitials] = useState('');
  const [contractorReadAgreed, setContractorReadAgreed] = useState(false);
  const [contractorReadAt, setContractorReadAt] = useState<string | null>(null);

  const isMinor = passengerRelationship === 'minor_child';
  const passengerWaived = isMinor || passengerNotPresent;
  const relationshipLabel =
    RELATIONSHIP_OPTIONS.find(o => o.value === passengerRelationship)?.label || '';

  useEffect(() => {
    (async () => {
      if (!token) { setError('Missing token'); setLoading(false); return; }
      const { data, error } = await supabase.functions.invoke('get-passenger-auth', {
        body: { token },
      });
      if (error || !data?.authorization) {
        setError((data as any)?.error || error?.message || 'Unable to load this authorization.');
      } else {
        const a = data.authorization as AuthRow;
        setRow(a);
        setContractorTypedName(a.driver_name || '');
        if (a.status === 'signed' || a.status === 'filed') setDone(true);
      }
      setLoading(false);
    })();
  }, [token]);

  const submit = async () => {
    if (!row) return;
    if (!contractorReadAgreed || !contractorReadAt) {
      toast.error('Please confirm you have read the Passenger Authorization.');
      return;
    }
    if (!passengerName || !passengerAge || !passengerRelationship || !effectiveDate ||
        !originCityState || !destinationCityState ||
        !passengerInitials ||
        !contractorTypedName || !contractorSig) {
      toast.error('Please complete all required fields and the contractor signature.');
      return;
    }
    if (isMinor && !parentInitials) {
      toast.error('Please enter Parent/Guardian initials for the minor passenger acknowledgment.');
      return;
    }
    if (!passengerWaived) {
      if (!passengerTypedName || !passengerSig) {
        toast.error('Please complete the passenger typed name and signature.');
        return;
      }
    } else if (passengerNotPresent && !waiverReason.trim()) {
      toast.error('Please provide a reason the passenger is not present at signing.');
      return;
    }
    const effectiveReason = isMinor
      ? 'Minor child — parent/guardian signature on file (contractor).'
      : waiverReason.trim();
    setSubmitting(true);
    try {
      const pdf = await buildPdf({
        driverName: row.driver_name, unitNumber: row.unit_number,
        passengerName, passengerAge,
        passengerRelationship, passengerRelationshipLabel: relationshipLabel, passengerDob,
        originCityState, destinationCityState,
        effectiveDate, expiresAt,
        passengerInitials, parentInitials,
        contractorReadAt: new Date(contractorReadAt).toLocaleString(),
        contractorTypedName, passengerTypedName,
        contractorSig: contractorSig!, passengerSig: passengerWaived ? null : passengerSig,
        passengerWaived, waiverReason: effectiveReason, isMinor,
      });
      const { data, error } = await supabase.functions.invoke('finalize-passenger-auth', {
        body: {
          token,
          passengerName, passengerRelationship: relationshipLabel,
          passengerDob: passengerDob || null,
          passengerAge: passengerAge ? Number(passengerAge) : null,
          originCityState, destinationCityState,
          expiresAt,
          passengerInitials,
          parentInitials: parentInitials || null,
          contractorReadAcknowledgedAt: contractorReadAt,
          effectiveDate,
          contractorTypedName,
          passengerTypedName: passengerWaived ? null : passengerTypedName,
          contractorSignature: contractorSig,
          passengerSignature: passengerWaived ? null : passengerSig,
          parentSignature: null,
          passengerSignatureWaived: passengerWaived,
          passengerWaiverReason: passengerWaived ? effectiveReason : null,
          executedPdf: pdf,
        },
      });
      if (error) throw new Error(await getEdgeFunctionErrorMessage(error, 'Submission failed'));
      if (!data?.ok) throw new Error((data as any)?.error || 'Submission failed');
      setDone(true);
      toast.success('Passenger authorization signed and filed.');
    } catch (e: any) {
      toast.error(e?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-surface-dark">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-surface-dark p-6">
        <Card className="max-w-md w-full"><CardContent className="p-6 text-center">
          <p className="text-destructive font-medium">{error}</p>
        </CardContent></Card>
      </div>
    );
  }
  if (done) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-surface-dark p-6">
        <Card className="max-w-md w-full"><CardContent className="p-8 text-center space-y-3">
          <CheckCircle2 className="h-10 w-10 text-gold mx-auto" />
          <h2 className="text-lg font-semibold">Passenger Authorization Received</h2>
          <p className="text-sm text-muted-foreground">
            Thanks{row?.driver_name ? `, ${row.driver_name}` : ''}. A copy has been filed to
            your Driver Hub. You can close this page.
          </p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-surface-dark py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Passenger Authorization</CardTitle>
            <p className="text-sm text-muted-foreground">
              For <strong>{row?.driver_name}</strong> — Unit <strong>{row?.unit_number}</strong>
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Full authorization body — must be read before signing */}
            <div>
              <Label className="mb-2 block">Read the Passenger Authorization *</Label>
              <div className="max-h-72 overflow-y-auto rounded-md border bg-white text-[13px] leading-relaxed text-foreground p-4 space-y-3">
                <div className="text-center">
                  <div className="font-bold">SUPERTRANSPORT</div>
                  <div className="italic text-xs text-muted-foreground">positive. thinking. transport.</div>
                  <div className="mt-2 font-semibold">{AUTH_TITLE}</div>
                  <div className="text-xs text-muted-foreground">{AUTH_SUBTITLE}</div>
                </div>
                <p className="italic text-xs">{AUTH_PREAMBLE}</p>
                {AUTH_SECTIONS.map((s) => (
                  <div key={s.heading} className="space-y-1">
                    <div className="font-semibold">{s.heading}</div>
                    {s.paragraphs?.map((p, i) => (<p key={i}>{p}</p>))}
                    {s.bullets && (
                      <ul className="list-disc pl-5 space-y-1">
                        {s.bullets.map((b, i) => (<li key={i}>{b}</li>))}
                      </ul>
                    )}
                  </div>
                ))}
                <p className="text-[11px] italic text-muted-foreground">{AUTH_RETENTION_NOTE}</p>
              </div>
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={contractorReadAgreed}
                  onChange={(e) => {
                    setContractorReadAgreed(e.target.checked);
                    setContractorReadAt(e.target.checked ? new Date().toISOString() : null);
                  }}
                />
                <span>
                  <strong>I have read and agree to the Passenger Authorization above.</strong>
                  <br />
                  <span className="text-muted-foreground text-xs">
                    Required. Your acknowledgment timestamp will be stamped on the executed PDF.
                  </span>
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Passenger full legal name *</Label>
                <Input value={passengerName} onChange={e => setPassengerName(e.target.value)} />
              </div>
              <div>
                <Label>Passenger age *</Label>
                <Input
                  type="number"
                  min={0}
                  max={120}
                  value={passengerAge}
                  onChange={e => setPassengerAge(e.target.value)}
                />
              </div>
              <div>
                <Label>Relationship to driver *</Label>
                <Select value={passengerRelationship} onValueChange={(v) => { setPassengerRelationship(v); if (v === 'minor_child') { setPassengerNotPresent(false); setWaiverReason(''); } }}>
                  <SelectTrigger><SelectValue placeholder="Select relationship" /></SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Passenger DOB</Label>
                <DobPicker value={passengerDob} onChange={setPassengerDob} />
              </div>
              <div>
                <Label>Transportation begins at (City, State) *</Label>
                <Input value={originCityState} onChange={e => setOriginCityState(e.target.value)} placeholder="e.g., Kansas City, MO" />
              </div>
              <div>
                <Label>Transportation ends at (City, State) *</Label>
                <Input value={destinationCityState} onChange={e => setDestinationCityState(e.target.value)} placeholder="e.g., Dallas, TX" />
              </div>
              <div>
                <Label>Effective date *</Label>
                <Input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} />
              </div>
              <div>
                <Label>Expires</Label>
                <Input type="date" value={expiresAt} readOnly disabled />
                <p className="text-xs text-muted-foreground mt-1">
                  Automatically set to one year from the effective date.
                </p>
              </div>
            </div>

            {/* Section 4 initials */}
            <div className="rounded-md border p-3 bg-muted/30 space-y-3">
              <p className="text-sm">
                <strong>Section 4 acknowledgment.</strong> Initials confirm the voluntary
                assumption-of-risk statement and the seat-belt certification.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Passenger initials *</Label>
                  <Input maxLength={5} value={passengerInitials} onChange={e => setPassengerInitials(e.target.value.toUpperCase())} placeholder="e.g., JMS" />
                </div>
                {isMinor && (
                  <div>
                    <Label>Parent / Guardian initials *</Label>
                    <Input maxLength={5} value={parentInitials} onChange={e => setParentInitials(e.target.value.toUpperCase())} placeholder="e.g., MMS" />
                  </div>
                )}
              </div>
            </div>

            {isMinor && (
              <div className="rounded-md border border-gold/40 bg-gold/10 p-3 text-sm">
                <strong>Minor passenger:</strong> a separate passenger signature is not required.
                Your signature below acts as the parent/guardian signature for this minor.
              </div>
            )}

            <div className="space-y-4 pt-2 border-t">
              <div>
                <Label>Contractor / Driver typed name *</Label>
                <Input value={contractorTypedName} onChange={e => setContractorTypedName(e.target.value)} />
                <div className="mt-2">
                  <SignaturePad label="Contractor / Driver signature *" value={contractorSig} onChange={setContractorSig} />
                </div>
              </div>
              {!isMinor && (
                <div className="space-y-3">
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={passengerNotPresent}
                      onChange={e => setPassengerNotPresent(e.target.checked)}
                    />
                    <span>
                      <strong>Passenger is not with me at the time of signing.</strong>
                      <br />
                      <span className="text-muted-foreground">
                        Check this if the named passenger is unavailable to sign right now.
                        A signature waiver will be stamped on the executed authorization.
                      </span>
                    </span>
                  </label>

                  {passengerNotPresent ? (
                    <div>
                      <Label>Reason passenger is not present *</Label>
                      <Textarea
                        rows={3}
                        placeholder="e.g., Spouse joining on Monday at the terminal; rider boarding at next stop."
                        value={waiverReason}
                        onChange={e => setWaiverReason(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        This reason will appear on the signed PDF in the passenger signature block.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <Label>Passenger typed name *</Label>
                      <Input value={passengerTypedName} onChange={e => setPassengerTypedName(e.target.value)} />
                      <div className="mt-2">
                        <SignaturePad label="Passenger signature *" value={passengerSig} onChange={setPassengerSig} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <Button className="w-full" onClick={submit} disabled={submitting || !contractorReadAgreed}>
              {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting…</> : 'Sign & Submit'}
            </Button>
            {!contractorReadAgreed && (
              <p className="text-xs text-center text-muted-foreground -mt-2">
                Confirm you have read the authorization above to enable submission.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}