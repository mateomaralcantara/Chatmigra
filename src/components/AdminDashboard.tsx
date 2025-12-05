import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { supabase } from '../services/supabaseClient';
import { User } from '../types';

const ADMIN_EMAIL = 'madmin@chatmig.com';

interface AdminDashboardProps {
  user: User;
}

// Tablas base
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

// Métricas generales
interface AdminOverview {
  totalRevenue: number;
  totalPayments: number;
  activePremium: number;
  totalConversations: number;
}

// Agregado por usuario
interface AdminUserRow {
  email: string;
  currentPlan: string | null;
  lastActivity: string | null;
  totalPayments: number;
  totalPaidUsd: number;
}

const createEmptyUserRow = (email: string): AdminUserRow => ({
  email,
  currentPlan: null,
  lastActivity: null,
  totalPayments: 0,
  totalPaidUsd: 0,
});

const AdminDashboard: React.FC<AdminDashboardProps> = ({ user }) => {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [userRows, setUserRows] = useState<AdminUserRow[]>([]);

  const [userSearch, setUserSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const isAdmin =
    user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    setInfo('');

    try {
      const [
        recentSubs,
        recentPays,
        allSubs,
        allPays,
        allConvs,
      ] = await Promise.all([
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

      if (!recentSubs.error) {
        setSubscriptions(
          (recentSubs.data as SubscriptionRow[]) || []
        );
      }

      if (!recentPays.error) {
        setPayments((recentPays.data as PaymentRow[]) || []);
      }

      if (allSubs.error) throw allSubs.error;
      if (allPays.error) throw allPays.error;
      if (allConvs.error) throw allConvs.error;

      const byEmail = new Map<string, AdminUserRow>();

      let totalRevenue = 0;
      let totalPayments = 0;
      let activePremium = 0;
      const totalConversations = (allConvs.data || []).length;

      // Suscripciones agregadas por usuario
      (allSubs.data || []).forEach(
        (s: {
          user_email: string;
          plan: string;
          status: string;
          created_at: string;
        }) => {
          const email = s.user_email;
          if (!email) return;

          let row = byEmail.get(email);
          if (!row) {
            row = createEmptyUserRow(email);
            byEmail.set(email, row);
          }

          if (s.status === 'active') {
            row.currentPlan = s.plan;
            if (s.plan === 'premium') activePremium += 1;
          }

          if (!row.lastActivity || s.created_at > row.lastActivity) {
            row.lastActivity = s.created_at;
          }
        }
      );

      // Pagos agregados por usuario
      (allPays.data || []).forEach(
        (p: {
          user_email: string;
          amount: number | string;
          currency: string;
          status: string;
          created_at: string;
        }) => {
          const email = p.user_email;
          if (!email) return;

          let row = byEmail.get(email);
          if (!row) {
            row = createEmptyUserRow(email);
            byEmail.set(email, row);
          }

          if (p.status === 'paid') {
            totalPayments += 1;
            row.totalPayments += 1;

            if (p.currency === 'USD') {
              let amountNum = 0;

              if (typeof p.amount === 'number') {
                amountNum = p.amount;
              } else if (typeof p.amount === 'string') {
                const parsed = parseFloat(p.amount);
                if (!Number.isNaN(parsed)) amountNum = parsed;
              }

              if (amountNum > 0) {
                totalRevenue += amountNum;
                row.totalPaidUsd += amountNum;
              }
            }
          }

          if (!row.lastActivity || p.created_at > row.lastActivity) {
            row.lastActivity = p.created_at;
          }
        }
      );

      // Conversaciones como actividad
      (allConvs.data || []).forEach(
        (c: { user_email: string; created_at: string }) => {
          const email = c.user_email;
          if (!email) return;

          let row = byEmail.get(email);
          if (!row) {
            row = createEmptyUserRow(email);
            byEmail.set(email, row);
          }

          if (!row.lastActivity || c.created_at > row.lastActivity) {
            row.lastActivity = c.created_at;
          }
        }
      );

      const usersArr = Array.from(byEmail.values()).sort((a, b) => {
        if (!a.lastActivity) return 1;
        if (!b.lastActivity) return -1;
        return b.lastActivity.localeCompare(a.lastActivity);
      });

      setUserRows(usersArr);
      setOverview({
        totalRevenue,
        totalPayments,
        activePremium,
        totalConversations,
      });
    } catch (err) {
      console.error('Admin load error:', err);
      setError(
        'Ocurrió un error al cargar los datos de administración.'
      );
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
    return userRows.filter(row =>
      row.email.toLowerCase().includes(q)
    );
  }, [userRows, userSearch]);

  const handleUpdateSubscriptionStatus = useCallback(
    async (id: string, newStatus: string) => {
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
          setError(
            'No se pudo actualizar el estado de la suscripción.'
          );
          return;
        }

        setSubscriptions(prev =>
          prev.map(s =>
            s.id === id ? { ...s, status: newStatus } : s
          )
        );
      } catch (err) {
        console.error('Update subscription error:', err);
        setError(
          'Error inesperado al actualizar la suscripción.'
        );
      } finally {
        setUpdatingId(null);
      }
    },
    []
  );

  const handleSendReset = useCallback(
    async (email: string) => {
      setError('');
      setInfo('');
      setActionLoading(`reset:${email}`);

      try {
        const { error } = await supabase.auth.resetPasswordForEmail(
          email,
          {
            redirectTo:
              window.location.origin + '/reset-password',
          }
        );

        if (error) throw error;
        setInfo(
          `Se envió un correo de restablecimiento a ${email}.`
        );
      } catch (e) {
        console.error('Error enviando reset password:', e);
        setError(
          `No se pudo enviar el correo de reset para ${email}.`
        );
      } finally {
        setActionLoading(null);
      }
    },
    []
  );

  const handleDeleteUserData = useCallback(
    async (email: string) => {
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

        const convIds = (convs || []).map(
          (c: { id: string }) => c.id
        );

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

        setUserRows(prev =>
          prev.filter(r => r.email !== email)
        );
        setInfo(
          `Se borraron los datos de negocio asociados a ${email}.`
        );
      } catch (e) {
        console.error('Error borrando datos de usuario:', e);
        setError(
          `No se pudo borrar completamente la data de ${email}. Revisa Supabase.`
        );
      } finally {
        setActionLoading(null);
      }
    },
    []
  );

  if (!isAdmin) {
    return (
      <div className="flex h-full items-center justify-center bg-black text-gray-100">
        <div className="bg-neutral-900 text-yellow-300 px-4 py-3 rounded-lg text-center max-w-md border border-yellow-700/50">
          <p className="font-semibold mb-1">Acceso restringido</p>
          <p className="text-sm">
            Esta sección es solo para el dueño de la plataforma. Inicia
            sesión con{' '}
            <code className="text-yellow-200">{ADMIN_EMAIL}</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-black text-gray-100">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold mb-1">
              Panel de Administración
            </h2>
            <p className="text-sm text-gray-400">
              Controla usuarios de pago, suscripciones y actividad de
              ChatMig.
            </p>
          </div>
          <button
            onClick={loadData}
            className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-500 disabled:bg-blue-900/60"
            disabled={loading}
          >
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>

        {/* Mensajes de estado */}
        {error && (
          <div className="bg-red-900/40 text-red-200 px-4 py-2 rounded-md text-sm border border-red-700/60">
            {error}
          </div>
        )}
        {info && !error && (
          <div className="bg-emerald-900/40 text-emerald-200 px-4 py-2 rounded-md text-sm border border-emerald-700/60">
            {info}
          </div>
        )}

        {/* Usuarios resumidos */}
        <div className="bg-neutral-900 rounded-xl shadow border border-gray-800 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="font-semibold">Usuarios</h3>
              <p className="text-xs text-gray-400">
                Resumen por email: plan, actividad y pagos.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Buscar por email..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                className="w-full sm:w-72 px-3 py-2 rounded-md border border-gray-700 bg-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-400">
                Usuarios únicos: {userRows.length}
              </span>
            </div>
          </div>

          {loading && userRows.length === 0 ? (
            <p className="text-sm text-gray-400">
              Cargando usuarios...
            </p>
          ) : filteredUserRows.length === 0 ? (
            <p className="text-sm text-gray-400">
              No hay usuarios que coincidan con el filtro.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-gray-400 border-b border-gray-800 bg-black/40">
                  <tr>
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Plan</th>
                    <th className="py-2 pr-3">
                      Última actividad
                    </th>
                    <th className="py-2 pr-3">Pagos (USD)</th>
                    <th className="py-2 pr-3 text-right">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUserRows.map(row => (
                    <tr
                      key={row.email}
                      className="border-b border-gray-800 bg-black/40"
                    >
                      <td className="py-2 pr-3 truncate max-w-[220px]">
                        {row.email}
                      </td>
                      <td className="py-2 pr-3 capitalize">
                        {row.currentPlan || 'sin plan'}
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-400">
                        {row.lastActivity
                          ? new Date(
                              row.lastActivity
                            ).toLocaleString()
                          : '—'}
                      </td>
                      <td className="py-2 pr-3">
                        {row.totalPayments > 0
                          ? `${row.totalPayments} pago(s) · $${row.totalPaidUsd.toFixed(
                              2
                            )}`
                          : 'Sin pagos'}
                      </td>
                      <td className="py-2 pl-3 text-right space-x-2">
                        <button
                          onClick={() =>
                            handleSendReset(row.email)
                          }
                          disabled={
                            actionLoading ===
                            `reset:${row.email}`
                          }
                          className="px-2 py-1 rounded-md text-xs bg-blue-600 text-white hover:bg-blue-500 disabled:bg-blue-900/60"
                        >
                          {actionLoading ===
                          `reset:${row.email}`
                            ? 'Enviando...'
                            : 'Reset clave'}
                        </button>
                        <button
                          onClick={() =>
                            handleDeleteUserData(row.email)
                          }
                          disabled={
                            actionLoading ===
                            `delete:${row.email}`
                          }
                          className="px-2 py-1 rounded-md text-xs bg-red-600 text-white hover:bg-red-500 disabled:bg-red-900/60"
                        >
                          {actionLoading ===
                          `delete:${row.email}`
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

          <p className="text-[11px] text-gray-500 mt-1">
            ⚠️ Este panel borra solo datos de negocio (conversaciones,
            mensajes, suscripciones y pagos). La cuenta de autenticación
            (Auth) se gestiona desde el dashboard de Supabase.
          </p>
        </div>

        {/* Métricas principales */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-neutral-900 rounded-xl shadow border border-gray-800 p-4">
            <p className="text-xs uppercase text-gray-400 mb-1">
              Ingresos totales
            </p>
            <p className="text-2xl font-bold">
              {overview
                ? `$${overview.totalRevenue.toFixed(2)} USD`
                : '—'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Basado en pagos con estado{' '}
              <span className="font-semibold">paid</span> y moneda
              USD.
            </p>
          </div>

          <div className="bg-neutral-900 rounded-xl shadow border border-gray-800 p-4">
            <p className="text-xs uppercase text-gray-400 mb-1">
              Pagos procesados
            </p>
            <p className="text-2xl font-bold">
              {overview ? overview.totalPayments : '—'}
            </p>
          </div>

          <div className="bg-neutral-900 rounded-xl shadow border border-gray-800 p-4">
            <p className="text-xs uppercase text-gray-400 mb-1">
              Usuarios Premium activos
            </p>
            <p className="text-2xl font-bold">
              {overview ? overview.activePremium : '—'}
            </p>
          </div>

          <div className="bg-neutral-900 rounded-xl shadow border border-gray-800 p-4">
            <p className="text-xs uppercase text-gray-400 mb-1">
              Conversaciones totales
            </p>
            <p className="text-2xl font-bold">
              {overview ? overview.totalConversations : '—'}
            </p>
          </div>
        </div>

        {/* Suscripciones recientes */}
        <div className="bg-neutral-900 rounded-xl shadow border border-gray-800 p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold">Últimas suscripciones</h3>
            <span className="text-xs text-gray-400">
              Mostrando {subscriptions.length} registros
            </span>
          </div>

          {subscriptions.length === 0 ? (
            <p className="text-sm text-gray-400">
              Aún no hay suscripciones.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-gray-400 border-b border-gray-800 bg-black/40">
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
                      className="border-b border-gray-800 bg-black/40"
                    >
                      <td className="py-2 pr-3">
                        {sub.user_email}
                      </td>
                      <td className="py-2 pr-3 capitalize">
                        {sub.plan}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {sub.provider}
                        <br />
                        <span className="text-gray-500">
                          {sub.provider_subscription_id}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={
                            'px-2 py-0.5 rounded-full text-xs ' +
                            (sub.status === 'active'
                              ? 'bg-green-900/40 text-green-300'
                              : sub.status === 'canceled'
                              ? 'bg-red-900/40 text-red-300'
                              : 'bg-gray-800 text-gray-200')
                          }
                        >
                          {sub.status}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-400">
                        {new Date(
                          sub.created_at
                        ).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3 space-x-2">
                        {sub.status !== 'active' && (
                          <button
                            onClick={() =>
                              handleUpdateSubscriptionStatus(
                                sub.id,
                                'active'
                              )
                            }
                            disabled={updatingId === sub.id}
                            className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-500 disabled:bg-green-900/60"
                          >
                            {updatingId === sub.id
                              ? '...'
                              : 'Activar'}
                          </button>
                        )}
                        {sub.status !== 'canceled' && (
                          <button
                            onClick={() =>
                              handleUpdateSubscriptionStatus(
                                sub.id,
                                'canceled'
                              )
                            }
                            disabled={updatingId === sub.id}
                            className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-500 disabled:bg-red-900/60"
                          >
                            {updatingId === sub.id
                              ? '...'
                              : 'Cancelar'}
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

        {/* Pagos recientes */}
        <div className="bg-neutral-900 rounded-xl shadow border border-gray-800 p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold">Pagos recientes</h3>
            <span className="text-xs text-gray-400">
              Mostrando {payments.length} registros
            </span>
          </div>

          {payments.length === 0 ? (
            <p className="text-sm text-gray-400">
              Aún no hay pagos registrados.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-gray-400 border-b border-gray-800 bg-black/40">
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
                      className="border-b border-gray-800 bg-black/40"
                    >
                      <td className="py-2 pr-3">
                        {pay.user_email}
                      </td>
                      <td className="py-2 pr-3">
                        ${pay.amount.toFixed(2)} {pay.currency}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={
                            'px-2 py-0.5 rounded-full text-xs ' +
                            (pay.status === 'paid'
                              ? 'bg-green-900/40 text-green-300'
                              : pay.status === 'failed'
                              ? 'bg-red-900/40 text-red-300'
                              : 'bg-gray-800 text-gray-200')
                          }
                        >
                          {pay.status}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {pay.provider}
                        <br />
                        <span className="text-gray-500">
                          {pay.provider_subscription_id}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-400">
                        {new Date(
                          pay.created_at
                        ).toLocaleString()}
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
