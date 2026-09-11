import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Crown, ShieldAlert, Clock, Loader2 } from 'lucide-react';

/**
 * Ownership Transfer — the only screen that reaches the three ownership
 * functions built in Pass 3. It offers NOTHING else: there is no control here
 * that writes `user_roles` directly, because the database refuses that and the
 * UI must not present what the database will reject.
 *
 *   owner      -> initiate_owner_transfer / cancel_owner_transfer
 *   recipient  -> transfer_owner (accept) / cancel_owner_transfer (decline)
 */

export interface PendingTransfer {
  id: string;
  from_user_id: string;
  to_user_id: string;
  expires_at: string;
  initiated_at: string;
  status: string;
}

interface PersonRow {
  user_id: string;
  name: string;
}

const fullName = (p: { first_name: string | null; last_name: string | null }) =>
  [p.first_name, p.last_name].filter(Boolean).join(' ').trim();

export function formatExpiry(expiresAt: string, now: Date = new Date()): string {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (ms <= 0) return 'Expired';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 1) return `Expires in ${hours}h ${minutes}m`;
  return `Expires in ${minutes}m`;
}

export default function OwnershipTransferPage() {
  const { user, isOwner } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingTransfer | null>(null);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [candidates, setCandidates] = useState<PersonRow[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [confirmInitiate, setConfirmInitiate] = useState(false);
  const [confirmAccept, setConfirmAccept] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: transfers, error: tErr } = await supabase
        .from('owner_transfers')
        .select('id, from_user_id, to_user_id, expires_at, initiated_at, status')
        .eq('status', 'pending')
        .order('initiated_at', { ascending: false })
        .limit(1);
      if (tErr) throw tErr;

      const { data: roleRows, error: rErr } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'management');
      if (rErr) throw rErr;

      const managementIds = (roleRows ?? []).map((r) => r.user_id);
      const wanted = new Set<string>(managementIds);
      transfers?.forEach((t) => { wanted.add(t.from_user_id); wanted.add(t.to_user_id); });

      let nameMap: Record<string, string> = {};
      if (wanted.size > 0) {
        const { data: profs, error: pErr } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name, account_status')
          .in('user_id', Array.from(wanted));
        if (pErr) throw pErr;
        nameMap = Object.fromEntries(
          (profs ?? []).map((p) => [p.user_id, fullName(p) || 'Unnamed user']),
        );
        setCandidates(
          (profs ?? [])
            .filter((p) => managementIds.includes(p.user_id) && p.user_id !== user?.id)
            .filter((p) => p.account_status === 'active')
            .map((p) => ({ user_id: p.user_id, name: fullName(p) || 'Unnamed user' }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      } else {
        setCandidates([]);
      }
      setPeople(nameMap);
      setPending((transfers ?? [])[0] ?? null);
    } catch (err) {
      toast({
        title: 'Could not load ownership transfer',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast, user?.id]);

  useEffect(() => { void load(); }, [load]);

  const iAmRecipient = !!pending && pending.to_user_id === user?.id;
  const iAmSender = !!pending && pending.from_user_id === user?.id;

  // The cancel link in the out-of-band owner email names the transfer; it carries
  // no authority. Arriving here still required a signed-in session, and the
  // cancel below still goes through cancel_owner_transfer(), which refuses
  // anyone who is not a party to the row.
  const [confirmCancel, setConfirmCancel] = useState(false);
  const linkedTransferId =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('cancel')
      : null;
  useEffect(() => {
    if (linkedTransferId && pending?.id === linkedTransferId && (iAmSender || iAmRecipient)) {
      setConfirmCancel(true);
    }
  }, [linkedTransferId, pending?.id, iAmSender, iAmRecipient]);


  const run = async (fn: () => Promise<{ error: unknown }>, ok: string) => {
    setBusy(true);
    try {
      const { error } = await fn();
      if (error) throw error;
      toast({ title: ok });
      await load();
    } catch (err) {
      toast({
        title: 'Refused',
        description:
          (err as { message?: string })?.message ?? 'The request was refused.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  // The out-of-band notice is deliberately NOT part of the transfer: the row is
  // already committed by the RPC. A mail failure is reported as a separate,
  // non-destructive warning and lands in the Email Log as a `failed` row.
  const onInitiate = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('initiate_owner_transfer', {
        p_to_user_id: selected,
      });
      if (error) throw error;
      toast({ title: 'Ownership transfer sent. It expires in 72 hours.' });
      const transferId = typeof data === 'string' ? data : null;
      if (transferId) {
        try {
          const { data: res, error: mailErr } = await supabase.functions.invoke(
            'notify-owner-transfer',
            { body: { transfer_id: transferId } },
          );
          if (mailErr || res?.sent === false) {
            toast({
              title: 'Transfer created, notice email not sent',
              description:
                'The transfer stands. The failed send is in Management → Email Log.',
            });
          }
        } catch {
          toast({
            title: 'Transfer created, notice email not sent',
            description:
              'The transfer stands. The failed send is in Management → Email Log.',
          });
        }
      }
      await load();
    } catch (err) {
      toast({
        title: 'Refused',
        description: (err as { message?: string })?.message ?? 'The request was refused.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };


  const onCancel = () =>
    run(
      async () => await supabase.rpc('cancel_owner_transfer', { p_transfer_id: pending!.id }),
      'Ownership transfer cancelled.',
    );

  const onAccept = () =>
    run(
      async () => await supabase.rpc('transfer_owner', { p_transfer_id: pending!.id }),
      'You are now the owner of this company.',
    );

  const expiryLabel = useMemo(
    () => (pending ? formatExpiry(pending.expires_at) : ''),
    [pending],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-10">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading ownership status…
      </div>
    );
  }

  if (!isOwner && !iAmRecipient) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground text-sm">
          Only the current owner can transfer ownership of this company. You have no
          ownership transfer waiting for you.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
          <Crown className="h-6 w-6 text-gold shrink-0" />
          Ownership Transfer
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Hand control of this company to another person.
        </p>
      </div>

      {/* ── The recipient's side. Shown first: it is the side with a decision
             waiting on it. ── */}
      {iAmRecipient && pending && (
        <Card className="border-gold/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-gold" />
              {people[pending.from_user_id] ?? 'The current owner'} is transferring
              ownership to you
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-gold/30 bg-gold/5 p-4 text-sm space-y-2">
              <p className="font-semibold text-foreground">If you accept:</p>
              <ul className="list-disc pl-5 space-y-1 text-foreground/90">
                <li>You become the owner of this company.</li>
                <li>
                  {people[pending.from_user_id] ?? 'The current owner'} stops being
                  the owner immediately.
                </li>
                <li>
                  It cannot be reversed, except by a new transfer back in the other
                  direction.
                </li>
              </ul>
            </div>
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3" /> {expiryLabel}
            </Badge>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => setConfirmAccept(true)}>
                Accept ownership
              </Button>
              <Button variant="outline" disabled={busy} onClick={onCancel}>
                Decline
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── The owner's side ── */}
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {pending && iAmSender ? 'Transfer in progress' : 'Transfer ownership'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm space-y-2">
              <p className="font-semibold text-destructive">
                This gives another person control of this company.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-foreground/90">
                <li>You lose the owner role the moment they accept.</li>
                <li>The new owner gains every owner-only power, including this screen.</li>
                <li>It cannot be undone once accepted.</li>
              </ul>
            </div>

            {pending && iAmSender ? (
              <div className="space-y-3">
                <p className="text-sm">
                  Pending transfer to{' '}
                  <span className="font-semibold">
                    {people[pending.to_user_id] ?? 'the selected user'}
                  </span>
                  .
                </p>
                <Badge variant="outline" className="gap-1">
                  <Clock className="h-3 w-3" /> {expiryLabel}
                </Badge>
                <div>
                  <Button variant="outline" disabled={busy} onClick={onCancel}>
                    Cancel transfer
                  </Button>
                </div>
              </div>
            ) : pending ? (
              <p className="text-sm text-muted-foreground">
                An ownership transfer is already pending.
              </p>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ownership can only be transferred to someone who already holds the
                management role. No other active management user exists yet — add one
                in Settings → Staff Directory first.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Transfer to</label>
                  <Select value={selected} onValueChange={setSelected}>
                    <SelectTrigger className="max-w-sm">
                      <SelectValue placeholder="Choose a management user" />
                    </SelectTrigger>
                    <SelectContent>
                      {candidates.map((c) => (
                        <SelectItem key={c.user_id} value={c.user_id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Only users who already hold management appear here. They have 72
                    hours to accept; either of you can cancel until then.
                  </p>
                </div>
                <Button
                  disabled={!selected || busy}
                  onClick={() => setConfirmInitiate(true)}
                >
                  Start ownership transfer
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmInitiate} onOpenChange={setConfirmInitiate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Transfer ownership to{' '}
              {candidates.find((c) => c.user_id === selected)?.name ?? 'this user'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They will be asked to accept. The moment they do, you stop being the
              owner of this company and they take your place. You can cancel any time
              before they accept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep ownership</AlertDialogCancel>
            <AlertDialogAction onClick={onInitiate}>Send transfer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this ownership transfer?</AlertDialogTitle>
            <AlertDialogDescription>
              The pending transfer will be withdrawn and nobody's role changes. If
              you did not start it, cancel it and change your password.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Leave it pending</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmCancel(false);
                void onCancel();
              }}
            >
              Cancel transfer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmAccept} onOpenChange={setConfirmAccept}>

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Become the owner of this company?</AlertDialogTitle>
            <AlertDialogDescription>
              You become the owner and the current owner ceases to be. This cannot be
              reversed except by a new transfer in the other direction.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={onAccept}>
              Accept ownership
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
