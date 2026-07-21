import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  passengerName: string; passengerRelationship: string; passengerDob: string;
  effectiveDate: string;
  contractorTypedName: string; passengerTypedName: string; parentTypedName: string;
  contractorSig: string; passengerSig: string; parentSig: string | null;
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
    `Relationship to Driver: ${opts.passengerRelationship}`,
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
  addSig('Contractor / Driver signature', opts.contractorTypedName, opts.contractorSig);
  addSig('Passenger signature', opts.passengerTypedName, opts.passengerSig);
  if (opts.parentSig) addSig('Parent / Guardian (if minor) signature', opts.parentTypedName, opts.parentSig);

  return doc.output('datauristring');
}

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
  const [parentTypedName, setParentTypedName] = useState('');
  const [contractorSig, setContractorSig] = useState<string | null>(null);
  const [passengerSig, setPassengerSig] = useState<string | null>(null);
  const [parentSig, setParentSig] = useState<string | null>(null);
  const [isMinor, setIsMinor] = useState(false);

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
        !contractorTypedName || !passengerTypedName ||
        !contractorSig || !passengerSig) {
      toast.error('Please complete all required fields and both signatures.');
      return;
    }
    if (isMinor && (!parentTypedName || !parentSig)) {
      toast.error('Please provide the parent/guardian signature for a minor passenger.');
      return;
    }
    setSubmitting(true);
    try {
      const pdf = await buildPdf({
        driverName: row.driver_name, unitNumber: row.unit_number,
        passengerName, passengerRelationship, passengerDob,
        effectiveDate,
        contractorTypedName, passengerTypedName, parentTypedName,
        contractorSig, passengerSig, parentSig: isMinor ? parentSig : null,
      });
      const { data, error } = await supabase.functions.invoke('finalize-passenger-auth', {
        body: {
          token,
          passengerName, passengerRelationship,
          passengerDob: passengerDob || null,
          effectiveDate,
          contractorTypedName, passengerTypedName,
          parentTypedName: isMinor ? parentTypedName : null,
          contractorSignature: contractorSig,
          passengerSignature: passengerSig,
          parentSignature: isMinor ? parentSig : null,
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
                <Input placeholder="Spouse, child, parent…" value={passengerRelationship} onChange={e => setPassengerRelationship(e.target.value)} />
              </div>
              <div>
                <Label>Passenger DOB</Label>
                <Input type="date" value={passengerDob} onChange={e => setPassengerDob(e.target.value)} />
              </div>
              <div>
                <Label>Effective date *</Label>
                <Input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isMinor} onChange={e => setIsMinor(e.target.checked)} />
              Passenger is a minor (under 18) — parent/guardian must also sign
            </label>

            <div className="space-y-4 pt-2 border-t">
              <div>
                <Label>Contractor / Driver typed name *</Label>
                <Input value={contractorTypedName} onChange={e => setContractorTypedName(e.target.value)} />
                <div className="mt-2">
                  <SignaturePad label="Contractor / Driver signature *" value={contractorSig} onChange={setContractorSig} />
                </div>
              </div>
              <div>
                <Label>Passenger typed name *</Label>
                <Input value={passengerTypedName} onChange={e => setPassengerTypedName(e.target.value)} />
                <div className="mt-2">
                  <SignaturePad label="Passenger signature *" value={passengerSig} onChange={setPassengerSig} />
                </div>
              </div>
              {isMinor && (
                <div>
                  <Label>Parent / Guardian typed name *</Label>
                  <Input value={parentTypedName} onChange={e => setParentTypedName(e.target.value)} />
                  <div className="mt-2">
                    <SignaturePad label="Parent / Guardian signature *" value={parentSig} onChange={setParentSig} />
                  </div>
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