import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, X, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CORRECTION_FIELDS, getFieldDef, formatValue, type CorrectionFieldDef } from '@/lib/applicationCorrections';

interface SuggestCorrectionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: Record<string, unknown> & { id: string; first_name?: string | null; last_name?: string | null; email: string };
  onSent: () => void;
}

interface PendingChange {
  path: string;
  newValue: unknown;
}

function unwrap(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  return v;
}

function ValueEditor({ def, value, onChange }: { def: CorrectionFieldDef; value: unknown; onChange: (v: unknown) => void }) {
  switch (def.kind) {
    case 'textarea':
      return <Textarea value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} rows={3} />;
    case 'date':
      return <Input type="date" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'boolean':
      return (
        <Select value={value === true ? 'true' : value === false ? 'false' : ''} onValueChange={(v) => onChange(v === 'true')}>
          <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Yes</SelectItem>
            <SelectItem value="false">No</SelectItem>
          </SelectContent>
        </Select>
      );
    case 'select':
      return (
        <Select value={(value as string) ?? ''} onValueChange={(v) => onChange(v)}>
          <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>
            {def.options?.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    case 'multiselect': {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-1.5">
          {def.options?.map((opt) => {
            const checked = arr.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onChange(checked ? arr.filter((x) => x !== opt) : [...arr, opt])}
                className={`px-2.5 py-1 text-xs rounded border ${checked ? 'bg-gold/20 border-gold text-foreground' : 'bg-background border-border text-muted-foreground'}`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      );
    }
    case 'employers': {
      // For employers, accept JSON edited as text — staff can copy/paste a corrected snippet.
      const txt = typeof value === 'string' ? value : JSON.stringify(value ?? [], null, 2);
      return (
        <Textarea
          value={txt}
          onChange={(e) => onChange(e.target.value)}
          rows={8}
          className="font-mono text-xs"
          placeholder='[{"name": "...", "city": "...", ...}]'
        />
      );
    }
    default:
      return <Input value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
}

export function SuggestCorrectionsModal({ open, onOpenChange, application, onSent }: SuggestCorrectionsModalProps) {
  const [reason, setReason] = useState('');
  const [courtesy, setCourtesy] = useState('');
  const [changes, setChanges] = useState<PendingChange[]>([]);
  const [pickerPath, setPickerPath] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setReason(''); setCourtesy(''); setChanges([]); setPickerPath('');
    }
  }, [open]);

  const grouped = useMemo(() => {
    const map = new Map<string, CorrectionFieldDef[]>();
    for (const f of CORRECTION_FIELDS) {
      if (!map.has(f.section)) map.set(f.section, []);
      map.get(f.section)!.push(f);
    }
    return Array.from(map.entries());
  }, []);

  const addField = (path: string) => {
    if (!path || changes.some((c) => c.path === path)) return;
    const def = getFieldDef(path);
    if (!def) return;
    const current = unwrap(application[path]);
    setChanges((prev) => [...prev, { path, newValue: def.kind === 'employers' ? JSON.stringify(current ?? [], null, 2) : current }]);
    setPickerPath('');
  };

  const removeField = (path: string) => setChanges((prev) => prev.filter((c) => c.path !== path));

  const updateValue = (path: string, value: unknown) => {
    setChanges((prev) => prev.map((c) => (c.path === path ? { ...c, newValue: value } : c)));
  };

  const fullName = [application.first_name, application.last_name].filter(Boolean).join(' ') || application.email;

  const handleSubmit = async () => {
    if (reason.trim().length < 5) {
      toast.error('Please enter a reason (at least 5 characters).');
      return;
    }
    if (changes.length === 0) {
      toast.error('Add at least one field to correct.');
      return;
    }

    // Serialize for the RPC
    const payload = changes.map((c) => {
      const def = getFieldDef(c.path)!;
      const oldRaw = unwrap(application[c.path]);
      let newVal: unknown = c.newValue;
      if (def.kind === 'employers' && typeof newVal === 'string') {
        try { newVal = JSON.parse(newVal); } catch { throw new Error(`Employment history is not valid JSON.`); }
      }
      if (def.kind === 'date' && newVal === '') newVal = null;
      return {
        field_path: c.path,
        field_label: def.label,
        old_value: oldRaw ?? null,
        new_value: newVal ?? null,
      };
    });

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('submit_application_correction', {
        p_application_id: application.id,
        p_reason: reason.trim(),
        p_courtesy_message: courtesy.trim() || null,
        p_fields: payload as unknown as never,
      });
      if (error) throw error;
      const requestId = (data as { request_id: string }[])?.[0]?.request_id;
      if (requestId) {
        const { error: emailErr } = await supabase.functions.invoke('send-application-correction-email', {
          body: { requestId },
        });
        if (emailErr) {
          console.warn('email send failed', emailErr);
          toast.warning(`Correction request created, but email failed to send. Notify ${application.email} manually.`);
        } else {
          toast.success(`Sent to ${application.email} for approval.`);
        }
      }
      onSent();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      const msg = (err as { message?: string })?.message || 'Failed to submit corrections';
      toast.error(msg.includes('pending_request_exists')
        ? 'There is already a pending correction request for this applicant. Cancel it first.'
        : msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send corrections to {fullName}</DialogTitle>
          <DialogDescription>
            Pick the fields you want to correct, enter the new values, and send to the applicant for e-signature approval.
            SSN, signature and consent checkboxes can't be changed this way — use "Request Revisions" instead.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <label className="text-xs font-semibold text-foreground mb-1.5 block">
              Reason for changes <span className="text-destructive">*</span>
              <span className="font-normal text-muted-foreground"> (shown to the applicant)</span>
            </label>
            <Textarea
              value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
              placeholder="e.g. Spelling correction on city name based on phone conversation"
              maxLength={1000}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground mb-1.5 block">
              Courtesy note <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Textarea
              value={courtesy} onChange={(e) => setCourtesy(e.target.value)} rows={2}
              placeholder="Optional friendly note shown above the proposed changes"
              maxLength={500}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">Fields to correct ({changes.length})</label>
              <div className="flex items-center gap-2">
                <Select value={pickerPath} onValueChange={addField}>
                  <SelectTrigger className="w-[260px]"><SelectValue placeholder="Add a field…" /></SelectTrigger>
                  <SelectContent className="max-h-[320px]">
                    {grouped.map(([section, fields]) => (
                      <div key={section}>
                        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground bg-muted/40">{section}</div>
                        {fields.map((f) => (
                          <SelectItem key={f.path} value={f.path} disabled={changes.some((c) => c.path === f.path)}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {changes.length === 0 ? (
              <div className="border border-dashed border-border rounded-lg p-6 text-center text-sm text-muted-foreground">
                <Plus className="h-5 w-5 mx-auto mb-2 opacity-60" />
                No fields added yet. Pick one from the dropdown above.
              </div>
            ) : (
              <div className="space-y-3">
                {changes.map((c) => {
                  const def = getFieldDef(c.path)!;
                  const oldRaw = unwrap(application[c.path]);
                  return (
                    <div key={c.path} className="border border-border rounded-lg p-3 bg-secondary/20">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px]">{def.section}</Badge>
                          <span className="text-sm font-semibold text-foreground">{def.label}</span>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeField(c.path)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Current</div>
                          <div className="text-xs text-muted-foreground bg-muted/40 border border-border rounded px-2 py-1.5 min-h-[34px] break-words">
                            {formatValue(oldRaw, def.kind)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">New value</div>
                          <ValueEditor def={def} value={c.newValue} onChange={(v) => updateValue(c.path, v)} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || changes.length === 0} className="bg-gold text-foreground hover:bg-gold/90">
            {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</> : <><Send className="h-4 w-4 mr-2" /> Send for approval</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}