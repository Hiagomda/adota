import { Component, type ErrorInfo as ReactErrorInfo, type ReactNode } from 'react';
import { CrashScreen } from './CrashScreen';
import { reportError } from './reporter';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Name of the section, sent with the report and useful when reading the console. */
  name: string;
  /** Section version of the error screen, inside a screen instead of replacing it. */
  inline?: boolean;
  retryLabel?: string;
  /** Runs after the error is recorded; the boundary resets afterwards. */
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: unknown;
  eventId: string | null;
  failed: boolean;
}

/**
 * Catches render errors below it, records them and shows the error screen.
 * "Tentar de novo" re-renders the children; the error is never swallowed silently.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, eventId: null, failed: false };

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error, failed: true };
  }

  componentDidCatch(error: unknown, info: ReactErrorInfo): void {
    const eventId = reportError(error, {
      source: 'boundary',
      where: this.props.name,
      fatal: !this.props.inline,
      extra: { componentStack: info.componentStack ?? null },
    });
    this.setState({ eventId });
  }

  private reset = (): void => {
    this.props.onReset?.();
    this.setState({ error: null, eventId: null, failed: false });
  };

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <CrashScreen
        error={this.state.error}
        eventId={this.state.eventId}
        inline={this.props.inline}
        retryLabel={this.props.retryLabel}
        onRetry={this.reset}
      />
    );
  }
}
