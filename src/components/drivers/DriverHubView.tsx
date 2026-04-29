import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import DriverRoster from './DriverRoster';
import ArchivedDriversView from './ArchivedDriversView';
import AddDriverModal from './AddDriverModal';
import OperatorDetailPanel from '@/pages/staff/OperatorDetailPanel';
import BulkMessageModal from '@/components/staff/BulkMessageModal';
import LaunchSuperdriveDialog from '@/components/management/LaunchSuperdriveDialog';
import ApplicationReviewDrawer, { type FullApplication } from '@/components/management/ApplicationReviewDrawer';
import ComplianceAlertsPanel from '@/components/inspection/ComplianceAlertsPanel';
import { formatDaysHuman } from '@/components/inspection/InspectionBinderTypes';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useBulkReminderCooldown } from '@/hooks/useBulkReminderCooldown';
import { differenceInDays, parseISO, startOfDay } from 'date-fns';
import { Users2, UserPlus, MessageSquare, AlertCircle, AlertTriangle, Clock, FileX, Info, Bell, Loader2, ChevronDown, ChevronUp, ShieldAlert, Archive, Rocket } from 'lucide-react';
import type { ComplianceFilter, ComplianceCounts } from './DriverRoster';
import { useComplianceWindow } from '@/hooks/useComplianceWindow';

interface DriverHubViewProps {
  /** If true, show the "Add Driver" button (management only) */
  canAddDriver?: boolean;
  /** If true, use dispatch-only columns in the roster */
  dispatchMode?: boolean;
  /** Called when the user clicks "Message" on a driver (navigates to messages tab) */
  onMessageDriver?: (userId: string) => void;
  /** Initial compliance filter to pre-apply when this view mounts */
  defaultComplianceFilter?: ComplianceFilter;
}

interface BulkReminderTarget {
  operator_id: string;
  name: string;
  doc_type: 'CDL' | 'Medical Cert';
  days_until: number;
  expiration_date: string;
}

const RATE_LIMIT_MS = 600;

