import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Shown in place of the crashed subtree. */
  label?: string;
  compact?: boolean;
}

export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[life-sim] render error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className={this.props.compact ? 'flex items-start gap-3 rounded-[10px] bg-danger-tint p-4 text-danger-ink' : 'mx-auto my-16 flex max-w-md items-start gap-3 rounded-card bg-danger-tint p-5 text-danger-ink'}>
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-body-sm font-semibold">{this.props.label ?? 'This part of the page failed to load'}</p>
          <p className="mt-0.5 text-body-sm">Your saved plan is unaffected.</p>
          <button onClick={() => this.setState({ error: null })} className="mt-2 rounded-button border border-danger-ink/30 px-3 py-1 text-body-sm font-medium hover:bg-white/50">
            Try again
          </button>
        </div>
      </div>
    );
  }
}
