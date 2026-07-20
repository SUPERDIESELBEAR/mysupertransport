import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { uploadToBucket } from '@/lib/uploadWithAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DateInput } from '@/components/ui/date-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SignatureCanvas from 'react-signature-canvas';
import { Loader2, PenTool, Truck, Plus, Replace, Send, Save, RotateCcw } from 'lucide-react';

type ActiveUnit = {
  source_id: string;
  source_type: string;
  amendment_number: number | null;
  unit_number: string | null;
  truck_year: string | null;
  truck_make: string | null;
  truck_model: string | null;
  truck_vin: string | null;
  truck_plate: string | null;
  truck_plate_state: string | null;
  trailer_number: string | null;
};

interface Props {
  operatorId: string;
  operatorName: string;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Staff-only modal to create a new ICA Amendment (Add Unit or Remove & Replace).
 * Enforces: parent ICA must be signed/complete, only one pending amendment per operator.
 */
export default function ICAAmendmentBuilderModal({ operatorId, operatorName, onClose, onSaved }: Props) {
  const { session, user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [parentIcaId, setParentIcaId] = useState<string | null>(null);
  const [activeUnits, setActiveUnits] = useState<ActiveUnit[]>([]);

  const [action, setAction] = useState<'add_unit' | 'replace_unit'>('add_unit');
  const [removedVin, setRemovedVin] = useState<string>('');
  const [effectiveDate, setEffectiveDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // New unit fields
  const [unitNumber, setUnitNumber] = useState('');
  const [truckYear, setTruckYear] = useState('');
  const [truckMake, setTruckMake] = useState('');
  const [truckModel, setTruckModel] = useState('');
  const [truckVin, setTruckVin] = useState('');
  const [truckPlate, setTruckPlate] = useState('');
  const [truckPlateState, setTruckPlateState] = useState('');
  const [trailerNumber, setTrailerNumber] = useState('');
  const [isPrimary, setIsPrimary] = useState(true);

  // Carrier signature
  const carrierSigRef = useRef<SignatureCanvas>(null);
  const [carrierTypedName, setCarrierTypedName] = useState('');
  const [carrierTitle, setCarrierTitle] = useState('');
  const [defaultSigUrl, setDefaultSigUrl] = useState<string | null>(null);
  const [defaultSigPreview, setDefaultSigPreview] = useState<string | null>(null);
  const [useDefaultSig, setUseDefaultSig] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Parent ICA (must exist and be signed/complete)
        const { data: ica } = await supabase
          .from('ica_contracts')
          .select('id, status')
          .eq('operator_id', operatorId)
          .in('status', ['signed', 'active', 'completed', 'complete'])
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!ica) {
          toast({
            title: 'No signed ICA on file',
            description: 'An amendment requires an existing, fully signed ICA.',
            variant: 'destructive',
          });
          onClose();
          return;
        }
        setParentIcaId(ica.id);

        // Active units for Remove & Replace picker
        const { data: units } = await supabase
          .from('v_operator_active_units')
          .select('*')
          .eq('operator_id', operatorId);
        setActiveUnits((units as any) ?? []);

        // Default carrier signature
        const { data: sig } = await supabase
          .from('carrier_signature_settings')
          .select('*')
          .maybeSingle();
        if (sig) {
          setCarrierTypedName((sig as any).typed_name ?? '');
          setCarrierTitle((sig as any).title ?? '');
          const sigPath = (sig as any).signature_url as string | null;
          if (sigPath) {
            setDefaultSigUrl(sigPath);
            setUseDefaultSig(true);
            const path = sigPath.includes('/ica-signatures/')
              ? sigPath.split('/ica-signatures/').pop()!
              : sigPath;
            const { data: signed } = await supabase.storage
              .from('ica-signatures')
              .createSignedUrl(path, 3600);
            if (signed?.signedUrl) setDefaultSigPreview(signed.signedUrl);
          }
        }
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operatorId]);

  const removedUnitObj = useMemo(
    () => activeUnits.find(u => (u.truck_vin ?? '').toUpperCase() === removedVin.toUpperCase()),
    [activeUnits, removedVin],
  );

  const uploadCarrierSignature = async (): Promise<string | null> => {
    if (carrierSigRef.current && !carrierSigRef.current.isEmpty()) {
      const dataUrl = carrierSigRef.current.toDataURL('image/png');
      const blob = await (await fetch(dataUrl)).blob();
      const path = `carrier/amendment-${operatorId}-${Date.now()}.png`;
      const { error } = await uploadToBucket('ica-signatures', path, blob, {
        contentType: 'image/png',
        upsert: true,
      });
      if (error) throw error;
      return path;
    }
    if (useDefaultSig && defaultSigUrl) return defaultSigUrl;
    return null;
  };

