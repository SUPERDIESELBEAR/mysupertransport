import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { PendingExit } from "@/hooks/useUnsavedChanges";

interface Props {
  /** PendingExit from useUnsavedChanges — null when no exit is queued. */
  pending: PendingExit | null;
  /** Optional override title. */
  title?: string;
  /** Optional override description. */
  description?: string;
  /** Hide the Save button (e.g. when there is no save handler bound). */
  hideSave?: boolean;
}

/**
 * The one and only unsaved-changes dialog used across the staff dashboard.
 * Wire it once per surface — sits idle until guard() triggers an exit.
 */
export function UnsavedChangesDialog({
  pending,
  title = "You have unsaved changes",
  description = "Save your changes before leaving, or discard them and continue.",
  hideSave = false,
}: Props) {
  const open = pending !== null;
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) pending?.cancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel onClick={() => pending?.cancel()}>
            Keep editing
          </AlertDialogCancel>
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => pending?.discard()}
          >
            Discard changes
          </Button>
          {!hideSave && (
            <AlertDialogAction onClick={() => { void pending?.proceed(); }}>
              Save & continue
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
