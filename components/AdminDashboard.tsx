import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { User } from '../types';

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string | undefined;

interface AdminDashboardProps {
  user: User;
}

interface SubscriptionRow {
  id: string;
  user_email: string;
  provider: string;
  provider_subscription_id: string | null;
  plan: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface PaymentRow {
  id: string;
  user_email: string;
  provider: string;
  provider_subscription_id: string | null;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
}

interface AdminOverview {
  totalRevenue: number;
  totalPayments: number;
  activePremium: number;
  totalConversations: number;
}

interface AdminUserRow {
  email: string;
  currentPlan: string | null;
  lastActivity: string | null;
  totalPayments: number;
  totalPaidUsd: number;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ user }) => {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  // 🔥 NUEVO: vista agregada de usuarios
  const [userRows, setUserRows] = useState<AdminUserRow[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const isAdmin = useMemo(
    () => !!ADMIN_EMAIL && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
    [user.email]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    setInfo('');

    try {
      // 1) Métricas + datos para tablas + datos agregados de usuarios
      const [
        paymentsAgg,
        paymentsCount,
        activePremiumCount,
        conversationsCount,
        recentSubs,
        recentPays,
        allSubs,
        allPays,
        allConvs,
      ] = await Promise.all([
        supabase
          .from('payments')
          .select('sum:amount', { head: false })
          .eq('status', 'paid')
          .single(),
        supabase
          .from('payments')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'paid'),
        supabase
          .from('subscriptions')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active')
          .eq('plan', 'premium'),
        supabase.from('conversations').select('*', { count: 'exact', head: true }),
        supabase
          .from('subscriptions')
          .select(
            'id, user_email, provider, provider_subscription_id, plan, status, created_at, updated_at'
          )
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('payments')
          .select(
            'id, user_email, provider, provider_subscription_id, amount, currency, status, created_at'
          )
          .order('created_at', { ascending: false })
          .limit(20),
        // para vista agregada de usuarios
        supabase
          .from('subscriptions')
          .select('user_email, plan, status, created_at'),
        supabase
          .from('payments')
          .select('user_email, amount, currency, status, created_at'),
        supabase
          .from('conversations')
          .select('user_email, created_at'),
      ]);

      const totalRevenue = (paymentsAgg.data as any)?.sum ?? 0;

      setOverview({
        totalRevenue: Number(totalRevenue) || 0,
        totalPayments: paymentsCount.count || 0,
        activePremium: activePremiumCount.count || 0,
        totalConversations: conversationsCount.count || 0,
      });

      if (recentSubs.error) {
        console.error('Error loading subscriptions:', recentSubs.error);
      } else {
        setSubscriptions((recentSubs.data as SubscriptionRow[]) || []);
      }

      if (recentPays.error) {
        console.error('Error loading payments:', recentPays.error);
      } else {
        setPayments((recentPays.data as PaymentRow[]) || []);
      }

      // 🔥 NUEVO: construir vista agregada de usuarios
      if (allSubs.error) throw allSubs.error;
      if (allPays.error) throw allPays.error;
      if (allConvs.error) throw allConvs.error;

      const byEmail = new Map<string, AdminUserRow>();

      // Suscripciones
      (allSubs.data || []).forEach((s: any) => {
        const email = s.user_email as string;
        if (!email) return;

        const existing = byEmail.get(email) || {
          email,
          currentPlan: null,
          lastActivity: null,
          totalPayments: 0,
          totalPaidUsd: 0,
        };

        if (s.status === 'active') {
          existing.currentPlan = s.plan;
        }

        if (!existing.lastActivity || s.created_at > existing.lastActivity) {
          existing.lastActivity = s.created_at;
        }

        byEmail.set(email, existing);
      });

      // Pagos
      (allPays.data || []).forEach((p: any) => {
        const email = p.user_email as string;
        if (!email) return;

        const existing = byEmail.get(email) || {
          email,
          currentPlan: null,
          lastActivity: null,
          totalPayments: 0,
          totalPaidUsd: 0,
        };

        if (p.status === 'paid') {
          existing.totalPayments += 1;
          if (p.currency === 'USD' && typeof p.amount === 'number') {
            existing.totalPaidUsd += p.amount;
          } else if (p.currency === 'USD' && typeof p.amount === 'string') {
            const num = parseFloat(p.amount);
            if (!Number.isNaN(num)) existing.totalPaidUsd += num;
          }
        }

        if (!existing.lastActivity || p.created_at > existing.lastActivity) {
          existing.lastActivity = p.created_at;
        }

        byEmail.set(email, existing);
      });

      // Conversaciones
      (allConvs.data || []).forEach((c: any) => {
        const email = c.user_email as string;
        if (!email) return;

        const existing = byEmail.get(email) || {
          email,
          currentPlan: null,
          lastActivity: null,
          totalPayments: 0,
          totalPaidUsd: 0,
        };

        if (!existing.lastActivity || c.created_at > existing.lastActivity) {
          existing.lastActivity = c.created_at;
        }

        byEmail.set(email, existing);
      });

      const usersArr = Array.from(byEmail.values()).sort((a, b) => {
        if (!a.lastActivity) return 1;
        if (!b.lastActivity) return -1;
        return b.lastActivity.localeCompare(a.lastActivity);
      });

      setUserRows(usersArr);
    } catch (err) {
      console.error('Admin load error:', err);
      setError('Ocurrió un error al cargar los datos de administración.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadData();
    }
  }, [isAdmin, loadData]);

  const filteredUserRows = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return userRows;
    return userRows.filter(r => r.email.toLowerCase().includes(q));
  }, [userRows, userSearch]);

  const handleUpdateSubscriptionStatus = async (id: string, newStatus: string) => {
    setUpdatingId(id);
    setError('');
    setInfo('');
    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) {
        console.error('Error updating subscription:', error);
        setError('No se pudo actualizar el estado de la suscripción.');
        return;
      }

      setSubscriptions(prev =>
        prev.map(s => (s.id === id ? { ...s, status: newStatus } : s))
      );
    } catch (err) {
      console.error('Update subscription error:', err);
      setError('Error inesperado al actualizar la suscripción.');
    } finally {
      setUpdatingId(null);
    }
  };

  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // 🔥 NUEVO: enviar email de reset de contraseña
  const handleSendReset = async (email: string) => {
    setError('');
    setInfo('');
    setActionLoading(`reset:${email}`);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password',
      });

      if (error) throw error;
      setInfo(`Se envió un correo de restablecimiento a ${email}.`);
    } catch (e) {
      console.error('Error enviando reset password:', e);
      setError(`No se pudo enviar el correo de reset para ${email}.`);
    } finally {
      setActionLoading(null);
    }
  };

  // 🔥 NUEVO: borrar data de negocio de un usuario
  const handleDeleteUserData = async (email: string) => {
    const ok = window.confirm(
      `⚠️ Vas a borrar TODAS las conversaciones, mensajes, suscripciones y pagos asociados a ${email}.\nEsto NO borra la cuenta de autenticación en Supabase.\n\n¿Seguro?`
    );
    if (!ok) return;

    setError('');
    setInfo('');
    setActionLoading(`delete:${email}`);

    try {
      const { data: convs, error: convsError } = await supabase
        .from('conversations')
        .select('id')
        .eq('user_email', email);

      if (convsError) throw convsError;

      const convIds = (convs || []).map((c: any) => c.id);

      if (convIds.length > 0) {
        const { error: msgError } = await supabase
          .from('messages')
          .delete()
          .in('conversation_id', convIds);
        if (msgError) throw msgError;

        const { error: convDelError } = await supabase
          .from('conversations')
          .delete()
          .eq('user_email', email);
        if (convDelError) throw convDelError;
      }

      const { error: subError } = await supabase
        .from('subscriptions')
        .delete()
        .eq('user_email', email);
      if (subError) throw subError;

      const { error: payError } = await supabase
        .from('payments')
        .delete()
        .eq('user_email', email);
      if (payError) throw payError;

      setUserRows(prev => prev.filter(r => r.email !== email));
      setInfo(`Se borraron los datos de negocio asociados a ${email}.`);
    } catch (e) {
      console.error('Error borrando datos de usuario:', e);
      setError(`No se pudo borrar completamente la data de ${email}. Revisa Supabase.`);
    } finally {
      setActionLoading(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="bg-yellow-100 text-yellow-800 px-4 py-3 rounded-lg text-center max-w-md">
          <p className="font-semibold mb-1">Acceso restringido</p>
          <p className="text-sm">
            Esta sección es solo para el dueño de la plataforma. Inicia sesión con el correo
            admin configurado en <code>VITE_ADMIN_EMAIL</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold mb-1">Panel de Administración</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Controla usuarios de pago, suscripciones y actividad de ChatMig.
            </p>
          </div>
          <button
            onClick={loadData}
            className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400"
            disabled={loading}
          >
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>

        {error && (
          <div className="bg-red-100 text-red-800 px-4 py-2 rounded-md text-sm">
            {error}
          </div>
        )}
        {info && !error && (
          <div className="bg-emerald-100 text-emerald-800 px-4 py-2 rounded-md text-sm">
            {info}
          </div>
        )}

        {/* 🔥 NUEVO: Vista agregada de usuarios */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="font-semibold">Usuarios</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Resumen por email: plan, actividad y pagos.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Buscar por email..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                className="w-full sm:w-72 px-3 py-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Usuarios únicos: {userRows.length}
              </span>
            </div>
          </div>

          {loading && userRows.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Cargando usuarios...
            </p>
          ) : filteredUserRows.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No hay usuarios que coincidan con el filtro.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-gray-500 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Plan</th>
                    <th className="py-2 pr-3">Última actividad</th>
                    <th className="py-2 pr-3">Pagos (USD)</th>
                    <th className="py-2 pr-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUserRows.map(row => (
                    <tr
                      key={row.email}
                      className="border-b border-gray-100 dark:border-gray-800"
                    >
                      <td className="py-2 pr-3 truncate max-w-[220px]">{row.email}</td>
                      <td className="py-2 pr-3 capitalize">
                        {row.currentPlan || 'sin plan'}
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-500 dark:text-gray-400">
                        {row.lastActivity
                          ? new Date(row.lastActivity).toLocaleString()
                          : '—'}
                      </td>
                      <td className="py-2 pr-3">
                        {row.totalPayments > 0
                          ? `${row.totalPayments} pago(s) · $${row.totalPaidUsd.toFixed(2)}`
                          : 'Sin pagos'}
                      </td>
                      <td className="py-2 pl-3 text-right space-x-2">
                        <button
                          onClick={() => handleSendReset(row.email)}
                          disabled={actionLoading === `reset:${row.email}`}
                          className="px-2 py-1 rounded-md text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400"
                        >
                          {actionLoading === `reset:${row.email}`
                            ? 'Enviando...'
                            : 'Reset clave'}
                        </button>
                        <button
                          onClick={() => handleDeleteUserData(row.email)}
                          disabled={actionLoading === `delete:${row.email}`}
                          className="px-2 py-1 rounded-md text-xs bg-red-600 text-white hover:bg-red-700 disabled:bg-red-400"
                        >
                          {actionLoading === `delete:${row.email}`
                            ? 'Borrando...'
                            : 'Borrar data'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[11px] text-gray-400 mt-1">
            ⚠️ Este panel borra solo datos de negocio (conversaciones, mensajes, suscripciones y pagos).
            La cuenta de autenticación (Auth) se gestiona desde el dashboard de Supabase.
          </p>
        </div>

        {/* Métricas principales (tu bloque original) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
            <p className="text-xs uppercase text-gray-500 dark:text-gray-400 mb-1">
              Ingresos totales
            </p>
            <p className="text-2xl font-bold">
              {overview ? `$${overview.totalRevenue.toFixed(2)} USD` : '—'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Basado en pagos con estado <span className="font-semibold">paid</span>.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
            <p className="text-xs uppercase text-gray-500 dark:text-gray-400 mb-1">
              Pagos procesados
            </p>
            <p className="text-2xl font-bold">
              {overview ? overview.totalPayments : '—'}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
            <p className="text-xs uppercase text-gray-500 dark:text-gray-400 mb-1">
              Usuarios Premium activos
            </p>
            <p className="text-2xl font-bold">
              {overview ? overview.activePremium : '—'}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
            <p className="text-xs uppercase text-gray-500 dark:text-gray-400 mb-1">
              Conversaciones totales
            </p>
            <p className="text-2xl font-bold">
              {overview ? overview.totalConversations : '—'}
            </p>
          </div>
        </div>

        {/* Suscripciones recientes (tu bloque original) */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold">Últimas suscripciones</h3>
            <span className="text-xs text-gray-500">
              Mostrando {subscriptions.length} registros
            </span>
          </div>

          {subscriptions.length === 0 ? (
            <p className="text-sm text-gray-500">Aún no hay suscripciones.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-gray-500 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="py-2 pr-3">Usuario</th>
                    <th className="py-2 pr-3">Plan</th>
                    <th className="py-2 pr-3">Proveedor</th>
                    <th className="py-2 pr-3">Estado</th>
                    <th className="py-2 pr-3">Creada</th>
                    <th className="py-2 pr-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map(sub => (
                    <tr
                      key={sub.id}
                      className="border-b border-gray-100 dark:border-gray-800"
                    >
                      <td className="py-2 pr-3">{sub.user_email}</td>
                      <td className="py-2 pr-3 capitalize">{sub.plan}</td>
                      <td className="py-2 pr-3 text-xs">
                        {sub.provider} <br />
                        <span className="text-gray-400">
                          {sub.provider_subscription_id}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={
                            'px-2 py-0.5 rounded-full text-xs ' +
                            (sub.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : sub.status === 'canceled'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-700')
                          }
                        >
                          {sub.status}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-500">
                        {new Date(sub.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3 space-x-2">
                        {sub.status !== 'active' && (
                          <button
                            onClick={() =>
                              handleUpdateSubscriptionStatus(sub.id, 'active')
                            }
                            disabled={updatingId === sub.id}
                            className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 disabled:bg-green-400"
                          >
                            {updatingId === sub.id ? '...' : 'Activar'}
                          </button>
                        )}
                        {sub.status !== 'canceled' && (
                          <button
                            onClick={() =>
                              handleUpdateSubscriptionStatus(sub.id, 'canceled')
                            }
                            disabled={updatingId === sub.id}
                            className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:bg-red-400"
                          >
                            {updatingId === sub.id ? '...' : 'Cancelar'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagos recientes (tu bloque original) */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold">Pagos recientes</h3>
            <span className="text-xs text-gray-500">
              Mostrando {payments.length} registros
            </span>
          </div>

          {payments.length === 0 ? (
            <p className="text-sm text-gray-500">Aún no hay pagos registrados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-gray-500 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="py-2 pr-3">Usuario</th>
                    <th className="py-2 pr-3">Monto</th>
                    <th className="py-2 pr-3">Estado</th>
                    <th className="py-2 pr-3">Proveedor</th>
                    <th className="py-2 pr-3">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(pay => (
                    <tr
                      key={pay.id}
                      className="border-b border-gray-100 dark:border-gray-800"
                    >
                      <td className="py-2 pr-3">{pay.user_email}</td>
                      <td className="py-2 pr-3">
                        ${pay.amount.toFixed(2)} {pay.currency}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={
                            'px-2 py-0.5 rounded-full text-xs ' +
                            (pay.status === 'paid'
                              ? 'bg-green-100 text-green-700'
                              : pay.status === 'failed'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-700')
                          }
                        >
                          {pay.status}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {pay.provider}
                        <br />
                        <span className="text-gray-400">
                          {pay.provider_subscription_id}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-500">
                        {new Date(pay.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
