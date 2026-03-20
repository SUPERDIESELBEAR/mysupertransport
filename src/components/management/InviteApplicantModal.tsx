import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Mail, Send, Loader2 } from 'lucide-react';

interface InviteApplicantModalProps {
  open: boolean;
  onClose: () => void;
  onInviteSent: () => void;
}

export default function InviteApplicantModal({ open, onClose, onInviteSent }: InviteApplicantModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '', note: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.first_name.trim()) errs.first_name = 'First name is required';
    if (!form.last_name.trim()) errs.last_name = 'Last name is required';
    if (!form.email.trim()) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = 'Enter a valid email address';
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const { data: { session: s } } = await supabase.auth.getSession();
      const authToken = s?.access_token ?? anonKey;

      const res = await fetch(`${supabaseUrl}/functions/v1/invite-applicant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}`, 'apikey': anonKey },
        body: JSON.stringify({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim() || null,
          note: form.note.trim() || null,
        }),
      });
      const data = await res.json();
      const error = res.ok ? null : new Error(data?.error ?? `HTTP ${res.status}`);

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.email_sent) {
        toast({ title: '✅ Invite Sent', description: `An invite email has been sent to ${form.email.trim()}.` });
      } else {
        toast({
          title: 'Invite Recorded',
          description: `The invite was saved but the email could not be delivered. Check the Invited tab for details.`,
          variant: 'destructive',
        });
      }

      setForm({ first_name: '', last_name: '', email: '', phone: '', note: '' });
      onInviteSent();
      onClose();
    } catch (err: unknown) {
      toast({
        title: 'Failed to Send Invite',
        description: err instanceof Error ? err.message : 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const field = (id: keyof typeof form) => ({
    value: form[id],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [id]: e.target.value })),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="h-9 w-9 rounded-lg bg-gold/15 flex items-center justify-center">
              <Mail className="h-4.5 w-4.5 text-gold" />
            </div>
            <DialogTitle>Invite Someone to Apply</DialogTitle>
          </div>
          <DialogDescription>
            Enter their contact details and we'll send a branded invite email with a link to the application.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="invite-fn">First Name <span className="text-destructive">*</span></Label>
              <Input id="invite-fn" placeholder="James" {...field('first_name')} />
              {errors.first_name && <p className="text-xs text-destructive">{errors.first_name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-ln">Last Name <span className="text-destructive">*</span></Label>
              <Input id="invite-ln" placeholder="Rivera" {...field('last_name')} />
              {errors.last_name && <p className="text-xs text-destructive">{errors.last_name}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email Address <span className="text-destructive">*</span></Label>
            <Input id="invite-email" type="email" placeholder="james@example.com" {...field('email')} />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-phone">Phone <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
            <Input id="invite-phone" type="tel" placeholder="(555) 000-0000" {...field('phone')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-note">Personal Note <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
            <Textarea
              id="invite-note"
              placeholder="Add a personal message that will appear in the invite email…"
              className="resize-none h-20 text-sm"
              {...field('note')}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send Invite
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
