import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useDemoMode } from '@/hooks/useDemoMode';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateInput } from '@/components/ui/date-input';
import { Loader2, UserCheck, RotateCcw, History, Package, ExternalLink, FileText, Upload, X, Pencil, Save } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { EquipmentItem } from './EquipmentInventory';
import { DEVICE_CONFIG_LABELS } from './equipmentUtils';
import { SHIPPING_CARRIERS, buildTrackingUrl, shortTracking } from './equipmentTracking';
import { FilePreviewModal } from '@/components/inspection/DocRow';
import { validateFile } from '@/lib/validateFile';

interface Assignment {
  id: string;
  operator_id: string;
  assigned_at: string;
  returned_at: string | null;
  return_condition: string | null;
  notes: string | null;
  operator_name: string;
  assigned_by_name: string | null;
  shipping_carrier: string | null;
  tracking_number: string | null;
  ship_date: string | null;
  tracking_receipt_url: string | null;
}

interface Props {
  open: boolean;
  item: EquipmentItem | null;
  onClose: () => void;
}

const CONDITION_COLORS: Record<string, string> = {
  available: 'bg-status-complete/15 text-status-complete border-status-complete/30',
  damaged:   'bg-warning/15 text-warning border-warning/30',
  lost:      'bg-destructive/15 text-destructive border-destructive/30',
};

