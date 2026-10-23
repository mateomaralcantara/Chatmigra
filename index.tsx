import './src/index.css';
import './src/styles/chatmi-ultimate.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import AuthWrapper from './src/AuthWrapper';
import AdminApp from './src/AdminApp';
import ResetPassword from './src/components/ResetPassword';
import PremiumShell from './src/ui/PremiumShell';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('No se encontró el elemento root');
}

const root = ReactDOM.createRoot(rootElement);
const path = window.location.pathname;

let app: React.ReactNode;

if (path.startsWith('/admin')) {
  app = <AdminApp />;
} else if (path.startsWith('/reset-password')) {
  app = <ResetPassword />;
} else {
  app = (
    <PremiumShell>
      <AuthWrapper />
    </PremiumShell>
  );
}

root.render(
  <React.StrictMode>
    {app}
  </React.StrictMode>,
);
