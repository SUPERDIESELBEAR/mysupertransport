import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ExternalLink, Info, Loader2 } from 'lucide-react';
import {
  addDaysToDate, FMCSA_REGISTERED_LIST_URL, FMCSA_REVOKED_LIST_URL,
  type DeviceModelRow, type RevokedListResult,
} from '@/lib/eld/revokedList';

const OUTCOMES: Array<{ value: RevokedListResult; label: string; help: string }> = [
  { value: 'registered', label: 'Registered', help: 'Found on the registered list with matching identifiers.' },
  { value: 'revoked', label: 'Revoked', help: 'Found on the revoked list. Capture the revocation date.' },
  { value: 'not_found', label: 'Not found', help: 'On neither list — usually the recorded model number is wrong.' },
];

export default function RevokedListCheckModal({
  model, open, onOpenChange, onRecorded,
}: {
  model: DeviceModelRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onRecorded: () => void;
}) {
  // No pre-selected outcome. A default would let someone click through the
  // dialog and record a verification that never happened.
  const [result, setResult] = useState<RevokedListResult | null>(null);
  const [listDate, setListDate] = useState('');
  const [notes, setNotes] = useState('');
  const [revocationDate, setRevocationDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setListDate(new Date().toISOString().slice(0, 10));
    setNotes('');
    setRevocationDate('');
    setDeadline('');
  }, [open, model?.id]);

  // The 60-day grace period is a convention, not a rule: it is set per
  // revocation, so the deadline only pre-fills and stays editable.
  useEffect(() => {
    if (revocationDate) setDeadline((d) => d || addDaysToDate(revocationDate, 60));
  }, [revocationDate]);

  if (!model) return null;

  const save = async () => {
    if (!result) { toast.error('Record an outcome before saving.'); return; }
    if (result === 'revoked' && !revocationDate) {
      toast.error('A revoked outcome needs the revocation date.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('record_revoked_list_check', {
      _model_id: model.id,
      _result: result,
      _fmcsa_list_date: listDate || null,
      _notes: notes.trim() || null,
      _revocation_date: result === 'revoked' ? revocationDate : null,
      _replacement_deadline: result === 'revoked' ? (deadline || null) : null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Revoked-list check recorded.');
    onOpenChange(false);
    onRecorded();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Verify against FMCSA's lists</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
            <div className="font-semibold">{model.device_make} {model.device_model}</div>
            <div className="text-muted-foreground">{model.provider_name}</div>
            <div className="text-muted-foreground">
              Registration ID: {model.fmcsa_registration_id || '— none recorded —'}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={FMCSA_REGISTERED_LIST_URL} target="_blank" rel="noreferrer">
                Registered list <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={FMCSA_REVOKED_LIST_URL} target="_blank" rel="noreferrer">
                Revoked list <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </a>
            </Button>
          </div>

          <p className="flex gap-2 rounded-md border-l-4 border-primary bg-primary/5 p-3 text-xs">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              Match on the ELD identifier the device itself reports in DOT Inspection mode.
              That is the authoritative value. A registration ID copied from a reseller or
              third-party site is not, and matching against it can pass a device that is
              actually revoked.
            </span>
          </p>

          <div className="space-y-2">
            <Label>Outcome</Label>
            <div className="grid gap-2">
              {OUTCOMES.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setResult(o.value)}
                  className={`rounded-lg border p-3 text-left transition ${
                    result === o.value ? 'border-primary bg-primary/10' : 'hover:bg-muted/50'
                  }`}
                >
                  <div className="font-medium">{o.label}</div>
                  <div className="text-xs text-muted-foreground">{o.help}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="rl-list-date">Date of the FMCSA list you read</Label>
            <Input id="rl-list-date" type="date" value={listDate}
              onChange={(e) => setListDate(e.target.value)} />
          </div>

          {result === 'revoked' && (
            <div className="grid gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <div className="grid gap-2">
                <Label htmlFor="rl-rev-date">Revocation date</Label>
                <Input id="rl-rev-date" type="date" value={revocationDate}
                  onChange={(e) => setRevocationDate(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rl-deadline">Replacement deadline</Label>
                <Input id="rl-deadline" type="date" value={deadline}
                  onChange={(e) => setDeadline(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  Defaults to 60 days after revocation. The grace period is set per
                  revocation, not by regulation — change it if FMCSA published a different one.
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="rl-notes">Notes</Label>
            <Textarea id="rl-notes" rows={3} value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What you matched on, and anything that did not line up." />
          </div>

          <p className="text-xs text-muted-foreground">
            Checks are permanent and cannot be edited. If this entry turns out to be wrong,
            record a new check — the history keeps both.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || !result}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record check
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}