import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { BdayAnnivEvent } from '@/hooks/useStaffBirthdayAnniversaryEvents';
import { anniversaryDefaults, birthdayDefaults } from '@/lib/birthdayAnniversary/templates';
import { getEdgeFunctionErrorMessage } from '@/lib/edgeFunctionError';

interface Props {
  event: BdayAnnivEvent | null;
  onClose: () => void;
  onSent: (ev: BdayAnnivEvent) => void;
}

export default function SendBirthdayAnniversaryModal({ event, onClose, onSent }: Props) {
  const open = !!event;
  const defaults = useMemo(() => {
    if (!event) return { subject: '', body: '' };
    return event.kind === 'birthday'
      ? birthdayDefaults({ firstName: event.firstName })
      : anniversaryDefaults({ firstName: event.firstName, years: event.years });
  }, [event]);

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [sendInApp, setSendInApp] = useState(true);
  const [sending, setSending] = useState(false);
  const [prefsBlocked, setPrefsBlocked] = useState<{ email: boolean; inApp: boolean }>({ email: false, inApp: false });

  useEffect(() => {
    if (!event) return;
    setSubject(defaults.subject);
    setBody(defaults.body);
    setSendEmail(true);
    setSendInApp(true);
    setPrefsBlocked({ email: false, inApp: false });
    // Check driver's notification preferences (best-effort)
    if (event.userId) {
      supabase
        .from('notification_preferences')
        .select('email_enabled, in_app_enabled')
        .eq('user_id', event.userId)
        .eq('event_type', 'birthday_anniversary')
        .maybeSingle()
        .then(({ data }) => {
          if (!data) return;
          const emailBlocked = (data as any).email_enabled === false;
          const inAppBlocked = (data as any).in_app_enabled === false;
          setPrefsBlocked({ email: emailBlocked, inApp: inAppBlocked });
          if (emailBlocked) setSendEmail(false);
          if (inAppBlocked) setSendInApp(false);
        });
    }
  }, [event, defaults]);

  if (!event) return null;

  const canSend = (sendEmail && !!event.email) || sendInApp && !!event.userId;

  const handleSend = async () => {
    if (!canSend || sending) return;
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('send-staff-birthday-message', {
        body: {
          operatorId: event.operatorId,
          kind: event.kind,
          subject: subject.trim(),
          body: body.trim(),
          sendEmail: sendEmail && !!event.email,
          sendInApp: sendInApp && !!event.userId,
          years: event.years ?? null,
        },
      });
      if (error) {
        const msg = await getEdgeFunctionErrorMessage(error, 'Failed to send message.');
        toast.error(msg);
        return;
      }
      toast.success(`Message sent to ${event.firstName}.`);
      onSent(event);
    } finally {
      setSending(false);
    }
  };

  const eventLabel = event.kind === 'birthday'
    ? '🎂 Birthday Message'
    : `🎉 ${event.years ?? ''}-Year Anniversary Message`.replace('  ', ' ');

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{eventLabel} — {event.firstName} {event.lastName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bday-subject">Subject</Label>
            <Input
              id="bday-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={sending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bday-body">Message</Label>
            <Textarea
              id="bday-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              disabled={sending}
              className="font-normal"
            />
          </div>

          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Send via</p>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={sendEmail}
                onCheckedChange={(v) => setSendEmail(!!v)}
                disabled={sending || !event.email || prefsBlocked.email}
              />
              <span>Email {event.email ? <span className="text-muted-foreground">({event.email})</span> : <span className="text-destructive">— no email on file</span>}</span>
              {prefsBlocked.email && <span className="text-[11px] text-muted-foreground">— driver opted out</span>}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={sendInApp}
                onCheckedChange={(v) => setSendInApp(!!v)}
                disabled={sending || !event.userId || prefsBlocked.inApp}
              />
              <span>In-app notification {!event.userId && <span className="text-destructive">— driver has no login</span>}</span>
              {prefsBlocked.inApp && <span className="text-[11px] text-muted-foreground">— driver opted out</span>}
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button onClick={handleSend} disabled={!canSend || sending || !subject.trim() || !body.trim()}>
            {sending ? 'Sending…' : 'Send Message'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}