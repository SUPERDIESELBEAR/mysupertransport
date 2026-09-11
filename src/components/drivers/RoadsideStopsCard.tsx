import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { FilePreviewModal } from '@/components/inspection/DocRow';
import { useToast } from '@/hooks/use-toast';
import { useScrollIntoViewOnOpen } from '@/hooks/useScrollIntoViewOnOpen';
import { ChevronDown, Loader2, Plus, ShieldAlert, FileText, Eye, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import RoadsideStopModal from './RoadsideStopModal';
import InspectionLevelGuide from './InspectionLevelGuide';
import {
  STOP_TYPES, STOP_REASONS, STOP_OUTCOMES, INSPECTION_LEVELS, labelFor,
  type RoadsideStop,
} from './roadsideStopTypes';

const sb = supabase as any;

interface Props {
  operatorId: string;
  unitNumber?: string | null;
  /** 'operator' = the driver's own read-mostly view (can add, can edit only their own recent entries) */
  mode?: 'staff' | 'operator';
  defaultCollapsed?: boolean;
}

function outcomeBadge(stop: RoadsideStop) {
  if (stop.oos_driver || stop.oos_vehicle || stop.outcome === 'out_of_service') {
    return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Out of service</Badge>;
  }
  if (stop.outcome === 'clean') {
    return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] px-1.5 py-0">Clean</Badge>;
  }
  return <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] px-1.5 py-0">{labelFor(STOP_OUTCOMES, stop.outcome)}</Badge>;
}

