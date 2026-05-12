import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateInput } from '@/components/ui/date-input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { validateFile } from '@/lib/validateFile';
import { Loader2, Settings2 } from 'lucide-react';

interface DOTInspectionModalProps {
  open: boolean;
  onClose: () => void;
  operatorId: string;
  onSaved: () => void;
  /** When provided, the modal opens in edit mode and updates this row instead of inserting. */
  existingInspection?: {
    id: string;
    inspection_date: string;
    reminder_interval: number;
    inspector_name: string | null;
    location: string | null;
    result: string;
    notes: string | null;
    certificate_file_path: string | null;
    certificate_file_name: string | null;
  } | null;
}

const INTERVALS = [
  { value: '90', label: '90 Days' },
  { value: '180', label: '180 Days' },
  { value: '270', label: '270 Days' },
  { value: '360', label: '360 Days' },
];

const RESULTS = [
  { value: 'pass', label: 'Pass' },
  { value: 'fail', label: 'Fail' },
  { value: 'conditional', label: 'Conditional' },
];

export default function DOTInspectionModal({ open, onClose, operatorId, onSaved, existingInspection }: DOTInspectionModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [inspectionDate, setInspectionDate] = useState('');
  const [reminderInterval, setReminderInterval] = useState('360');
  const [inspectorName, setInspectorName] = useState('');
  const [location, setLocation] = useState('');
  const [result, setResult] = useState('pass');
  const [notes, setNotes] = useState('');
  const [certFile, setCertFile] = useState<File | null>(null);
  const [fleetDefault, setFleetDefault] = useState<number | null>(null);

  const isEdit = !!existingInspection;

  // Load fleet-wide default interval when the modal opens; pre-select it.
  useEffect(() => {
    if (!open) return;
    // In edit mode, hydrate fields from the existing row and skip fleet-default override.
    if (existingInspection) {
      setInspectionDate(existingInspection.inspection_date);
      setReminderInterval(String(existingInspection.reminder_interval));
      setInspectorName(existingInspection.inspector_name ?? '');
      setLocation(existingInspection.location ?? '');
      setResult(existingInspection.result);
      setNotes(existingInspection.notes ?? '');
      setCertFile(null);
    }
    let cancelled = false;
    supabase
      .from('fleet_settings')
      .select('default_dot_reminder_interval_days')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const val = data?.default_dot_reminder_interval_days ?? 360;
        setFleetDefault(val);
        if (!existingInspection) setReminderInterval(String(val));
      });
    return () => { cancelled = true; };
  }, [open, existingInspection]);

  const reset = () => {
    setInspectionDate('');
    setReminderInterval(String(fleetDefault ?? 360));
    setInspectorName('');
    setLocation('');
    setResult('pass');
    setNotes('');
    setCertFile(null);
  };

  const handleSave = async () => {
    if (!inspectionDate) {
      toast({ title: 'Inspection date is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      let certFilePath: string | null = null;
      let certFileName: string | null = null;

      if (certFile) {
        const validation = validateFile(certFile);
        if (!validation.valid) {
          toast({ title: 'Invalid file', description: validation.error, variant: 'destructive' });
          setSaving(false);
          return;
        }
        const ext = certFile.name.split('.').pop()?.toLowerCase() || 'bin';
        certFilePath = `${operatorId}/dot/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('fleet-documents')
          .upload(certFilePath, certFile, { upsert: true });
        if (uploadErr) throw uploadErr;
        certFileName = certFile.name;
      }

      if (isEdit && existingInspection) {
        const updates: any = {
          inspection_date: inspectionDate,
          reminder_interval: parseInt(reminderInterval),
          inspector_name: inspectorName.trim() || null,
          location: location.trim() || null,
          result,
          notes: notes.trim() || null,
        };
        // Only overwrite certificate when a new file was uploaded.
        if (certFile) {
          updates.certificate_file_path = certFilePath;
          updates.certificate_file_name = certFileName;
        }
        const { error } = await supabase
          .from('truck_dot_inspections')
          .update(updates)
          .eq('id', existingInspection.id);
        if (error) throw error;
        toast({ title: 'DOT inspection updated' });
      } else {
        const { error } = await supabase.from('truck_dot_inspections').insert({
          operator_id: operatorId,
          inspection_date: inspectionDate,
          reminder_interval: parseInt(reminderInterval),
          inspector_name: inspectorName.trim() || null,
          location: location.trim() || null,
          result,
          certificate_file_path: certFilePath,
          certificate_file_name: certFileName,
          notes: notes.trim() || null,
          created_by: user?.id ?? null,
        });
        if (error) throw error;
        toast({ title: 'DOT inspection recorded' });
      }
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
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit DOT Inspection' : 'Add DOT Inspection'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <Label className="text-xs">Inspection Date *</Label>
            <DateInput value={inspectionDate} onChange={setInspectionDate} placeholder="MM/DD/YYYY" className="h-9 text-xs" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Inspector Name</Label>
              <Input className="h-9 text-xs" value={inspectorName} onChange={e => setInspectorName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Location</Label>
              <Input className="h-9 text-xs" value={location} onChange={e => setLocation(e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="text-xs mb-2 block">Result</Label>
            <RadioGroup value={result} onValueChange={setResult} className="flex gap-4">
              {RESULTS.map(r => (
                <label key={r.value} className="flex items-center gap-2 text-xs cursor-pointer">
                  <RadioGroupItem value={r.value} />
                  {r.label}
                </label>
              ))}
            </RadioGroup>
          </div>

          <div>
            <Label className="text-xs mb-2 block">Reminder Interval</Label>
            {fleetDefault !== null && (
              <p className="text-[10px] text-muted-foreground mb-1.5 flex items-center gap-1">
                <Settings2 className="h-3 w-3" />
                Fleet default: {fleetDefault} days · override per truck below
              </p>
            )}
            <RadioGroup value={reminderInterval} onValueChange={setReminderInterval} className="grid grid-cols-2 gap-2">
              {INTERVALS.map(i => (
                <label key={i.value} className="flex items-center gap-2 text-xs cursor-pointer border border-border rounded-lg px-3 py-2 hover:bg-muted/30 transition-colors">
                  <RadioGroupItem value={i.value} />
                  {i.label}
                </label>
              ))}
            </RadioGroup>
          </div>

          <div>
            <Label className="text-xs">
              {isEdit && existingInspection?.certificate_file_name
                ? `Replace Certificate (current: ${existingInspection.certificate_file_name})`
                : 'Upload Certificate'}
            </Label>
            <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif" className="text-xs h-9" onChange={e => setCertFile(e.target.files?.[0] ?? null)} />
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Input className="h-9 text-xs" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Save Inspection'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
