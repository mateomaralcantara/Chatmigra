import React, { useState, useEffect } from 'react';
import { User, Plan, AccountDashboardData } from '../types';
import { getAccountDashboardData } from '../services/accountDashboardService';
import PlanSelector from './PlanSelector';
import { logActivity } from '../services/activityService';
import CambiarPlan from './CambiarPlan';

interface AccountDashboardProps {
  user: User;
  plan: Plan;
  onPlanChange?: (plan: Plan) => void;
  // si es true, al montar hacemos scroll al plan Premium
  focusPremium?: boolean;
}

const LoadingSkeleton: React.FC = () => (
  <div className="grid md:grid-cols-2 gap-6 animate-pulse">
    <div className="bg-neutral-900 rounded-lg h-48" />
    <div className="bg-neutral-900 rounded-lg h-48" />
    <div className="md:col-span-2 bg-neutral-900 rounded-lg h-64" />
  </div>
);

const ProgressBar: React.FC<{ value: number; max: number; label: string }> = ({
  value,
  max,
  label,
}) => {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;

  return (
    <div>
      <div className="flex justify-between items-end mb-1">
        <span className="text-sm font-medium text-gray-200">{label}</span>
        <span className="text-xs font-mono text-gray-400">
          {value.toLocaleString()} / {max.toLocaleString()}
        </span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden">
        <div
          className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

type ActivityEvent = AccountDashboardData['activity'][number];

const formatEventType = (type: string) => {
  switch (type) {
    case 'chat_message_sent':
      return 'Mensaje enviado al asistente';
    case 'chat_message_answered':
      return 'Respuesta generada por el asistente';
    case 'upgrade_click':
      return 'Click en botón de upgrade';
    case 'plan_manage_open':
      return 'Gestión de suscripción abierta';
    default:
      return type;
  }
};

const AccountDashboard: React.FC<AccountDashboardProps> = ({
  user,
  plan,
  onPlanChange,
  focusPremium,
}) => {
  const [data, setData] = useState<AccountDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState<boolean>(false);

  // cargar info de dashboard
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const dashboardData = await getAccountDashboardData(plan);
        setData(dashboardData);
      } catch (e) {
        console.error('Error cargando dashboard:', e);
        setError('No se pudo cargar la información de la cuenta.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [plan]);

  // scroll automático al plan Premium si viene focusPremium=true
  useEffect(() => {
    if (!focusPremium) return;

    const el = document.getElementById('premium-plan');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      console.log('[AccountDashboard] Scroll a #premium-plan completado');
    } else {
      console.warn(
        '[AccountDashboard] No se encontró #premium-plan. Revisa PlanSelector.tsx',
      );
    }
  }, [focusPremium]);

  const handlePlanChange = (newPlan: Plan) => {
    if (newPlan === plan) return;

    void logActivity({
      userEmail: user.email,
      type: 'upgrade_click',
      metadata: {
        from: plan,
        to: newPlan,
        source: 'account_dashboard',
      },
    });

    onPlanChange?.(newPlan);
  };

  const handleManageSubscription = () => {
    void logActivity({
      userEmail: user.email,
      type: 'plan_manage_open',
      metadata: {
        currentPlan: data?.subscription?.planName,
        status: data?.subscription?.status,
      },
    });

    alert('Redirigiendo al portal de facturación...');
  };

  const subscription = data?.subscription;
  const quotas = data?.quotas;
  const payments = data?.payments ?? [];
  const activity = data?.activity ?? [];

  const handlePremiumClick = () => {
    // el usuario hizo clic en el plan Premium: mostramos bloque de pago
    setShowUpgrade(true);
  };

  const handlePlanChangedByPayment = (newPlan: Plan) => {
    handlePlanChange(newPlan);
    setShowUpgrade(false);
  };

  const scrollToTop = () => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const scrollToBottom = () => {
    if (typeof window !== 'undefined') {
      const height =
        document.documentElement.scrollHeight || document.body.scrollHeight;
      window.scrollTo({ top: height, behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-black text-gray-100">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        <header>
          <h1 className="text-2xl sm:text-3xl font-bold mb-1">Mi Cuenta</h1>
          <p className="text-sm sm:text-base text-gray-400">
            Administra tu suscripción, revisa tu plan y consulta tu uso.
          </p>
        </header>

        {/* Selector de plan (oferta navideña / Premium) */}
        <PlanSelector
          currentPlan={plan}
          onPlanChange={handlePlanChange}
          onPremiumClick={handlePremiumClick}
        />

        {/* Bloque de pago con PayPal, reutilizando CambiarPlan */}
        {showUpgrade && (
          <section className="bg-neutral-900 p-4 sm:p-6 rounded-lg shadow-md border border-gray-800">
            <CambiarPlan user={user} onPlanChanged={handlePlanChangedByPayment} />
          </section>
        )}

        {isLoading && <LoadingSkeleton />}

        {error && (
          <div className="text-center text-red-400 bg-red-900/40 p-4 rounded-lg border border-red-700/60">
            {error}
          </div>
        )}

        {data && !isLoading && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Suscripción actual */}
            <section className="bg-neutral-900 p-6 rounded-lg shadow-md border border-gray-800">
              <h2 className="text-xl font-semibold mb-4">
                Suscripción actual
              </h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Usuario:</span>
                  <span className="font-medium text-gray-200 truncate max-w-[55%] text-right">
                    {user.email}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Plan:</span>
                  <span className="font-medium text-blue-400 uppercase">
                    {subscription?.planName ?? '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Estado:</span>
                  <span
                    className={`font-medium capitalize ${
                      subscription?.status === 'active'
                        ? 'text-green-400'
                        : 'text-yellow-300'
                    }`}
                  >
                    {subscription?.status ?? '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Próxima factura:</span>
                  <span className="font-medium">
                    {subscription?.currentPeriodEnd ?? '—'}
                  </span>
                </div>
              </div>
              <button
                onClick={handleManageSubscription}
                className="w-full mt-6 bg-blue-600 text-white font-bold py-2.5 px-4 rounded-md hover:bg-blue-500 transition-colors text-sm"
              >
                Gestionar suscripción
              </button>
            </section>

            {/* Uso restante */}
            <section className="bg-neutral-900 p-6 rounded-lg shadow-md border border-gray-800">
              <h2 className="text-xl font-semibold mb-4">Uso restante</h2>
              {quotas ? (
                <div className="space-y-5">
                  <ProgressBar
                    value={quotas.messagesRemaining}
                    max={quotas.messagesMax}
                    label="Mensajes"
                  />
                  <ProgressBar
                    value={quotas.tokensRemaining}
                    max={quotas.tokensMax}
                    label="Tokens"
                  />
                </div>
              ) : (
                <p className="text-sm text-gray-400">
                  No hay información de cuotas disponible.
                </p>
              )}
            </section>

            {/* Historial de pagos */}
            <section className="md:col-span-2 bg-neutral-900 p-6 rounded-lg shadow-md border border-gray-800">
              <h2 className="text-xl font-semibold mb-4">
                Historial de pagos
              </h2>
              {payments.length === 0 ? (
                <p className="text-sm text-gray-400">
                  Aún no hay pagos registrados para esta cuenta.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left text-gray-300">
                    <thead className="text-xs text-gray-400 uppercase bg-black/70">
                      <tr>
                        <th scope="col" className="px-6 py-3">
                          Fecha
                        </th>
                        <th scope="col" className="px-6 py-3">
                          Monto
                        </th>
                        <th scope="col" className="px-6 py-3">
                          Estado
                        </th>
                        <th scope="col" className="px-6 py-3">
                          ID transacción
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map(payment => (
                        <tr
                          key={payment.id}
                          className="border-b border-gray-800 bg-black/40"
                        >
                          <td className="px-6 py-3">{payment.date}</td>
                          <td className="px-6 py-3">{payment.amount}</td>
                          <td className="px-6 py-3">
                            <span
                              className={
                                payment.status === 'paid'
                                  ? 'text-green-400'
                                  : 'text-yellow-300'
                              }
                            >
                              {payment.status}
                            </span>
                          </td>
                          <td className="px-6 py-3 font-mono text-xs">
                            {payment.id}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Actividad reciente */}
            <section className="md:col-span-2 bg-neutral-900 p-6 rounded-lg shadow-md border border-gray-800">
              <h2 className="text-xl font-semibold mb-4">Actividad reciente</h2>
              {activity.length === 0 ? (
                <p className="text-sm text-gray-400">
                  Todavía no hay actividad registrada para esta cuenta.
                </p>
              ) : (
                <ul className="space-y-2 max-h-64 overflow-y-auto text-sm">
                  {activity.slice(0, 30).map((event: ActivityEvent) => (
                    <li
                      key={event.id}
                      className="flex justify-between items-start border-b border-gray-800 pb-2 last:border-none last:pb-0"
                    >
                      <div>
                        <p className="font-medium text-gray-100">
                          {formatEventType(event.type)}
                        </p>
                        {event.metadata?.source && (
                          <p className="text-xs text-gray-400">
                            Origen: {event.metadata.source}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 ml-4 whitespace-nowrap">
                        {new Date(event.createdAt).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>

      {/* Botones flotantes para subir y bajar en el dashboard */}
      <div className="fixed right-4 bottom-4 flex flex-col gap-2 z-50">
        <button
          type="button"
          onClick={scrollToTop}
          className="w-9 h-9 rounded-full bg-slate-800/90 border border-slate-600 text-xs text-slate-100 hover:bg-slate-700 transition-colors shadow-lg"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={scrollToBottom}
          className="w-9 h-9 rounded-full bg-slate-800/90 border border-slate-600 text-xs text-slate-100 hover:bg-slate-700 transition-colors shadow-lg"
        >
          ↓
        </button>
      </div>
    </div>
  );
};

export default AccountDashboard;
