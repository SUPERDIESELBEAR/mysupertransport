import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { DateInput } from '@/components/ui/date-input';
import { useToast } from '@/hooks/use-toast';
import { validateFile } from '@/lib/validateFile';
import { Loader2, Sparkles, Paperclip, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const CATEGORY_OPTIONS = [
  { value: 'pm_service', label: 'PM Service' },
  { value: 'general_repair', label: 'General Repair' },
  { value: 'tires', label: 'Tires' },
];

interface MaintenanceRecordModalProps {
  open: boolean;
  onClose: () => void;
  operatorId: string;
  onSaved: () => void;
}

export default function MaintenanceRecordModal({ open, onClose, operatorId, onSaved }: MaintenanceRecordModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [aiFilled, setAiFilled] = useState(false);
  const [aiMissing, setAiMissing] = useState<string[]>([]);
  const [aiFilledFields, setAiFilledFields] = useState<string[]>([]);
  const [attachedFromAi, setAttachedFromAi] = useState(false);

  const [serviceDate, setServiceDate] = useState('');
  const [odometer, setOdometer] = useState('');
  const [shopName, setShopName] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);

  const toggleCategory = (val: string) => {
    setCategories(prev => prev.includes(val) ? prev.filter(c => c !== val) : [...prev, val]);
  };

  const reset = () => {
    setServiceDate('');
    setOdometer('');
    setShopName('');
    setAmount('');
    setDescription('');
    setInvoiceNumber('');
    setCategories([]);
    setNotes('');
    setInvoiceFile(null);
    setAiFilled(false);
    setAiMissing([]);
    setAiFilledFields([]);
    setAttachedFromAi(false);
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

  const isoToMdY = (iso: string): string => {
    // DateInput expects MM/DD/YYYY
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return '';
    return `${m[2]}/${m[3]}/${m[1]}`;
  };

  const handleScanInvoice = async (file: File) => {
    const validation = validateFile(file);
    if (!validation.valid) {
      toast({ title: 'Invalid file', description: validation.error, variant: 'destructive' });
      return;
    }
    setScanning(true);
    try {
      const base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke('parse-maintenance-invoice', {
        body: { file_base64: base64, mime_type: file.type, file_name: file.name },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const filled: string[] = [];
      const missing: string[] = [];
      if (data?.service_date) { setServiceDate(isoToMdY(data.service_date)); filled.push('Service Date'); } else missing.push('Service Date');
      if (typeof data?.odometer === 'number') { setOdometer(String(data.odometer)); filled.push('Odometer'); } else missing.push('Odometer');
      if (data?.shop_name) { setShopName(data.shop_name); filled.push('Shop'); } else missing.push('Shop');
      if (typeof data?.amount === 'number') { setAmount(String(data.amount)); filled.push('Amount'); } else missing.push('Amount');
      if (data?.invoice_number) { setInvoiceNumber(data.invoice_number); filled.push('Invoice #'); } else missing.push('Invoice #');
      if (Array.isArray(data?.categories) && data.categories.length > 0) { setCategories(data.categories); filled.push('Category'); } else missing.push('Category');
      if (data?.description) { setDescription(data.description); filled.push('Description'); } else missing.push('Description');

      setInvoiceFile(file);
      setAttachedFromAi(true);
      setAiFilled(true);
      setAiFilledFields(filled);
      setAiMissing(missing);
      toast({ title: 'Invoice scanned', description: 'Review the prefilled fields before saving.' });
    } catch (err: any) {
      toast({
        title: 'Could not read invoice',
        description: err?.message ?? 'Please fill the form manually.',
        variant: 'destructive',
      });
    } finally {
      setScanning(false);
    }
  };

  const handleSave = async () => {
    if (!serviceDate) {
      toast({ title: 'Service date is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      let invoiceFilePath: string | null = null;
      let invoiceFileName: string | null = null;

      if (invoiceFile) {
        const validation = validateFile(invoiceFile);
        if (!validation.valid) {
          toast({ title: 'Invalid file', description: validation.error, variant: 'destructive' });
          setSaving(false);
          return;
        }
        const ext = invoiceFile.name.split('.').pop()?.toLowerCase() || 'bin';
        invoiceFilePath = `${operatorId}/maintenance/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('fleet-documents')
          .upload(invoiceFilePath, invoiceFile, { upsert: true });
        if (uploadErr) throw uploadErr;
        invoiceFileName = invoiceFile.name;
      }

      const { error } = await supabase.from('truck_maintenance_records').insert({
        operator_id: operatorId,
        service_date: serviceDate,
        odometer: odometer ? parseInt(odometer) : null,
        shop_name: shopName.trim() || null,
        amount: amount ? parseFloat(amount) : null,
        description: description.trim() || null,
        invoice_number: invoiceNumber.trim() || null,
        categories,
        invoice_file_path: invoiceFilePath,
        invoice_file_name: invoiceFileName,
        notes: notes.trim() || null,
        created_by: user?.id ?? null,
      });

      if (error) throw error;
      toast({ title: 'Maintenance record saved' });
      reset();
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Maintenance Record</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between rounded-md border border-dashed border-[#C9A84C]/60 bg-[#C9A84C]/5 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-[#0D0D0D]">
              <Sparkles className="h-3.5 w-3.5 text-[#C9A84C]" />
              <span>Scan an invoice with AI to auto-fill the fields.</span>
            </div>
            <label className="inline-flex">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.heic,.heif"
                className="hidden"
                disabled={scanning}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) handleScanInvoice(f);
                }}
              />
              <span
                className={`inline-flex h-7 items-center gap-1.5 rounded-md border border-[#C9A84C] bg-white px-2.5 text-xs font-medium text-[#0D0D0D] cursor-pointer hover:bg-[#C9A84C]/10 ${scanning ? 'opacity-60 pointer-events-none' : ''}`}
              >
                {scanning ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Reading invoice…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Scan invoice with AI
                  </>
                )}
              </span>
            </label>
          </div>
          {aiFilled && (
            <Badge variant="outline" className="border-[#C9A84C] text-[#0D0D0D] bg-[#C9A84C]/10 text-[10px]">
              Filled by AI — please review
            </Badge>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Service Date *</Label>
              <DateInput value={serviceDate} onChange={setServiceDate} placeholder="MM/DD/YYYY" className="h-9 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Odometer</Label>
              <Input type="number" className="h-9 text-xs" placeholder="Miles" value={odometer} onChange={e => setOdometer(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Shop Name</Label>
              <Input className="h-9 text-xs" value={shopName} onChange={e => setShopName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Amount ($)</Label>
              <Input type="number" step="0.01" className="h-9 text-xs" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="text-xs">Description of Work</Label>
            <Textarea className="text-xs min-h-[60px]" value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          <div>
            <Label className="text-xs">Invoice #</Label>
            <Input className="h-9 text-xs" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
          </div>

          <div>
            <Label className="text-xs mb-2 block">Category</Label>
            <div className="flex gap-4">
              {CATEGORY_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox
                    checked={categories.includes(opt.value)}
                    onCheckedChange={() => toggleCategory(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Upload Invoice</Label>
            <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif" className="text-xs h-9" onChange={e => setInvoiceFile(e.target.files?.[0] ?? null)} />
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Input className="h-9 text-xs" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save Record
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
