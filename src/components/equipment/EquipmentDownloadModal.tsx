import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Download, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { EquipmentItem } from './EquipmentInventory';
import {
  type ExportScope, SCOPE_LABEL, buildExportRows,
  downloadCsv, openEquipmentPdf,
} from '@/lib/equipmentExport';

type Format = 'csv' | 'pdf';

const SCOPE_OPTIONS: { value: ExportScope; label: string }[] = [
  { value: 'eld', label: SCOPE_LABEL.eld + ' only' },
  { value: 'dash_cam', label: SCOPE_LABEL.dash_cam + ' only' },
  { value: 'eld_dash_cam', label: SCOPE_LABEL.eld_dash_cam },
  { value: 'fuel_card', label: SCOPE_LABEL.fuel_card + ' only' },
];

export default function EquipmentDownloadModal({
  open, onClose,
}: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [scope, setScope] = useState<ExportScope>('eld');
  const [format, setFormat] = useState<Format>('csv');
  const [busy, setBusy] = useState(false);

  async function fetchAll(): Promise<EquipmentItem[]> {
    const { data: itemsData, error } = await supabase
      .from('equipment_items')
      .select('*')
      .order('device_type')
      .order('serial_number');
    if (error) throw error;

    const { data: assignments } = await supabase
      .from('equipment_assignments')
      .select(`
        id,
        equipment_id,
        operator_id,
        operators!inner(
          application_id,
          applications(first_name, last_name)
        )
      `)
      .is('returned_at', null);

    const map: Record<string, { name: string; assignmentId: string }> = {};
    for (const a of (assignments ?? []) as any[]) {
      const app = a.operators?.applications;
      const name = [app?.first_name, app?.last_name].filter(Boolean).join(' ') || 'Unknown Operator';
      map[a.equipment_id] = { name, assignmentId: a.id };
    }

    return (itemsData ?? []).map((item: any) => ({
      ...item,
      current_operator_name: map[item.id]?.name ?? null,
      current_assignment_id: map[item.id]?.assignmentId ?? null,
    })) as EquipmentItem[];
  }

  async function handleDownload() {
    setBusy(true);
    try {
      const items = await fetchAll();
      const rows = buildExportRows(items, scope);
      if (rows.length === 0) {
        toast({
          title: 'No devices to export',
          description: `There are no ${SCOPE_LABEL[scope]} in the inventory.`,
        });
        setBusy(false);
        return;
      }
      if (format === 'csv') {
        downloadCsv(scope, rows);
        toast({ title: 'CSV download started', description: `${rows.length} device${rows.length === 1 ? '' : 's'} exported.` });
      } else {
        openEquipmentPdf(scope, rows);
      }
      onClose();
    } catch (e: any) {
      toast({
        title: 'Export failed',
        description: e?.message ?? 'Unable to load equipment data.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Download Equipment List</DialogTitle>
          <DialogDescription>
            Exports every device of the selected type(s), regardless of any filters currently applied on screen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div>
            <Label className="text-sm font-semibold mb-2 block">What to include</Label>
            <RadioGroup value={scope} onValueChange={(v) => setScope(v as ExportScope)} className="gap-2">
              {SCOPE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  htmlFor={`scope-${opt.value}`}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-muted/40 has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5"
                >
                  <RadioGroupItem id={`scope-${opt.value}`} value={opt.value} />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div>
            <Label className="text-sm font-semibold mb-2 block">Format</Label>
            <RadioGroup value={format} onValueChange={(v) => setFormat(v as Format)} className="grid grid-cols-2 gap-2">
              {(['csv', 'pdf'] as const).map((f) => (
                <label
                  key={f}
                  htmlFor={`fmt-${f}`}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-muted/40 has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5"
                >
                  <RadioGroupItem id={`fmt-${f}`} value={f} />
                  <span className="text-sm uppercase">{f}</span>
                </label>
              ))}
            </RadioGroup>
            <p className="text-xs text-muted-foreground mt-2">
              {format === 'csv'
                ? 'Spreadsheet file that opens in Excel or Google Sheets.'
                : 'Opens a printable view — use your browser\'s "Save as PDF" option.'}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleDownload} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}