export default function DriverHubView({ canAddDriver = false, dispatchMode = false, onMessageDriver, defaultComplianceFilter }: DriverHubViewProps) {
  const { toast } = useToast();
  const [selectedOperatorId, setSelectedOperatorId] = useState<string | null>(null);
  const [pendingFocusField, setPendingFocusField] = useState<'cdl' | 'medcert' | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [launchDialogOpen, setLaunchDialogOpen] = useState(false);
  const [rosterKey, setRosterKey] = useState(0);
  const [selectedOperatorIds, setSelectedOperatorIds] = useState<string[]>([]);
  const [alertsPanelOpen, setAlertsPanelOpen] = useState(true);
  const [complianceFilter, setComplianceFilter] = useState<ComplianceFilter>(defaultComplianceFilter ?? 'all');
  const [complianceCounts, setComplianceCounts] = useState<ComplianceCounts>({ expired: 0, critical: 0, warning: 0, neverRenewed: 0, notYetReminded: 0, webOnly: 0, neverSignedIn: 0 });
  const { windowDays } = useComplianceWindow();
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [archivedCount, setArchivedCount] = useState<number | null>(null);

  const fetchArchivedCount = useCallback(async () => {
    const { count } = await supabase
      .from('operators')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', false);
    setArchivedCount(count ?? 0);
  }, []);

  useEffect(() => { fetchArchivedCount(); }, [fetchArchivedCount]);

  // Inline App Review Drawer state (opened via "Update" link on roster rows)
  const [reviewApp, setReviewApp] = useState<FullApplication | null>(null);
  const [reviewFocusField, setReviewFocusField] = useState<'cdl' | 'medcert' | undefined>(undefined);
  const [reviewLoading, setReviewLoading] = useState(false);

  // Bulk reminder state
  const [bulkReminderDialogOpen, setBulkReminderDialogOpen] = useState(false);
  const [bulkReminderTargets, setBulkReminderTargets] = useState<BulkReminderTarget[]>([]);
  const [bulkReminderLoading, setBulkReminderLoading] = useState(false);
  const [bulkReminderProgress, setBulkReminderProgress] = useState<{ sent: number; total: number } | null>(null);
  const { isCoolingDown: bulkCooldown, minutesLeft: bulkCooldownMinutes, lastSentLabel: bulkLastSentLabel, startCooldown: startBulkCooldown } = useBulkReminderCooldown('bulk-reminder-driver-hub');
  // Keep a snapshot of all roster drivers for the bulk reminder lookup
  const allDriversRef = useRef<Array<{
    operator_id: string;
    first_name: string | null;
    last_name: string | null;
    cdl_expiration: string | null;
    medical_cert_expiration: string | null;
  }>>([]);

  const hasAlerts = complianceCounts.expired + complianceCounts.critical + complianceCounts.warning + complianceCounts.neverRenewed > 0;

  // Whether the bulk-remind button should appear (only expired/critical filters)
  const showBulkRemindButton = !dispatchMode && (complianceFilter === 'expired' || complianceFilter === 'critical');

  // Live count of remindable targets for the button label (computed from roster snapshot)
  const bulkReminderCount = useMemo(() => {
    if (!showBulkRemindButton) return 0;
    const today = startOfDay(new Date());
    const seen = new Set<string>();
    let count = 0;
    for (const d of allDriversRef.current) {
      const check = (dateStr: string | null) => {
        if (!dateStr || seen.has(d.operator_id)) return;
        const days = differenceInDays(startOfDay(parseISO(dateStr)), today);
        const inFilter =
          (complianceFilter === 'expired' && days < 0) ||
          (complianceFilter === 'critical' && days >= 0 && days <= 7);
        if (inFilter) { seen.add(d.operator_id); count++; }
      };
      check(d.cdl_expiration);
      check(d.medical_cert_expiration);
    }
    return count;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBulkRemindButton, complianceFilter, complianceCounts]);

  // Derive contextual guidance text for active filter
  const guidanceBanner = useMemo(() => {
    if (complianceFilter === 'all') return null;
    const n = (filter: ComplianceFilter) => {
      if (filter === 'expired') return complianceCounts.expired;
      if (filter === 'critical') return complianceCounts.critical;
      if (filter === 'warning') return complianceCounts.warning;
      if (filter === 'not_yet_reminded') return complianceCounts.notYetReminded;
      return complianceCounts.neverRenewed;
    };
    const count = n(complianceFilter);
    const driver = count === 1 ? 'driver' : 'drivers';
    if (complianceFilter === 'expired') return { text: `Showing ${count} ${driver} with an expired CDL or Med Cert. Click Update on any row to fix their expiration date.`, variant: 'destructive' as const };
    if (complianceFilter === 'critical') return { text: `Showing ${count} ${driver} with CDL or Med Cert expiring within 7 days. Click Update on any row to fix their expiration date.`, variant: 'destructive' as const };
    if (complianceFilter === 'warning') return { text: `Showing ${count} ${driver} with CDL or Med Cert expiring within ${windowDays} days. Click Update on any row to review their documents.`, variant: 'warning' as const };
    if (complianceFilter === 'not_yet_reminded') return { text: `Showing ${count} ${driver} who have never received a cert reminder. Use the Send Reminders button or individual rows to start their outreach history.`, variant: 'warning' as const };
    return { text: `Showing ${count} ${driver} with no CDL or Med Cert expiration date on file. Click Update on any row to add their dates.`, variant: 'destructive' as const };
  }, [complianceFilter, complianceCounts, windowDays]);

  // Called when the inline "Update" link is clicked on a roster row
  const handleUpdateCompliance = useCallback(async (operatorId: string, focusField: 'cdl' | 'medcert') => {
    setReviewLoading(true);
    const { data } = await supabase
      .from('operators')
      .select('application_id, applications(*)')
      .eq('id', operatorId)
      .single();
    if (data?.applications) {
      setReviewApp(data.applications as FullApplication);
      setReviewFocusField(focusField);
    }
    setReviewLoading(false);
  }, []);

  // Build the list of targets for the bulk reminder confirmation dialog
  const handleOpenBulkReminderDialog = useCallback(() => {
    const today = startOfDay(new Date());
    const targets: BulkReminderTarget[] = [];

    for (const d of allDriversRef.current) {
      const name = [d.first_name, d.last_name].filter(Boolean).join(' ') || 'Unknown Driver';

      const checkDoc = (dateStr: string | null, label: 'CDL' | 'Medical Cert') => {
        if (!dateStr) return;
        const days = differenceInDays(startOfDay(parseISO(dateStr)), today);
        const inFilter =
          (complianceFilter === 'expired' && days < 0) ||
          (complianceFilter === 'critical' && days >= 0 && days <= 7);
        if (inFilter) {
          targets.push({ operator_id: d.operator_id, name, doc_type: label, days_until: days, expiration_date: dateStr });
        }
      };

      checkDoc(d.cdl_expiration, 'CDL');
      checkDoc(d.medical_cert_expiration, 'Medical Cert');
    }

    // De-duplicate: one entry per operator — pick the worst doc
    const byOperator: Record<string, BulkReminderTarget> = {};
    for (const t of targets) {
      if (!byOperator[t.operator_id] || t.days_until < byOperator[t.operator_id].days_until) {
        byOperator[t.operator_id] = t;
      }
    }

    const deduped = Object.values(byOperator);
    setBulkReminderTargets(deduped);
    setBulkReminderDialogOpen(true);
  }, [complianceFilter]);

  // Fire off the reminders sequentially with rate-limiting
  const handleConfirmBulkReminder = useCallback(async () => {
    if (bulkReminderTargets.length === 0) return;
    setBulkReminderLoading(true);
    setBulkReminderProgress({ sent: 0, total: bulkReminderTargets.length });

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    let sent = 0;
    let failed = 0;

    for (const target of bulkReminderTargets) {
      try {
        const { error } = await supabase.functions.invoke('send-cert-reminder', {
          body: {
            operator_id: target.operator_id,
            doc_type: target.doc_type,
            days_until: target.days_until,
            expiration_date: target.expiration_date,
          },
        });
        if (error) throw error;
        sent++;
      } catch {
        failed++;
      }
      setBulkReminderProgress({ sent: sent + failed, total: bulkReminderTargets.length });
      // Rate-limit between calls
      if (sent + failed < bulkReminderTargets.length) {
        await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
      }
    }

    setBulkReminderLoading(false);
    setBulkReminderDialogOpen(false);
    setBulkReminderProgress(null);

    if (failed === 0) {
      toast({ title: `✓ Reminders sent`, description: `${sent} reminder${sent !== 1 ? 's' : ''} sent successfully.` });
    } else {
      toast({
        title: `Reminders sent with errors`,
        description: `${sent} sent, ${failed} failed. Check audit log for details.`,
        variant: 'destructive',
      });
    }
    // Start cooldown regardless of partial failures to prevent duplicate sends
    startBulkCooldown();
  }, [bulkReminderTargets, toast, startBulkCooldown]);

  if (selectedOperatorId) {
    return (
      <OperatorDetailPanel
        backLabel="Driver Hub"
        operatorId={selectedOperatorId}
        onBack={() => { setSelectedOperatorId(null); setPendingFocusField(null); }}
        onMessageOperator={userId => {
          setSelectedOperatorId(null);
          setPendingFocusField(null);
          onMessageDriver?.(userId);
        }}
      />
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground leading-tight">Driver Hub</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Manage active and archived operators</p>
            </div>
          </div>

          {/* Compliance summary chips — only in non-dispatch mode */}
          {!dispatchMode && hasAlerts && (
            <div className="flex items-center gap-2 flex-wrap pl-0.5">
              <TooltipProvider delayDuration={200}>
              {complianceCounts.expired > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setComplianceFilter(complianceFilter === 'expired' ? 'all' : 'expired')}
                      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                        complianceFilter === 'expired'
                          ? 'bg-destructive/15 border-destructive/40 text-destructive'
                          : 'border-destructive/30 text-destructive/80 hover:bg-destructive/10 hover:border-destructive/50'
                      }`}
                    >
                      <AlertCircle className="h-3 w-3" />
                      {complianceCounts.expired} expired
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-left space-y-1.5 max-w-[220px]">
                    <p className="font-semibold">Expired</p>
                    <p className="text-muted-foreground">CDL or Med Cert is past its expiration date. Immediate action required.</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {complianceCounts.critical > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setComplianceFilter(complianceFilter === 'critical' ? 'all' : 'critical')}
                      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                        complianceFilter === 'critical'
                          ? 'bg-destructive/15 border-destructive/40 text-destructive'
                          : 'border-destructive/30 text-destructive/80 hover:bg-destructive/10 hover:border-destructive/50'
                      }`}
                    >
                      <AlertTriangle className="h-3 w-3" />
                      {complianceCounts.critical} critical
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-left space-y-1.5 max-w-[220px]">
                    <p className="font-semibold">Critical — ≤ 7 days</p>
                    <p className="text-muted-foreground">CDL or Med Cert expiring within 7 days. Send a renewal reminder urgently.</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {complianceCounts.warning > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setComplianceFilter(complianceFilter === 'warning' ? 'all' : 'warning')}
                      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                        complianceFilter === 'warning'
                          ? 'bg-[hsl(var(--warning))]/15 border-[hsl(var(--warning))]/40 text-[hsl(var(--warning))]'
                          : 'border-[hsl(var(--warning))]/30 text-[hsl(var(--warning))]/80 hover:bg-[hsl(var(--warning))]/10 hover:border-[hsl(var(--warning))]/50'
                      }`}
                    >
                      <Clock className="h-3 w-3" />
                      {complianceCounts.warning} expiring soon
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-left space-y-1.5 max-w-[220px]">
                    <p className="font-semibold">Warning — 8–30 days</p>
                    <p className="text-muted-foreground">CDL or Med Cert expiring within 30 days. Plan for renewal now.</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {complianceCounts.neverRenewed > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setComplianceFilter(complianceFilter === 'never_renewed' ? 'all' : 'never_renewed')}
                      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                        complianceFilter === 'never_renewed'
                          ? 'bg-destructive/15 border-destructive/40 text-destructive'
                          : 'border-destructive/30 text-destructive/80 hover:bg-destructive/10 hover:border-destructive/50'
                      }`}
                    >
                      <FileX className="h-3 w-3" />
                      {complianceCounts.neverRenewed} missing dates
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-left space-y-1.5 max-w-[220px]">
                    <p className="font-semibold">Missing Dates</p>
                    <p className="text-muted-foreground">No CDL or Med Cert expiration date on file. Use Update to add them.</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {complianceCounts.notYetReminded > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setComplianceFilter(complianceFilter === 'not_yet_reminded' ? 'all' : 'not_yet_reminded')}
                      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                        complianceFilter === 'not_yet_reminded'
                          ? 'bg-primary/15 border-primary/40 text-primary'
                          : 'border-primary/25 text-primary/70 hover:bg-primary/10 hover:border-primary/40 hover:text-primary'
                      }`}
                    >
                      <Bell className="h-3 w-3" />
                      {complianceCounts.notYetReminded} not yet reminded
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-left space-y-1.5 max-w-[220px]">
                    <p className="font-semibold">Not Yet Reminded</p>
                    <p className="text-muted-foreground">Drivers who have never received a cert reminder. Send one to start their outreach history.</p>
                  </TooltipContent>
                </Tooltip>
              )}
              </TooltipProvider>
              {complianceFilter !== 'all' && (
                <button
                  onClick={() => setComplianceFilter('all')}
                  className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
                >
                  Clear filter
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Send Reminders to All — only for expired/critical filters */}
          {showBulkRemindButton && (bulkReminderCount > 0 || bulkCooldown) && (
            <div className="flex flex-col items-end gap-0.5">
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={bulkCooldown}
                        className={`gap-2 animate-fade-in transition-all ${
                          bulkCooldown
                            ? 'border-border/40 text-muted-foreground/50 bg-muted/30 cursor-not-allowed opacity-50'
                            : 'border-destructive/40 text-destructive hover:bg-destructive/10 hover:border-destructive/60 hover:text-destructive'
                        }`}
                        onClick={handleOpenBulkReminderDialog}
                      >
                        <Bell className="h-4 w-4" />
                        {bulkCooldown
                          ? `Reminders Sent · ${bulkCooldownMinutes}m cooldown`
                          : `Send Reminders to All (${bulkReminderCount})`}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[220px] text-center">
                    {bulkCooldown
                      ? `Reminders sent this session. Available again in ${bulkCooldownMinutes} minute${bulkCooldownMinutes !== 1 ? 's' : ''}.`
                      : `Send renewal reminder emails to all ${bulkReminderCount} driver${bulkReminderCount !== 1 ? 's' : ''} with expired or critical documents.`}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {bulkLastSentLabel && (
                <span className="text-[10px] text-muted-foreground/70 leading-none pr-0.5">
                  Last sent: {bulkLastSentLabel}
                </span>
              )}
            </div>
          )}

          {/* Bulk Message button — visible only when drivers are selected */}
          {selectedOperatorIds.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 animate-fade-in"
              onClick={() => setBulkModalOpen(true)}
            >
              <MessageSquare className="h-4 w-4" />
              Message {selectedOperatorIds.length} Driver{selectedOperatorIds.length !== 1 ? 's' : ''}
            </Button>
          )}

          {canAddDriver && (
            <Button
              onClick={() => setAddModalOpen(true)}
              className="gap-2"
              size="sm"
            >
              <UserPlus className="h-4 w-4" />
              Add Driver
            </Button>
          )}

          {canAddDriver && (
            <Button
              onClick={() => setLaunchDialogOpen(true)}
              className="gap-2 bg-gold text-surface-dark hover:bg-gold-light"
              size="sm"
            >
              <Rocket className="h-4 w-4" />
              <span className="hidden sm:inline">Launch SUPERDRIVE</span>
              <span className="sm:hidden">Launch</span>
            </Button>
          )}
        </div>
      </div>

      {/* Contextual guidance banner — shown when a compliance filter is active */}
      {!dispatchMode && guidanceBanner && (
        <div
          className={`flex items-start gap-2.5 rounded-lg px-3.5 py-2.5 border text-xs animate-fade-in ${
            guidanceBanner.variant === 'warning'
              ? 'bg-[hsl(var(--warning)/0.08)] border-[hsl(var(--warning)/0.25)] text-[hsl(var(--warning))]'
              : 'bg-destructive/8 border-destructive/20 text-destructive/90'
          }`}
        >
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-70" />
          <span>{guidanceBanner.text}</span>
        </div>
      )}

      {/* CDL / Med Cert Alerts Panel */}
      {!dispatchMode && (
        <div className="border border-border rounded-xl overflow-hidden shadow-sm">
          <button
            onClick={() => setAlertsPanelOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-sm font-semibold text-foreground"
          >
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive/70" />
              CDL &amp; Med Cert Alerts
            </div>
            {alertsPanelOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {alertsPanelOpen && (
            <div className="p-4 pt-3">
              <ComplianceAlertsPanel
                onOpenOperator={setSelectedOperatorId}
                onOpenOperatorWithFocus={async (operatorId, focusField) => {
                  setSelectedOperatorId(operatorId);
                  const { data } = await supabase
                    .from('operators')
                    .select('application_id, applications(*)')
                    .eq('id', operatorId)
                    .single();
                  if (data?.applications) {
                    setReviewApp(data.applications as FullApplication);
                    setReviewFocusField(focusField);
                  }
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Tabs: Active / Archived — only in non-dispatch mode */}
      {!dispatchMode && (
        <Tabs value={activeTab} onValueChange={v => { setActiveTab(v as 'active' | 'archived'); if (v === 'archived') fetchArchivedCount(); }}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="active" className="gap-2">
              <Users2 className="h-3.5 w-3.5" />
              Active Drivers
            </TabsTrigger>
            <TabsTrigger value="archived" className="gap-2">
              <Archive className="h-3.5 w-3.5" />
              Archived
              {archivedCount !== null && archivedCount > 0 && (
                <span className="inline-flex items-center justify-center h-4.5 min-w-[1.125rem] px-1 rounded-full bg-muted-foreground/20 text-muted-foreground text-[10px] font-semibold leading-none tabular-nums">
                  {archivedCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4 space-y-4">
            <DriverRoster
              key={rosterKey}
              onOpenDriver={setSelectedOperatorId}
              onMessageDriver={onMessageDriver}
              dispatchMode={false}
              showInactive={false}
              onSelectionChange={setSelectedOperatorIds}
              complianceFilter={complianceFilter}
              onComplianceFilterChange={setComplianceFilter}
              onComplianceCountsChange={setComplianceCounts}
              onUpdateCompliance={handleUpdateCompliance}
              onDriversChange={drivers => { allDriversRef.current = drivers; }}
            />
          </TabsContent>

          <TabsContent value="archived" className="mt-4">
            <ArchivedDriversView
              onOpenDriver={setSelectedOperatorId}
              onMessageDriver={onMessageDriver}
              onReactivated={() => { setRosterKey(k => k + 1); fetchArchivedCount(); }}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* Roster — dispatch mode (no tabs) */}
      {dispatchMode && (
        <DriverRoster
          key={rosterKey}
          onOpenDriver={setSelectedOperatorId}
          onMessageDriver={onMessageDriver}
          dispatchMode={true}
          showInactive={false}
          onSelectionChange={setSelectedOperatorIds}
          complianceFilter={complianceFilter}
          onComplianceFilterChange={setComplianceFilter}
          onComplianceCountsChange={setComplianceCounts}
          onUpdateCompliance={handleUpdateCompliance}
          onDriversChange={drivers => { allDriversRef.current = drivers; }}
        />
      )}

      {/* Add Driver Modal */}
      <AddDriverModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAdded={() => setRosterKey(k => k + 1)}
      />

      {/* Launch SUPERDRIVE bulk-invite Dialog */}
      <LaunchSuperdriveDialog
        open={launchDialogOpen}
        onClose={() => setLaunchDialogOpen(false)}
      />

      {/* Bulk Message Modal */}
      <BulkMessageModal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        preselectedIds={selectedOperatorIds}
      />

      {/* Inline App Review Drawer — opened from row "Update" links */}
      {reviewApp && (
        <ApplicationReviewDrawer
          app={reviewApp}
          focusField={reviewFocusField}
          onClose={() => { setReviewApp(null); setReviewFocusField(undefined); }}
          onApprove={async () => { setReviewApp(null); }}
          onDeny={async () => { setReviewApp(null); }}
          onExpiryUpdated={() => setRosterKey(k => k + 1)}
        />
      )}

      {/* Bulk Reminder Confirmation Dialog */}
      <AlertDialog open={bulkReminderDialogOpen} onOpenChange={open => { if (!bulkReminderLoading) setBulkReminderDialogOpen(open); }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-destructive" />
              Send Reminders to All
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This will send a renewal reminder email to{' '}
                  <strong className="text-foreground">{bulkReminderTargets.length} driver{bulkReminderTargets.length !== 1 ? 's' : ''}</strong>{' '}
                  with {complianceFilter === 'expired' ? 'expired' : 'expired or critical'} documents.
                </p>
                {bulkReminderTargets.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/40 divide-y divide-border text-xs">
                    {bulkReminderTargets.map(t => (
                      <div key={t.operator_id} className="flex items-center justify-between px-3 py-2 gap-2">
                        <span className="font-medium text-foreground truncate">{t.name}</span>
                        <span className={`shrink-0 font-medium ${t.days_until < 0 ? 'text-destructive' : 'text-[hsl(var(--status-action))]'}`}>
                          {t.doc_type} · {t.days_until < 0 ? `${formatDaysHuman(t.days_until)} ago` : `${formatDaysHuman(t.days_until)} left`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {bulkReminderLoading && bulkReminderProgress && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Sending {bulkReminderProgress.sent} of {bulkReminderProgress.total}…
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300 rounded-full"
                        style={{ width: `${(bulkReminderProgress.sent / bulkReminderProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkReminderLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkReminderLoading || bulkReminderTargets.length === 0}
              onClick={e => { e.preventDefault(); handleConfirmBulkReminder(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2"
            >
              {bulkReminderLoading ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />Sending…</>
              ) : (
                <><Bell className="h-3.5 w-3.5" />Send {bulkReminderTargets.length} Reminder{bulkReminderTargets.length !== 1 ? 's' : ''}</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
