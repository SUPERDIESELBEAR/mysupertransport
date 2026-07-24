import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateInput } from '@/components/ui/date-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Send, ShieldAlert, Mail } from 'lucide-react';

const RECIPIENT_EMAIL = 'tracey@iondot.net';
const RECIPIENT_NAME = 'Tracey L. McQuilken';
const REASON_OPTIONS = [
  'Resigned', 'Terminated', 'Personal Reasons', 'Truck Down',
  'Not Compliant', 'Medical', 'Abandoned', 'Other',
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  open: boolean;
  operatorId: string;
  operatorName: string;
  unitNumber?: string | null;
  initialReason?: string;
  initialNotes?: string;
  onSent: (notifiedAt: string) => void;
}

/**
 * Mandatory dialog shown after a driver is deactivated. Staff MUST send the
 * email to the Safety Advisor (Tracey McQuilken) before this dialog can close.
 */
export default function NotifySafetyAdvisorDialog({
  open, operatorId, operatorName, unitNumber,
  initialReason = '', initialNotes = '', onSent,
}: Props) {
  const { session } = useAuth();
  const { toast } = useToast();

  const [terminationDate, setTerminationDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState<string>(initialReason && REASON_OPTIONS.includes(initialReason) ? initialReason : (initialReason ? 'Other' : ''));
  const [rehire, setRehire] = useState<'yes' | 'no' | ''>('');
  const [notes, setNotes] = useState<string>(initialNotes);
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [ccInput, setCcInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const senderEmail = (session?.user?.email ?? '').toLowerCase();

  // Reset & pre-fill whenever dialog opens for a new driver
  useEffect(() => {
    if (!open) return;
    setTerminationDate(new Date().toISOString().slice(0, 10));
    setReason(initialReason && REASON_OPTIONS.includes(initialReason) ? initialReason : (initialReason ? 'Other' : ''));
    setRehire('');
    setNotes(initialNotes);
    setError(null);
    setSending(false);
    setCcInput('');

    // Pre-fill CCs: sender + owner(s)
    (async () => {
      const defaults = new Set<string>();
      if (senderEmail && EMAIL_RE.test(senderEmail)) defaults.add(senderEmail);
      try {
        const { data: ownerRoles } = await supabase
          .from('user_roles').select('user_id').eq('role', 'owner');
        const ownerIds = (ownerRoles ?? []).map((r: any) => r.user_id).filter(Boolean);
        if (ownerIds.length) {
          const { data: ownerProfiles } = await supabase
            .from('profiles').select('email').in('user_id', ownerIds);
          for (const p of (ownerProfiles ?? []) as any[]) {
            const e = (p?.email ?? '').toString().trim().toLowerCase();
            if (e && EMAIL_RE.test(e) && e !== RECIPIENT_EMAIL.toLowerCase()) defaults.add(e);
          }
        }
      } catch (e) {
        console.warn('Owner CC lookup failed:', e);
      }
      setCcEmails(Array.from(defaults));
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, operatorId]);

  const addCc = () => {
    const email = ccInput.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return;
    if (email === RECIPIENT_EMAIL.toLowerCase()) return;
    if (ccEmails.includes(email)) { setCcInput(''); return; }
    if (ccEmails.length >= 15) return;
    setCcEmails(prev => [...prev, email]);
    setCcInput('');
  };

  const canSend = !!terminationDate && !!reason && (rehire === 'yes' || rehire === 'no') && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('send-deactivation-notice', {
        body: {
          operator_id: operatorId,
          termination_date: terminationDate,
          reason,
          rehire,
          notes: notes.trim(),
          cc_emails: ccEmails,
        },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (fnErr) throw new Error(fnErr.message || 'Failed to send email');
      if (!data?.success) throw new Error(data?.error || 'Failed to send email');

      toast({
        title: 'Safety Advisor notified',
        description: `Email sent to ${RECIPIENT_NAME}${ccEmails.length ? ` and ${ccEmails.length} CC${ccEmails.length === 1 ? '' : 's'}` : ''}.`,
      });
      onSent(data.notified_at ?? new Date().toISOString());
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      setError(msg);
      toast({ title: 'Email failed', description: msg, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => { /* mandatory: no dismiss */ }}>
      <DialogContent
        className="max-w-lg max-h-[90dvh] overflow-y-auto [&>button.absolute]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-gold" />
            Notify Safety Advisor
          </DialogTitle>
          <DialogDescription>
            <strong className="text-foreground">{operatorName}</strong> has been deactivated.
            You must email <strong className="text-foreground">{RECIPIENT_NAME}</strong> (<span className="font-mono">{RECIPIENT_EMAIL}</span>) before continuing. This dialog cannot be dismissed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Recipients summary */}
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Mail className="h-3 w-3" /> To
            </div>
            <div className="mt-1 font-medium text-foreground">{RECIPIENT_NAME} &lt;{RECIPIENT_EMAIL}&gt;</div>
          </div>

          {/* CC */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">CC</Label>
            <p className="text-[11px] text-muted-foreground">Pre-filled with you and the owner. Add more if needed.</p>
            <div className="flex gap-2">
              <Input
                type="email"
                value={ccInput}
                onChange={e => setCcInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCc(); } }}
                placeholder="name@example.com"
                className="h-8 text-xs flex-1"
                disabled={ccEmails.length >= 15 || sending}
              />
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs px-3"
                onClick={addCc}
                disabled={ccEmails.length >= 15 || sending}
              >Add</Button>
            </div>
            {ccEmails.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {ccEmails.map(email => (
                  <span key={email} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted border border-border text-foreground">
                    {email}
                    <button
                      type="button"
                      onClick={() => setCcEmails(prev => prev.filter(e => e !== email))}
                      className="text-muted-foreground hover:text-destructive ml-0.5 leading-none"
                      disabled={sending}
                      aria-label={`Remove ${email}`}
                    >×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Driver + unit (read-only) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Driver</Label>
              <Input value={operatorName} readOnly className="h-9 text-sm bg-muted/40" />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Unit #</Label>
              <Input value={unitNumber ?? ''} readOnly placeholder="—" className="h-9 text-sm bg-muted/40" />
            </div>
          </div>

          {/* Termination date */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Termination Date <span className="text-destructive">*</span>
            </Label>
            <DateInput
              value={terminationDate}
              onChange={v => setTerminationDate(v ?? '')}
              className="h-9 text-sm"
            />
          </div>

          {/* Reason */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Reason for Deactivation <span className="text-destructive">*</span>
            </Label>
            <Select value={reason} onValueChange={setReason} disabled={sending}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select a reason…" />
              </SelectTrigger>
              <SelectContent>
                {REASON_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Rehire */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Available for Rehire? <span className="text-destructive">*</span>
            </Label>
            <div className="mt-1.5 flex gap-2">
              {(['yes','no'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setRehire(v)}
                  disabled={sending}
                  className={
                    'flex-1 h-9 rounded-md border text-sm font-medium transition ' +
                    (rehire === v
                      ? (v === 'yes'
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                          : 'bg-red-50 border-red-500 text-red-800')
                      : 'bg-background border-border text-foreground hover:bg-muted/40')
                  }
                >
                  {v === 'yes' ? 'Yes' : 'No'}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              maxLength={5000}
              placeholder="Add any context Tracey should know…"
              className="text-sm"
              disabled={sending}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          <p className="text-[11px] text-muted-foreground">
            Tracey can reply to this email; her reply will reach you and everyone copied on the thread.
          </p>

          <Button
            type="button"
            className="w-full bg-gold hover:bg-gold/90 text-black gap-1.5"
            onClick={handleSend}
            disabled={!canSend}
          >
            {sending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
              : <><Send className="h-4 w-4" /> Send Email to {RECIPIENT_NAME}</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}