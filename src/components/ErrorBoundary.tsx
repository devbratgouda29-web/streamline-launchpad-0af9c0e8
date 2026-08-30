import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportLovableError } from "@/lib/lovable-error-reporting";

type Props = { children: ReactNode; fallback?: (err: Error, reset: () => void) => ReactNode };
type State = { error: Error | null };

/**
 * App-level React ErrorBoundary. Catches render-time exceptions so a broken
 * screen shows a fallback UI (with stack trace in dev) instead of a fully
 * black preview.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface to the console and to Lovable's error reporter.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info);
    try {
      reportLovableError(error, { componentStack: info.componentStack });
    } catch {
      /* ignore */
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-destructive/40 bg-card p-6 text-center shadow-xl">
          <h1 className="text-lg font-black uppercase tracking-widest text-destructive">
            Something broke
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The screen crashed before it could finish rendering.
          </p>
          <pre className="mt-4 max-h-48 overflow-auto rounded-lg bg-black/60 p-3 text-left text-[11px] leading-snug text-amber-200">
            {error.message}
            {error.stack ? `\n\n${error.stack}` : ""}
          </pre>
          <div className="mt-5 flex justify-center gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Try again
            </button>
            <a
              href="/"
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent"
            >
              Go home
            </a>
          </div>
        </div>
      </div>
    );
  }
}
