import { Component } from 'preact';
import type { ComponentChildren } from 'preact';

interface Props {
  children: ComponentChildren;
  fallbackMessage?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches rendering errors in child components and shows a fallback UI
 * instead of crashing the entire app. Preact class components support
 * error boundaries via componentDidCatch.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  componentDidCatch(error: Error) {
    this.setState({ error });
    console.error('mercury panel error:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100%', padding: '24px',
        }}>
          <div style={{
            background: 'var(--bg-toolbar)',
            borderRadius: '6px',
            padding: '24px',
            maxWidth: '420px',
            textAlign: 'center',
            boxShadow: 'var(--shadow)',
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚠</div>
            <div style={{ color: 'var(--text-bright)', fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>
              {this.props.fallbackMessage || 'Something went wrong'}
            </div>
            <div style={{
              color: 'var(--status-error)', fontSize: '11px',
              fontFamily: 'monospace', marginBottom: '16px',
              padding: '8px', background: 'var(--bg-input)',
              borderRadius: '4px', maxHeight: '80px', overflow: 'auto',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {this.state.error.message}
            </div>
            <button
              onClick={() => this.setState({ error: null })}
              style={{
                background: 'var(--accent-btn)', color: 'var(--text-white)',
                border: 'none', borderRadius: '3px', padding: '6px 16px',
                cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit',
                fontWeight: 'bold',
              }}>
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
