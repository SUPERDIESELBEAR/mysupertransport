import { useState, useEffect, useCallback } from 'react';
import { reminderErrorToast } from '@/lib/reminderError';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useBulkReminderCooldown } from '@/hooks/useBulkReminderCooldown';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ShieldAlert, Send, CheckCheck, RotateCcw, Loader2, ShieldCheck, ArrowUpDown, ArrowDown, ArrowUp, CheckCircle2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { differenceInDays, format } from 'date-fns';
import { parseLocalDate, formatDaysHuman } from './InspectionBinderTypes'; 
import { useToast } from '@/hooks/use-toast';
import { useComplianceWindow } from '@/hooks/useComplianceWindow';
import { ComplianceWindowPicker } from '@/components/shared/ComplianceWindowPicker';

// ── Types ──────────────────────────────────────────────────────────────────
export interface ComplianceAlert {
  operator_id: string;
  operator_name: string;
  doc_type: 'CDL' | 'Medical Cert';
  expiration_date: string;
  days_until: number;
}

interface Props {
  onOpenOperator?: (operatorId: string) => void;
  onOpenOperatorWithFocus?: (operatorId: string, focusField: 'cdl' | 'medcert') => void;
  /** When true the panel mounts with the "No Action" filter pre-applied */
  defaultNoActionOnly?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────
export default function ComplianceAlertsPanel({ onOpenOperator, onOpenOperatorWithFocus, defaultNoActionOnly = false }: Props) {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const { windowDays } = useComplianceWindow();

  const [alerts, setAlerts] = useState<ComplianceAlert[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [sort, setSort] = useState<'urgency' | 'last_action_asc' | 'last_action_desc'>('urgency');
  const [noActionOnly, setNoActionOnly] = useState(defaultNoActionOnly);
  const [docFilter, setDocFilter] = useState<'all' | 'CDL' | 'Medical Cert'>('all');

  // Outreach tracking
  const [lastReminded, setLastReminded] = useState<Record<string, string>>({});
  const [lastRemindedBy, setLastRemindedBy] = useState<Record<string, string>>({});
  const [lastReminderOutcome, setLastReminderOutcome] = useState<Record<string, { sent: boolean; error?: string }>>({});
  const [lastRenewed, setLastRenewed] = useState<Record<string, string>>({});
  const [lastRenewedBy, setLastRenewedBy] = useState<Record<string, string>>({});

  // Row-level action state
  const [reminderSending, setReminderSending] = useState<Record<string, boolean>>({});
  const [reminderSent, setReminderSent] = useState<Record<string, boolean>>({});
  const [rowRenewing, setRowRenewing] = useState<Record<string, boolean>>({});
  const [rowRenewed, setRowRenewed] = useState<Record<string, boolean>>({});

  // Bulk state
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkSentCount, setBulkSentCount] = useState<number | null>(null);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkRenewing, setBulkRenewing] = useState(false);
  const [bulkRenewedCount, setBulkRenewedCount] = useState<number | null>(null);
  const [showBulkRenewConfirm, setShowBulkRenewConfirm] = useState(false);
  const [noActionBulkSending, setNoActionBulkSending] = useState(false);
  const [noActionBulkSentCount, setNoActionBulkSentCount] = useState<number | null>(null);
  const [showNoActionBulkConfirm, setShowNoActionBulkConfirm] = useState(false);

  const { isCoolingDown: bulkCooldown, minutesLeft: bulkCooldownMinutes, lastSentLabel: bulkLastSentLabel, startCooldown: startBulkCooldown } = useBulkReminderCooldown('bulk-reminder-compliance-tab');
  const { isCoolingDown: noActionCooldown, minutesLeft: noActionCooldownMinutes, lastSentLabel: noActionLastSentLabel, startCooldown: startNoActionCooldown } = useBulkReminderCooldown('bulk-reminder-compliance-tab-noaction');

  // ── Data fetching ──────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    const today = new Date();
    const [{ data: ops }, { data: reminders }, { data: renewals }, { data: binderDocs }] = await Promise.all([
      supabase
        .from('operators')
        .select('id, user_id, application_id, applications(first_name, last_name, cdl_expiration, medical_cert_expiration)')
        .not('application_id', 'is', null)
        .eq('is_active', true),
      supabase
        .from('cert_reminders')
        .select('operator_id, doc_type, sent_at, sent_by_name, email_sent, email_error')
        .order('sent_at', { ascending: false }),
      supabase
        .from('audit_log' as any)
        .select('entity_id, actor_name, created_at, metadata')
        .eq('action', 'cert_renewed')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('inspection_documents')
        .select('driver_id, name, expires_at')
        .eq('scope', 'per_driver')
        .in('name', ['CDL (Front)', 'Medical Certificate']),
    ]);
    if (!ops) return;

    // Build binder expiry lookup: driver_id (user_id) → { cdl, med }
    const binderDates: Record<string, { cdl?: string; med?: string }> = {};
    (binderDocs ?? []).forEach((doc: any) => {
      if (!doc.driver_id || !doc.expires_at) return;
      if (!binderDates[doc.driver_id]) binderDates[doc.driver_id] = {};
      if (doc.name === 'CDL (Front)') binderDates[doc.driver_id].cdl = doc.expires_at;
      if (doc.name === 'Medical Certificate') binderDates[doc.driver_id].med = doc.expires_at;
    });

    const remindedMap: Record<string, string> = {};
    const remindedByMap: Record<string, string> = {};
    const outcomeMap: Record<string, { sent: boolean; error?: string }> = {};
    (reminders ?? []).forEach((r: any) => {
      const key = `${r.operator_id}|${r.doc_type}`;
      if (!remindedMap[key]) {
        remindedMap[key] = r.sent_at;
        if (r.sent_by_name) remindedByMap[key] = r.sent_by_name;
        outcomeMap[key] = { sent: r.email_sent ?? true, error: r.email_error ?? undefined };
      }
    });
    setLastReminded(remindedMap);
    setLastRemindedBy(remindedByMap);
    setLastReminderOutcome(outcomeMap);

