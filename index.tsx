import './src/index.css';
import './src/styles/chatmi-ultimate.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import AuthWrapper from './AuthWrapper';
import AdminApp from './src/AdminApp';
import ResetPassword from './src/components/ResetPassword';
import PremiumShell from './src/ui/PremiumShell';
import ErrorBoundary from './src/ui/ErrorBoundary';
import { initMonitoring, reportError } from './src/services/monitoring';

void initMonitoring();
window.addEventListener('unhandledrejection', (event) => reportError(event.reason, { kind: 'unhandledrejection' }));

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('No se encontró el elemento root');
}

const root = ReactDOM.createRoot(rootElement);
const path = window.location.pathname;

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      {path.startsWith('/reset-password') ? (
        <ResetPassword />
      ) : path.startsWith('/admin') ? (
        <AdminApp />
      ) : (
        <PremiumShell>
          <AuthWrapper />
        </PremiumShell>
      )}
    </ErrorBoundary>
  </React.StrictMode>,
);
