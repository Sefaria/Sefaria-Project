/**
 * A React error boundary that reports what it catches (src/lib/monitoring/error-reporter.ts) and shows a fallback instead of
 * unmounting the whole page. `name` says where it sits ("root", "panel") in the report; `resetKey` changing (the page's path, the
 * panel's ref) gives the children another try.
 *
 * @feature ANL-017 Browser error reporting
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportError } from "./error-reporter";

export interface ReportingBoundaryProps {
  name: string;
  children: ReactNode;
  fallback: (error: unknown, retry: () => void) => ReactNode;
  resetKey?: unknown;
}

interface State {
  error: unknown;
  failed: boolean;
  key: unknown;
}

export class ReportingBoundary extends Component<ReportingBoundaryProps, State> {
  override state: State = { error: null, failed: false, key: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error, failed: true };
  }

  static getDerivedStateFromProps(props: ReportingBoundaryProps, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { key: props.resetKey, failed: false, error: null } : null;
  }

  override componentDidCatch(error: unknown, _info: ErrorInfo): void {
    // the component stack names components only (no text), but it is long and adds nothing the JS stack lacks: left out
    reportError("boundary", error, { boundary: this.props.name });
  }

  private retry = () => this.setState({ failed: false, error: null });

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback(this.state.error, this.retry) : this.props.children;
  }
}
