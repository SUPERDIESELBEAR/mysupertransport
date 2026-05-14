import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';

type TestKind = 'initial' | 'follow_up' | 'final_notice';

const TEMPLATE_BY_KIND: Record<TestKind, string> = {
  initial: 'pei-request-initial',
  follow_up: 'pei-request-follow-up',
  final_notice: 'pei-request-final-notice',
};

const LABELS: Record<TestKind, string> = {
  initial: 'Initial request',
  follow_up: 'Follow-up',
  final_notice: 'Final notice',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SendTestPEIDialog({ open, onOpenChange }: Props) {
  const [email, setEmail] = useState('');
  const [kind, setKind] = useState<TestKind>('initial');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email && !email) setEmail(data.user.email);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSend() {
    const recipient = email.trim().toLowerCase();
    if (!EMAIL_RE.test(recipient)) {
      toast.error('Please enter a valid email address.');
      return;
    }
    setSending(true);
    try {
      const siteOrigin =
        typeof window !== 'undefined' && window.location?.origin
          ? window.location.origin
          : 'https://mysupertransport.lovable.app';
      const responseUrl = `${siteOrigin.replace(/\/$/, '')}/pei/respond/test-token-preview`;

      const templateData = {
        applicantName: 'Test Applicant',
        employerName: 'Sample Trucking Co.',
        contactName: 'Jane Doe',
        employmentStartDate: '01/2022',
        employmentEndDate: '06/2024',
        responseUrl,
        deadlineDate: 'by December 1, 2026',
        daysRemaining: 14,
        subjectPrefix: '[TEST] ',
      };

      const { error } = await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: TEMPLATE_BY_KIND[kind],
          recipientEmail: recipient,
          idempotencyKey: `pei-test-${kind}-${recipient}-${Date.now()}`,
          templateData,
          subjectOverride: `[TEST] PEI ${LABELS[kind]} — Sample Trucking Co.`,
        },
      });
      if (error) throw error;
      toast.success(`Test PEI (${LABELS[kind]}) queued to ${recipient}.`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send test PEI.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send test PEI email</DialogTitle>
          <DialogDescription>
            Sends a sample PEI email using fake applicant and employer data. No real records are
            modified.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="test-pei-email">Recipient email</Label>
            <Input
              id="test-pei-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={sending}
            />
          </div>

          <div className="space-y-2">
            <Label>Template</Label>
            <RadioGroup
              value={kind}
              onValueChange={(v) => setKind(v as TestKind)}
              disabled={sending}
            >
              {(Object.keys(LABELS) as TestKind[]).map((k) => (
                <div key={k} className="flex items-center space-x-2">
                  <RadioGroupItem value={k} id={`test-pei-kind-${k}`} />
                  <Label htmlFor={`test-pei-kind-${k}`} className="font-normal cursor-pointer">
                    {LABELS[k]}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending} className="gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}