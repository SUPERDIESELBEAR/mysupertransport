import React from 'react';
import { AlertTriangle, RefreshCw, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Guards a whole portal destination.
 *
 * A role switch used to be able to white-screen: the destination portal threw
 * (or was clobbered mid-navigation) and the tree unmounted with nothing on
 * screen and no way back. A failed destination must always say what happened
 * and offer a route out.
 */
interface Props {
  /** Human name of the destination, shown in the fallback. */
  name: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class PortalErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`PortalErrorBoundary [${this.props.name}]:`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface-dark p-6">
        <div
          role="alert"
          className="w-full max-w-md rounded-lg border border-destructive/40 bg-surface-dark-card p-5"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-destructive">
                {this.props.name} could not be displayed.
              </p>
              <p className="mt-1 break-words font-mono text-xs text-surface-dark-muted">
                {error.message}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="gap-1.5 bg-gold text-surface-dark hover:bg-gold-light"
                  onClick={() => this.setState({ error: null })}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Try again
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => {
                    window.location.assign('/dashboard');
                  }}
                >
                  Back to dashboard
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-surface-dark-muted"
                  onClick={() => {
                    window.location.assign('/login');
                  }}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign in again
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default PortalErrorBoundary;
