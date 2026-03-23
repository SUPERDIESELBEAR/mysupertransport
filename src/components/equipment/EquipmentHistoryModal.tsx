import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, UserCheck, RotateCcw, History } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { EquipmentItem } from './EquipmentInventory';
import { DEVICE_CONFIG_LABELS } from './equipmentUtils';

interface Assignment {
  id: string;
  assigned_at: string;
  returned_at: string | null;
  return_condition: string | null;
  notes: string | null;
  operator_name: string;
  assigned_by_name: string | null;
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
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !item) return;
    fetchHistory();
  }, [open, item]);

  const fetchHistory = async () => {
    if (!item) return;
    setLoading(true);
    const { data } = await supabase
      .from('equipment_assignments')
      .select(`
        id, assigned_at, returned_at, return_condition, notes,
        operator_id,
        operators!inner(
          application_id,
          applications(first_name, last_name)
        ),
        assigned_by
      `)
      .eq('equipment_id', item.id)
      .order('assigned_at', { ascending: false });

    if (data) {
      // Resolve assigned_by names via profiles
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
          assigned_at: a.assigned_at,
          returned_at: a.returned_at,
          return_condition: a.return_condition,
          notes: a.notes,
          operator_name: [app?.first_name, app?.last_name].filter(Boolean).join(' ') || 'Unknown Operator',
          assigned_by_name: a.assigned_by ? (profileMap[a.assigned_by] ?? null) : null,
        };
      }));
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
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
            {assignments.map((a, idx) => (
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
                    <div>
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
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {!a.returned_at ? (
                        <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                          Active
                        </Badge>
                      ) : a.return_condition ? (
                        <Badge variant="outline" className={`text-xs ${CONDITION_COLORS[a.return_condition] ?? ''}`}>
                          {a.return_condition === 'available' ? 'Returned OK' :
                           a.return_condition === 'damaged'   ? 'Damaged' : 'Lost'}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
