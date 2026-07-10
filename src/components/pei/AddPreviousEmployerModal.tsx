import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { US_STATES } from '@/components/application/types';
import { toTitleCase } from '@/components/application/utils';
import { lookupEmployerEmail } from '@/lib/pei/lookupEmail';

interface Props {
  open: boolean;
  applicationId: string;
  onClose: () => void;
  onCreated: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_EXTRACT_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

// Accept MM/YYYY or YYYY-MM and normalize to YYYY-MM-15 for DB storage.
function normalizeMonthDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  const mmYyyy = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmYyyy) {
    const mm = String(Math.min(12, Math.max(1, Number(mmYyyy[1])))).padStart(2, '0');
    return `${mmYyyy[2]}-${mm}-15`;
  }
  const yyyyMm = s.match(/^(\d{4})-(\d{1,2})$/);
  if (yyyyMm) {
    const mm = String(Math.min(12, Math.max(1, Number(yyyyMm[2])))).padStart(2, '0');
    return `${yyyyMm[1]}-${mm}-15`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function AddPreviousEmployerModal({ open, applicationId, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isDot, setIsDot] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  function reset() {
    setName(''); setContactName(''); setEmail(''); setCity(''); setState('');
    setStartDate(''); setEndDate(''); setIsDot(true);
  }

  async function handleLookup() {
    if (!name.trim()) {
      toast.error('Enter the employer name first');
      return;
    }
    setLookingUp(true);
    try {
      const result = await lookupEmployerEmail({
        employer_name: name.trim(),
        city: city || null,
        state: state || null,
      });
      if (!result.candidates?.length) {
        toast.info(result.reason ?? 'No email found — please enter manually.');
        return;
      }
      const top = result.candidates[0];
      setEmail(top.email);
      toast.success(
        `Found ${top.email}${result.website ? ' on ' + result.website.replace(/^https?:\/\//, '') : ''}`
      );
    } catch (e: any) {
      toast.error(e?.message ?? 'Lookup failed');
    } finally {
      setLookingUp(false);
    }
  }

  async function handleSave() {
    const employerName = toTitleCase(name.trim());
    if (!employerName) { toast.error('Employer name is required'); return; }
    if (!city.trim()) { toast.error('City is required'); return; }
    if (!state.trim()) { toast.error('State is required'); return; }

    let normalizedEmail: string | null = null;
    const rawEmail = email.trim();
    if (rawEmail) {
      const m = rawEmail.match(EMAIL_EXTRACT_RE);
      normalizedEmail = (m ? m[0] : rawEmail).toLowerCase();
      if (!EMAIL_RE.test(normalizedEmail)) {
        toast.error('Enter a valid email address (or leave blank to add later)');
        return;
      }
    }

    const startISO = normalizeMonthDate(startDate);
    const endISO = normalizeMonthDate(endDate);
    if (startDate && !startISO) { toast.error('Start date must be MM/YYYY'); return; }
    if (endDate && !endISO) { toast.error('End date must be MM/YYYY'); return; }

    setSaving(true);
    try {
      const { error: insErr } = await supabase.from('pei_requests').insert({
        application_id: applicationId,
        employer_name: employerName,
        employer_contact_name: contactName.trim() || null,
        employer_contact_email: normalizedEmail,
        employer_city: toTitleCase(city.trim()),
        employer_state: state.trim().toUpperCase(),
        employment_start_date: startISO,
        employment_end_date: endISO,
        is_dot_regulated: isDot,
        status: 'pending',
      } as any);
      if (insErr) throw insErr;

      // Mirror autoBuildPEIRequests: ensure applications.pei_deadline is set.
      const { data: app } = await supabase
        .from('applications')
        .select('pei_deadline')
        .eq('id', applicationId)
        .maybeSingle();
      if (!app?.pei_deadline) {
        const { error: updErr } = await supabase
          .from('applications')
          .update({ pei_deadline: addDaysISO(30) } as any)
          .eq('id', applicationId);
        if (updErr) throw updErr;
      }

      toast.success('Previous employer added');
      reset();
      onCreated();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to add previous employer');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) { reset(); onClose(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Previous Employer</DialogTitle>
          <DialogDescription>
            Manually add a PEI record for drivers who joined before the in-app application.
            You can send, follow up, and document GFE just like an auto-built record.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Employer name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <Label className="text-xs">Contact name</Label>
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Contact email</Label>
              <button
                type="button"
                onClick={handleLookup}
                disabled={lookingUp || !name.trim()}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-gold hover:underline disabled:opacity-50"
              >
                {lookingUp ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {lookingUp ? 'Searching…' : 'Find with AI'}
              </button>
            </div>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Label className="text-xs">City *</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">State *</Label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">—</option>
                {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Start (MM/YYYY)</Label>
              <Input value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">End (MM/YYYY)</Label>
              <Input value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm">DOT-regulated employer</Label>
              <p className="text-xs text-muted-foreground">Required investigation under §391.23</p>
            </div>
            <Switch checked={isDot} onCheckedChange={setIsDot} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Add employer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}