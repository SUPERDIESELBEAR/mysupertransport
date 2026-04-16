import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useDemoMode } from '@/hooks/useDemoMode';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DateInput } from '@/components/ui/date-input';
import { Loader2, UserCheck, Package, Upload, X, FileText } from 'lucide-react';
import DemoLockIcon from '@/components/DemoLockIcon';
import type { EquipmentItem } from './EquipmentInventory';
import { DEVICE_CONFIG_LABELS } from './equipmentUtils';
import { SHIPPING_CARRIERS } from './equipmentTracking';
import { validateFile } from '@/lib/validateFile';

interface Operator {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  item: EquipmentItem | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function EquipmentAssignModal({ open, item, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { guardDemo } = useDemoMode();
  const [operators, setOperators] = useState<Operator[]>([]);
  const [selectedOperator, setSelectedOperator] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingOps, setLoadingOps] = useState(false);

  // Shipping & tracking state
  const [shipToggle, setShipToggle] = useState(false);
  const [carrier, setCarrier] = useState<string>('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [shipDate, setShipDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedOperator('');
    setNotes('');
    setShipToggle(false);
    setCarrier('');
    setTrackingNumber('');
    setReceiptFile(null);
    const d = new Date();
    setShipDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    fetchOperators();
  }, [open]);

  const fetchOperators = async () => {
    setLoadingOps(true);
    const { data } = await supabase
      .from('operators')
      .select('id, applications(first_name, last_name)')
      .order('created_at');
    if (data) {
      const ops: Operator[] = (data as any[]).map(op => {
        const app = op.applications;
        const name = [app?.first_name, app?.last_name].filter(Boolean).join(' ') || 'Unknown Operator';
        return { id: op.id, name };
      });
      setOperators(ops);
    }
    setLoadingOps(false);
  };

  const handleReceiptPick = (file: File | null) => {
    if (!file) {
      setReceiptFile(null);
      return;
    }
    const result = validateFile(file);
    if (!result.valid) {
      toast({ title: 'Invalid file', description: result.error, variant: 'destructive' });
      return;
    }
    setReceiptFile(file);
  };

