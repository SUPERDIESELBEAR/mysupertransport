import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { DateInput } from '@/components/ui/date-input';

export interface TruckInspectionDetails {
  inspection_date: string;
  inspection_result: 'pass' | 'fail';
  inspector_name: string | null;
}

interface Props {
  open: boolean;
  fileName?: string;
  onCancel: () => void;
  onConfirm: (details: TruckInspectionDetails) => void;
}

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function TruckInspectionDetailsDialog({ open, fileName, onCancel, onConfirm }: Props) {
  const [date, setDate] = useState('');
  const [result, setResult] = useState<'pass' | 'fail'>('pass');
  const [inspector, setInspector] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDate('');
      setResult('pass');
      setInspector('');
      setError(null);
    }
  }, [open]);

  const submit = () => {
    if (!date) {
      setError('Enter the inspection date shown on the certificate.');
      return;
    }
    if (date > todayIso()) {
      setError('The inspection date cannot be in the future.');
      return;
    }
    onConfirm({
      inspection_date: date,
      inspection_result: result,
      inspector_name: inspector.trim().slice(0, 120) || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Inspection details</DialogTitle>
          <DialogDescription>
            {fileName ? `"${fileName}" — ` : ''}
            These details create the DOT Periodic Inspection record in the Vehicle Hub and set the next due date.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Inspection date <span className="text-destructive">*</span></Label>
            <DateInput value={date} onChange={setDate} error={!!error && !date} />
          </div>

          <div className="space-y-1.5">
            <Label>Result</Label>
            <RadioGroup
              value={result}
              onValueChange={v => setResult(v as 'pass' | 'fail')}
              className="flex gap-6 pt-1"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="pass" id="insp-pass" />
                <Label htmlFor="insp-pass" className="font-normal cursor-pointer">Pass</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="fail" id="insp-fail" />
                <Label htmlFor="insp-fail" className="font-normal cursor-pointer">Fail</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-1.5">
            <Label>Inspector / shop <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              value={inspector}
              maxLength={120}
              placeholder="e.g. Midwest Truck Service"
              onChange={e => setInspector(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={submit}>Upload inspection</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}