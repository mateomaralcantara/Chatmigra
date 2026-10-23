import './src/index.css';
import './src/styles/chatmi-ultimate.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import AuthWrapper from './AuthWrapper';
import AdminApp from './src/AdminApp';
import ResetPassword from './src/components/ResetPassword';
import PremiumShell from './src/ui/PremiumShell';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('No se encontró el elemento root');
}

const root = ReactDOM.createRoot(rootElement);
const path = window.location.pathname;

root.render(
  <React.StrictMode>
    {path.startsWith('/reset-password') ? (
      <ResetPassword />
    ) : path.startsWith('/admin') ? (
      <AdminApp />
    ) : (
      <PremiumShell>
        <AuthWrapper />
      </PremiumShell>
    )}
  </React.StrictMode>,
);
