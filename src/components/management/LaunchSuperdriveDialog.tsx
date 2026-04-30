import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Search, Rocket, CheckCircle2, AlertCircle, Clock, Send, MailX, UserX } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';

interface EligibleOperator {
  operator_id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  last_invited_at: string | null;
  audience: 'pre_existing' | 'app_onboarded';
}

type SendStatus = 'sent' | 'recently_invited' | 'no_email' | 'no_user_account' | 'not_eligible' | 'error';

interface SendResult {
  operator_id: string;
  email?: string;
  status: SendStatus;
  message?: string;
  last_invited_at?: string;
}

interface SendSummary {
  total: number;
  sent: number;
  recently_invited: number;
  no_email: number;
  no_user_account: number;
  not_eligible: number;
  errors: number;
}

interface LaunchSuperdriveDialogProps {
  open: boolean;
  onClose: () => void;
}

type FilterMode = 'all' | 'never_invited' | 'invited_recently';
type EmailTemplate = 'binder' | 'full';
type AudienceMode = 'pre_existing' | 'app_onboarded' | 'all';

const COOLDOWN_DAYS = 30;
const PRE_EXISTING_NOTE = 'Pre-existing operator added directly';

export default function LaunchSuperdriveDialog({ open, onClose }: LaunchSuperdriveDialogProps) {
  const { session } = useAuth();
  const { toast } = useToast();
  const { guardDemo } = useDemoMode();

  const [loading, setLoading] = useState(false);
  const [operators, setOperators] = useState<EligibleOperator[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('never_invited');
  const [sending, setSending] = useState(false);
  const [resultMap, setResultMap] = useState<Record<string, SendResult>>({});
  const [summary, setSummary] = useState<SendSummary | null>(null);
  const [template, setTemplate] = useState<EmailTemplate>('binder');
  const [forceResend, setForceResend] = useState(false);
  const [audienceMode, setAudienceMode] = useState<AudienceMode>('pre_existing');

  // Load eligible pre-existing operators
  const loadOperators = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all fully-onboarded active operators. Audience (pre-existing vs
      // app-onboarded) is derived client-side from applications.reviewer_notes.
      const { data: rows, error } = await supabase
        .from('operators')
        .select(`
          id,
          user_id,
          is_active,
          onboarding_status!inner(fully_onboarded),
          applications(first_name, last_name, email, reviewer_notes)
        `)
        .eq('is_active', true)
        .eq('onboarding_status.fully_onboarded', true);

      if (error) throw error;

      const operatorIds = (rows ?? []).map((r: any) => r.id);

      // Fetch most-recent audit_log entry per operator (welcome-superdrive sends)
      let lastInvitedMap: Record<string, string> = {};
      if (operatorIds.length > 0) {
        const { data: auditRows } = await supabase
          .from('audit_log')
          .select('entity_id, created_at')
          .eq('action', 'superdrive_invite_sent')
          .eq('entity_type', 'operator')
          .in('entity_id', operatorIds)
          .order('created_at', { ascending: false });

        for (const row of auditRows ?? []) {
          const eid = (row as any).entity_id;
          if (eid && !lastInvitedMap[eid]) lastInvitedMap[eid] = (row as any).created_at;
        }
      }

      const eligible: EligibleOperator[] = (rows ?? [])
        .map((r: any) => ({
          operator_id: r.id,
          user_id: r.user_id,
          first_name: r.applications?.first_name ?? '',
          last_name: r.applications?.last_name ?? '',
          email: r.applications?.email ?? '',
          last_invited_at: lastInvitedMap[r.id] ?? null,
          audience: (r.applications?.reviewer_notes === PRE_EXISTING_NOTE
            ? 'pre_existing'
            : 'app_onboarded') as 'pre_existing' | 'app_onboarded',
        }))
        .filter(op => !!op.email)
        .sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`));

      setOperators(eligible);
    } catch (err: any) {
      toast({
        title: 'Failed to load operators',
        description: err?.message ?? 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set());
      setSearchQuery('');
      setFilterMode('never_invited');
      setResultMap({});
      setSummary(null);
      setTemplate('binder');
      setForceResend(false);
      setAudienceMode('pre_existing');
      loadOperators();
    }
  }, [open, loadOperators]);

  const cooldownCutoffMs = Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

  const isInCooldown = useCallback((op: EligibleOperator) => {
    if (!op.last_invited_at) return false;
    const sentMs = new Date(op.last_invited_at).getTime();
    return sentMs > cooldownCutoffMs;
  }, [cooldownCutoffMs]);

  const filteredOperators = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return operators.filter(op => {
      // Audience scope
      if (audienceMode === 'pre_existing' && op.audience !== 'pre_existing') return false;
      if (audienceMode === 'app_onboarded' && op.audience !== 'app_onboarded') return false;
      // Filter mode
      if (filterMode === 'never_invited' && op.last_invited_at) return false;
      if (filterMode === 'invited_recently' && !isInCooldown(op)) return false;
      // Search
      if (q) {
        const haystack = `${op.first_name} ${op.last_name} ${op.email}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [operators, searchQuery, filterMode, isInCooldown, audienceMode]);

  // Reset selection whenever audience changes — selecting a row in one audience
  // and then switching could send the wrong template, so make it explicit.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [audienceMode]);

  const visibleSelectableIds = useMemo(
    () => filteredOperators.filter(op => forceResend || !isInCooldown(op)).map(op => op.operator_id),
    [filteredOperators, isInCooldown, forceResend]
  );

  const allVisibleSelected =
    visibleSelectableIds.length > 0 && visibleSelectableIds.every(id => selectedIds.has(id));

  const toggleSelect = (operatorId: string, op: EligibleOperator) => {
    if (isInCooldown(op) && !forceResend) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(operatorId)) next.delete(operatorId);
      else next.add(operatorId);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleSelectableIds) next.delete(id);
      } else {
        for (const id of visibleSelectableIds) next.add(id);
      }
      return next;
    });
  };

  const selectNeverInvited = () => {
    const ids = filteredOperators.filter(op => !op.last_invited_at).map(op => op.operator_id);
    setSelectedIds(new Set(ids));
  };

  const handleSend = async () => {
    if (guardDemo()) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setSending(true);
    setResultMap({});
    setSummary(null);

    try {
      const { data, error } = await supabase.functions.invoke('launch-superdrive-invite', {
        body: {
          operator_ids: ids,
          template,
          force: forceResend,
          audience_routing: audienceMode !== 'pre_existing',
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (error || (data as any)?.error) {
        throw new Error(error?.message ?? (data as any)?.error ?? 'Send failed');
      }

      const results: SendResult[] = (data as any).results ?? [];
      const map: Record<string, SendResult> = {};
      for (const r of results) map[r.operator_id] = r;
      setResultMap(map);
      setSummary((data as any).summary);

      toast({
        title: 'SUPERDRIVE invites processed',
        description: `${(data as any).summary.sent} sent · ${(data as any).summary.recently_invited} skipped (cooldown) · ${(data as any).summary.errors} errors`,
      });

      // Refresh "last invited" timestamps for the rows we just sent to
      await loadOperators();
      setSelectedIds(new Set());
    } catch (err: any) {
      toast({
        title: 'Failed to send invites',
        description: err?.message ?? 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const renderStatusBadge = (op: EligibleOperator) => {
    const result = resultMap[op.operator_id];
    if (result) {
      switch (result.status) {
        case 'sent':
          return <Badge className="bg-status-complete/15 text-status-complete border-status-complete/30 gap-1"><CheckCircle2 className="h-3 w-3" />Sent</Badge>;
        case 'recently_invited':
          return <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300"><Clock className="h-3 w-3" />Cooldown</Badge>;
        case 'no_email':
          return <Badge variant="outline" className="gap-1 text-muted-foreground"><MailX className="h-3 w-3" />No email</Badge>;
        case 'no_user_account':
          return <Badge variant="outline" className="gap-1 text-muted-foreground"><UserX className="h-3 w-3" />No account</Badge>;
        case 'error':
          return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />Error</Badge>;
      }
    }
    if (isInCooldown(op) && op.last_invited_at) {
      return (
        <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300">
          <Clock className="h-3 w-3" />
          Sent {formatDistanceToNow(parseISO(op.last_invited_at), { addSuffix: true })}
        </Badge>
      );
    }
    if (op.last_invited_at) {
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Last sent {formatDistanceToNow(parseISO(op.last_invited_at), { addSuffix: true })}
        </Badge>
      );
    }
    return <Badge className="bg-gold/15 text-gold-muted border-gold/30">Never invited</Badge>;
  };

  // Counts for the audience picker — based on the FULL operator list, not the
  // currently filtered view, so the picker labels stay stable.
  const audienceCounts = useMemo(() => {
    const pre = operators.filter(o => o.audience === 'pre_existing').length;
    const app = operators.filter(o => o.audience === 'app_onboarded').length;
    return { pre, app, all: pre + app };
  }, [operators]);

  // Counts for the filter chips — scoped to the current audience.
  const audienceScoped = useMemo(
    () => operators.filter(op => {
      if (audienceMode === 'pre_existing') return op.audience === 'pre_existing';
      if (audienceMode === 'app_onboarded') return op.audience === 'app_onboarded';
      return true;
    }),
    [operators, audienceMode]
  );
  const totalNeverInvited = audienceScoped.filter(op => !op.last_invited_at).length;
  const totalEligible = audienceScoped.length;

  const showTemplatePicker = audienceMode === 'pre_existing';
  const showAudienceRoutingNote = audienceMode === 'all';
  const showAppAnnouncementNote = audienceMode === 'app_onboarded';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !sending && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90dvh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Rocket className="h-5 w-5 text-gold" />
            Launch SUPERDRIVE Invite
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Branded emails tuned per audience — only pre-existing drivers get a password-setup link.
          </p>
        </DialogHeader>

        {/* Audience picker */}
        <div className="px-6 py-2 border-b bg-background">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Audience</p>
          <div className="grid sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setAudienceMode('pre_existing')}
              disabled={sending}
              className={`text-left px-2.5 py-1.5 rounded-md border transition ${
                audienceMode === 'pre_existing' ? 'border-gold bg-gold/10' : 'border-border hover:bg-muted/50'
              }`}
            >
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                {audienceMode === 'pre_existing' && <CheckCircle2 className="h-3.5 w-3.5 text-gold" />}
                Pre-existing ({audienceCounts.pre})
              </p>
            </button>
            <button
              type="button"
              onClick={() => setAudienceMode('app_onboarded')}
              disabled={sending}
              className={`text-left px-2.5 py-1.5 rounded-md border transition ${
                audienceMode === 'app_onboarded' ? 'border-gold bg-gold/10' : 'border-border hover:bg-muted/50'
              }`}
            >
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                {audienceMode === 'app_onboarded' && <CheckCircle2 className="h-3.5 w-3.5 text-gold" />}
                App-onboarded ({audienceCounts.app})
              </p>
            </button>
            <button
              type="button"
              onClick={() => setAudienceMode('all')}
              disabled={sending}
              className={`text-left px-2.5 py-1.5 rounded-md border transition ${
                audienceMode === 'all' ? 'border-gold bg-gold/10' : 'border-border hover:bg-muted/50'
              }`}
            >
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                {audienceMode === 'all' && <CheckCircle2 className="h-3.5 w-3.5 text-gold" />}
                All onboarded ({audienceCounts.all})
              </p>
            </button>
          </div>

          {showAppAnnouncementNote && (
            <div className="mt-2 px-2 py-1.5 rounded-md border border-primary/30 bg-primary/5 text-[11px] text-foreground/80 leading-snug">
              Feature-announcement email only — <span className="font-semibold">no password reset</span>, existing logins untouched.
            </div>
          )}
          {showAudienceRoutingNote && (
            <div className="mt-2 px-2 py-1.5 rounded-md border border-primary/30 bg-primary/5 text-[11px] text-foreground/80 leading-snug">
              Auto-routes per driver: pre-existing get your selected template + password-setup link; app-onboarded get the announcement email only.
            </div>
          )}
        </div>

        {/* Template picker — only meaningful when sending to pre-existing drivers */}
        {showTemplatePicker && (
        <div className="px-6 py-2 border-b bg-background">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Email template</p>
          <div className="grid sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTemplate('binder')}
              disabled={sending}
              className={`text-left px-2.5 py-1.5 rounded-md border transition ${
                template === 'binder' ? 'border-gold bg-gold/10' : 'border-border hover:bg-muted/50'
              }`}
            >
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                {template === 'binder' && <CheckCircle2 className="h-3.5 w-3.5 text-gold" />}
                Inspection Binder intro <span className="text-muted-foreground font-normal">· recommended</span>
              </p>
            </button>
            <button
              type="button"
              onClick={() => setTemplate('full')}
              disabled={sending}
              className={`text-left px-2.5 py-1.5 rounded-md border transition ${
                template === 'full' ? 'border-gold bg-gold/10' : 'border-border hover:bg-muted/50'
              }`}
            >
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                {template === 'full' && <CheckCircle2 className="h-3.5 w-3.5 text-gold" />}
                Full feature tour
              </p>
            </button>
          </div>
        </div>
        )}

        {/* Force resend (always visible) */}
        <div className="px-6 py-2 border-b bg-background">
          <label className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md border border-amber-300/60 bg-amber-50 cursor-pointer hover:bg-amber-100/60 transition">
            <Checkbox
              checked={forceResend}
              onCheckedChange={(v) => setForceResend(v === true)}
              disabled={sending}
            />
            <p className="text-xs text-amber-900">
              <span className="font-semibold">Force resend</span> — bypass 30-day cooldown (recipients may get a duplicate).
            </p>
          </label>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 border-b bg-muted/30 flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            <Button
              variant={filterMode === 'never_invited' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterMode('never_invited')}
              className="text-xs h-8"
            >
              Never invited ({totalNeverInvited})
            </Button>
            <Button
              variant={filterMode === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterMode('all')}
              className="text-xs h-8"
            >
              All eligible ({totalEligible})
            </Button>
            <Button
              variant={filterMode === 'invited_recently' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterMode('invited_recently')}
              className="text-xs h-8"
            >
              In cooldown
            </Button>
          </div>
        </div>

        {/* Selection toolbar */}
        <div className="px-6 py-2.5 border-b flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={allVisibleSelected}
              onCheckedChange={toggleSelectAllVisible}
              disabled={visibleSelectableIds.length === 0 || sending}
            />
            <span className="text-muted-foreground">
              {selectedIds.size} of {filteredOperators.length} visible selected
            </span>
          </div>
          <button
            type="button"
            onClick={selectNeverInvited}
            disabled={sending || totalNeverInvited === 0}
            className="text-xs text-gold hover:text-gold-light underline disabled:opacity-50 disabled:no-underline"
          >
            Select all never-invited ({totalNeverInvited})
          </button>
        </div>

        {/* Operator list */}
        <ScrollArea className="flex-1 min-h-[320px]">
          <div className="px-6 py-2 pr-4">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading operators…
              </div>
            ) : filteredOperators.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                {operators.length === 0
                  ? 'No pre-existing operators found.'
                  : 'No operators match the current filter.'}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filteredOperators.map((op) => {
                  const cooldown = isInCooldown(op);
                  const checked = selectedIds.has(op.operator_id);
                  return (
                    <li
                      key={op.operator_id}
                      className={`flex items-center gap-3 py-2.5 ${cooldown && !forceResend ? 'opacity-60' : ''}`}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={(cooldown && !forceResend) || sending}
                        onCheckedChange={() => toggleSelect(op.operator_id, op)}
                        aria-label={`Select ${op.first_name} ${op.last_name}`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {op.first_name} {op.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{op.email}</p>
                      </div>
                      <div className="shrink-0">{renderStatusBadge(op)}</div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </ScrollArea>

        {/* Result summary */}
        {summary && (
          <div className="px-6 py-3 border-t bg-muted/30 text-xs flex flex-wrap gap-3">
            <span className="text-status-complete font-medium">✓ {summary.sent} sent</span>
            {summary.recently_invited > 0 && <span className="text-amber-600">⏳ {summary.recently_invited} cooldown</span>}
            {summary.no_email > 0 && <span className="text-muted-foreground">✉ {summary.no_email} no email</span>}
            {summary.no_user_account > 0 && <span className="text-muted-foreground">⊘ {summary.no_user_account} no account</span>}
            {summary.errors > 0 && <span className="text-destructive">⚠ {summary.errors} errors</span>}
          </div>
        )}

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t flex-row gap-2 sm:justify-between">
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Close
          </Button>
          <Button
            onClick={handleSend}
            disabled={selectedIds.size === 0 || sending}
            className="bg-gold text-surface-dark hover:bg-gold-light gap-2"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending
              ? `Sending ${selectedIds.size}…`
              : selectedIds.size === 0
              ? 'Select operators to send'
              : `Send to ${selectedIds.size} operator${selectedIds.size === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}