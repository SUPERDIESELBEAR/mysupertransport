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
import { Loader2, Upload } from 'lucide-react';

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
