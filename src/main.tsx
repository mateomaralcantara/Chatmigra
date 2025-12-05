// src/main.tsx
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

root.render(
  <React.StrictMode>
    {path.startsWith('/admin') ? <AdminApp /> : <AuthWrapper />}
  </React.StrictMode>
);
