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
  passengerName: string; passengerRelationship: string; passengerRelationshipLabel: string; passengerDob: string;
  effectiveDate: string;
  contractorTypedName: string; passengerTypedName: string;
  contractorSig: string; passengerSig: string | null;
  passengerWaived: boolean; waiverReason: string; isMinor: boolean;
}): Promise<string> {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const M = 54;
  let y = M;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text('SUPERTRANSPORT — Passenger Authorization', M, y); y += 22;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  doc.text(`Contractor / Driver: ${opts.driverName}`, M, y); y += 16;
  doc.text(`Unit Number: ${opts.unitNumber}`, M, y); y += 24;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text('Passenger Authorization', M, y); y += 18;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  const lines = [
    `Passenger Name: ${opts.passengerName}`,
    `Relationship to Driver: ${opts.passengerRelationshipLabel}`,
    `Passenger DOB: ${opts.passengerDob || '—'}`,
    `Effective Date: ${opts.effectiveDate}`,
  ];
  for (const l of lines) { doc.text(l, M, y); y += 16; }
  y += 12;
  doc.setFont('helvetica', 'bold'); doc.text('Signatures', M, y); y += 6;
  doc.setFont('helvetica', 'normal');

  const addSig = (label: string, typedName: string, sigDataUrl: string | null) => {
    y += 14;
    doc.text(label, M, y); y += 4;
    if (sigDataUrl) {
      try { doc.addImage(sigDataUrl, 'PNG', M, y, 200, 50); } catch { /* noop */ }
    }
    y += 56;
    doc.text(`Name: ${typedName || '—'}    Date: ${new Date().toLocaleDateString()}`, M, y);
    y += 6;
    doc.line(M, y, 400, y);
  };
  const contractorLabel = opts.isMinor
    ? 'Contractor / Driver signature (also acting as parent/guardian for minor passenger)'
    : 'Contractor / Driver signature';
  addSig(contractorLabel, opts.contractorTypedName, opts.contractorSig);

  if (opts.isMinor) {
    y += 14;
    doc.setFont('helvetica', 'bold');
    doc.text('Passenger signature', M, y); y += 14;
    doc.setFont('helvetica', 'italic');
    doc.text('MINOR PASSENGER — parent/guardian signature captured above (contractor).', M, y);
    doc.setFont('helvetica', 'normal'); y += 10;
    doc.line(M, y, 400, y);
  } else if (opts.passengerWaived) {
    y += 14;
    doc.setFont('helvetica', 'bold');
    doc.text('Passenger signature', M, y); y += 14;
    doc.setFont('helvetica', 'bold');
    doc.text('PASSENGER SIGNATURE WAIVED', M, y); y += 14;
    doc.setFont('helvetica', 'normal');
    const wrapped = doc.splitTextToSize(`Reason: ${opts.waiverReason}`, 480) as string[];
    for (const ln of wrapped) { doc.text(ln, M, y); y += 14; }
    doc.text(`Contractor attested at signing on ${new Date().toLocaleDateString()}`, M, y);
    y += 6;
    doc.line(M, y, 400, y);
  } else {
    addSig('Passenger signature', opts.passengerTypedName, opts.passengerSig);
  }

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
  const [passengerRelationship, setPassengerRelationship] = useState('');
  const [passengerDob, setPassengerDob] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [contractorTypedName, setContractorTypedName] = useState('');
  const [passengerTypedName, setPassengerTypedName] = useState('');
  const [contractorSig, setContractorSig] = useState<string | null>(null);
  const [passengerSig, setPassengerSig] = useState<string | null>(null);
  const [passengerNotPresent, setPassengerNotPresent] = useState(false);
  const [waiverReason, setWaiverReason] = useState('');

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
    if (!passengerName || !passengerRelationship || !effectiveDate ||
        !contractorTypedName || !contractorSig) {
      toast.error('Please complete all required fields and the contractor signature.');
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
        passengerName, passengerRelationship, passengerRelationshipLabel: relationshipLabel, passengerDob,
        effectiveDate,
        contractorTypedName, passengerTypedName,
        contractorSig: contractorSig!, passengerSig: passengerWaived ? null : passengerSig,
        passengerWaived, waiverReason: effectiveReason, isMinor,
      });
      const { data, error } = await supabase.functions.invoke('finalize-passenger-auth', {
        body: {
          token,
          passengerName, passengerRelationship: relationshipLabel,
          passengerDob: passengerDob || null,
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
      if (error || !data?.ok) throw new Error((data as any)?.error || error?.message || 'Submission failed');
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Passenger full legal name *</Label>
                <Input value={passengerName} onChange={e => setPassengerName(e.target.value)} />
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
                <Label>Effective date *</Label>
                <Input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} />
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

            <Button className="w-full" onClick={submit} disabled={submitting}>
              {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting…</> : 'Sign & Submit'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}