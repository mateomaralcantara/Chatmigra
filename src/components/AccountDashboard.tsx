import React, { useEffect, useState } from 'react';
import { getAccountDashboardData } from '../services/accountDashboardService';
import { logActivity } from '../services/activityService';
import {
  type AccountDashboardData,
  Plan,
  type User,
} from '../types';
import CambiarPlan from './CambiarPlan';
import PlanSelector from './PlanSelector';

interface AccountDashboardProps {
  user: User;
  plan: Plan;
  onPlanChange?: (plan: Plan) => void;
  onLogout: () => void;
  focusPremium?: boolean;
}

const AccountDashboard: React.FC<AccountDashboardProps> = ({
  user,
  plan,
  onPlanChange,
  onLogout,
  focusPremium,
}) => {
  const [data, setData] = useState<AccountDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUpgrade, setShowUpgrade] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const result = await getAccountDashboardData(plan);
        if (active) setData(result);
      } catch (error) {
        console.warn('[dashboard]', error);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [plan]);

  useEffect(() => {
    if (!focusPremium) return;

    setShowUpgrade(true);
    requestAnimationFrame(() => {
      document.getElementById('premium-plan')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [focusPremium]);

  const activatePremium = () => {
    void logActivity({
      userEmail: user.email,
      type: 'upgrade_click',
      metadata: { source: 'account_dashboard', from: plan },
    });

    setShowUpgrade(true);
  };

  const handlePaidPlan = (newPlan: Plan) => {
    onPlanChange?.(newPlan);
    setShowUpgrade(false);
    void getAccountDashboardData(newPlan).then(setData);
  };

  const quota = data?.quotas;
  const subscription = data?.subscription;
  const percent =
    quota && quota.tokensMax > 0
      ? Math.max(
          0,
          Math.min(100, (quota.tokensRemaining / quota.tokensMax) * 100),
        )
      : 0;

  return (
    <div className="min-h-full bg-white text-neutral-900">
      <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Mi cuenta</h1>
            <p className="mt-1 text-sm text-neutral-500">{user.email}</p>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-semibold hover:bg-neutral-50"
          >
            Cerrar sesión
          </button>
        </header>

        <PlanSelector
          currentPlan={plan}
          onPremiumClick={activatePremium}
        />

        {showUpgrade && plan === Plan.FREE && (
          <CambiarPlan
            user={user}
            onPlanChanged={handlePaidPlan}
          />
        )}

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-3xl border border-neutral-200 bg-white p-5">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Plan actual
            </span>
            <div className="mt-3 text-2xl font-bold">
              {subscription?.planName || (plan === Plan.FREE ? 'Free' : 'Premium')}
            </div>
            <p className="mt-1 text-sm text-neutral-500">
              {subscription?.currentPeriodEnd ||
                (plan === Plan.FREE ? 'Plan gratuito' : 'Acceso activo')}
            </p>
          </article>

          <article className="rounded-3xl border border-neutral-200 bg-white p-5">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Uso
            </span>

            {plan === Plan.FREE ? (
              <>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <strong className="text-2xl">
                    {(quota?.tokensRemaining ?? 3000).toLocaleString()}
                  </strong>
                  <span className="text-sm text-neutral-500">
                    de {(quota?.tokensMax ?? 3000).toLocaleString()} tokens
                  </span>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-blue-600"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-emerald-700">
                Premium activo. La cuota gratuita no aplica.
              </p>
            )}
          </article>
        </section>

        <section className="rounded-3xl border border-neutral-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Pagos</h2>

          {loading ? (
            <p className="mt-3 text-sm text-neutral-500">Cargando…</p>
          ) : (data?.payments.length ?? 0) === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">
              No hay pagos registrados.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-neutral-500">
                    <th className="py-2">Fecha</th>
                    <th className="py-2">Monto</th>
                    <th className="py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.payments.map((payment) => (
                    <tr key={payment.id} className="border-b border-neutral-100">
                      <td className="py-3">
                        {payment.date
                          ? new Date(payment.date).toLocaleDateString()
                          : '—'}
                      </td>
                      <td className="py-3">{payment.amount.toFixed(2)} USD</td>
                      <td className="py-3">{payment.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default AccountDashboard;
