import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Degrades ONE card, not the page.
 *
 * A shape mismatch in a single Load Detail card used to throw during render,
 * unmount the whole route and bounce the user to /dashboard with no
 * explanation. A card that cannot render should say so where it sits and leave
 * every other card on the load readable.
 */
interface Props {
  /** Human name of the section, shown in the fallback. */
  name: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class SectionErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`SectionErrorBoundary [${this.props.name}]:`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <section
        role="alert"
        className="rounded-lg border border-destructive/40 bg-destructive/5 p-4"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-destructive">
              This section could not be displayed.
            </p>
            <p className="mt-1 text-sm text-foreground">{this.props.name}</p>
            <p className="mt-1 break-words font-mono text-xs text-muted-foreground">
              {error.message}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-1.5"
              onClick={() => this.setState({ error: null })}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        </div>
      </section>
    );
  }
}

export default SectionErrorBoundary;
