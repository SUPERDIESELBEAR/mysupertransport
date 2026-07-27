import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { DeactivationWizardContent } from './DeactivationWizardContent';

export interface DeactivationWizardProps {
  open: boolean;
  onClose: () => void;
  operatorId: string;
  operatorName: string;
  unitNumber?: string | null;
  isActive: boolean;
  isManagement: boolean;
  onComplete?: () => void;
}

export function DeactivationWizard({
  open,
  onClose,
  operatorId,
  operatorName,
  unitNumber,
  isActive,
  isManagement,
  onComplete,
}: DeactivationWizardProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl w-[95vw] p-0 h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader className="sr-only">
          <DialogTitle>Deactivation & Delease Wizard</DialogTitle>
          <DialogDescription>
            Step through every offboarding requirement for {operatorName} before finalizing deactivation.
          </DialogDescription>
        </DialogHeader>
        <DeactivationWizardContent
          operatorId={operatorId}
          operatorName={operatorName}
          unitNumber={unitNumber}
          isActive={isActive}
          isManagement={isManagement}
          onComplete={() => {
            onClose();
            onComplete?.();
          }}
          onCancel={onClose}
          layout="modal"
        />
      </DialogContent>
    </Dialog>
  );
}