  const validate = (): string | null => {
    if (!parentIcaId) return 'Missing parent ICA';
    if (!truckVin.trim()) return 'New unit VIN is required';
    if (!truckYear.trim() || !truckMake.trim()) return 'New unit year and make are required';
    if (!effectiveDate) return 'Effective date is required';
    if (action === 'replace_unit' && !removedVin) return 'Select which unit to remove';
    return null;
  };

  const persist = async (
    finalStatus: 'draft' | 'sent_to_operator',
  ): Promise<string | null> => {
    const err = validate();
    if (err) {
      toast({ title: err, variant: 'destructive' });
      return null;
    }

    setSaving(true);
    try {
      const carrierSigPath = finalStatus === 'sent_to_operator' ? await uploadCarrierSignature() : null;

      // 1. Insert amendment row
      const { data: amendRow, error: aErr } = await supabase
        .from('ica_amendments')
        .insert({
          operator_id: operatorId,
          parent_ica_id: parentIcaId!,
          action,
          effective_date: effectiveDate,
          notes: notes.trim() || null,
          status: finalStatus,
          amendment_number: 0, // trigger assigns
          created_by: user?.id ?? null,
          carrier_signature_url: carrierSigPath,
          carrier_signed_at: carrierSigPath ? new Date().toISOString() : null,
          carrier_signed_by: carrierSigPath ? user?.id ?? null : null,
          carrier_typed_name: carrierSigPath ? carrierTypedName || null : null,
          carrier_title: carrierSigPath ? carrierTitle || null : null,
        })
        .select()
        .single();
      if (aErr || !amendRow) throw aErr ?? new Error('Amendment insert failed');

      // 2. Insert unit rows
      const rows: any[] = [];
      rows.push({
        amendment_id: amendRow.id,
        change_type: 'added',
        is_primary: isPrimary,
        unit_number: unitNumber.trim() || null,
        truck_year: truckYear.trim() || null,
        truck_make: truckMake.trim() || null,
        truck_model: truckModel.trim() || null,
        truck_vin: truckVin.trim().toUpperCase() || null,
        truck_plate: truckPlate.trim() || null,
        truck_plate_state: truckPlateState.trim() || null,
        trailer_number: trailerNumber.trim() || null,
      });
      if (action === 'replace_unit' && removedUnitObj) {
        rows.push({
          amendment_id: amendRow.id,
          change_type: 'removed',
          is_primary: false,
          unit_number: removedUnitObj.unit_number,
          truck_year: removedUnitObj.truck_year,
          truck_make: removedUnitObj.truck_make,
          truck_model: removedUnitObj.truck_model,
          truck_vin: removedUnitObj.truck_vin,
          truck_plate: removedUnitObj.truck_plate,
          truck_plate_state: removedUnitObj.truck_plate_state,
          trailer_number: removedUnitObj.trailer_number,
        });
      }
      const { error: uErr } = await supabase.from('ica_amendment_units').insert(rows);
      if (uErr) throw uErr;

      // 3. Audit
      await supabase.from('audit_log').insert({
        actor_id: user?.id ?? null,
        action: finalStatus === 'draft' ? 'ica_amendment_drafted' : 'ica_amendment_sent',
        entity_type: 'ica_amendment',
        entity_id: amendRow.id,
        entity_label: `Amendment #${amendRow.amendment_number}`,
        metadata: {
          operator_id: operatorId,
          operator_name: operatorName,
          amendment_action: action,
          effective_date: effectiveDate,
        },
      });

      // 4. Notify the operator when sent
      if (finalStatus === 'sent_to_operator') {
        const { data: op } = await supabase
          .from('operators')
          .select('user_id')
          .eq('id', operatorId)
          .maybeSingle();
        if (op?.user_id) {
          await supabase.from('notifications').insert({
            user_id: op.user_id,
            title: 'ICA Amendment awaiting your signature',
            body: `Amendment #${amendRow.amendment_number} — please review and sign.`,
            type: 'ica_amendment_sent',
            channel: 'in_app',
            link: `/operator?view=ica-amendment&id=${amendRow.id}`,
            priority: 'action',
          } as any);
        }
      }

      toast({
        title: finalStatus === 'draft' ? 'Amendment draft saved' : 'Amendment sent to operator',
        description: `Amendment #${amendRow.amendment_number} for ${operatorName}.`,
      });
      onSaved();
      return amendRow.id;
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
      return null;
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-primary" />
            Amend ICA — {operatorName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 pt-2">
            {/* Action toggle */}
            <div>
              <Label className="text-xs mb-2 block">Action</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAction('add_unit')}
                  className={
                    'p-3 rounded-md border text-left transition-colors ' +
                    (action === 'add_unit'
                      ? 'bg-gold/10 border-gold'
                      : 'bg-background border-border hover:bg-muted/50')
                  }
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Plus className="h-3.5 w-3.5" /> Add an Additional Unit
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Original unit(s) remain leased. Adds a new unit under the same ICA.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setAction('replace_unit')}
                  className={
                    'p-3 rounded-md border text-left transition-colors ' +
                    (action === 'replace_unit'
                      ? 'bg-gold/10 border-gold'
                      : 'bg-background border-border hover:bg-muted/50')
                  }
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Replace className="h-3.5 w-3.5" /> Remove & Replace Unit
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Retires the selected unit and adds a replacement. Auto-generates a Lease Termination for the removed unit.
                  </p>
                </button>
              </div>
            </div>

            {/* Remove picker */}
            {action === 'replace_unit' && (
              <div>
                <Label className="text-xs mb-1 block">Unit to remove *</Label>
                <Select value={removedVin} onValueChange={setRemovedVin}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select current unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeUnits.map(u => (
                      <SelectItem key={u.source_id} value={u.truck_vin ?? u.source_id}>
                        {[u.truck_year, u.truck_make, u.truck_model].filter(Boolean).join(' ')}
                        {u.truck_vin ? ` · VIN ${u.truck_vin}` : ''}
                        {u.truck_plate ? ` · ${u.truck_plate}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activeUnits.length === 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1">No active units found on file.</p>
                )}
              </div>
            )}

            {/* New unit fields */}
            <div className="border border-border rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5 text-primary" /> New Unit Details
              </h4>
              <div className="grid grid-cols-3 gap-3">
                <TextField label="Year *" value={truckYear} onChange={setTruckYear} />
                <TextField label="Make *" value={truckMake} onChange={setTruckMake} />
                <TextField label="Model" value={truckModel} onChange={setTruckModel} />
                <TextField
                  label="VIN *"
                  value={truckVin}
                  onChange={(v) => setTruckVin(v.toUpperCase())}
                  span={2}
                />
                <TextField label="Unit #" value={unitNumber} onChange={setUnitNumber} />
                <TextField label="Plate" value={truckPlate} onChange={setTruckPlate} />
                <TextField label="Plate State" value={truckPlateState} onChange={setTruckPlateState} />
                <TextField label="Trailer #" value={trailerNumber} onChange={setTrailerNumber} />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                <input
                  type="checkbox"
                  checked={isPrimary}
                  onChange={e => setIsPrimary(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Make this the operator&apos;s primary unit (updates roster / dispatch card)
              </label>
            </div>

            {/* Effective date + notes */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Effective Date *</Label>
                <DateInput value={effectiveDate} onChange={setEffectiveDate} className="h-9 text-sm" />
              </div>
              <div className="row-span-2">
                <Label className="text-xs">Staff Notes</Label>
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Reason for amendment, delivery details, insurance sync notes…"
                  className="text-sm min-h-[80px] resize-none"
                />
              </div>
            </div>

            {/* Carrier signature */}
            <div className="border border-border rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <PenTool className="h-3.5 w-3.5 text-primary" /> Carrier Signature
              </h4>
              <p className="text-[11px] text-muted-foreground">
                Sign now to send to the operator; the amendment activates automatically once the operator counter-signs.
                You can also Save Draft and sign later.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Typed Name" value={carrierTypedName} onChange={setCarrierTypedName} />
                <TextField label="Title" value={carrierTitle} onChange={setCarrierTitle} />
              </div>
              {defaultSigPreview && useDefaultSig ? (
                <div className="border rounded-md p-3 bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] text-muted-foreground">Using saved default signature</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7 gap-1"
                      onClick={() => setUseDefaultSig(false)}
                    >
                      <RotateCcw className="h-3 w-3" /> Draw a new one
                    </Button>
                  </div>
                  <img src={defaultSigPreview} alt="Saved signature" className="max-h-16" />
                </div>
              ) : (
                <div>
                  <div className="border border-dashed border-border rounded-md bg-white">
                    <SignatureCanvas
                      ref={carrierSigRef}
                      penColor="#000"
                      canvasProps={{ className: 'w-full h-24 rounded-md' }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-[11px] h-6"
                      onClick={() => carrierSigRef.current?.clear()}
                    >
                      Clear
                    </Button>
                    {defaultSigUrl && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-[11px] h-6"
                        onClick={() => setUseDefaultSig(true)}
                      >
                        Use saved default
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => persist('draft').then(id => { if (id) onClose(); })}
                disabled={saving}
                className="gap-1.5"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save Draft
              </Button>
              <Button
                size="sm"
                onClick={() => persist('sent_to_operator').then(id => { if (id) onClose(); })}
                disabled={saving}
                className="gap-1.5 bg-primary text-primary-foreground"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send to Operator
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TextField({
  label,
  value,
  onChange,
  span = 1,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  span?: number;
}) {
  return (
    <div className={span === 2 ? 'col-span-2' : span === 3 ? 'col-span-3' : ''}>
      <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</Label>
      <Input value={value} onChange={e => onChange(e.target.value)} className="h-9 text-sm" />
    </div>
  );
}