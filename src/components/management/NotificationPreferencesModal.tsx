import { useState, useEffect, useRef } from 'react';
import { Bell, CheckCircle2, XCircle, AlertTriangle, MessageCircle, FileText, Target, Paperclip, Truck, Loader2, Check, Banknote } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface EventPref {
  event_type: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
}

const EVENT_TYPES: { type: string; label: string; description: string; icon: React.ElementType; iconBg: string; iconColor: string }[] = [
  { type: 'application_approved',   label: 'Application Approved',    description: 'When an applicant is approved & invited', icon: CheckCircle2,  iconBg: 'bg-green-100',  iconColor: 'text-green-600' },
  { type: 'application_denied',     label: 'Application Denied',      description: 'When an applicant is denied',             icon: XCircle,        iconBg: 'bg-red-100',    iconColor: 'text-red-500' },
  { type: 'new_application',        label: 'New Application',         description: 'When a new driver application is submitted', icon: FileText,     iconBg: 'bg-muted',      iconColor: 'text-muted-foreground' },
  { type: 'truck_down',             label: 'Truck Down',              description: 'When an operator reports a truck down',   icon: AlertTriangle,  iconBg: 'bg-yellow-100', iconColor: 'text-yellow-500' },
  { type: 'dispatch_status_change', label: 'Dispatch Status Change',  description: "When an operator's dispatch status changes", icon: Truck,        iconBg: 'bg-muted',      iconColor: 'text-muted-foreground' },
  { type: 'onboarding_milestone',   label: 'Onboarding Milestone',    description: 'When an operator completes an onboarding step', icon: Target,    iconBg: 'bg-gold/15',    iconColor: 'text-gold' },
  { type: 'docs_uploaded',          label: 'Documents Uploaded',      description: 'When an operator uploads requested documents', icon: Paperclip,  iconBg: 'bg-muted',      iconColor: 'text-muted-foreground' },
  { type: 'pay_setup_submitted',    label: 'Pay Setup Submitted',     description: 'When an operator completes Stage 8 (Contractor Pay Setup)', icon: Banknote, iconBg: 'bg-gold/15', iconColor: 'text-gold' },
  { type: 'new_message',            label: 'New Message',             description: 'When you receive a new message',          icon: MessageCircle,  iconBg: 'bg-blue-100',   iconColor: 'text-blue-500' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

// Per-cell state: null | 'saving' | 'saved'
type CellState = 'saving' | 'saved' | null;

export default function NotificationPreferencesModal({ open, onClose }: Props) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Record<string, EventPref>>({});
  const [loading, setLoading] = useState(true);
  const [cellState, setCellState] = useState<Record<string, CellState>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Clean up timers on unmount
  useEffect(() => {
    return () => { Object.values(timers.current).forEach(clearTimeout); };
  }, []);

  useEffect(() => {
    if (open && session?.user?.id) fetchPrefs();
  }, [open, session?.user?.id]);

  const fetchPrefs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('notification_preferences')
      .select('event_type, in_app_enabled, email_enabled')
      .eq('user_id', session!.user.id);

    const map: Record<string, EventPref> = {};
    EVENT_TYPES.forEach(e => {
      map[e.type] = { event_type: e.type, in_app_enabled: true, email_enabled: true };
    });
    (data ?? []).forEach(row => {
      map[row.event_type] = { event_type: row.event_type, in_app_enabled: row.in_app_enabled, email_enabled: row.email_enabled };
    });
    setPrefs(map);
    setLoading(false);
  };

  const setCellStatus = (key: string, status: CellState) => {
    setCellState(prev => ({ ...prev, [key]: status }));
  };

  const toggle = async (eventType: string, channel: 'in_app_enabled' | 'email_enabled', value: boolean) => {
    if (!session?.user?.id) return;

    const key = `${eventType}-${channel}`;

    // Clear any existing fade-out timer for this cell
    if (timers.current[key]) {
      clearTimeout(timers.current[key]);
      delete timers.current[key];
    }

    setCellStatus(key, 'saving');

    const updated = { ...prefs[eventType], [channel]: value };
    setPrefs(prev => ({ ...prev, [eventType]: updated }));

    const { error } = await supabase
      .from('notification_preferences')
      .upsert(
        { user_id: session.user.id, event_type: eventType, in_app_enabled: updated.in_app_enabled, email_enabled: updated.email_enabled, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,event_type' }
      );

    if (error) {
      setPrefs(prev => ({ ...prev, [eventType]: prefs[eventType] }));
      setCellStatus(key, null);
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }

    // Show checkmark, then fade it out after 3.5 s
    setCellStatus(key, 'saved');
    timers.current[key] = setTimeout(() => {
      setCellStatus(key, null);
      delete timers.current[key];
    }, 3500);
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/10">
              <Bell className="h-4.5 w-4.5 text-gold" />
            </span>
            <div>
              <DialogTitle className="text-base font-semibold">Notification Preferences</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Choose how you receive each notification type</p>
            </div>
          </div>
        </DialogHeader>

        {/* Column headers */}
        <div className="px-6 py-2.5 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center">
            <div className="flex-1" />
            <div className="flex gap-6 pr-1">
              <span className="w-14 text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wide">In-App</span>
              <span className="w-14 text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Email</span>
            </div>
          </div>
        </div>

        {/* Preference rows */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-gold" />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {EVENT_TYPES.map(ev => {
                const pref = prefs[ev.type];
                const Icon = ev.icon;
                return (
                  <div key={ev.type} className="flex items-center gap-4 px-6 py-4 hover:bg-muted/20 transition-colors">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${ev.iconBg}`}>
                      <Icon className={`h-3.5 w-3.5 ${ev.iconColor}`} strokeWidth={2.5} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{ev.label}</p>
                      <p className="text-xs text-muted-foreground">{ev.description}</p>
                    </div>
                    <div className="flex items-center gap-6 shrink-0">
                      {(['in_app_enabled', 'email_enabled'] as const).map(channel => {
                        const key = `${ev.type}-${channel}`;
                        const state = cellState[key];
                        return (
                          <div key={channel} className="w-14 flex justify-center items-center relative">
                            {state === 'saving' ? (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : (
                              <>
                                <Switch
                                  checked={channel === 'in_app_enabled' ? (pref?.in_app_enabled ?? true) : (pref?.email_enabled ?? true)}
                                  onCheckedChange={v => toggle(ev.type, channel, v)}
                                />
                                {/* Saved checkmark: fades in then out */}
                                <span
                                  className={`
                                    pointer-events-none absolute -top-1 -right-1
                                    flex h-4 w-4 items-center justify-center rounded-full
                                    bg-green-500 text-white shadow-sm
                                    transition-all duration-300
                                    ${state === 'saved' ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}
                                  `}
                                >
                                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                                </span>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-border bg-muted/20 shrink-0">
          <p className="text-[11px] text-muted-foreground">Changes save instantly. Disabled channels will no longer deliver that notification type to you.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
