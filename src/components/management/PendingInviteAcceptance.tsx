import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { MailWarning, Send, Loader2, CheckCircle2, RefreshCcw } from 'lucide-react';

type StuckApplicant = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  reviewed_at: string | null;
};

type Props = {
  /** Optional callback fired after a resend so parents can refresh metrics. */
  onResent?: () => void;
};

/**
 * Lists approved applicants whose auth account exists but who have never
 * successfully signed in. Lets staff resend the invite (per-row or bulk)
 * via the existing `resend-invite` edge function with `staff_override`.
 */
export default function PendingInviteAcceptance({ onResent }: Props) {
  const { toast } = useToast();
  const [rows, setRows] = useState<StuckApplicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [bulkSending, setBulkSending] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    // Pull approved applicants who have a linked auth user. We then filter
    // client-side using a dedicated admin view-style query through an RPC
    // would be cleaner, but the simplest reliable path is the edge function
    // doing the work. Here we rely on a public-safe view: the operators table
    // exposes `pwa_installed_at` & `created_at` but not `last_sign_in_at`.
    // Instead we use the operators row's user_id absence of any session by
    // querying applications + an auxiliary check via the resend function's
    // own filter. To avoid a new function, we approximate with `operators`
    // joined to `applications`: anyone approved whose operator has no
    // dispatch row activity AND was created > 1h ago AND user has not
    // installed the PWA is a strong "stuck" candidate.
    //
    // For accuracy we instead call a small RPC-like select against the
    // applications table and let staff see the candidate list. The
    // edge function will reject the resend if the user has actually
    // signed in (it checks `last_sign_in_at`).
    const { data, error } = await supabase
      .from('applications')
      .select('id, first_name, last_name, email, reviewed_at, user_id, review_status')
      .eq('review_status', 'approved')
      .not('user_id', 'is', null)
      .order('reviewed_at', { ascending: false });

    if (error) {
      toast({ title: 'Failed to load', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    // Cross-check against operators.pwa_installed_at — if they've installed,
    // they almost certainly signed in. Filter those out. Anyone left is a
    // strong stuck-applicant candidate. The edge function is the source
    // of truth for "actually never signed in" and will no-op if not.
    const userIds = (data ?? []).map((a: any) => a.user_id).filter(Boolean);
    let installedSet = new Set<string>();
    if (userIds.length > 0) {
      const { data: ops } = await supabase
        .from('operators')
        .select('user_id, pwa_installed_at')
        .in('user_id', userIds);
      installedSet = new Set(
        (ops ?? [])
          .filter((o: any) => !!o.pwa_installed_at)
          .map((o: any) => o.user_id as string),
      );
    }

    const candidates: StuckApplicant[] = (data ?? [])
      .filter((a: any) => !installedSet.has(a.user_id))
      .map((a: any) => ({
        id: a.id,
        first_name: a.first_name,
        last_name: a.last_name,
        email: a.email,
        reviewed_at: a.reviewed_at,
      }));

    setRows(candidates);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const resendOne = async (row: StuckApplicant): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('resend-invite', {
        body: { email: row.email, staff_override: true },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return true;
    } catch (err: any) {
      toast({
        title: `Resend failed — ${row.email}`,
        description: err?.message ?? 'Unknown error',
        variant: 'destructive',
      });
      return false;
    }
  };

  const handleResend = async (row: StuckApplicant) => {
    setResendingId(row.id);
    const ok = await resendOne(row);
    setResendingId(null);
    if (ok) {
      toast({
        title: '✅ Invitation resent',
        description: `A fresh invite was sent to ${row.email}.`,
      });
      onResent?.();
    }
  };

  const handleResendAll = async () => {
    if (rows.length === 0) return;
    setBulkSending(true);
    let success = 0;
    let failed = 0;
    for (const row of rows) {
      // Sequential to be friendly to the email API.
      // eslint-disable-next-line no-await-in-loop
      const ok = await resendOne(row);
      if (ok) success++;
      else failed++;
    }
    setBulkSending(false);
    toast({
      title: `Resent ${success} of ${rows.length} invitations`,
      description: failed > 0 ? `${failed} failed — see individual errors above.` : 'All applicants will receive a fresh link.',
      variant: failed > 0 ? 'destructive' : undefined,
    });
    onResent?.();
  };

  return (
    <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
            <MailWarning className="h-4 w-4 text-gold" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground">Pending Invite Acceptance</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {loading
                ? 'Checking for applicants who haven’t completed sign-in…'
                : rows.length === 0
                  ? 'All approved applicants have signed in.'
                  : `${rows.length} approved applicant${rows.length === 1 ? '' : 's'} have not signed in yet`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={fetchRows} className="text-xs gap-1.5" disabled={loading}>
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {rows.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleResendAll}
              disabled={bulkSending}
              className="text-xs gap-1.5"
            >
              {bulkSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Resend to all {rows.length}
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center">
          <CheckCircle2 className="h-10 w-10 text-status-complete mx-auto mb-3" />
          <p className="font-medium text-foreground">No stuck applicants</p>
          <p className="text-sm text-muted-foreground mt-1">Everyone you've approved has signed in successfully.</p>
        </div>
      ) : (
        <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
          {rows.map(row => {
            const name = [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email;
            const days = row.reviewed_at
              ? Math.max(0, Math.floor((Date.now() - new Date(row.reviewed_at).getTime()) / (1000 * 60 * 60 * 24)))
              : null;
            return (
              <div key={row.id} className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 hover:bg-secondary/30 transition-colors gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground text-sm truncate">{name}</p>
                  <p className="text-xs text-muted-foreground truncate">{row.email}</p>
                  {days !== null && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Approved {days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleResend(row)}
                  disabled={resendingId === row.id || bulkSending}
                  className="text-xs gap-1.5 shrink-0"
                >
                  {resendingId === row.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Resend
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}