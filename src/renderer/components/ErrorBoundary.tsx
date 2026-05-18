import { Component, type ReactNode, type ErrorInfo } from 'react';

/**
 * Renderer error boundary. Without one, a thrown error during render
 * silently unmounts the React tree and leaves a blank window — which
 * is exactly the white-screen failure mode we hit on first launch.
 * This component catches the throw and surfaces the message + stack
 * in a way the user can actually read.
 */
interface State { error: Error | null; info: ErrorInfo | null; }
interface Props  { children: ReactNode; surface?: 'pill' | 'notch' | 'overlay' | 'dashboard'; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, info });
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', this.props.surface ?? 'unknown', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    // Compact body for surfaces that can't host much chrome (overlay
    // is transparent + click-through; reporting an error in it would
    // be invisible anyway).
    if (this.props.surface === 'overlay') return null;
    return (
      <div
        style={{
          padding: 16,
          background: 'var(--paper)',
          color: 'var(--ink-900)',
          fontFamily: '-apple-system, "Segoe UI", system-ui, sans-serif',
          fontSize: 13,
          lineHeight: 1.5,
          maxWidth: 540,
          margin: '24px auto',
          borderRadius: 12,
          border: '0.5px solid var(--hairline)',
          boxShadow: '0 4px 12px rgba(10,10,11,0.18)',
        }}
      >
        <h2 style={{ marginTop: 0, fontFamily: 'Fraunces, Georgia, serif', fontWeight: 300 }}>
          Keyfloe hit a render error
        </h2>
        <p style={{ color: 'var(--ink-600)' }}>
          The {this.props.surface ?? 'window'} renderer crashed before the UI could mount.
          Restart the app; if it keeps happening, attach the log file at
          <code> %APPDATA%\Keyfloe\logs\keyfloe.log</code>.
        </p>
        <pre
          style={{
            background: 'rgba(0,0,0,0.04)',
            padding: 8,
            borderRadius: 6,
            overflow: 'auto',
            fontSize: 11,
            whiteSpace: 'pre-wrap',
          }}
        >
{String(this.state.error?.message ?? this.state.error)}
{'\n\n'}
{this.state.error?.stack ?? ''}
        </pre>
      </div>
    );
  }
}