export default function EquipmentHistoryModal({ open, item, onClose }: Props) {
  const { toast } = useToast();
  const { guardDemo } = useDemoMode();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Edit-tracking state for active row
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCarrier, setEditCarrier] = useState('');
  const [editTracking, setEditTracking] = useState('');
  const [editShipDate, setEditShipDate] = useState('');
  const [editReceiptFile, setEditReceiptFile] = useState<File | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (!open || !item) return;
    fetchHistory();
    setEditingId(null);
  }, [open, item]);

  const fetchHistory = async () => {
    if (!item) return;
    setLoading(true);
    const { data } = await supabase
      .from('equipment_assignments')
      .select(`
        id, operator_id, assigned_at, returned_at, return_condition, notes,
        shipping_carrier, tracking_number, ship_date, tracking_receipt_url,
        operators!inner(
          application_id,
          applications(first_name, last_name)
        ),
        assigned_by
      `)
      .eq('equipment_id', item.id)
      .order('assigned_at', { ascending: false });

    if (data) {
      const assignedByIds = [...new Set((data as any[]).map(a => a.assigned_by).filter(Boolean))];
      const profileMap: Record<string, string> = {};
      if (assignedByIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name')
          .in('user_id', assignedByIds);
        for (const p of profiles ?? []) {
          profileMap[p.user_id] = [p.first_name, p.last_name].filter(Boolean).join(' ');
        }
      }

      setAssignments((data as any[]).map(a => {
        const app = a.operators?.applications;
        return {
          id: a.id,
          operator_id: a.operator_id,
          assigned_at: a.assigned_at,
          returned_at: a.returned_at,
          return_condition: a.return_condition,
          notes: a.notes,
          operator_name: [app?.first_name, app?.last_name].filter(Boolean).join(' ') || 'Unknown Operator',
          assigned_by_name: a.assigned_by ? (profileMap[a.assigned_by] ?? null) : null,
          shipping_carrier: a.shipping_carrier ?? null,
          tracking_number: a.tracking_number ?? null,
          ship_date: a.ship_date ?? null,
          tracking_receipt_url: a.tracking_receipt_url ?? null,
        };
      }));
    }
    setLoading(false);
  };

  const beginEdit = (a: Assignment) => {
    setEditingId(a.id);
    setEditCarrier(a.shipping_carrier ?? '');
    setEditTracking(a.tracking_number ?? '');
    setEditShipDate(a.ship_date ?? (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })());
    setEditReceiptFile(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditReceiptFile(null);
  };

  const handleReceiptPick = (file: File | null) => {
    if (!file) {
      setEditReceiptFile(null);
      return;
    }
    const result = validateFile(file);
    if (!result.valid) {
      toast({ title: 'Invalid file', description: result.error, variant: 'destructive' });
      return;
    }
    setEditReceiptFile(file);
  };

  const saveTracking = async (a: Assignment) => {
    if (guardDemo()) return;
    if (!editCarrier) {
      toast({ title: 'Select a shipping carrier', variant: 'destructive' });
      return;
    }
    if (!editTracking.trim()) {
      toast({ title: 'Enter the tracking number', variant: 'destructive' });
      return;
    }
    setSavingEdit(true);

    let receiptUrl = a.tracking_receipt_url;
    try {
      if (editReceiptFile) {
        const ext = editReceiptFile.name.split('.').pop()?.toLowerCase() ?? 'bin';
        const path = `equipment-receipts/${a.operator_id}/${a.id}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('operator-documents')
          .upload(path, editReceiptFile, { upsert: true });
        if (upErr) throw new Error(upErr.message);
        const { data: signed } = await supabase.storage
          .from('operator-documents')
          .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
        if (signed?.signedUrl) receiptUrl = signed.signedUrl;
      }

      const updatePayload: Record<string, any> = {
        shipping_carrier: editCarrier,
        tracking_number: editTracking.trim(),
        ship_date: editShipDate || null,
      };
      if (editReceiptFile) {
        updatePayload.tracking_receipt_url = receiptUrl;
        updatePayload.tracking_receipt_uploaded_at = new Date().toISOString();
      }

      const { error: updErr } = await supabase
        .from('equipment_assignments')
        .update(updatePayload as any)
        .eq('id', a.id);
      if (updErr) throw new Error(updErr.message);

      toast({ title: '✅ Tracking saved' });
      setEditingId(null);
      setEditReceiptFile(null);
      fetchHistory();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message ?? '', variant: 'destructive' });
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            Assignment History
          </DialogTitle>
        </DialogHeader>
        {item && (
          <div className="bg-muted/40 rounded-lg px-3 py-2 text-sm mb-2">
            <span className="text-muted-foreground">{DEVICE_CONFIG_LABELS[item.device_type]}:</span>{' '}
            <span className="font-mono font-semibold">{item.serial_number}</span>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : assignments.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            <History className="h-8 w-8 mx-auto mb-2 opacity-30" />
            No assignment history yet
          </div>
        ) : (
          <div className="space-y-3">
            {assignments.map((a, idx) => {
              const trackingUrl = buildTrackingUrl(a.shipping_carrier, a.tracking_number);
              const isActive = !a.returned_at;
              const isEditing = editingId === a.id;
              return (
                <div key={a.id} className="relative pl-6">
                  {/* Timeline line */}
                  {idx < assignments.length - 1 && (
                    <div className="absolute left-2.5 top-5 bottom-0 w-px bg-border" />
                  )}
                  {/* Timeline dot */}
                  <div className={`absolute left-0 top-1.5 h-5 w-5 rounded-full flex items-center justify-center ${
                    a.returned_at ? 'bg-muted border border-border' : 'bg-primary/10 border border-primary/30'
                  }`}>
                    {a.returned_at
                      ? <RotateCcw className="h-2.5 w-2.5 text-muted-foreground" />
                      : <UserCheck className="h-2.5 w-2.5 text-primary" />
                    }
                  </div>

                  <div className="bg-card border border-border rounded-lg px-3 py-2.5 mb-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm text-foreground">{a.operator_name}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium">Assigned:</span>{' '}
                            {format(parseISO(a.assigned_at), 'MMM d, yyyy')}
                          </p>
                          {a.returned_at && (
                            <p className="text-xs text-muted-foreground">
                              <span className="font-medium">Returned:</span>{' '}
                              {format(parseISO(a.returned_at), 'MMM d, yyyy')}
                            </p>
                          )}
                        </div>
                        {a.assigned_by_name && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Assigned by: {a.assigned_by_name}
                          </p>
                        )}
                        {a.notes && (
                          <p className="text-xs text-muted-foreground mt-1 italic">{a.notes}</p>
                        )}

                        {/* ── Tracking display (when not editing) ── */}
                        {!isEditing && (a.shipping_carrier || a.tracking_number || a.tracking_receipt_url) && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {(a.shipping_carrier || a.tracking_number) && (
                              trackingUrl ? (
                                <a
                                  href={trackingUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/15 transition-colors"
                                >
                                  <Package className="h-3 w-3" />
                                  {a.shipping_carrier ?? 'Shipped'}
                                  {a.tracking_number && <span className="font-mono">· {shortTracking(a.tracking_number)}</span>}
                                  {a.ship_date && <span className="text-muted-foreground">· {format(parseISO(a.ship_date), 'MMM d')}</span>}
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] font-medium text-foreground">
                                  <Package className="h-3 w-3" />
                                  {a.shipping_carrier ?? 'Shipped'}
                                  {a.tracking_number && <span className="font-mono">· {shortTracking(a.tracking_number)}</span>}
                                  {a.ship_date && <span className="text-muted-foreground">· {format(parseISO(a.ship_date), 'MMM d')}</span>}
                                </span>
                              )
                            )}
                            {a.tracking_receipt_url && (
                              <button
                                type="button"
                                onClick={() => setPreviewUrl(a.tracking_receipt_url!)}
                                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted/60 transition-colors"
                              >
                                <FileText className="h-3 w-3 text-primary" />
                                View receipt
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {isActive ? (
                          <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                            Active
                          </Badge>
                        ) : a.return_condition ? (
                          <Badge variant="outline" className={`text-xs ${CONDITION_COLORS[a.return_condition] ?? ''}`}>
                            {a.return_condition === 'available' ? 'Returned OK' :
                             a.return_condition === 'damaged'   ? 'Damaged' : 'Lost'}
                          </Badge>
                        ) : null}
                        {isActive && !isEditing && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px] gap-1"
                            onClick={() => beginEdit(a)}
                          >
                            <Pencil className="h-3 w-3" />
                            {a.tracking_number || a.tracking_receipt_url ? 'Edit' : 'Add'} tracking
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* ── Inline tracking editor ── */}
                    {isEditing && (
                      <div className="mt-3 pt-3 border-t border-border space-y-2.5">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Carrier</Label>
                            <Select value={editCarrier} onValueChange={setEditCarrier}>
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
                              value={editShipDate}
                              onChange={v => setEditShipDate(v)}
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Tracking Number</Label>
                          <Input
                            value={editTracking}
                            onChange={e => setEditTracking(e.target.value)}
                            placeholder="e.g. 1Z999AA10123456784"
                            className="h-8 text-sm font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">
                            Receipt {a.tracking_receipt_url ? '(replace existing)' : '(optional)'}
                          </Label>
                          {editReceiptFile ? (
                            <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                                <span className="truncate">{editReceiptFile.name}</span>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 shrink-0"
                                onClick={() => setEditReceiptFile(null)}
                                aria-label="Remove receipt"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <label className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 cursor-pointer transition-colors">
                              <Upload className="h-3 w-3" />
                              {a.tracking_receipt_url ? 'Replace receipt' : 'Upload receipt'}
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                className="hidden"
                                onChange={e => handleReceiptPick(e.target.files?.[0] ?? null)}
                              />
                            </label>
                          )}
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button
                            size="sm"
                            className="flex-1 h-8 gap-1.5"
                            onClick={() => saveTracking(a)}
                            disabled={savingEdit}
                          >
                            {savingEdit ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Save className="h-3.5 w-3.5" />
                            )}
                            Save
                          </Button>
                          <Button variant="outline" size="sm" className="h-8" onClick={cancelEdit} disabled={savingEdit}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {previewUrl && (
          <FilePreviewModal
            url={previewUrl}
            name="Shipping Receipt"
            onClose={() => setPreviewUrl(null)}
            bucketName="operator-documents"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