    const renewedMap: Record<string, string> = {};
    const renewedByMap: Record<string, string> = {};
    (renewals ?? []).forEach((r: any) => {
      const docType = r.metadata?.document_type as string | undefined;
      if (!r.entity_id || !docType) return;
      const key = `${r.entity_id}|${docType}`;
      if (!renewedMap[key]) {
        renewedMap[key] = r.created_at;
        if (r.actor_name) renewedByMap[key] = r.actor_name;
      }
    });
    setLastRenewed(renewedMap);
    setLastRenewedBy(renewedByMap);

    const newAlerts: ComplianceAlert[] = [];
    (ops as any[]).forEach((op: any) => {
      const app = Array.isArray(op.applications) ? op.applications[0] : op.applications;
      if (!app) return;
      const name = `${app.first_name ?? ''} ${app.last_name ?? ''}`.trim() || 'Unknown Operator';
      (['cdl_expiration', 'medical_cert_expiration'] as const).forEach(field => {
        const binderDate = field === 'cdl_expiration' ? binderDates[op.user_id]?.cdl : binderDates[op.user_id]?.med;
        const dateStr: string | null = binderDate ?? app[field];
        if (!dateStr) return;
        const days = differenceInDays(parseLocalDate(dateStr), today);
        if (days <= windowDays) {
          newAlerts.push({
            operator_id: op.id,
            operator_name: name,
            doc_type: field === 'cdl_expiration' ? 'CDL' : 'Medical Cert',
            expiration_date: dateStr,
            days_until: days,
          });
        }
      });
    });

