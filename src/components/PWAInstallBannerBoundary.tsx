import { Component, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, X } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  dismissed: boolean;
}

export default class PWAInstallBannerBoundary extends Component<Props, State> {
  state: State = { hasError: false, dismissed: false };

  static getDerivedStateFromError(): State {
    return { hasError: true, dismissed: false };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error("PWAInstallBanner crashed:", error, info);
  }

  render() {
    if (this.state.dismissed) return null;
    if (this.state.hasError) {
      return (
        <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-lg border border-border bg-card p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="flex-1 text-sm">
              <p className="font-medium text-foreground">Install banner unavailable</p>
              <p className="mt-1 text-muted-foreground">
                Visit{" "}
                <a href="/install" className="underline underline-offset-2">
                  the install guide
                </a>{" "}
                to add SUPERDRIVE to your device.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => this.setState({ dismissed: true })}
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}