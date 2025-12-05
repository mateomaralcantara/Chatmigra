// main.tsx o index.tsx (el que tu proyecto use como entry)
import './src/index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import AuthWrapper from './AuthWrapper';
import AdminApp from './src/AdminApp';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('No se encontró el elemento root');
}

const root = ReactDOM.createRoot(rootElement);

// Detecta la ruta actual: /  o  /admin
const path = window.location.pathname;

if (path.startsWith('/admin')) {
  // 🔐 Panel ADMIN
  root.render(
    <React.StrictMode>
      <AdminApp />
    </React.StrictMode>
  );
} else {
  // 🧑‍💻 Flujo normal
  root.render(
    <React.StrictMode>
      <AuthWrapper />
    </React.StrictMode>
  );
}
