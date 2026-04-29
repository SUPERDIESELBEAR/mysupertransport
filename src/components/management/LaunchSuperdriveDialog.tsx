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

const COOLDOWN_DAYS = 30;

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

  // Load eligible pre-existing operators
  const loadOperators = useCallback(async () => {
    setLoading(true);
    try {
      // Pre-existing operators are flagged via the application's reviewer_notes
      const { data: rows, error } = await supabase
        .from('operators')
        .select('id, user_id, is_active, applications!inner(first_name, last_name, email, reviewer_notes)')
        .eq('is_active', true)
        .eq('applications.reviewer_notes', 'Pre-existing operator added directly');

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
  }, [operators, searchQuery, filterMode, isInCooldown]);

  const visibleSelectableIds = useMemo(
    () => filteredOperators.filter(op => !isInCooldown(op)).map(op => op.operator_id),
    [filteredOperators, isInCooldown]
  );

  const allVisibleSelected =
    visibleSelectableIds.length > 0 && visibleSelectableIds.every(id => selectedIds.has(id));

  const toggleSelect = (operatorId: string, op: EligibleOperator) => {
    if (isInCooldown(op)) return;
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
    const ids = operators.filter(op => !op.last_invited_at).map(op => op.operator_id);
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
        body: { operator_ids: ids, template },
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

  const totalNeverInvited = operators.filter(op => !op.last_invited_at).length;
  const totalEligible = operators.length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !sending && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90dvh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Rocket className="h-5 w-5 text-gold" />
            Launch SUPERDRIVE Invite
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1.5">
            Send the branded "Welcome to SUPERDRIVE" email to pre-existing operators with a one-click password setup link.
          </p>
        </DialogHeader>

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
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-2">
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
                      className={`flex items-center gap-3 py-2.5 ${cooldown ? 'opacity-60' : ''}`}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={cooldown || sending}
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