import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateInput } from '@/components/ui/date-input';
import { useToast } from '@/hooks/use-toast';
import { uploadToBucket } from '@/lib/uploadWithAuth';
import { validateFile } from '@/lib/validateFile';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import {
  STOP_TYPES, STOP_REASONS, STOP_OUTCOMES, INSPECTION_LEVELS, US_STATES,
  type RoadsideStop, type RoadsideStopType, type RoadsideStopReason,
  type RoadsideStopOutcome, type RoadsideInspectionLevel, type RoadsideStopViolation,
} from './roadsideStopTypes';

const sb = supabase as any;

interface Props {
  open: boolean;
  onClose: () => void;
  operatorId: string;
  defaultUnitNumber?: string | null;
  stop?: RoadsideStop | null;
  onSaved: () => void;
}

const emptyViolation = (): RoadsideStopViolation => ({ code: '', description: '', unit: 'vehicle', is_oos: false });

function toDateInput(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function toTimeInput(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function RoadsideStopModal({ open, onClose, operatorId, defaultUnitNumber, stop, onSaved }: Props) {
  const { toast } = useToast();
  const editing = !!stop;

  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [state, setState] = useState('');
  const [location, setLocation] = useState('');
  const [stopType, setStopType] = useState<RoadsideStopType>('dot_inspection');
  const [reason, setReason] = useState<RoadsideStopReason>('random');
  const [outcome, setOutcome] = useState<RoadsideStopOutcome>('clean');
  const [unitNumber, setUnitNumber] = useState('');
  const [loadId, setLoadId] = useState<string>('none');
  const [reportNumber, setReportNumber] = useState('');
  const [level, setLevel] = useState<RoadsideInspectionLevel | 'none'>('none');
  const [inspector, setInspector] = useState('');
  const [agency, setAgency] = useState('');
  const [cvsa, setCvsa] = useState(false);
  const [oosDriver, setOosDriver] = useState(false);
  const [oosVehicle, setOosVehicle] = useState(false);
  const [citation, setCitation] = useState(false);
  const [fine, setFine] = useState('');
  const [notes, setNotes] = useState('');
  const [violations, setViolations] = useState<RoadsideStopViolation[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [loads, setLoads] = useState<{ id: string; load_number: string | null }[]>([]);

  useEffect(() => {
    if (!open) return;
    setDate(stop ? toDateInput(stop.stop_at) : toDateInput(new Date().toISOString()));
    setTime(stop ? toTimeInput(stop.stop_at) : toTimeInput(new Date().toISOString()));
    setState(stop?.state ?? '');
    setLocation(stop?.location ?? '');
    setStopType(stop?.stop_type ?? 'dot_inspection');
    setReason(stop?.stop_reason ?? 'random');
    setOutcome(stop?.outcome ?? 'clean');
    setUnitNumber(stop?.truck_unit_number ?? defaultUnitNumber ?? '');
    setLoadId(stop?.load_id ?? 'none');
    setReportNumber(stop?.inspection_report_number ?? '');
    setLevel(stop?.inspection_level ?? 'none');
    setInspector(stop?.inspector_name ?? '');
    setAgency(stop?.agency ?? '');
    setCvsa(!!stop?.cvsa_sticker);
    setOosDriver(!!stop?.oos_driver);
    setOosVehicle(!!stop?.oos_vehicle);
    setCitation(!!stop?.citation_issued);
    setFine(stop?.fine_amount != null ? String(stop.fine_amount) : '');
    setNotes(stop?.notes ?? '');
    setViolations(stop?.roadside_stop_violations?.map(v => ({ ...v })) ?? []);
    setFiles([]);
  }, [open, stop, defaultUnitNumber]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data } = await sb
        .from('loads')
        .select('id, load_number')
        .eq('operator_id', operatorId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (!cancelled && data) setLoads(data);
    })();
    return () => { cancelled = true; };
  }, [open, operatorId]);

  const isInspection = stopType === 'dot_inspection';

  const handleSave = async () => {
    if (!date) {
      toast({ title: 'Date required', description: 'Enter the date of the stop.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const stopAt = new Date(`${date}T${time || '12:00'}:00`).toISOString();
      const payload = {
        operator_id: operatorId,
        load_id: loadId === 'none' ? null : loadId,
        truck_unit_number: unitNumber.trim() || null,
        stop_at: stopAt,
        state: state || null,
        location: location.trim() || null,
        stop_type: stopType,
        stop_reason: reason,
        outcome,
        inspection_report_number: isInspection ? (reportNumber.trim() || null) : null,
        inspection_level: isInspection && level !== 'none' ? level : null,
        inspector_name: inspector.trim() || null,
        agency: agency.trim() || null,
        cvsa_sticker: isInspection ? cvsa : false,
        oos_driver: oosDriver,
        oos_vehicle: oosVehicle,
        citation_issued: citation,
        fine_amount: fine.trim() ? Number(fine) : null,
        notes: notes.trim() || null,
      };

      let stopId = stop?.id ?? '';
      if (editing) {
        const { error } = await sb.from('roadside_stops').update(payload).eq('id', stop!.id);
        if (error) throw error;
        await sb.from('roadside_stop_violations').delete().eq('stop_id', stop!.id);
      } else {
        const { data: authData } = await supabase.auth.getUser();
        const { data, error } = await sb
          .from('roadside_stops')
          .insert({ ...payload, created_by: authData.user?.id ?? null })
          .select('id')
          .single();
        if (error) throw error;
        stopId = data.id;
      }

      const cleanViolations = violations.filter(v => (v.code || '').trim() || (v.description || '').trim());
      if (cleanViolations.length) {
        const { error: vErr } = await sb.from('roadside_stop_violations').insert(
          cleanViolations.map(v => ({
            stop_id: stopId,
            code: v.code?.trim() || null,
            description: v.description?.trim() || null,
            unit: v.unit || 'vehicle',
            is_oos: !!v.is_oos,
          })),
        );
        if (vErr) throw vErr;
      }

      for (const file of files) {
        const check = validateFile(file);
        if (!check.valid) {
          toast({ title: 'File skipped', description: `${file.name}: ${check.error}`, variant: 'destructive' });
          continue;
        }
        const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
        const path = `roadside/${operatorId}/${stopId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await uploadToBucket('driver-uploads', path, file, { upsert: true });
        if (upErr) throw upErr;
        const { data: signed } = await supabase.storage.from('driver-uploads').createSignedUrl(path, 60 * 60 * 24 * 365);
        const { error: docErr } = await sb.from('roadside_stop_documents').insert({
          stop_id: stopId,
          file_path: path,
          file_name: file.name,
          file_url: signed?.signedUrl ?? null,
        });
        if (docErr) throw docErr;
      }

      toast({ title: editing ? 'Stop updated' : 'Stop recorded' });
      onSaved();
      onClose();
    } catch (err: unknown) {
      toast({
        title: 'Could not save',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{editing ? 'Edit roadside stop' : 'Record a roadside stop'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1 block">Date</Label>
              <DateInput value={date} onChange={setDate} placeholder="MM/DD/YYYY" className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Time (optional)</Label>
              <Input type="time" value={time} onChange={e => setTime(e.target.value)} className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">State</Label>
              <Select value={state || 'none'} onValueChange={v => setState(v === 'none' ? '' : v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select state" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="none" className="text-sm">Not recorded</SelectItem>
                  {US_STATES.map(s => <SelectItem key={s} value={s} className="text-sm">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Location</Label>
              <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Scale house, mile marker, city" className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Type</Label>
              <Select value={stopType} onValueChange={v => setStopType(v as RoadsideStopType)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{STOP_TYPES.map(t => <SelectItem key={t.value} value={t.value} className="text-sm">{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Reason for the stop</Label>
              <Select value={reason} onValueChange={v => setReason(v as RoadsideStopReason)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{STOP_REASONS.map(t => <SelectItem key={t.value} value={t.value} className="text-sm">{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Outcome</Label>
              <Select value={outcome} onValueChange={v => setOutcome(v as RoadsideStopOutcome)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{STOP_OUTCOMES.map(t => <SelectItem key={t.value} value={t.value} className="text-sm">{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Truck / unit</Label>
              <Input value={unitNumber} onChange={e => setUnitNumber(e.target.value)} placeholder="Unit number" className="h-9 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs mb-1 block">Load (optional)</Label>
              <Select value={loadId} onValueChange={setLoadId}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="No load" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="none" className="text-sm">No load / empty</SelectItem>
                  {loads.map(l => <SelectItem key={l.id} value={l.id} className="text-sm">{l.load_number || l.id.slice(0, 8)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isInspection && (
            <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
              <p className="text-xs font-semibold text-foreground">Inspection details</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1 block">Report number</Label>
                  <Input value={reportNumber} onChange={e => setReportNumber(e.target.value)} className="h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Level</Label>
                  <Select value={level} onValueChange={v => setLevel(v as RoadsideInspectionLevel | 'none')}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select level" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-sm">Not recorded</SelectItem>
                      {INSPECTION_LEVELS.map(l => <SelectItem key={l.value} value={l.value} className="text-sm">{l.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Inspector</Label>
                  <Input value={inspector} onChange={e => setInspector(e.target.value)} className="h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Agency</Label>
                  <Input value={agency} onChange={e => setAgency(e.target.value)} placeholder="State patrol, DOT" className="h-9 text-sm" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-foreground">
                <Checkbox checked={cvsa} onCheckedChange={v => setCvsa(!!v)} /> CVSA sticker issued
              </label>
            </div>
          )}

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs text-foreground">
              <Checkbox checked={oosDriver} onCheckedChange={v => setOosDriver(!!v)} /> Driver placed out of service
            </label>
            <label className="flex items-center gap-2 text-xs text-foreground">
              <Checkbox checked={oosVehicle} onCheckedChange={v => setOosVehicle(!!v)} /> Vehicle placed out of service
            </label>
            <label className="flex items-center gap-2 text-xs text-foreground">
              <Checkbox checked={citation} onCheckedChange={v => setCitation(!!v)} /> Citation issued
            </label>
          </div>

          {citation && (
            <div className="w-40">
              <Label className="text-xs mb-1 block">Fine amount</Label>
              <Input value={fine} onChange={e => setFine(e.target.value)} inputMode="decimal" placeholder="0.00" className="h-9 text-sm" />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Violations</Label>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setViolations(p => [...p, emptyViolation()])}>
                <Plus className="h-3 w-3" /> Add violation
              </Button>
            </div>
            {violations.length === 0 && <p className="text-xs text-muted-foreground">No violations recorded.</p>}
            {violations.map((v, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <Input
                  className="col-span-3 h-8 text-xs" placeholder="Code (393.75)"
                  value={v.code ?? ''}
                  onChange={e => setViolations(p => p.map((x, ix) => ix === i ? { ...x, code: e.target.value } : x))}
                />
                <Input
                  className="col-span-5 h-8 text-xs" placeholder="Description"
                  value={v.description ?? ''}
                  onChange={e => setViolations(p => p.map((x, ix) => ix === i ? { ...x, description: e.target.value } : x))}
                />
                <Select value={v.unit} onValueChange={val => setViolations(p => p.map((x, ix) => ix === i ? { ...x, unit: val } : x))}>
                  <SelectTrigger className="col-span-2 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vehicle" className="text-xs">Vehicle</SelectItem>
                    <SelectItem value="driver" className="text-xs">Driver</SelectItem>
                  </SelectContent>
                </Select>
                <label className="col-span-1 flex items-center gap-1 text-[10px]">
                  <Checkbox checked={v.is_oos} onCheckedChange={val => setViolations(p => p.map((x, ix) => ix === i ? { ...x, is_oos: !!val } : x))} /> OOS
                </label>
                <Button size="icon" variant="ghost" className="col-span-1 h-8 w-8 text-destructive" onClick={() => setViolations(p => p.filter((_, ix) => ix !== i))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <div>
            <Label className="text-xs mb-1 block">Attach report, citation or photos</Label>
            <Input
              type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.heic,.heif"
              className="text-xs h-9"
              onChange={e => setFiles(Array.from(e.target.files ?? []))}
            />
          </div>

          <div>
            <Label className="text-xs mb-1 block">Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="text-sm" placeholder="What happened, repairs made, follow-up needed" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving} className="text-sm">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="text-sm gap-1.5">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {editing ? 'Save changes' : 'Record stop'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
