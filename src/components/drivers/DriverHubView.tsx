import { useState } from 'react';
import DriverRoster from './DriverRoster';
import AddDriverModal from './AddDriverModal';
import OperatorDetailPanel from '@/pages/staff/OperatorDetailPanel';
import { Button } from '@/components/ui/button';
import { Users2, UserPlus, ArrowLeft } from 'lucide-react';

interface DriverHubViewProps {
  /** If true, show the "Add Driver" button (management only) */
  canAddDriver?: boolean;
  /** If true, use dispatch-only columns in the roster */
  dispatchMode?: boolean;
  /** Called when the user clicks "Message" on a driver (navigates to messages tab) */
  onMessageDriver?: (userId: string) => void;
}

export default function DriverHubView({ canAddDriver = false, dispatchMode = false, onMessageDriver }: DriverHubViewProps) {
  const [selectedOperatorId, setSelectedOperatorId] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [rosterKey, setRosterKey] = useState(0);

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground leading-tight">Active Drivers</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Fully onboarded operators ready for dispatch</p>
            </div>
          </div>
        </div>
        {canAddDriver && (
          <Button
            onClick={() => setAddModalOpen(true)}
            className="gap-2 shrink-0"
            size="sm"
          >
            <UserPlus className="h-4 w-4" />
            Add Driver
          </Button>
        )}
      </div>

      {/* Roster */}
      <DriverRoster
        key={rosterKey}
        onOpenDriver={setSelectedOperatorId}
        onMessageDriver={onMessageDriver}
        dispatchMode={dispatchMode}
      />

      {/* Add Driver Modal */}
      <AddDriverModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAdded={() => setRosterKey(k => k + 1)}
      />
    </div>
  );
}
