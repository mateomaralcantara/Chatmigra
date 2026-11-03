import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '../services/monitoring';

interface State {
  failed: boolean;
}

/** Last line of defence: a crash in one screen shows a recovery message
 *  instead of a blank page, and is reported to monitoring. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(error, { componentStack: info.componentStack });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="cm-error-boundary">
        <h1>Algo salió mal</h1>
        <p>Tus datos están a salvo. Recarga la página para continuar.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Recargar
        </button>
      </div>
    );
  }
}
