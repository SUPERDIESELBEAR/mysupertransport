import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import {
  Plus, Search, Loader2, Car, CheckCircle2, UserCheck,
  AlertTriangle, Archive, History, Pencil, RotateCcw,
  RefreshCcw, Trash2, UserX, CalendarClock, ArrowLeftRight, User, Hash,
} from 'lucide-react';

// ── Expiry helpers (mirrors Inspection Binder logic) ──────────────────────────
function getExpiryStatus(expiresAt: string | null): 'valid' | 'expiring_soon' | 'expired' | null {
  if (!expiresAt) return null;
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
  if (days < 0) return 'expired';
  if (days <= 30) return 'expiring_soon';
  return 'valid';
}

function daysUntilExpiry(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
}
import MoPlateFormModal, { type MoPlate } from './MoPlateFormModal';
import MoPlateAssignModal from './MoPlateAssignModal';
import MoPlateHistoryModal from './MoPlateHistoryModal';

type PlateWithAssignee = MoPlate & {
  current_driver?: string | null;
  current_driver_unit?: string | null;
  assigned_since?: string | null;
  lost_since?: string | null;
};

type StatusFilter = 'all' | 'available' | 'assigned' | 'lost_stolen' | 'retired';

const STATUS_CONFIG: Record<string, { label: string; badge: string; icon: JSX.Element }> = {
  available:    { label: 'Available',    badge: 'bg-status-complete/15 text-status-complete border-status-complete/30',   icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  assigned:     { label: 'Assigned',     badge: 'bg-primary/15 text-primary border-primary/30',                           icon: <UserCheck className="h-3.5 w-3.5" /> },
  lost_stolen:  { label: 'Lost/Stolen',  badge: 'bg-destructive/15 text-destructive border-destructive/30',               icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  retired:      { label: 'Retired',      badge: 'bg-muted text-muted-foreground border-border',                           icon: <Archive className="h-3.5 w-3.5" /> },
};

export default function MoPlateRegistry() {
  const { toast } = useToast();
  const { session } = useAuth();
  const [plates, setPlates] = useState<PlateWithAssignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [editPlate, setEditPlate] = useState<MoPlate | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignPlate, setAssignPlate] = useState<MoPlate | null>(null);
  const [transferFromDriver, setTransferFromDriver] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPlate, setHistoryPlate] = useState<MoPlate | null>(null);

  // Return dialog
  const [returnDialogPlate, setReturnDialogPlate] = useState<PlateWithAssignee | null>(null);
  const [returnNotes, setReturnNotes] = useState('');
  const [returnLoading, setReturnLoading] = useState(false);

  // Lost/stolen dialog
  const [lostDialogPlate, setLostDialogPlate] = useState<PlateWithAssignee | null>(null);
  const [lostNotes, setLostNotes] = useState('');
  const [lostLoading, setLostLoading] = useState(false);

  // Replacement dialog
  const [replacementDialogPlate, setReplacementDialogPlate] = useState<PlateWithAssignee | null>(null);
  const [replacementLoading, setReplacementLoading] = useState(false);

  // Delete dialog
  const [deleteDialogPlate, setDeleteDialogPlate] = useState<PlateWithAssignee | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchPlates = useCallback(async () => {
    setLoading(true);
    const { data: platesData } = await supabase
      .from('mo_plates')
      .select('*')
      .order('created_at', { ascending: false });

    if (!platesData) { setLoading(false); return; }

    // Fetch open assignments for all plates at once
    const plateIds = platesData.map((p: any) => p.id);
    const { data: openAssignments } = await supabase
      .from('mo_plate_assignments')
      .select('plate_id, driver_name, unit_number, event_type, assigned_at')
      .in('plate_id', plateIds)
      .is('returned_at', null);

    // Build a map of plate_id → open event
    const openMap: Record<string, any> = {};
    for (const a of (openAssignments ?? [])) {
      openMap[a.plate_id] = a;
    }

    const enriched: PlateWithAssignee[] = platesData.map((p: any) => {
      const open = openMap[p.id];
      return {
        ...p,
        current_driver: open?.event_type === 'assignment' ? open.driver_name : null,
        current_driver_unit: open?.unit_number ?? null,
        assigned_since: open?.event_type === 'assignment' ? open.assigned_at : null,
        lost_since: open?.event_type === 'lost_stolen' ? open.assigned_at : null,
      };
    });

    setPlates(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPlates(); }, [fetchPlates]);

  // ---------- RETURN ----------
  const handleReturn = async () => {
    if (!returnDialogPlate) return;
    setReturnLoading(true);
    try {
      await supabase
        .from('mo_plate_assignments')
        .update({ returned_at: new Date().toISOString(), returned_by: session?.user?.id, notes: returnNotes.trim() || null })
        .eq('plate_id', returnDialogPlate.id)
        .is('returned_at', null)
        .eq('event_type', 'assignment');
      await supabase.from('mo_plates').update({ status: 'available' }).eq('id', returnDialogPlate.id);
      toast({ title: 'Plate returned', description: `${returnDialogPlate.plate_number} is now available.` });
      setReturnDialogPlate(null);
      setReturnNotes('');
      fetchPlates();
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setReturnLoading(false);
    }
  };

  // ---------- LOST / STOLEN ----------
  const handleMarkLost = async () => {
    if (!lostDialogPlate) return;
    setLostLoading(true);
    try {
      // Close open assignment if exists
      if (lostDialogPlate.status === 'assigned') {
        await supabase
          .from('mo_plate_assignments')
          .update({ returned_at: new Date().toISOString(), returned_by: session?.user?.id })
          .eq('plate_id', lostDialogPlate.id)
          .is('returned_at', null)
          .eq('event_type', 'assignment');
      }
      // Insert lost/stolen event
      await supabase.from('mo_plate_assignments').insert({
        plate_id: lostDialogPlate.id,
        driver_name: 'LOST/STOLEN',
        event_type: 'lost_stolen',
        notes: lostNotes.trim() || null,
        assigned_by: session?.user?.id,
      });
      await supabase.from('mo_plates').update({ status: 'lost_stolen' }).eq('id', lostDialogPlate.id);
      toast({ title: 'Marked as lost/stolen', description: `${lostDialogPlate.plate_number} has been flagged.` });
      setLostDialogPlate(null);
      setLostNotes('');
      fetchPlates();
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setLostLoading(false);
    }
  };

  // ---------- REPLACEMENT RECEIVED ----------
  const handleReplacementReceived = async () => {
    if (!replacementDialogPlate) return;
    setReplacementLoading(true);
    try {
      // Close lost/stolen event
      await supabase
        .from('mo_plate_assignments')
        .update({ returned_at: new Date().toISOString(), returned_by: session?.user?.id })
        .eq('plate_id', replacementDialogPlate.id)
        .is('returned_at', null)
        .eq('event_type', 'lost_stolen');
      // Insert replacement_received event
      await supabase.from('mo_plate_assignments').insert({
        plate_id: replacementDialogPlate.id,
        driver_name: 'REPLACEMENT',
        event_type: 'replacement_received',
        notes: 'Replacement plate received from MO — same number',
        assigned_by: session?.user?.id,
        returned_at: new Date().toISOString(),
      });
      await supabase.from('mo_plates').update({ status: 'available' }).eq('id', replacementDialogPlate.id);
      toast({ title: 'Replacement received', description: `${replacementDialogPlate.plate_number} is now available again.` });
      setReplacementDialogPlate(null);
      fetchPlates();
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setReplacementLoading(false);
    }
  };

  // ---------- RETIRE / REACTIVATE ----------
  const handleSetStatus = async (plate: PlateWithAssignee, newStatus: 'retired' | 'available') => {
    await supabase.from('mo_plates').update({ status: newStatus }).eq('id', plate.id);
    toast({ title: newStatus === 'retired' ? 'Plate retired' : 'Plate reactivated' });
    fetchPlates();
  };

  // ---------- DELETE ----------
  const handleDelete = async () => {
    if (!deleteDialogPlate) return;
    setDeleteLoading(true);
    await supabase.from('mo_plates').delete().eq('id', deleteDialogPlate.id);
    toast({ title: 'Plate deleted' });
    setDeleteDialogPlate(null);
    setDeleteLoading(false);
    fetchPlates();
  };

  // ---------- FILTER ----------
  const displayed = plates.filter(p => {
    const matchFilter = filter === 'all' || p.status === filter;
    const matchSearch = !search ||
      p.plate_number.toLowerCase().includes(search.toLowerCase()) ||
      (p.registration_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (p.current_driver ?? '').toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const counts = {
    all: plates.length,
    available: plates.filter(p => p.status === 'available').length,
    assigned: plates.filter(p => p.status === 'assigned').length,
    lost_stolen: plates.filter(p => p.status === 'lost_stolen').length,
    retired: plates.filter(p => p.status === 'retired').length,
    expiring_soon: plates.filter(p => getExpiryStatus(p.expires_at) === 'expiring_soon' || getExpiryStatus(p.expires_at) === 'expired').length,
  };

  const FILTERS: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all',         label: 'All',          count: counts.all },
    { key: 'available',   label: 'Available',     count: counts.available },
    { key: 'assigned',    label: 'Assigned',      count: counts.assigned },
    { key: 'lost_stolen', label: 'Lost/Stolen',   count: counts.lost_stolen },
    { key: 'retired',     label: 'Retired',       count: counts.retired },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Car className="h-5 w-5 text-primary" />
            MO Plate Registry
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track Missouri-issued registrations and plates as they move between drivers.
          </p>
        </div>
        <Button onClick={() => { setEditPlate(null); setFormOpen(true); }} className="gap-1.5 shrink-0">
          <Plus className="h-4 w-4" />
          Add Plate
        </Button>
      </div>

      {/* Summary counts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
          { label: 'Total Plates',   value: counts.all,          color: 'text-foreground',         bg: 'bg-muted/50' },
          { label: 'Assigned',       value: counts.assigned,     color: 'text-primary',            bg: 'bg-primary/8' },
          { label: 'Available',      value: counts.available,    color: 'text-status-complete',    bg: 'bg-status-complete/10' },
          { label: 'Exp. / Renewing',value: counts.expiring_soon,color: 'text-status-warning',     bg: 'bg-status-warning/10' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border border-border p-3 sm:p-4 ${s.bg}`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`text-xs px-2.5 py-1.5 rounded-lg font-medium border transition-colors ${
                filter === f.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
              }`}
            >
              {f.label}
              {f.count > 0 && (
                <span className={`ml-1.5 text-[10px] px-1 py-0.5 rounded-full ${filter === f.key ? 'bg-white/20' : 'bg-muted'}`}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search plate or driver…"
            className="pl-8 h-8 text-sm w-full sm:w-56"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Plate cards */}
      {loading ? (
        <div className="flex justify-center py-14">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-14 text-muted-foreground">
          <Car className="h-10 w-10 mx-auto mb-3 opacity-25" />
          <p className="font-medium">No plates found</p>
          <p className="text-sm mt-1">
            {plates.length === 0 ? 'Add your first MO plate to get started.' : 'Try adjusting your search or filter.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {displayed.map(plate => {
            const cfg = STATUS_CONFIG[plate.status] ?? STATUS_CONFIG.available;
            return (
              <div key={plate.id} className="bg-card border border-border rounded-xl shadow-sm hover:shadow-md transition-shadow p-4 space-y-3">
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono font-bold text-lg text-foreground tracking-wider">{plate.plate_number}</p>
                    {plate.registration_number && (
                      <p className="text-xs text-muted-foreground">Reg #{plate.registration_number}</p>
                    )}
                    {/* Expiry indicator */}
                    {(() => {
                      const status = getExpiryStatus(plate.expires_at);
                      const days = daysUntilExpiry(plate.expires_at);
                      if (!status) return null;
                      const expiryClasses = {
                        valid: 'text-status-complete',
                        expiring_soon: 'text-status-warning',
                        expired: 'text-destructive',
                      };
                      const expiryLabel = status === 'expired'
                        ? `Expired ${format(new Date(plate.expires_at!), 'MMM d, yyyy')}`
                        : status === 'expiring_soon'
                          ? `Expires in ${days}d — ${format(new Date(plate.expires_at!), 'MMM d, yyyy')}`
                          : `Expires ${format(new Date(plate.expires_at!), 'MMM d, yyyy')}`;
                      return (
                        <p className={`text-[11px] flex items-center gap-1 mt-0.5 font-medium ${expiryClasses[status]}`}>
                          <CalendarClock className="h-3 w-3" />
                          {expiryLabel}
                        </p>
                      );
                    })()}
                  </div>
                  <Badge className={`text-[10px] font-semibold border flex items-center gap-1 shrink-0 ${cfg.badge}`}>
                    {cfg.icon}
                    {cfg.label}
                  </Badge>
                </div>

                {/* Current driver info */}
                {plate.status === 'assigned' && plate.current_driver && (
                  <div className="bg-primary/5 border border-primary/15 rounded-lg px-3 py-2">
                    <p className="text-xs font-semibold text-primary">{plate.current_driver}</p>
                    {plate.current_driver_unit && (
                      <p className="text-[11px] text-muted-foreground">Unit #{plate.current_driver_unit}</p>
                    )}
                    {plate.assigned_since && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Since {format(new Date(plate.assigned_since), 'MMM d, yyyy')}
                      </p>
                    )}
                  </div>
                )}

                {plate.status === 'lost_stolen' && plate.lost_since && (
                  <div className="bg-destructive/5 border border-destructive/15 rounded-lg px-3 py-2">
                    <p className="text-xs font-semibold text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Reported {format(new Date(plate.lost_since), 'MMM d, yyyy')}
                    </p>
                  </div>
                )}

                {plate.notes && (
                  <p className="text-xs text-muted-foreground italic line-clamp-2">{plate.notes}</p>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/60">
                  {plate.status === 'available' && (
                    <Button size="sm" className="h-7 text-xs gap-1" onClick={() => { setAssignPlate(plate); setAssignOpen(true); }}>
                      <UserCheck className="h-3 w-3" /> Assign
                    </Button>
                  )}
                  {plate.status === 'assigned' && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { setReturnDialogPlate(plate); setReturnNotes(''); }}>
                      <UserX className="h-3 w-3" /> Return
                    </Button>
                  )}
                  {plate.status === 'lost_stolen' && (
                    <Button size="sm" className="h-7 text-xs gap-1 bg-status-complete hover:bg-status-complete/90 text-white" onClick={() => setReplacementDialogPlate(plate)}>
                      <RefreshCcw className="h-3 w-3" /> Replacement Received
                    </Button>
                  )}
                  {plate.status === 'retired' && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => handleSetStatus(plate, 'available')}>
                      <RotateCcw className="h-3 w-3" /> Reactivate
                    </Button>
                  )}

                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => { setHistoryPlate(plate); setHistoryOpen(true); }}>
                    <History className="h-3 w-3" /> History
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => { setEditPlate(plate); setFormOpen(true); }}>
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>

                  {(plate.status === 'available' || plate.status === 'assigned') && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => { setLostDialogPlate(plate); setLostNotes(''); }}
                    >
                      <AlertTriangle className="h-3 w-3" /> Lost/Stolen
                    </Button>
                  )}
                  {plate.status !== 'retired' && plate.status !== 'lost_stolen' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                      onClick={() => handleSetStatus(plate, 'retired')}
                    >
                      <Archive className="h-3 w-3" /> Retire
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto"
                    onClick={() => setDeleteDialogPlate(plate)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <MoPlateFormModal open={formOpen} onClose={() => setFormOpen(false)} onSaved={fetchPlates} plate={editPlate} />
      <MoPlateAssignModal open={assignOpen} onClose={() => setAssignOpen(false)} onSaved={fetchPlates} plate={assignPlate} />
      <MoPlateHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} plate={historyPlate} />

      {/* Return dialog */}
      <AlertDialog open={!!returnDialogPlate} onOpenChange={(o) => { if (!o) setReturnDialogPlate(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Return Plate {returnDialogPlate?.plate_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the plate as returned from {returnDialogPlate?.current_driver} and set it to Available.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 pb-2">
            <Label className="text-sm">Notes (optional)</Label>
            <Textarea className="mt-1 resize-none" rows={2} placeholder="e.g. Driver left the company" value={returnNotes} onChange={e => setReturnNotes(e.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button onClick={handleReturn} disabled={returnLoading}>
              {returnLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Confirm Return
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lost/Stolen dialog */}
      <AlertDialog open={!!lostDialogPlate} onOpenChange={(o) => { if (!o) setLostDialogPlate(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Mark Plate {lostDialogPlate?.plate_number} as Lost/Stolen?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {lostDialogPlate?.status === 'assigned'
                ? `This will close the active assignment for ${lostDialogPlate.current_driver} and flag the plate as lost or stolen.`
                : 'This will flag the plate as lost or stolen.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 pb-2">
            <Label className="text-sm">Notes (optional)</Label>
            <Textarea className="mt-1 resize-none" rows={2} placeholder="e.g. Reported lost on Route 44, driver John Smith" value={lostNotes} onChange={e => setLostNotes(e.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleMarkLost} disabled={lostLoading}>
              {lostLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Confirm Lost/Stolen
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Replacement received dialog */}
      <AlertDialog open={!!replacementDialogPlate} onOpenChange={(o) => { if (!o) setReplacementDialogPlate(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCcw className="h-5 w-5 text-status-complete" />
              Replacement Received for {replacementDialogPlate?.plate_number}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Missouri has issued a replacement with the same plate number. This will close the lost/stolen event and set the plate back to Available, ready for re-assignment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button className="bg-status-complete hover:bg-status-complete/90 text-white" onClick={handleReplacementReceived} disabled={replacementLoading}>
              {replacementLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Confirm Replacement
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete dialog */}
      <AlertDialog open={!!deleteDialogPlate} onOpenChange={(o) => { if (!o) setDeleteDialogPlate(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Plate {deleteDialogPlate?.plate_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this plate record and all its history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Delete Permanently
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
