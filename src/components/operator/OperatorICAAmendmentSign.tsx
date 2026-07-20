import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Pen, CheckCircle2, Truck, ArrowLeft } from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import { uploadToBucket } from '@/lib/uploadWithAuth';

interface Props {
  amendmentId: string;
  onBack?: () => void;
  onComplete?: () => void;
}

type Amend = {
  id: string;
  amendment_number: number;
  action: 'add_unit' | 'replace_unit';
  status: string;
  effective_date: string | null;
  notes: string | null;
  operator_id: string;
  operator_signature_url: string | null;
  operator_signed_at: string | null;
  operator_typed_name: string | null;
  carrier_signature_url: string | null;
  carrier_typed_name: string | null;
  carrier_title: string | null;
};

type Unit = {
  id: string;
  change_type: 'added' | 'removed';
  unit_number: string | null;
  truck_year: string | null;
  truck_make: string | null;
  truck_model: string | null;
  truck_vin: string | null;
  truck_plate: string | null;
  truck_plate_state: string | null;
  trailer_number: string | null;
  is_primary: boolean;
};

export default function OperatorICAAmendmentSign({ amendmentId, onBack, onComplete }: Props) {
  const { session, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [amend, setAmend] = useState<Amend | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [typedName, setTypedName] = useState('');
  const [hasDrawn, setHasDrawn] = useState(false);
  const sigRef = useRef<SignatureCanvas>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data: a } = await supabase
          .from('ica_amendments')
          .select('*')
          .eq('id', amendmentId)
          .maybeSingle();
        setAmend(a as any);
        setTypedName((a as any)?.operator_typed_name ?? '');
        const { data: u } = await supabase
          .from('ica_amendment_units')
          .select('*')
          .eq('amendment_id', amendmentId)
          .order('change_type');
        setUnits((u as any) ?? []);
      } finally {
        setLoading(false);
      }
    };
    if (session?.user?.id) load();
  }, [amendmentId, session?.user?.id]);

  const handleSign = async () => {
    if (!amend || !user) return;
    if (!typedName.trim()) { toast.error('Type your full legal name'); return; }
    if (!sigRef.current || sigRef.current.isEmpty()) { toast.error('Draw your signature'); return; }

    setSaving(true);
    try {
      const dataUrl = sigRef.current.toDataURL('image/png');
      const blob = await (await fetch(dataUrl)).blob();
      const path = `operator/amendment-${amend.id}-${Date.now()}.png`;
      const { error: upErr } = await uploadToBucket('ica-signatures', path, blob, {
        contentType: 'image/png',
        upsert: true,
      });
      if (upErr) throw upErr;

      // Status: if carrier already signed => active, else awaiting carrier
      const bothSigned = !!amend.carrier_signature_url;
      const nextStatus = bothSigned ? 'active' : 'operator_signed';

      const { error: uErr } = await supabase
        .from('ica_amendments')
        .update({
          operator_signature_url: path,
          operator_signed_at: new Date().toISOString(),
          operator_signed_by: user.id,
          operator_typed_name: typedName.trim(),
          status: nextStatus,
          ...(bothSigned ? { activated_at: new Date().toISOString() } : {}),
        } as any)
        .eq('id', amend.id);
      if (uErr) throw uErr;

      await supabase.from('audit_log').insert({
        actor_id: user.id,
        action: bothSigned ? 'ica_amendment_activated' : 'ica_amendment_operator_signed',
        entity_type: 'ica_amendment',
        entity_id: amend.id,
        entity_label: `Amendment #${amend.amendment_number}`,
        metadata: { operator_id: amend.operator_id },
      });

      toast.success(
        bothSigned
          ? 'Amendment activated — your fleet is updated.'
          : 'Signed. Awaiting carrier counter-signature.',
      );
      onComplete?.();
    } catch (e: any) {
      toast.error(e?.message ?? 'Sign failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!amend) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-3">
        <p className="text-sm text-muted-foreground">Amendment not found or access denied.</p>
        {onBack && (
          <Button variant="outline" size="sm" onClick={onBack} className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
        )}
      </div>
    );
  }

  const alreadySigned = !!amend.operator_signature_url;
  const added = units.filter(u => u.change_type === 'added');
  const removed = units.filter(u => u.change_type === 'removed');

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      {onBack && (
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 h-8">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Button>
      )}

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">ICA Amendment #{amend.amendment_number}</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          {amend.action === 'add_unit' ? 'Add an additional leased unit' : 'Remove & replace a leased unit'}
          {amend.effective_date ? ` · Effective ${amend.effective_date}` : ''}
        </p>
        {amend.notes && (
          <p className="text-xs italic text-foreground/80 border-l-2 border-border pl-2">
            {amend.notes}
          </p>
        )}

        {removed.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-destructive">
              Removed unit
            </div>
            {removed.map(u => <UnitLine key={u.id} u={u} />)}
          </div>
        )}
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
            Added unit
          </div>
          {added.map(u => <UnitLine key={u.id} u={u} />)}
        </div>

        {amend.carrier_signature_url && (
          <div className="text-[11px] text-muted-foreground pt-2 border-t border-border">
            Carrier signed by {amend.carrier_typed_name}
            {amend.carrier_title ? `, ${amend.carrier_title}` : ''}.
          </div>
        )}
      </div>

      {alreadySigned ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center gap-2 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          You&apos;ve already signed this amendment.
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Pen className="h-3.5 w-3.5 text-primary" /> Your Signature
          </h3>
          <div>
            <Label className="text-xs">Full legal name</Label>
            <Input
              value={typedName}
              onChange={e => setTypedName(e.target.value)}
              className="h-9 text-sm"
              placeholder="e.g. John A. Smith"
            />
          </div>
          <div>
            <Label className="text-xs">Sign below</Label>
            <div className="border border-dashed border-border rounded-md bg-white mt-1">
              <SignatureCanvas
                ref={sigRef}
                penColor="#000"
                canvasProps={{ className: 'w-full h-32 rounded-md' }}
                onEnd={() => setHasDrawn(true)}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-[11px] h-6 mt-1"
              onClick={() => { sigRef.current?.clear(); setHasDrawn(false); }}
            >
              Clear
            </Button>
          </div>
          <Button
            onClick={handleSign}
            disabled={saving || !hasDrawn || !typedName.trim()}
            className="w-full gap-1.5 bg-primary text-primary-foreground"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Sign Amendment
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">
            By signing, you agree that this amendment modifies your existing Independent Contractor Agreement.
          </p>
        </div>
      )}
    </div>
  );
}

function UnitLine({ u }: { u: Unit }) {
  return (
    <div className="text-xs bg-muted/30 rounded-md p-2">
      <div className="font-medium">
        {[u.truck_year, u.truck_make, u.truck_model].filter(Boolean).join(' ') || 'Unit'}
        {u.is_primary && u.change_type === 'added' && (
          <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary">Primary</span>
        )}
      </div>
      <div className="text-muted-foreground text-[11px] mt-0.5">
        VIN {u.truck_vin || '—'}
        {u.truck_plate ? ` · Plate ${u.truck_plate}${u.truck_plate_state ? ` (${u.truck_plate_state})` : ''}` : ''}
        {u.unit_number ? ` · Unit ${u.unit_number}` : ''}
        {u.trailer_number ? ` · Trailer ${u.trailer_number}` : ''}
      </div>
    </div>
  );
}