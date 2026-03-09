import { useAuth } from '@/hooks/useAuth';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}:${String(s).padStart(2, '0')}`;
  return `${s}s`;
}

export default function IdleWarningModal() {
  const { user } = useAuth();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const { showWarning, secondsLeft, resetIdle } = useIdleTimeout({
    idleMs: 25 * 60 * 1000,   // 25 min idle
    warningMs: 5 * 60 * 1000, // 5 min to respond
    onSignOut: handleSignOut,
  });

  // Only show for authenticated users
  if (!user || !showWarning) return null;

  const isUrgent = secondsLeft <= 60;

  return (
    <AlertDialog open={showWarning}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
              isUrgent ? 'bg-destructive/10' : 'bg-amber-500/10'
            }`}>
              <Clock className={`h-5 w-5 ${isUrgent ? 'text-destructive' : 'text-amber-500'}`} />
            </div>
            <AlertDialogTitle className="text-base">Session Expiring Soon</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-sm text-muted-foreground">
            You've been inactive for a while. For your security, you'll be signed out automatically in{' '}
            <span className={`font-bold tabular-nums ${isUrgent ? 'text-destructive' : 'text-amber-500'}`}>
              {formatTime(secondsLeft)}
            </span>
            {' '}unless you continue.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel
            onClick={handleSignOut}
            className="text-xs"
          >
            Sign out now
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={resetIdle}
            className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs"
          >
            Stay signed in
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
