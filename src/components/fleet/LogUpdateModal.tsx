import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DateInput } from '@/components/ui/date-input';
import { useToast } from '@/hooks/use-toast';
import { Wrench, ShieldCheck, NotebookPen, Loader2, ArrowLeft } from 'lucide-react';
import MaintenanceRecordModal from './MaintenanceRecordModal';
import DOTInspectionModal from './DOTInspectionModal';

interface LogUpdateModalProps {
  open: boolean;
  onClose: () => void;
  operatorId: string;
  driverName: string;
  onSaved: () => void;
}

type Mode = 'choose' | 'maintenance' | 'inspection' | 'note';

export default function LogUpdateModal({ open, onClose, operatorId, driverName, onSaved }: LogUpdateModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('choose');
  const [noteDate, setNoteDate] = useState('');
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setMode('choose');
    setNoteDate('');
    setNoteText('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSaveNote = async () => {
    if (!noteDate || !noteText.trim()) {
      toast({ title: 'Date and note are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('truck_maintenance_records').insert({
        operator_id: operatorId,
        service_date: noteDate,
        amount: 0,
        description: noteText.trim(),
        categories: ['note'],
        notes: noteText.trim(),
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      toast({ title: 'Note logged' });
      onSaved();
      handleClose();
    } catch (err: unknown) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // Sub-modals (rendered when their mode is active) — they manage their own dialog shell.
  if (mode === 'maintenance') {
    return (
      <MaintenanceRecordModal
        open={open}
        onClose={handleClose}
        operatorId={operatorId}
        onSaved={() => { onSaved(); }}
      />
    );
  }

  if (mode === 'inspection') {
    return (
      <DOTInspectionModal
        open={open}
        onClose={handleClose}
        operatorId={operatorId}
        onSaved={() => { onSaved(); }}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'note' && (
              <button onClick={() => setMode('choose')} className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            Log Update
            <span className="text-xs font-normal text-muted-foreground">· {driverName}</span>
          </DialogTitle>
        </DialogHeader>

        {mode === 'choose' && (
          <div className="grid grid-cols-1 gap-2 pt-1">
            <button
              onClick={() => setMode('maintenance')}
              className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/30 transition-colors text-left"
            >
              <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <Wrench className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">Repair / Maintenance</div>
                <div className="text-xs text-muted-foreground">Log a repair cost, PM service, tires, or other work.</div>
              </div>
            </button>
            <button
              onClick={() => setMode('inspection')}
              className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/30 transition-colors text-left"
            >
              <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <ShieldCheck className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">DOT Inspection</div>
                <div className="text-xs text-muted-foreground">Record an inspection with result and next due date.</div>
              </div>
            </button>
            <button
              onClick={() => setMode('note')}
              className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/30 transition-colors text-left"
            >
              <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <NotebookPen className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">Quick Note</div>
                <div className="text-xs text-muted-foreground">Capture a short status or observation in maintenance history.</div>
              </div>
            </button>
          </div>
        )}

        {mode === 'note' && (
          <div className="space-y-3 pt-1">
            <div>
              <Label className="text-xs">Date *</Label>
              <DateInput value={noteDate} onChange={setNoteDate} placeholder="MM/DD/YYYY" className="h-9 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Note *</Label>
              <Textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="e.g. Tire pressure low on PS rear; driver topped up at TA."
                className="text-xs min-h-[80px]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={handleClose} disabled={saving}>Cancel</Button>
              <Button size="sm" onClick={handleSaveNote} disabled={saving} className="gap-1.5">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save Note
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}