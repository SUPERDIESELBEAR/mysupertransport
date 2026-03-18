import { useState, useMemo } from 'react';
import DriverRoster from './DriverRoster';
import AddDriverModal from './AddDriverModal';
import OperatorDetailPanel from '@/pages/staff/OperatorDetailPanel';
import BulkMessageModal from '@/components/staff/BulkMessageModal';
import { Button } from '@/components/ui/button';
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
    if (complianceFilter === 'expired') return { text: `Showing ${count} ${driver} with an expired CDL or Med Cert. Click a driver to update their expiration date.`, variant: 'destructive' as const };
    if (complianceFilter === 'critical') return { text: `Showing ${count} ${driver} with CDL or Med Cert expiring within 30 days. Click a driver to update their expiration date.`, variant: 'destructive' as const };
    if (complianceFilter === 'warning') return { text: `Showing ${count} ${driver} with CDL or Med Cert expiring within 90 days. Click a driver to review their documents.`, variant: 'warning' as const };
    return { text: `Showing ${count} ${driver} with no CDL or Med Cert expiration date on file. Click a driver to add their dates.`, variant: 'destructive' as const };
  }, [complianceFilter, complianceCounts]);

  if (selectedOperatorId) {
    return (
      <OperatorDetailPanel
        operatorId={selectedOperatorId}
        onBack={() => setSelectedOperatorId(null)}
        onMessageOperator={userId => {
          setSelectedOperatorId(null);
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
              {complianceCounts.expired > 0 && (
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
              )}
              {complianceCounts.critical > 0 && (
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
              )}
              {complianceCounts.warning > 0 && (
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
              )}
              {complianceCounts.neverRenewed > 0 && (
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
              )}
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
    </div>
  );
}