    const urgencyTier = (days: number) => days < 0 ? 0 : days <= 30 ? 1 : 2;
    newAlerts.sort((a, b) => {
      const tierDiff = urgencyTier(a.days_until) - urgencyTier(b.days_until);
      if (tierDiff !== 0) return tierDiff;
      const aRenewed = !!renewedMap[`${a.operator_id}|${a.doc_type}`];
      const bRenewed = !!renewedMap[`${b.operator_id}|${b.doc_type}`];
      if (aRenewed !== bRenewed) return aRenewed ? 1 : -1;
      return a.days_until - b.days_until;
    });
    setAlerts(newAlerts);
    setNoActionOnly(false);
    setSort('urgency');
    setNoActionBulkSentCount(null);
  }, [windowDays]);

  useEffect(() => {
    fetchData();
    const ch1 = supabase
      .channel('compliance-alerts-panel-apps')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'applications' }, (payload: any) => {
        const { new: n, old: o } = payload;
        if (n?.cdl_expiration !== o?.cdl_expiration || n?.medical_cert_expiration !== o?.medical_cert_expiration) {
          fetchData();
        }
      })
      .subscribe();
    const ch2 = supabase
      .channel('compliance-alerts-panel-reminders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cert_reminders' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [fetchData]);

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleSendReminder = async (alert: ComplianceAlert) => {
    const key = `${alert.operator_id}|${alert.doc_type}`;
    setReminderSending(prev => ({ ...prev, [key]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/send-cert-reminder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          operator_id: alert.operator_id,
          doc_type: alert.doc_type,
          days_until: alert.days_until,
          expiration_date: alert.expiration_date,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to send reminder');
      const now = new Date().toISOString();
      const senderName = profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || null : null;
      setLastReminded(prev => ({ ...prev, [key]: now }));
      if (senderName) setLastRemindedBy(prev => ({ ...prev, [key]: senderName }));
      if (data.email_error) {
        setLastReminderOutcome(prev => ({ ...prev, [key]: { sent: false, error: data.email_error } }));
        setReminderSent(prev => ({ ...prev, [key]: true }));
        setTimeout(() => setReminderSent(prev => ({ ...prev, [key]: false })), 8000);
        const { title, description } = reminderErrorToast(new Error(data.email_error));
        toast({ title, description, variant: 'destructive' });
      } else {
        setLastReminderOutcome(prev => ({ ...prev, [key]: { sent: true } }));
        setReminderSent(prev => ({ ...prev, [key]: true }));
        toast({ title: 'Reminder sent', description: `Email sent to ${alert.operator_name}` });
        setTimeout(() => setReminderSent(prev => ({ ...prev, [key]: false })), 8000);
      }
    } catch (err: any) {
      const { title, description } = reminderErrorToast(err);
      toast({ title, description, variant: 'destructive' });
    } finally {
      setReminderSending(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleSendAllCritical = async (targets?: ComplianceAlert[]) => {
    const criticalAlerts = targets ?? alerts.filter(a => a.days_until <= 30);
    if (criticalAlerts.length === 0) return;
    setBulkSending(true);
    setBulkSentCount(null);
    const { data: { session } } = await supabase.auth.getSession();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    let successCount = 0; let failCount = 0;
    for (const alert of criticalAlerts) {
      const key = `${alert.operator_id}|${alert.doc_type}`;
      if (reminderSending[key] || reminderSent[key]) { successCount++; continue; }
      setReminderSending(prev => ({ ...prev, [key]: true }));
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-cert-reminder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}`, 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ operator_id: alert.operator_id, doc_type: alert.doc_type, days_until: alert.days_until, expiration_date: alert.expiration_date }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed');
        const now = new Date().toISOString();
        setLastReminded(prev => ({ ...prev, [key]: now }));
        if (data.email_error) { setLastReminderOutcome(prev => ({ ...prev, [key]: { sent: false, error: data.email_error } })); failCount++; }
        else { setLastReminderOutcome(prev => ({ ...prev, [key]: { sent: true } })); successCount++; }
        setReminderSent(prev => ({ ...prev, [key]: true }));
        setTimeout(() => setReminderSent(prev => ({ ...prev, [key]: false })), 8000);
      } catch { failCount++; } finally { setReminderSending(prev => ({ ...prev, [key]: false })); }
      await new Promise(r => setTimeout(r, 600));
    }
    setBulkSending(false);
    setBulkSentCount(successCount);
    if (failCount === 0) { toast({ title: `${successCount} reminder${successCount !== 1 ? 's' : ''} sent`, description: `All targeted operators have been notified.` }); }
    else { toast({ title: `${successCount} sent, ${failCount} failed`, description: 'Some reminders could not be sent — check that the mysupertransport.com domain is verified at resend.com/domains.', variant: 'destructive' }); }
    setTimeout(() => setBulkSentCount(null), 10000);
    startBulkCooldown();
  };

  const handleSendAllNoAction = async () => {
    const noActionAlerts = alerts.filter(a => { const key = `${a.operator_id}|${a.doc_type}`; return !lastReminded[key] && !lastRenewed[key]; });
    if (noActionAlerts.length === 0) return;
    setNoActionBulkSending(true);
    setNoActionBulkSentCount(null);
    const { data: { session } } = await supabase.auth.getSession();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const senderName = profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || null : null;
    let successCount = 0; let failCount = 0;
    await Promise.all(noActionAlerts.map(async (alert) => {
      const key = `${alert.operator_id}|${alert.doc_type}`;
      if (reminderSending[key] || reminderSent[key]) { successCount++; return; }
      setReminderSending(prev => ({ ...prev, [key]: true }));
      try {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-cert-reminder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}`, 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ operator_id: alert.operator_id, doc_type: alert.doc_type, days_until: alert.days_until, expiration_date: alert.expiration_date }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed');
        const now = new Date().toISOString();
        setLastReminded(prev => ({ ...prev, [key]: now }));
        if (senderName) setLastRemindedBy(prev => ({ ...prev, [key]: senderName }));
        if (data.email_error) { setLastReminderOutcome(prev => ({ ...prev, [key]: { sent: false, error: data.email_error } })); failCount++; }
        else { setLastReminderOutcome(prev => ({ ...prev, [key]: { sent: true } })); successCount++; }
        setReminderSent(prev => ({ ...prev, [key]: true }));
        setTimeout(() => setReminderSent(prev => ({ ...prev, [key]: false })), 8000);
      } catch { failCount++; } finally { setReminderSending(prev => ({ ...prev, [key]: false })); }
    }));
    setNoActionBulkSending(false);
    setNoActionBulkSentCount(successCount);
    if (failCount === 0) { toast({ title: `${successCount} reminder${successCount !== 1 ? 's' : ''} sent`, description: 'All uncontacted operators have been notified.' }); }
    else { toast({ title: `${successCount} sent, ${failCount} failed`, description: 'Some reminders could not be sent.', variant: 'destructive' }); }
    setTimeout(() => setNoActionBulkSentCount(null), 10000);
    startNoActionCooldown();
  };

  const handleBulkMarkRenewed = async () => {
    if (alerts.length === 0) return;
    setBulkRenewing(true);
    setBulkRenewedCount(null);
    const actorId = user?.id ?? null;
    const actorName = profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || null : null;
    const newDate = new Date(); newDate.setFullYear(newDate.getFullYear() + 1);
    const newDateStr = newDate.toISOString().split('T')[0];
    let successCount = 0; let failCount = 0;
    const byOperator: Record<string, { operatorId: string; appId?: string; alerts: typeof alerts }> = {};
    alerts.forEach(alert => {
      if (!byOperator[alert.operator_id]) byOperator[alert.operator_id] = { operatorId: alert.operator_id, alerts: [] };
      byOperator[alert.operator_id].alerts.push(alert);
    });
    const operatorIds = Object.keys(byOperator);
    const { data: opRows } = await supabase.from('operators').select('id, application_id').in('id', operatorIds);
    (opRows ?? []).forEach((o: any) => { if (byOperator[o.id]) byOperator[o.id].appId = o.application_id; });
    await Promise.all(Object.values(byOperator).map(async ({ operatorId, appId, alerts: opAlerts }) => {
      if (!appId) { failCount += opAlerts.length; return; }
      for (const alert of opAlerts) {
        const col = alert.doc_type === 'CDL' ? 'cdl_expiration' : 'medical_cert_expiration';
        try {
          const { data: appData } = await supabase.from('applications').select(col).eq('id', appId).single();
          const oldDateStr = (appData as any)?.[col] ?? null;
          const { error } = await supabase.from('applications').update({ [col]: newDateStr }).eq('id', appId);
          if (error) throw error;
          await supabase.from('audit_log' as any).insert({ actor_id: actorId, actor_name: actorName, action: 'cert_renewed', entity_type: 'operator', entity_id: operatorId, entity_label: alert.operator_name, metadata: { document_type: alert.doc_type, old_expiry: oldDateStr, new_expiry: newDateStr, operator_name: alert.operator_name, bulk: true } });
          successCount++;
        } catch { failCount++; }
      }
    }));
    setBulkRenewing(false);
    setBulkRenewedCount(successCount);
    if (failCount === 0) toast({ title: `${successCount} document${successCount !== 1 ? 's' : ''} marked as renewed`, description: `Expiry dates extended to ${new Date(newDateStr + 'T00:00:00').toLocaleDateString()}.` });
    else toast({ title: `${successCount} renewed, ${failCount} failed`, description: 'Some documents could not be updated.', variant: 'destructive' });
    setTimeout(() => setBulkRenewedCount(null), 10000);
  };

  const handleMarkRenewed = async (alert: ComplianceAlert) => {
    const key = `${alert.operator_id}|${alert.doc_type}`;
    setRowRenewing(prev => ({ ...prev, [key]: true }));
    const actorId = user?.id ?? null;
    const actorName = profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || null : null;
    const newDate = new Date(); newDate.setFullYear(newDate.getFullYear() + 1);
    const newDateStr = newDate.toISOString().split('T')[0];
    const col = alert.doc_type === 'CDL' ? 'cdl_expiration' : 'medical_cert_expiration';
    try {
      const { data: opRow } = await supabase.from('operators').select('application_id').eq('id', alert.operator_id).single();
      const appId = (opRow as any)?.application_id;
      if (!appId) throw new Error('No application found');
      const { data: appData } = await supabase.from('applications').select(col).eq('id', appId).single();
      const oldDateStr = (appData as any)?.[col] ?? null;
      const { error } = await supabase.from('applications').update({ [col]: newDateStr }).eq('id', appId);
      if (error) throw error;
      await supabase.from('audit_log' as any).insert({ actor_id: actorId, actor_name: actorName, action: 'cert_renewed', entity_type: 'operator', entity_id: alert.operator_id, entity_label: alert.operator_name, metadata: { document_type: alert.doc_type, old_expiry: oldDateStr, new_expiry: newDateStr, operator_name: alert.operator_name } });
      const renewedNow = new Date().toISOString();
      setRowRenewing(prev => ({ ...prev, [key]: false }));
      setRowRenewed(prev => ({ ...prev, [key]: true }));
      setLastRenewed(prev => ({ ...prev, [key]: renewedNow }));
      if (actorName) setLastRenewedBy(prev => ({ ...prev, [key]: actorName }));
      toast({ title: `${alert.doc_type} marked as renewed`, description: `${alert.operator_name}'s expiry extended to ${new Date(newDateStr + 'T00:00:00').toLocaleDateString()}.` });
      setTimeout(() => setRowRenewed(prev => { const n = { ...prev }; delete n[key]; return n; }), 8000);
    } catch {
      setRowRenewing(prev => ({ ...prev, [key]: false }));
      toast({ title: 'Failed to renew document', variant: 'destructive' });
    }
  };

  // ── Derived data ───────────────────────────────────────────────────────
  const visibleAlerts = (() => {
    const base = alerts.filter(a => {
      if (noActionOnly) { const key = `${a.operator_id}|${a.doc_type}`; if (lastReminded[key] || lastRenewed[key]) return false; }
      return docFilter === 'all' || a.doc_type === docFilter;
    });
    if (sort === 'urgency') return base;
    return [...base].sort((a, b) => {
      const aTs = Math.max(lastReminded[`${a.operator_id}|${a.doc_type}`] ? new Date(lastReminded[`${a.operator_id}|${a.doc_type}`]).getTime() : 0, lastRenewed[`${a.operator_id}|${a.doc_type}`] ? new Date(lastRenewed[`${a.operator_id}|${a.doc_type}`]).getTime() : 0);
      const bTs = Math.max(lastReminded[`${b.operator_id}|${b.doc_type}`] ? new Date(lastReminded[`${b.operator_id}|${b.doc_type}`]).getTime() : 0, lastRenewed[`${b.operator_id}|${b.doc_type}`] ? new Date(lastRenewed[`${b.operator_id}|${b.doc_type}`]).getTime() : 0);
      return sort === 'last_action_desc' ? bTs - aTs : aTs - bTs;
    });
  })();

  const noActionCount = alerts.filter(a => { const key = `${a.operator_id}|${a.doc_type}`; return !lastReminded[key] && !lastRenewed[key]; }).length;

  if (alerts.length === 0) return (
    <div className="border border-status-complete/30 bg-status-complete/5 rounded-xl shadow-sm px-5 py-6 flex items-center gap-4">
      <div className="h-10 w-10 rounded-full bg-status-complete/15 flex items-center justify-center shrink-0">
        <ShieldCheck className="h-5 w-5 text-status-complete" />
      </div>
      <div>
        <p className="font-semibold text-sm text-status-complete">All clear — fleet is compliant</p>
        <p className="text-xs text-muted-foreground mt-0.5">No CDL or Medical Cert expiries within the next 90 days</p>
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <>
    <div className="border border-destructive/30 bg-destructive/5 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center px-4 py-3 gap-2">
        {/* Expand/collapse toggle */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex-1 flex items-center gap-2.5 text-left hover:opacity-80 transition-opacity min-w-0"
        >
          <div className="h-7 w-7 rounded-lg bg-destructive/15 flex items-center justify-center shrink-0">
            <ShieldAlert className="h-4 w-4 text-destructive" />
          </div>
          <span className="font-semibold text-sm text-destructive">Compliance Alerts</span>
          <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-none">
            {alerts.length}
          </span>
          {/* Never Renewed badge */}
          {(() => {
            const neverRenewed = alerts.filter(a => !lastRenewed[`${a.operator_id}|${a.doc_type}`]).length;
            if (neverRenewed === 0) return null;
            return (
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-destructive/10 border border-destructive/30 text-destructive text-[10px] font-semibold shrink-0 cursor-default">
                      <span className="h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                      {neverRenewed} Never Renewed
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-56 text-center text-xs">These documents have never been marked as renewed by staff</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })()}
          {/* Recently sent badge */}
          {(() => {
            const now = Date.now();
            const recentlySent = alerts.filter(a => { const ts = lastReminded[`${a.operator_id}|${a.doc_type}`]; return ts && now - new Date(ts).getTime() <= 30 * 24 * 60 * 60 * 1000; }).length;
            if (recentlySent === 0) return null;
            return (
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-warning/10 border border-warning/30 text-[10px] font-semibold shrink-0 cursor-default" style={{color: 'hsl(var(--warning))'}}>
                      <span className="h-1.5 w-1.5 rounded-full bg-warning shrink-0" />
                      {recentlySent} Reminder Sent
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-56 text-center text-xs">{recentlySent} operator{recentlySent !== 1 ? 's' : ''} received a manual reminder in the last 30 days</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })()}
          <span className="text-xs text-muted-foreground hidden sm:inline truncate">
            {alerts.filter(a => a.days_until < 0).length > 0 ? `${alerts.filter(a => a.days_until < 0).length} expired · ` : ''}
            CDL or medical cert expiring within {windowDays} days
          </span>
          {/* Doc-type filter chips */}
          <div className="hidden sm:flex items-center gap-1 ml-1 shrink-0" onClick={e => e.stopPropagation()}>
            {(['all', 'CDL', 'Medical Cert'] as const).map(f => {
              const count = f === 'all' ? alerts.length : alerts.filter(a => a.doc_type === f).length;
              const active = docFilter === f && !noActionOnly;
              return (
                <button key={f} onClick={() => { setDocFilter(f); setNoActionOnly(false); }}
                  className={`inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-semibold border transition-all ${active ? 'bg-destructive/15 border-destructive/40 text-destructive' : 'bg-background border-border text-muted-foreground hover:border-destructive/30 hover:text-destructive/70'}`}>
                  {f === 'all' ? 'All' : f}
                  <span className={`text-[9px] font-bold ${active ? 'text-destructive' : 'text-muted-foreground'}`}>{count}</span>
                </button>
              );
            })}
            {noActionCount > 0 && (
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={() => setNoActionOnly(v => !v)}
                      className={`inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-semibold border transition-all ${noActionOnly ? 'bg-muted-foreground/15 border-muted-foreground/40 text-foreground' : 'bg-background border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground'}`}>
                      No Action <span className={`text-[9px] font-bold ${noActionOnly ? 'text-foreground' : 'text-muted-foreground'}`}>{noActionCount}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[200px] text-center">Show only operators with no reminder or renewal recorded</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </button>

        {/* Bulk Send Reminders */}
        {(() => {
          const filteredTargets = alerts.filter(a => { if (docFilter !== 'all' && a.doc_type !== docFilter) return false; return a.days_until <= 30; });
          if (filteredTargets.length === 0 && !bulkCooldown) return null;
          const allSent = bulkSentCount !== null;
          const docLabel = docFilter === 'all' ? 'critical' : docFilter;
          return (
            <div className="flex flex-col items-end gap-0.5">
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setShowBulkConfirm(true); }} disabled={bulkSending || bulkCooldown}
                      className={`shrink-0 h-7 px-3 text-xs gap-1.5 font-semibold transition-all ${bulkCooldown ? 'border-border/40 text-muted-foreground/50 bg-muted/30 cursor-not-allowed opacity-50' : allSent ? 'border-status-complete/40 text-status-complete bg-status-complete/10 hover:bg-status-complete/10' : 'border-destructive/40 text-destructive bg-destructive/5 hover:bg-destructive/15'}`}>
                      {bulkSending ? <><Loader2 className="h-3 w-3 animate-spin" />Sending…</> : bulkCooldown ? <><CheckCheck className="h-3 w-3" />Sent · {bulkCooldownMinutes}m cooldown</> : allSent ? <><CheckCheck className="h-3 w-3" />{bulkSentCount} Sent</> : <><Send className="h-3 w-3" />Send Reminders to All ({filteredTargets.length})</>}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[240px] text-center">{bulkCooldown ? `Available again in ${bulkCooldownMinutes} minute${bulkCooldownMinutes !== 1 ? 's' : ''}.` : allSent ? `${bulkSentCount} reminder${bulkSentCount !== 1 ? 's' : ''} sent` : `Send renewal reminder emails to all ${filteredTargets.length} ${docLabel} operator${filteredTargets.length !== 1 ? 's' : ''} (≤ 30 days)`}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {bulkLastSentLabel && <span className="text-[10px] text-muted-foreground/70 leading-none">Last sent: {bulkLastSentLabel}</span>}
            </div>
          );
        })()}

        {/* Bulk Mark as Renewed */}
        {(() => {
          const allRenewed = bulkRenewedCount !== null;
          return (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setShowBulkRenewConfirm(true); }} disabled={bulkRenewing}
                    className={`shrink-0 h-7 px-3 text-xs gap-1.5 font-semibold transition-all ${allRenewed ? 'border-status-complete/40 text-status-complete bg-status-complete/10 hover:bg-status-complete/10' : 'border-status-progress/40 text-status-progress bg-status-progress/5 hover:bg-status-progress/15'}`}>
                    {bulkRenewing ? <><Loader2 className="h-3 w-3 animate-spin" />Renewing…</> : allRenewed ? <><CheckCheck className="h-3 w-3" />{bulkRenewedCount} Renewed</> : <><RotateCcw className="h-3 w-3" />Mark All Renewed</>}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs max-w-[240px] text-center">{allRenewed ? `${bulkRenewedCount} document${bulkRenewedCount !== 1 ? 's' : ''} renewed successfully` : `Extend all ${alerts.length} alerted document${alerts.length !== 1 ? 's' : ''} by +1 year from today`}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })()}

        {/* Bulk Remind Uncontacted */}
        {(() => {
          const noActionAlerts = alerts.filter(a => { const key = `${a.operator_id}|${a.doc_type}`; return !lastReminded[key] && !lastRenewed[key]; });
          const allSent = noActionBulkSentCount !== null;
          if (noActionAlerts.length === 0 && !allSent && !noActionBulkSending && !noActionCooldown) return null;
          return (
            <div className="flex flex-col items-end gap-0.5">
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setShowNoActionBulkConfirm(true); }} disabled={noActionBulkSending || allSent || noActionAlerts.length === 0 || noActionCooldown}
                      className={`shrink-0 h-7 px-3 text-xs gap-1.5 font-semibold transition-all ${noActionCooldown ? 'border-border/40 text-muted-foreground/50 bg-muted/30 cursor-not-allowed opacity-50' : allSent ? 'border-status-complete/40 text-status-complete bg-status-complete/10 hover:bg-status-complete/10' : 'border-muted-foreground/40 text-muted-foreground bg-muted/30 hover:border-foreground/40 hover:text-foreground hover:bg-muted/60'}`}>
                      {noActionBulkSending ? <><Loader2 className="h-3 w-3 animate-spin" />Sending…</> : noActionCooldown ? <><CheckCheck className="h-3 w-3" />Sent · {noActionCooldownMinutes}m cooldown</> : allSent ? <><CheckCheck className="h-3 w-3" />{noActionBulkSentCount} Sent</> : <><Send className="h-3 w-3" />Remind Uncontacted ({noActionAlerts.length})</>}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[240px] text-center">{noActionCooldown ? `Available again in ${noActionCooldownMinutes} minute${noActionCooldownMinutes !== 1 ? 's' : ''}.` : allSent ? `${noActionBulkSentCount} reminder${noActionBulkSentCount !== 1 ? 's' : ''} sent` : `Send reminders to ${noActionAlerts.length} operator${noActionAlerts.length !== 1 ? 's' : ''} with no prior reminder or renewal`}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {noActionLastSentLabel && <span className="text-[10px] text-muted-foreground/70 leading-none">Last sent: {noActionLastSentLabel}</span>}
            </div>
          );
        })()}

        <button onClick={() => setExpanded(v => !v)} className="shrink-0 hover:opacity-80 transition-opacity">
          {expanded ? <ShieldCheck className="h-4 w-4 text-muted-foreground" style={{transform:'rotate(0deg)'}} /> : <ShieldAlert className="h-4 w-4 text-muted-foreground opacity-50" />}
        </button>
      </div>

      {/* Alert rows */}
      {expanded && (
        <div className="border-t border-destructive/20 divide-y divide-destructive/10">
          {/* Column headers */}
          <div className="flex items-center gap-3 px-4 py-1.5 bg-destructive/5">
            <span className="h-2 w-2 shrink-0" />
            <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Operator</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60 hidden sm:block shrink-0 w-[80px]">Expires</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60 shrink-0 w-[60px] text-right">Status</span>
            <button onClick={() => setSort(s => s === 'urgency' ? 'last_action_desc' : s === 'last_action_desc' ? 'last_action_asc' : 'urgency')}
              className="hidden md:inline-flex items-center gap-1 w-[90px] justify-end text-[10px] font-semibold uppercase tracking-wide transition-colors hover:text-foreground group shrink-0"
              style={{ color: sort !== 'urgency' ? 'hsl(var(--foreground))' : undefined }}>
              <span className={sort !== 'urgency' ? 'text-foreground' : 'text-muted-foreground/60'}>Last Action</span>
              {sort === 'urgency' ? <ArrowUpDown className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground/70" /> : sort === 'last_action_desc' ? <ArrowDown className="h-3 w-3 text-gold" /> : <ArrowUp className="h-3 w-3 text-gold" />}
            </button>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60 hidden xl:block shrink-0 w-[72px] text-right">Last Reminded</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60 hidden xl:block shrink-0 w-[72px] text-right">Last Renewed</span>
            <span className="shrink-0 w-[74px]" /><span className="shrink-0 w-[68px]" /><span className="shrink-0 w-[58px]" />
          </div>

          {visibleAlerts.map((alert) => {
            const expired = alert.days_until < 0;
            const critical = !expired && alert.days_until <= 30;
            const warning = !expired && !critical;
            const rowKey = `${alert.operator_id}|${alert.doc_type}`;
            const isSending = reminderSending[rowKey];
            const isSent = reminderSent[rowKey];
            const remindedAt = lastReminded[rowKey];
            const remindedBy = lastRemindedBy[rowKey];
            const reminderOutcome = lastReminderOutcome[rowKey];
            const isRowRenewing = rowRenewing[rowKey];
            const isRowRenewed = rowRenewed[rowKey];
            const renewedAt = lastRenewed[rowKey];
            const renewedByName = lastRenewedBy[rowKey];
            return (
              <div key={`${alert.operator_id}-${alert.doc_type}`}
                className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${!renewedAt ? 'bg-destructive/[0.04] hover:bg-destructive/[0.07] border-l-2 border-l-destructive/40' : 'bg-background/60 hover:bg-background/80 border-l-2 border-l-transparent'}`}>
                {/* Urgency dot */}
                <span className={`h-2 w-2 rounded-full shrink-0 ${expired ? 'bg-destructive animate-pulse' : critical ? 'bg-destructive' : 'bg-yellow-500'}`} />
                {/* Name + doc type */}
                <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-medium text-sm text-foreground truncate">{alert.operator_name}</span>
                  <span className={`inline-flex items-center text-[11px] px-1.5 py-0.5 rounded font-medium border ${alert.doc_type === 'CDL' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-purple-50 text-purple-700 border-purple-200'}`}>{alert.doc_type}</span>
                  {!renewedAt && <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-semibold bg-destructive/10 text-destructive border border-destructive/25 shrink-0"><span className="h-1.5 w-1.5 rounded-full bg-destructive inline-block" />Never Renewed</span>}
                </div>
                {/* Expiry date */}
                <span className="text-xs text-muted-foreground hidden sm:block shrink-0">{format(parseLocalDate(alert.expiration_date), 'MMM d, yyyy')}</span>
                {/* Urgency badge */}
                <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-semibold border shrink-0 ${expired || critical ? 'bg-destructive/10 text-destructive border-destructive/30' : 'bg-yellow-50 text-yellow-700 border-yellow-300'}`}>
                  {expired ? `Expired ${formatDaysHuman(alert.days_until)} ago` : alert.days_until === 0 ? 'Expires today' : `${formatDaysHuman(alert.days_until)} left`}
                </span>
                {/* Last Action column */}
                {(() => {
                  const remindedTs = remindedAt ? new Date(remindedAt).getTime() : 0;
                  const renewedTs = renewedAt ? new Date(renewedAt).getTime() : 0;
                  const hasAction = remindedTs > 0 || renewedTs > 0;
                  const lastActionTs = Math.max(remindedTs, renewedTs);
                  const lastActionDate = hasAction ? new Date(lastActionTs) : null;
                  const isRenewal = renewedTs >= remindedTs && renewedTs > 0;
                  const actionBy = isRenewal ? renewedByName : remindedBy;
                  const actionLabel = isRenewal ? 'Renewed' : 'Reminded';
                  const pillClass = isRenewal ? 'bg-status-complete/10 text-status-complete border border-status-complete/25' : 'bg-primary/10 text-primary border border-primary/25';
                  const Icon = isRenewal ? RotateCcw : CheckCheck;
                  return (
                    <TooltipProvider delayDuration={100}><Tooltip>
                      <TooltipTrigger asChild>
                        <span className={`hidden md:inline-flex items-center gap-1 text-[11px] shrink-0 cursor-default w-[90px] justify-end rounded px-1.5 py-0.5 transition-colors ${hasAction ? pillClass : 'text-muted-foreground/40'}`}>
                          {hasAction && lastActionDate ? <><Icon className="h-3 w-3 shrink-0" />{format(lastActionDate, 'MMM d')}</> : <span className="text-muted-foreground/40">No action</span>}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs max-w-[220px]">
                        {hasAction && lastActionDate ? <span className="flex flex-col gap-0.5"><span className="font-medium">{actionLabel}</span><span>{format(lastActionDate, "MMM d, yyyy 'at' h:mm a")}</span>{actionBy && <span className="text-muted-foreground">by {actionBy}</span>}</span> : 'No reminder or renewal recorded yet'}
                      </TooltipContent>
                    </Tooltip></TooltipProvider>
                  );
                })()}
                {/* Last Reminded column */}
                {(() => {
                  let freshness: 'recent' | 'stale' | 'none' = 'none';
                  if (remindedAt) { const d = differenceInDays(new Date(), new Date(remindedAt)); freshness = d <= 7 ? 'recent' : d >= 30 ? 'stale' : 'none'; }
                  const emailFailed = remindedAt && reminderOutcome && !reminderOutcome.sent;
                  const pillClass = emailFailed ? 'bg-destructive/10 text-destructive border border-destructive/30' : freshness === 'recent' ? 'bg-status-complete/10 text-status-complete border border-status-complete/25' : freshness === 'stale' ? 'bg-warning/10 text-warning border border-warning/25' : '';
                  const iconClass = emailFailed ? 'text-destructive' : freshness === 'recent' ? 'text-status-complete' : freshness === 'stale' ? 'text-warning' : 'text-muted-foreground';
                  return (
                    <TooltipProvider delayDuration={100}><Tooltip>
                      <TooltipTrigger asChild>
                        <span className={`hidden xl:inline-flex items-center gap-1 text-[11px] shrink-0 cursor-default w-[72px] justify-end rounded px-1 py-0.5 transition-colors ${remindedAt ? pillClass : 'text-muted-foreground/40'}`}>
                          {remindedAt ? <><CheckCheck className={`h-3 w-3 shrink-0 ${iconClass}`} />{format(new Date(remindedAt), 'MMM d')}</> : <span className="text-muted-foreground/40">—</span>}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs max-w-[240px]">
                        {remindedAt ? <span className="flex flex-col gap-0.5"><span>Last reminder {format(new Date(remindedAt), "MMM d, yyyy 'at' h:mm a")}</span>{remindedBy && <span className="text-muted-foreground">by {remindedBy}</span>}{emailFailed ? <span className="text-destructive font-medium">✗ Email failed{reminderOutcome?.error ? ` — ${reminderOutcome.error.replace(/^Error:\s*/i, '').slice(0, 80)}` : ''}</span> : <span className="text-status-complete font-medium">✓ Email delivered</span>}</span> : 'No reminder sent yet'}
                      </TooltipContent>
                    </Tooltip></TooltipProvider>
                  );
                })()}
                {/* Last Renewed column */}
                {(() => {
                  const pillClass = renewedAt ? 'bg-status-complete/10 text-status-complete border border-status-complete/25' : '';
                  return (
                    <TooltipProvider delayDuration={100}><Tooltip>
                      <TooltipTrigger asChild>
                        <span className={`hidden xl:inline-flex items-center gap-1 text-[11px] shrink-0 cursor-default w-[72px] justify-end rounded px-1 py-0.5 transition-colors ${renewedAt ? pillClass : 'text-muted-foreground/40'}`}>
                          {renewedAt ? <><RotateCcw className="h-3 w-3 shrink-0 text-status-complete" />{format(new Date(renewedAt), 'MMM d')}</> : <span className="text-muted-foreground/40">—</span>}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs max-w-[220px]">
                        {renewedAt ? <span className="flex flex-col gap-0.5"><span>Last renewed {format(new Date(renewedAt), "MMM d, yyyy 'at' h:mm a")}</span>{renewedByName && <span className="text-muted-foreground">by {renewedByName}</span>}</span> : 'Not yet renewed'}
                      </TooltipContent>
                    </Tooltip></TooltipProvider>
                  );
                })()}
                {/* Last-reminded badge */}
                {remindedAt && !isSent && (() => {
                  const daysSince = differenceInDays(new Date(), new Date(remindedAt));
                  const label = daysSince === 0 ? 'Today' : daysSince === 1 ? '1d ago' : `${daysSince}d ago`;
                  const isRecent = daysSince <= 7;
                  const emailFailed = reminderOutcome && !reminderOutcome.sent;
                  return (
                    <TooltipProvider delayDuration={100}><Tooltip>
                      <TooltipTrigger asChild>
                        <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium rounded px-1.5 py-0.5 border shrink-0 cursor-default ${emailFailed ? 'text-destructive bg-destructive/10 border-destructive/30' : isRecent ? 'text-primary bg-primary/10 border-primary/25' : 'text-muted-foreground bg-muted border-border'}`}>
                          <Send className="h-2.5 w-2.5 shrink-0" />{label}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs max-w-[220px]">
                        <span className="flex flex-col gap-0.5">
                          <span>Last reminder {format(new Date(remindedAt), "MMM d, yyyy 'at' h:mm a")}</span>
                          {remindedBy && <span className="text-muted-foreground">by {remindedBy}</span>}
                          {emailFailed ? <span className="text-destructive font-medium">✗ Email failed{reminderOutcome?.error ? ` — ${reminderOutcome.error.replace(/^Error:\s*/i, '').slice(0, 80)}` : ''}</span> : <span className="text-status-complete font-medium">✓ Email delivered</span>}
                        </span>
                      </TooltipContent>
                    </Tooltip></TooltipProvider>
                  );
                })()}
                {/* Send Reminder button */}
                <TooltipProvider delayDuration={100}><Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={() => handleSendReminder(alert)} disabled={isSending || isSent}
                      className={`shrink-0 h-7 px-2 text-xs gap-1.5 transition-all ${isSent ? 'border-status-complete/40 text-status-complete bg-status-complete/10 hover:bg-status-complete/10' : 'border-muted-foreground/30 text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5'}`}>
                      {isSending ? <Loader2 className="h-3 w-3 animate-spin" /> : isSent ? <><CheckCheck className="h-3 w-3" /><span className="hidden sm:inline">Sent</span></> : <><Send className="h-3 w-3" /><span className="hidden sm:inline">Remind</span></>}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">{isSent ? 'Reminder sent!' : `Send email reminder to ${alert.operator_name}`}</TooltipContent>
                </Tooltip></TooltipProvider>
                {/* Mark as Renewed button */}
                <TooltipProvider delayDuration={100}><Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={() => handleMarkRenewed(alert)} disabled={isRowRenewing || isRowRenewed}
                      className={`relative shrink-0 h-7 px-2 text-xs gap-1.5 transition-all ${isRowRenewed ? 'border-status-complete/40 text-status-complete bg-status-complete/10 hover:bg-status-complete/10' : warning ? 'border-warning/40 text-warning/80 bg-warning/5 hover:border-warning/60 hover:text-warning hover:bg-warning/10' : 'border-muted-foreground/30 text-muted-foreground hover:border-status-complete/50 hover:text-status-complete hover:bg-status-complete/5'}`}>
                      {isRowRenewing ? <Loader2 className="h-3 w-3 animate-spin" /> : isRowRenewed ? <><CheckCircle2 className="h-3 w-3" /><span className="hidden sm:inline">Renewed</span></> : <><RotateCcw className="h-3 w-3" /><span className="hidden sm:inline">Renew</span></>}
                      {warning && !isRowRenewed && !isRowRenewing && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-warning border border-background" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-[200px] text-center">{isRowRenewed ? 'Document renewed!' : warning ? <><span className="font-semibold text-warning block">Not urgent yet</span><span>{alert.doc_type} expires in {alert.days_until}d</span></> : `Mark ${alert.doc_type} as renewed (+1 year)`}</TooltipContent>
                </Tooltip></TooltipProvider>
                {/* Open button */}
                {(onOpenOperator || onOpenOperatorWithFocus) && (
                  <Button variant="ghost" size="sm" onClick={() => { const f = alert.doc_type === 'CDL' ? 'cdl' : 'medcert'; onOpenOperatorWithFocus ? onOpenOperatorWithFocus(alert.operator_id, f) : onOpenOperator?.(alert.operator_id); }}
                    className="text-xs text-gold hover:text-gold-light hover:bg-gold/10 shrink-0 h-7 px-2">
                    Open →
                  </Button>
                )}
              </div>
            );
          })}

          {visibleAlerts.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-5 text-muted-foreground">
              <ShieldCheck className="h-4 w-4 shrink-0 opacity-50" />
              <span className="text-xs">{noActionOnly ? 'All operators have at least one reminder or renewal recorded' : docFilter === 'all' ? 'No compliance alerts within 90 days' : `No ${docFilter} alerts found`}</span>
            </div>
          )}
        </div>
      )}
    </div>

    {/* Confirm dialogs */}
    {(() => {
      const filteredTargets = alerts.filter(a => { if (docFilter !== 'all' && a.doc_type !== docFilter) return false; return a.days_until <= 30; });
      const docScope = docFilter === 'all' ? 'CDL/Med Cert' : docFilter;
      return (
        <AlertDialog open={showBulkConfirm} onOpenChange={setShowBulkConfirm}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2"><Send className="h-4 w-4 text-destructive" />Send Reminders to All{docFilter !== 'all' && <span className="text-xs font-normal text-muted-foreground">— {docFilter} only</span>}</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">The following {filteredTargets.length} operator{filteredTargets.length !== 1 ? 's' : ''} will receive a {docScope} expiry reminder email:</p>
                  <ul className="divide-y divide-border rounded-md border border-border overflow-hidden text-sm max-h-64 overflow-y-auto">
                    {filteredTargets.map(alert => (
                      <li key={`${alert.operator_id}|${alert.doc_type}`} className="flex items-center justify-between px-3 py-2 bg-background">
                        <span className="font-medium text-foreground">{alert.operator_name}</span>
                        <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{alert.doc_type}</span><span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${alert.days_until < 0 ? 'bg-destructive/15 text-destructive' : 'bg-destructive/10 text-destructive'}`}>{alert.days_until < 0 ? `${Math.abs(alert.days_until)}d expired` : `${alert.days_until}d left`}</span></div>
                      </li>
                    ))}
                  </ul>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => { setShowBulkConfirm(false); handleSendAllCritical(filteredTargets); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90"><Send className="h-3.5 w-3.5 mr-1.5" />Send {filteredTargets.length} Reminder{filteredTargets.length !== 1 ? 's' : ''}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );
    })()}

    {(() => {
      const newDate = new Date(); newDate.setFullYear(newDate.getFullYear() + 1);
      const newDateStr = newDate.toLocaleDateString();
      return (
        <AlertDialog open={showBulkRenewConfirm} onOpenChange={setShowBulkRenewConfirm}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2"><RotateCcw className="h-4 w-4 text-status-progress" />Mark All as Renewed</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">The following {alerts.length} document{alerts.length !== 1 ? 's' : ''} will have their expiry date extended to <span className="font-semibold text-foreground">{newDateStr}</span>:</p>
                  <ul className="divide-y divide-border rounded-md border border-border overflow-hidden text-sm max-h-64 overflow-y-auto">
                    {alerts.map(alert => (
                      <li key={`${alert.operator_id}|${alert.doc_type}`} className="flex items-center justify-between px-3 py-2 bg-background">
                        <span className="font-medium text-foreground">{alert.operator_name}</span>
                        <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{alert.doc_type}</span><span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${alert.days_until < 0 ? 'bg-destructive/15 text-destructive' : alert.days_until <= 30 ? 'bg-destructive/10 text-destructive' : 'bg-gold/10 text-gold'}`}>{alert.days_until < 0 ? `${Math.abs(alert.days_until)}d expired` : `${alert.days_until}d left`}</span></div>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">Each renewal is logged in the Activity Log with the old and new dates.</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => { setShowBulkRenewConfirm(false); handleBulkMarkRenewed(); }} className="bg-status-progress text-white hover:bg-status-progress/90"><RotateCcw className="h-3.5 w-3.5 mr-1.5" />Renew {alerts.length} Document{alerts.length !== 1 ? 's' : ''}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );
    })()}

    {(() => {
      const noActionAlerts = alerts.filter(a => { const key = `${a.operator_id}|${a.doc_type}`; return !lastReminded[key] && !lastRenewed[key]; });
      return (
        <AlertDialog open={showNoActionBulkConfirm} onOpenChange={setShowNoActionBulkConfirm}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2"><Send className="h-4 w-4 text-muted-foreground" />Remind Uncontacted Operators</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">The following {noActionAlerts.length} operator{noActionAlerts.length !== 1 ? 's' : ''} have no reminder or renewal on record:</p>
                  <ul className="divide-y divide-border rounded-md border border-border overflow-hidden text-sm max-h-64 overflow-y-auto">
                    {noActionAlerts.map(alert => (
                      <li key={`${alert.operator_id}|${alert.doc_type}`} className="flex items-center justify-between px-3 py-2 bg-background">
                        <span className="font-medium text-foreground">{alert.operator_name}</span>
                        <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{alert.doc_type}</span><span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${alert.days_until < 0 ? 'bg-destructive/15 text-destructive' : alert.days_until <= 30 ? 'bg-destructive/10 text-destructive' : 'bg-gold/10 text-gold'}`}>{alert.days_until < 0 ? `${Math.abs(alert.days_until)}d expired` : `${alert.days_until}d left`}</span></div>
                      </li>
                    ))}
                  </ul>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => { setShowNoActionBulkConfirm(false); handleSendAllNoAction(); }} className="bg-foreground text-background hover:bg-foreground/90"><Send className="h-3.5 w-3.5 mr-1.5" />Send {noActionAlerts.length} Reminder{noActionAlerts.length !== 1 ? 's' : ''}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );
    })()}
    </>
  );
}
