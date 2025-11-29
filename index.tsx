import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import AuthWrapper from './AuthWrapper';
import App from './App';
import { User, Plan } from './types';


const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);

// Ruta actual (/, /admin, etc.)
const path = window.location.pathname;

if (path === '/admin') {
  // Usuario admin “fake” solo para desarrollo
  const adminUser: User = {
    email: 'madmin@chatmig.com',
    firstName: 'Admin',
    lastName: 'Local',
  };

  root.render(
    <React.StrictMode>
      <App
        user={adminUser}
        plan={Plan.PREMIUM}
        onLogout={() => {
          // Si haces logout desde admin, te mando al flujo normal
          window.location.href = '/';
        }}
        initialView="admin"
      />
    </React.StrictMode>
  );
} else {
  // Flujo normal: login / pago / etc.
  root.render(
    <React.StrictMode>
      <AuthWrapper />
    </React.StrictMode>
  );
}
