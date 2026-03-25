import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Loader2, Truck, AlertTriangle, RefreshCcw, UserCheck } from 'lucide-react';
import type { MoPlate } from './MoPlateFormModal';

type Assignment = {
  id: string;
  driver_name: string;
  unit_number: string | null;
  event_type: 'assignment' | 'lost_stolen' | 'replacement_received';
  assigned_at: string;
  returned_at: string | null;
  notes: string | null;
  operator_id: string | null;
};

interface Props {
  open: boolean;
  onClose: () => void;
  plate: MoPlate | null;
}

const EVENT_CONFIG = {
  assignment: {
    icon: <Truck className="h-3.5 w-3.5" />,
    dot: 'bg-primary',
    label: 'ASSIGNED',
    labelClass: 'text-primary',
  },
  lost_stolen: {
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    dot: 'bg-destructive',
    label: 'LOST / STOLEN',
    labelClass: 'text-destructive',
  },
  replacement_received: {
    icon: <RefreshCcw className="h-3.5 w-3.5" />,
    dot: 'bg-status-complete',
    label: 'REPLACEMENT REC\'D',
    labelClass: 'text-status-complete',
  },
};

export default function MoPlateHistoryModal({ open, onClose, plate }: Props) {
  const [loading, setLoading] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  useEffect(() => {
    if (!open || !plate) return;
    setLoading(true);
    supabase
      .from('mo_plate_assignments')
      .select('id, driver_name, unit_number, event_type, assigned_at, returned_at, notes, operator_id')
      .eq('plate_id', plate.id)
      .order('assigned_at', { ascending: false })
      .then(({ data }) => {
        setAssignments((data as Assignment[]) ?? []);
        setLoading(false);
      });
  }, [open, plate]);

  if (!plate) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono text-lg">{plate.plate_number}</span>
            <span className="text-muted-foreground font-normal text-sm">— History</span>
          </DialogTitle>
          {plate.registration_number && (
            <p className="text-xs text-muted-foreground mt-0.5">Reg #{plate.registration_number}</p>
          )}
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : assignments.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            <UserCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />
            No history yet for this plate.
          </div>
        ) : (
          <div className="relative mt-2">
            {/* vertical line */}
            <div className="absolute left-3.5 top-2 bottom-2 w-px bg-border" />
            <div className="space-y-5 pl-10">
              {assignments.map((a) => {
                const cfg = EVENT_CONFIG[a.event_type] ?? EVENT_CONFIG.assignment;
                const isCurrent = a.event_type === 'assignment' && !a.returned_at;
                return (
                  <div key={a.id} className="relative">
                    {/* dot */}
                    <span className={`absolute -left-6 top-1 h-3 w-3 rounded-full border-2 border-background ${cfg.dot}`} />
                    <div className="bg-muted/40 border border-border rounded-lg p-3 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`flex items-center gap-1 text-[10px] font-bold tracking-wider uppercase ${cfg.labelClass}`}>
                          {cfg.icon}
                          {cfg.label}
                        </span>
                        {isCurrent && (
                          <span className="text-[9px] font-semibold bg-primary/15 text-primary border border-primary/30 rounded px-1.5 py-0.5 uppercase tracking-wide">Currently Assigned</span>
                        )}
                      </div>

                      {a.event_type === 'assignment' && (
                        <p className="text-sm font-semibold text-foreground">{a.driver_name}</p>
                      )}
                      {a.unit_number && (
                        <p className="text-xs text-muted-foreground">Unit #{a.unit_number}</p>
                      )}

                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <p>
                          <span className="font-medium text-foreground/70">
                            {a.event_type === 'assignment' ? 'Assigned:' :
                             a.event_type === 'lost_stolen' ? 'Reported:' : 'Received:'}
                          </span>{' '}
                          {format(new Date(a.assigned_at), 'MMM d, yyyy')}
                        </p>
                        {a.returned_at && a.event_type === 'assignment' && (
                          <p>
                            <span className="font-medium text-foreground/70">Returned:</span>{' '}
                            {format(new Date(a.returned_at), 'MMM d, yyyy')}
                          </p>
                        )}
                      </div>

                      {a.notes && (
                        <p className="text-xs text-muted-foreground italic border-t border-border/50 pt-1 mt-1">"{a.notes}"</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
