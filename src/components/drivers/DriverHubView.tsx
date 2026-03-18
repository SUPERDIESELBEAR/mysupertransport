import { useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import DriverRoster from './DriverRoster';
import AddDriverModal from './AddDriverModal';
import OperatorDetailPanel from '@/pages/staff/OperatorDetailPanel';
import BulkMessageModal from '@/components/staff/BulkMessageModal';
import ApplicationReviewDrawer, { type FullApplication } from '@/components/management/ApplicationReviewDrawer';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Users2, UserPlus, MessageSquare, AlertCircle, AlertTriangle, Clock, FileX, Info } from 'lucide-react';
import type { ComplianceFilter, ComplianceCounts } from './DriverRoster';

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

export default function DriverHubView({ canAddDriver = false, dispatchMode = false, onMessageDriver, defaultComplianceFilter }: DriverHubViewProps) {
  const [selectedOperatorId, setSelectedOperatorId] = useState<string | null>(null);
  const [pendingFocusField, setPendingFocusField] = useState<'cdl' | 'medcert' | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [rosterKey, setRosterKey] = useState(0);
  const [selectedOperatorIds, setSelectedOperatorIds] = useState<string[]>([]);
  const [complianceFilter, setComplianceFilter] = useState<ComplianceFilter>(defaultComplianceFilter ?? 'all');
  const [complianceCounts, setComplianceCounts] = useState<ComplianceCounts>({
    expired: 0,
    critical: 0,
    warning: 0,
    neverRenewed: 0,
  });

  // Inline App Review Drawer state (opened via "Update" link on roster rows)
  const [reviewApp, setReviewApp] = useState<FullApplication | null>(null);
  const [reviewFocusField, setReviewFocusField] = useState<'cdl' | 'medcert' | undefined>(undefined);
  const [reviewLoading, setReviewLoading] = useState(false);

  const hasAlerts = complianceCounts.expired + complianceCounts.critical + complianceCounts.warning + complianceCounts.neverRenewed > 0;

  // Derive contextual guidance text for active filter
  const guidanceBanner = useMemo(() => {
    if (complianceFilter === 'all') return null;
    const n = (filter: ComplianceFilter) => {
      if (filter === 'expired') return complianceCounts.expired;
      if (filter === 'critical') return complianceCounts.critical;
      if (filter === 'warning') return complianceCounts.warning;
      return complianceCounts.neverRenewed;
    };
    const count = n(complianceFilter);
    const driver = count === 1 ? 'driver' : 'drivers';
    if (complianceFilter === 'expired') return { text: `Showing ${count} ${driver} with an expired CDL or Med Cert. Click Update on any row to fix their expiration date.`, variant: 'destructive' as const };
    if (complianceFilter === 'critical') return { text: `Showing ${count} ${driver} with CDL or Med Cert expiring within 30 days. Click Update on any row to fix their expiration date.`, variant: 'destructive' as const };
    if (complianceFilter === 'warning') return { text: `Showing ${count} ${driver} with CDL or Med Cert expiring within 90 days. Click Update on any row to review their documents.`, variant: 'warning' as const };
    return { text: `Showing ${count} ${driver} with no CDL or Med Cert expiration date on file. Click Update on any row to add their dates.`, variant: 'destructive' as const };
  }, [complianceFilter, complianceCounts]);

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

  if (selectedOperatorId) {
    return (
      <OperatorDetailPanel
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
              <h1 className="text-xl font-bold text-foreground leading-tight">Active Drivers</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Fully onboarded operators ready for dispatch</p>
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

      {/* Roster */}
      <DriverRoster
        key={rosterKey}
        onOpenDriver={setSelectedOperatorId}
        onMessageDriver={onMessageDriver}
        dispatchMode={dispatchMode}
        onSelectionChange={setSelectedOperatorIds}
        complianceFilter={complianceFilter}
        onComplianceFilterChange={setComplianceFilter}
        onComplianceCountsChange={setComplianceCounts}
        onUpdateCompliance={handleUpdateCompliance}
      />

      {/* Add Driver Modal */}
      <AddDriverModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAdded={() => setRosterKey(k => k + 1)}
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
    </div>
  );
}