  const uploadReceipt = async (assignmentId: string, operatorId: string): Promise<string | null> => {
    if (!receiptFile) return null;
    const ext = receiptFile.name.split('.').pop()?.toLowerCase() ?? 'bin';
    const path = `equipment-receipts/${operatorId}/${assignmentId}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('operator-documents')
      .upload(path, receiptFile, { upsert: true });
    if (upErr) {
      throw new Error(`Receipt upload failed: ${upErr.message}`);
    }
    const { data: signed } = await supabase.storage
      .from('operator-documents')
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 5); // 5-year signed URL
    return signed?.signedUrl ?? null;
  };

  const handleAssign = async () => {
    if (guardDemo()) return;
    if (!item || !selectedOperator) {
      toast({ title: 'Please select an operator', variant: 'destructive' });
      return;
    }

    // If shipping section is on, basic validation
    if (shipToggle) {
      if (!carrier) {
        toast({ title: 'Select a shipping carrier', variant: 'destructive' });
        return;
      }
      if (!trackingNumber.trim()) {
        toast({ title: 'Enter the tracking number', variant: 'destructive' });
        return;
      }
    }

    setSaving(true);

    // Check for active assignment (prevent double-assign)
    const { data: activeAssign } = await supabase
      .from('equipment_assignments')
      .select('id')
      .eq('equipment_id', item.id)
      .is('returned_at', null)
      .limit(1);
    if (activeAssign && activeAssign.length > 0) {
      toast({ title: 'This device is already assigned to another operator', variant: 'destructive' });
      setSaving(false);
      return;
    }

    // 1. Create assignment record (without receipt URL — added after upload)
    const insertPayload: Record<string, any> = {
      equipment_id: item.id,
      operator_id: selectedOperator,
      assigned_by: user?.id ?? null,
      notes: notes.trim() || null,
    };
    if (shipToggle) {
      insertPayload.shipping_carrier = carrier;
      insertPayload.tracking_number = trackingNumber.trim();
      insertPayload.ship_date = shipDate || null;
    }

    const { data: inserted, error: assignError } = await supabase
      .from('equipment_assignments')
      .insert(insertPayload as any)
      .select('id')
      .single();

    if (assignError || !inserted) {
      toast({ title: 'Assignment failed', description: assignError?.message ?? 'Unknown error', variant: 'destructive' });
      setSaving(false);
      return;
    }

    // 2. Upload receipt (if any) and patch the row with URL
    if (shipToggle && receiptFile) {
      try {
        const url = await uploadReceipt(inserted.id, selectedOperator);
        if (url) {
          await supabase
            .from('equipment_assignments')
            .update({
              tracking_receipt_url: url,
              tracking_receipt_uploaded_at: new Date().toISOString(),
            })
            .eq('id', inserted.id);
        }
      } catch (e: any) {
        toast({ title: 'Receipt upload failed', description: e?.message ?? '', variant: 'destructive' });
        // Continue — assignment itself succeeded
      }
    }

    // 3. Update item status to assigned
    await supabase.from('equipment_items').update({ status: 'assigned' }).eq('id', item.id);

    // 4. Auto-fill Stage 5 onboarding_status field
    const fieldMap: Record<string, string> = {
      eld:       'eld_serial_number',
      dash_cam:  'dash_cam_number',
      bestpass:  'bestpass_number',
      fuel_card: 'fuel_card_number',
    };
    const field = fieldMap[item.device_type];
    if (field) {
      const { data: os } = await supabase
        .from('onboarding_status')
        .select('id')
        .eq('operator_id', selectedOperator)
        .single();
      if (os) {
        await supabase
          .from('onboarding_status')
          .update({ [field]: item.serial_number })
          .eq('operator_id', selectedOperator);
      }
    }

    toast({ title: '✅ Device assigned', description: `${DEVICE_CONFIG_LABELS[item.device_type]} ${item.serial_number} assigned.` });
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-primary" />
            Assign Device to Operator
          </DialogTitle>
        </DialogHeader>
        {item && (
          <div className="bg-muted/40 rounded-lg px-3 py-2 text-sm mb-1">
            <span className="text-muted-foreground">{DEVICE_CONFIG_LABELS[item.device_type]}:</span>{' '}
            <span className="font-mono font-semibold">{item.serial_number}</span>
          </div>
        )}
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Assign To Operator</Label>
            {loadingOps ? (
              <div className="h-9 flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading operators...
              </div>
            ) : (
              <Select value={selectedOperator} onValueChange={setSelectedOperator}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select operator..." />
                </SelectTrigger>
                <SelectContent>
                  {operators.map(op => (
                    <SelectItem key={op.id} value={op.id}>{op.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Assignment notes..."
              className="min-h-[60px] resize-none text-sm"
            />
          </div>

          {/* ── Shipping & Tracking ── */}
          <div className="rounded-lg border border-border bg-muted/20">
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <Package className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground leading-none">Shipping & Tracking</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                    Toggle on if shipped to operator (self-install)
                  </p>
                </div>
              </div>
              <Switch checked={shipToggle} onCheckedChange={setShipToggle} />
            </div>

            {shipToggle && (
              <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Carrier</Label>
                    <Select value={carrier} onValueChange={setCarrier}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {SHIPPING_CARRIERS.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Ship Date</Label>
                    <DateInput
                      value={shipDate}
                      onChange={v => setShipDate(v)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tracking Number</Label>
                  <Input
                    value={trackingNumber}
                    onChange={e => setTrackingNumber(e.target.value)}
                    placeholder="e.g. 1Z999AA10123456784"
                    className="h-8 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Receipt Photo / PDF <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  {receiptFile ? (
                    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="truncate">{receiptFile.name}</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 shrink-0"
                        onClick={() => setReceiptFile(null)}
                        aria-label="Remove receipt"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 cursor-pointer transition-colors">
                      <Upload className="h-3.5 w-3.5" />
                      Click to upload receipt
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={e => handleReceiptPick(e.target.files?.[0] ?? null)}
                      />
                    </label>
                  )}
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground bg-primary/5 rounded-lg px-3 py-2 border border-primary/15">
            ℹ️ This will automatically populate the device number in the operator's Stage 5 onboarding panel.
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleAssign} disabled={saving || !selectedOperator} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DemoLockIcon />}
            Assign Device
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
