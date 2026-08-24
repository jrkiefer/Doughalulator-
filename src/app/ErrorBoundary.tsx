/**
 * The last line of defence: if anything in the tree throws while rendering,
 * the owner gets a card in the app's own voice instead of a blank page.
 *
 * Why this exists in an app this small: the screen is rebuilt from the
 * phone's own storage and from spreadsheet fetches on every open, so a
 * malformed cached entry (a hand-edited value, a half-written record from a
 * dying browser) could crash the first render — and a blank page reads as
 * "the app is gone", which at 2 PM on a busy day is a small emergency. A
 * crash here loses NOTHING: every keystroke is already persisted (see
 * services/sync.ts), so "reload" genuinely is the whole fix in almost every
 * case.
 *
 * This is deliberately the only class component in the codebase — error
 * boundaries are the one thing React still requires a class for.
 */
import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  /** The message of whatever was thrown; null while everything is fine. */
  message: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  render() {
    if (this.state.message === null) return this.props.children;
    return (
      <div className="page">
        <div className="band">
          <div className="card crash-card">
            <h2 className="crash-title">Something broke on this screen</h2>
            <p className="crash-body">
              Nothing typed has been lost — every number is saved on the phone the moment it is
              entered. Reloading almost always fixes this.
            </p>
            {/* The raw message, small: useless to the owner but exactly what a
                helper needs to be told over the phone. */}
            <p className="crash-detail">{this.state.message}</p>
            <button className="btn-primary" onClick={() => window.location.reload()}>
              RELOAD THE APP
            </button>
          </div>
        </div>
      </div>
    );
  }
}
