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

const SETTINGS_ROW_ID = '00000000-0000-0000-0000-000000000001';
const OWNER_EMAIL = 'marc@mysupertransport.com';
const OWNER_NAME = 'Marcus Mueller';
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
  onSent: (notifiedAt: string | null) => void;
}

/**
 * Mandatory dialog shown after a driver is deactivated. Staff MUST send the
 * email to the DOT Consultant before this dialog can close.
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
  const [toEmails, setToEmails] = useState<string[]>([]);
  const [toInput, setToInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sentAndClosing, setSentAndClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  // Saved DOT Consultant record (email + display name + greeting).
  const [consultantEmails, setConsultantEmails] = useState<string[]>([]);
  const [consultantName, setConsultantName] = useState('');
  const [greetingName, setGreetingName] = useState('');

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
    setSentAndClosing(false);
    setCcInput('');
    setToInput('');
    setInputError(null);
    setToEmails([]);

    // Pre-fill CC with the owner (locked) and the sender. The edge function
    // also auto-adds owner(s) server-side as a safety net.
    const defaults = new Set<string>();
    defaults.add(OWNER_EMAIL);
    if (senderEmail && EMAIL_RE.test(senderEmail)) defaults.add(senderEmail);
    setCcEmails(Array.from(defaults));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, operatorId, senderEmail]);

  // Load the saved DOT Consultant and pre-fill the To field with them.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('dot_consultant_email_settings')
        .select('recipient_emails, consultant_name, greeting_name')
        .eq('id', SETTINGS_ROW_ID)
        .maybeSingle();
      if (cancelled) return;
      const emails = (((data as any)?.recipient_emails ?? []) as unknown[])
        .filter((v): v is string => typeof v === 'string')
        .map(v => v.trim().toLowerCase())
        .filter(v => EMAIL_RE.test(v));
      setConsultantEmails(emails);
      setConsultantName(((data as any)?.consultant_name ?? '') as string);
      setGreetingName(((data as any)?.greeting_name ?? '') as string);
      setToEmails(emails);
    })();
    return () => { cancelled = true; };
  }, [open, operatorId]);

  const addCc = () => {
    const email = ccInput.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { setInputError('Enter a valid email address.'); return; }
    if (ccEmails.length >= 15) { setInputError('CC is limited to 15 addresses.'); return; }
    // Move from To → CC if present there
    if (toEmails.includes(email)) setToEmails(prev => prev.filter(e => e !== email));
    if (ccEmails.includes(email)) { setCcInput(''); return; }
    setCcEmails(prev => [...prev, email]);
    setCcInput('');
    setInputError(null);
  };

  const addTo = () => {
    const email = toInput.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { setInputError('Enter a valid email address.'); return; }
    if (toEmails.length >= 15) { setInputError('To is limited to 15 addresses.'); return; }
    // Move from CC → To if present there (owner stays permitted; the CC chip
    // remove button is hidden, but moving via the To input is intentional).
    if (ccEmails.includes(email)) setCcEmails(prev => prev.filter(e => e !== email));
    if (toEmails.includes(email)) { setToInput(''); return; }
    setToEmails(prev => [...prev, email]);
    setToInput('');
    setInputError(null);
  };

  const canSend = toEmails.length > 0 && !!terminationDate && !!reason && (rehire === 'yes' || rehire === 'no') && !sending;

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
          to_emails: toEmails,
          cc_emails: ccEmails,
          greeting_name: greetingName.trim() || null,
        },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (fnErr) throw new Error(fnErr.message || 'Failed to send email');
      if (!data?.success) throw new Error(data?.error || 'Failed to send email');

      const primary = consultantEmails.includes(toEmails[0]) && consultantName.trim()
        ? consultantName.trim()
        : toEmails[0];
      const extras = toEmails.length - 1;
      setSentAndClosing(true);
      toast({
        title: 'Deactivation email sent',
        description: `Sent to ${primary}${extras > 0 ? ` and ${extras} other${extras === 1 ? '' : 's'}` : ''}${ccEmails.length ? `, ${ccEmails.length} CC${ccEmails.length === 1 ? '' : 's'}` : ''}.`,
      });
      // Always close the dialog; only pass a timestamp when the consultant actually
      // received the email so the parent knows to clear the notification banner.
      onSent(data?.consultant_included && data?.notified_at ? data.notified_at : null);

    } catch (err: any) {
      const msg = err?.message ?? String(err);
      setError(msg);
      toast({ title: 'Email failed', description: msg, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  if (sentAndClosing) return null;

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
            Notify DOT Consultant
          </DialogTitle>
          <DialogDescription>
            <strong className="text-foreground">{operatorName}</strong> has been deactivated.
            Send the required notice to the DOT Consultant so DQ files and compliance records stay current.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* To */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Mail className="h-3 w-3" /> To <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <Input
                type="email"
                value={toInput}
                onChange={e => setToInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTo(); } }}
                placeholder="name@example.com"
                className="h-8 text-xs flex-1"
                disabled={toEmails.length >= 15 || sending}
              />
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs px-3"
                onClick={addTo}
                disabled={toEmails.length >= 15 || sending}
              >Add</Button>
            </div>
            {toEmails.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {toEmails.map(email => {
                  const isConsultant = consultantEmails.includes(email);
                  return (
                    <span
                      key={email}
                      className={
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ' +
                        (isConsultant
                          ? 'bg-gold/10 border-gold/40 text-foreground'
                          : 'bg-muted border-border text-foreground')
                      }
                    >
                      {isConsultant && consultantName.trim() ? `${consultantName.trim()} <${email}>` : email}
                      <button
                        type="button"
                        onClick={() => setToEmails(prev => prev.filter(e => e !== email))}
                        className="text-muted-foreground hover:text-destructive ml-0.5 leading-none"
                        disabled={sending}
                        aria-label={`Remove ${email}`}
                      >×</button>
                    </span>
                  );
                })}
              </div>
            )}
            {toEmails.length === 0 && (
              <p className="text-[11px] text-destructive pt-1">Add at least one recipient.</p>
            )}
            {inputError && (
              <p className="text-[11px] text-destructive pt-1">{inputError}</p>
            )}
          </div>

          {/* CC */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">CC</Label>
            <p className="text-[11px] text-muted-foreground">{OWNER_NAME} (owner) and you are pre-filled. Add more if needed.</p>
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
                {ccEmails.map(email => {
                  const isOwner = email === OWNER_EMAIL;
                  return (
                    <span
                      key={email}
                      className={
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ' +
                        (isOwner
                          ? 'bg-gold/10 border-gold/40 text-foreground'
                          : 'bg-muted border-border text-foreground')
                      }
                    >
                      {isOwner ? `${OWNER_NAME} <${email}>` : email}
                      {!isOwner && (
                        <button
                          type="button"
                          onClick={() => setCcEmails(prev => prev.filter(e => e !== email))}
                          className="text-muted-foreground hover:text-destructive ml-0.5 leading-none"
                          disabled={sending}
                          aria-label={`Remove ${email}`}
                        >×</button>
                      )}
                    </span>
                  );
                })}
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

          {/* Greeting */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email Greeting</Label>
            <Input
              value={greetingName}
              onChange={e => setGreetingName(e.target.value)}
              maxLength={60}
              placeholder="e.g. Tracey"
              className="h-9 text-sm"
              disabled={sending}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Email opens with “{greetingName.trim() ? `Hi ${greetingName.trim()}` : 'Hello'}, please find the deactivation details below.”
            </p>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              maxLength={5000}
              placeholder="Add any context the DOT Consultant should know…"
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
            The recipient can reply to this email; their reply will reach you and everyone copied on the thread.
          </p>

          <Button
            type="button"
            className="w-full bg-gold hover:bg-gold/90 text-black gap-1.5"
            onClick={handleSend}
            disabled={!canSend}
          >
            {sending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
              : <><Send className="h-4 w-4" /> Send Deactivation Notice</>}

          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}