export default function RoadsideStopsCard({ operatorId, unitNumber, mode = 'staff', defaultCollapsed = true }: Props) {
  const { toast } = useToast();
  const [stops, setStops] = useState<RoadsideStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const cardRef = useScrollIntoViewOnOpen<HTMLDivElement>(!collapsed);
  const [modalOpen, setModalOpen] = useState(false);
  const [editStop, setEditStop] = useState<RoadsideStop | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RoadsideStop | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const fetchStops = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb
      .from('roadside_stops')
      .select('*, roadside_stop_violations(*), roadside_stop_documents(*)')
      .eq('operator_id', operatorId)
      .order('stop_at', { ascending: false });
    if (error) {
      console.error('[RoadsideStopsCard] load failed', error.message);
    }
    setStops((data as RoadsideStop[]) ?? []);
    setLoading(false);
  }, [operatorId]);

  useEffect(() => { fetchStops(); }, [fetchStops]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await sb.from('roadside_stops').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast({ title: 'Stop removed' });
      setDeleteTarget(null);
      fetchStops();
    } catch (err: unknown) {
      toast({ title: 'Could not remove', description: err instanceof Error ? err.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const lastYear = stops.filter(s => new Date(s.stop_at).getTime() >= cutoff);
  const oosCount = lastYear.filter(s => s.oos_driver || s.oos_vehicle || s.outcome === 'out_of_service').length;
  const cleanInspections = lastYear.filter(s => s.stop_type === 'dot_inspection' && s.outcome === 'clean').length;

  const canEdit = (s: RoadsideStop) => {
    if (mode === 'staff') return true;
    const withinDay = Date.now() - new Date(s.created_at).getTime() < 24 * 60 * 60 * 1000;
    return withinDay && s.created_by === currentUserId;
  };

  const toggleRow = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <>
      <div ref={cardRef} className="bg-white border border-border rounded-xl shadow-sm scroll-mt-20">
        <button onClick={() => setCollapsed(p => !p)} className="w-full flex items-center justify-between px-5 py-4 text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <ShieldAlert className="h-4 w-4 text-gold" />
            <h3 className="font-semibold text-foreground text-sm">Roadside Stops</h3>
            <span className="text-[11px] text-muted-foreground">({stops.length})</span>
            {oosCount > 0 && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{oosCount} out of service · 12 mo</Badge>}
            {cleanInspections > 0 && <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] px-1.5 py-0">{cleanInspections} clean inspections · 12 mo</Badge>}
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        </button>

        {!collapsed && (
          <div className="px-5 pb-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-muted-foreground">
                Every time the truck is pulled in — a DOT inspection or a traffic stop.
              </p>
              <Button size="sm" variant="outline" className="text-xs gap-1.5 shrink-0" onClick={() => { setEditStop(null); setModalOpen(true); }}>
                <Plus className="h-3.5 w-3.5" /> {mode === 'operator' ? 'Report a Stop' : 'Add Stop'}
              </Button>
            </div>

            {loading ? (
              <div className="text-center py-6 text-muted-foreground text-xs">
                <Loader2 className="h-5 w-5 mx-auto animate-spin mb-2" /> Loading…
              </div>
            ) : stops.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-xs">
                <ShieldAlert className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>No roadside stops recorded.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {stops.map(stop => {
                  const open = expanded.has(stop.id);
                  return (
                    <div key={stop.id} className="py-2.5 first:pt-0 last:pb-0">
                      <div className="flex items-start gap-3">
                        <button className="flex-1 min-w-0 text-left" onClick={() => toggleRow(stop.id)}>
                          <p className="text-xs font-medium text-foreground truncate">
                            {format(new Date(stop.stop_at), 'MMM d, yyyy · h:mm a')} — {labelFor(STOP_TYPES, stop.stop_type)}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {[stop.location, stop.state].filter(Boolean).join(', ') || 'Location not recorded'}
                            {' · '}{labelFor(STOP_REASONS, stop.stop_reason)}
                            {stop.truck_unit_number ? ` · Unit ${stop.truck_unit_number}` : ''}
                          </p>
                        </button>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {outcomeBadge(stop)}
                          {canEdit(stop) && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditStop(stop); setModalOpen(true); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {mode === 'staff' && (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(stop)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {open && (
                        <div className="mt-2 pl-1 space-y-2 text-[11px] text-muted-foreground">
                          {stop.stop_type === 'dot_inspection' && (
                            <>
                              <p>
                                Report {stop.inspection_report_number || '—'} · {labelFor(INSPECTION_LEVELS, stop.inspection_level ?? undefined)}
                                {stop.inspector_name ? ` · ${stop.inspector_name}` : ''}
                                {stop.agency ? ` · ${stop.agency}` : ''}
                                {stop.cvsa_sticker ? ' · CVSA sticker issued' : ''}
                              </p>
                              <InspectionLevelGuide />
                            </>
                          )}
                          {(stop.citation_issued || stop.fine_amount) && (
                            <p>Citation issued{stop.fine_amount ? ` · $${Number(stop.fine_amount).toFixed(2)}` : ''}</p>
                          )}
                          {!!stop.roadside_stop_violations?.length && (
                            <div className="space-y-1">
                              <p className="font-medium text-foreground">Violations</p>
                              {stop.roadside_stop_violations.map((v, i) => (
                                <p key={v.id ?? i}>
                                  {v.code ? `${v.code} — ` : ''}{v.description || 'No description'} ({v.unit}){v.is_oos ? ' · out of service' : ''}
                                </p>
                              ))}
                            </div>
                          )}
                          {!!stop.roadside_stop_documents?.length && (
                            <div className="flex flex-wrap gap-2">
                              {stop.roadside_stop_documents.map(doc => (
                                <Button
                                  key={doc.id} size="sm" variant="outline" className="h-7 text-[11px] gap-1.5"
                                  onClick={async () => {
                                    const { data: signed } = await supabase.storage.from('driver-uploads').createSignedUrl(doc.file_path, 3600);
                                    const url = signed?.signedUrl ?? doc.file_url;
                                    if (url) setPreview({ url, name: doc.file_name || 'Attachment' });
                                  }}
                                >
                                  <FileText className="h-3 w-3" /> {doc.file_name || 'Attachment'} <Eye className="h-3 w-3" />
                                </Button>
                              ))}
                            </div>
                          )}
                          {stop.notes && <p className="whitespace-pre-wrap">{stop.notes}</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <RoadsideStopModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditStop(null); }}
        operatorId={operatorId}
        defaultUnitNumber={unitNumber}
        stop={editStop}
        onSaved={fetchStops}
      />

      {preview && (
        <FilePreviewModal url={preview.url} name={preview.name} onClose={() => setPreview(null)} />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this roadside stop?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the entry and its attachments from the driver's record.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
