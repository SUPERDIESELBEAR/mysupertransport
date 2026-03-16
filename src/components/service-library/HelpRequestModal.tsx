import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { HelpCircle } from 'lucide-react';

interface HelpRequestModalProps {
  open: boolean;
  onClose: () => void;
  serviceId: string;
  serviceName: string;
  resourceId?: string | null;
  resourceTitle?: string | null;
}

export default function HelpRequestModal({
  open, onClose, serviceId, serviceName, resourceId, resourceTitle,
}: HelpRequestModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('service_help_requests').insert({
        service_id: serviceId,
        resource_id: resourceId ?? null,
        user_id: user.id,
        message: message.trim() || null,
        status: 'Open',
      });
      if (error) throw error;

      // Notify staff via existing notification system
      // Insert notification for all staff/management
      const { data: staffRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['onboarding_staff', 'management']);

      if (staffRoles && staffRoles.length > 0) {
        const notifs = staffRoles.map((r: any) => ({
          user_id: r.user_id,
          title: `Help Request — ${serviceName}`,
          body: resourceTitle
            ? `A driver needs help with "${resourceTitle}" in ${serviceName}.`
            : `A driver submitted a help request for ${serviceName}.`,
          type: 'service_help_request',
          channel: 'in_app' as const,
          link: '/staff',
        }));
        await supabase.from('notifications').insert(notifs);
      }

      toast({ title: 'Help request sent ✓', description: 'Your coordinator will follow up shortly.' });
      setMessage('');
      onClose();
    } catch {
      toast({ title: 'Error', description: 'Could not submit your request. Please try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            I need help with this
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-0.5">{serviceName}</p>
            {resourceTitle && <p className="text-xs">{resourceTitle}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Describe your issue <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              placeholder="What are you having trouble with? The more detail, the faster we can help."
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
              {submitting ? 'Sending…' : 'Send Help Request'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
