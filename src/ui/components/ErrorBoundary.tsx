import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Changing this key clears the error (for example when the input changes). */
  resetKey?: unknown;
  title?: string;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[TaxForge] render error", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-panel" role="alert">
          <h2>{this.props.title ?? "Something went wrong"}</h2>
          <p>The calculation hit an error. Your inputs are saved; change a value or reload to try again.</p>
          <pre>{this.state.error.message}</pre>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
