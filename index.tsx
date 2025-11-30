// index.tsx
import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';

import AuthWrapper from './AuthWrapper';
import AdminApp from './AdminApp';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('No se encontró el elemento root');
}

const root = ReactDOM.createRoot(rootElement);

// Detecta la ruta actual: /  o  /admin
const path = window.location.pathname;

if (path.startsWith('/admin')) {
  // 🔐 Panel ADMIN: siempre pide correo + clave (lo maneja AdminApp)
  root.render(
    <React.StrictMode>
      <AdminApp />
    </React.StrictMode>
  );
} else {
  // 🧑‍💻 Flujo normal de usuarios (login, pago, chat, etc.)
  root.render(
    <React.StrictMode>
      <AuthWrapper />
    </React.StrictMode>
  );
}
