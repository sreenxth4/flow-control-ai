import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Upload } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full items-center justify-center p-8">
          <div className="mx-auto max-w-md space-y-4 text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
            <h2 className="text-lg font-bold text-foreground">
              {this.props.fallbackTitle || "Something went wrong"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {this.state.error?.message || "An unexpected error occurred. Please try again."}
            </p>
            <div className="flex justify-center gap-3">
              <Button onClick={this.handleRetry} variant="default" size="sm">
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
              <Button
                onClick={() => (window.location.href = "/admin")}
                variant="outline"
                size="sm"
              >
                <Upload className="mr-2 h-4 w-4" />
                Go to Upload
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
