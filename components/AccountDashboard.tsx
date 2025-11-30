import React, { useState, useEffect } from 'react';
import { User, Plan, AccountDashboardData } from '../types';
import { getAccountDashboardData } from '../services/accountDashboardService';

interface AccountDashboardProps {
  user: User;
  plan: Plan;
}

const LoadingSkeleton: React.FC = () => (
  <div className="grid md:grid-cols-2 gap-6 animate-pulse">
    <div className="bg-neutral-900 rounded-lg h-48"></div>
    <div className="bg-neutral-900 rounded-lg h-48"></div>
    <div className="md:col-span-2 bg-neutral-900 rounded-lg h-64"></div>
  </div>
);

const ProgressBar: React.FC<{ value: number; max: number; label: string }> = ({
  value,
  max,
  label,
}) => {
  const percentage = max > 0 ? (value / max) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between items-end mb-1">
        <span className="text-sm font-medium text-gray-200">{label}</span>
        <span className="text-xs font-mono text-gray-400">
          {value.toLocaleString()} / {max.toLocaleString()}
        </span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-2.5">
        <div
          className="bg-blue-600 h-2.5 rounded-full"
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
};

const AccountDashboard: React.FC<AccountDashboardProps> = ({ user, plan }) => {
  const [data, setData] = useState<AccountDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const dashboardData = await getAccountDashboardData();
        setData(dashboardData);
      } catch (e) {
        setError('No se pudo cargar la información de la cuenta.');
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleManageSubscription = () => {
    alert('Redirigiendo al portal de facturación...');
  };

  return (
    <div className="flex-grow overflow-y-auto bg-black text-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Mi Cuenta</h1>
        <p className="text-md text-gray-400 mb-8">
          Administra tu suscripción y consulta tu uso.
        </p>

        {isLoading && <LoadingSkeleton />}

        {error && (
          <div className="text-center text-red-400 bg-red-900/40 p-4 rounded-lg">
            {error}
          </div>
        )}

        {data && !isLoading && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Subscription Card */}
            <div className="bg-neutral-900 p-6 rounded-lg shadow-md border border-gray-800">
              <h2 className="text-xl font-semibold mb-4">Suscripción Actual</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Plan:</span>
                  <span className="font-medium text-blue-400 uppercase">
                    {data.subscription.planName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Estado:</span>
                  <span className="font-medium text-green-400 capitalize">
                    {data.subscription.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Próxima Factura:</span>
                  <span className="font-medium">
                    {data.subscription.currentPeriodEnd}
                  </span>
                </div>
              </div>
              <button
                onClick={handleManageSubscription}
                className="w-full mt-6 bg-blue-600 text-white font-bold py-2 px-4 rounded-md hover:bg-blue-500 transition-colors"
              >
                Gestionar Suscripción
              </button>
            </div>

            {/* Usage Quotas Card */}
            <div className="bg-neutral-900 p-6 rounded-lg shadow-md border border-gray-800">
              <h2 className="text-xl font-semibold mb-4">Uso Restante</h2>
              <div className="space-y-5">
                <ProgressBar
                  value={data.quotas.messagesRemaining}
                  max={data.quotas.messagesMax}
                  label="Mensajes"
                />
                <ProgressBar
                  value={data.quotas.tokensRemaining}
                  max={data.quotas.tokensMax}
                  label="Tokens"
                />
              </div>
            </div>

            {/* Payment History Card */}
            <div className="md:col-span-2 bg-neutral-900 p-6 rounded-lg shadow-md border border-gray-800">
              <h2 className="text-xl font-semibold mb-4">Historial de Pagos</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-300">
                  <thead className="text-xs text-gray-400 uppercase bg-black">
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
                        ID Transacción
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map(payment => (
                      <tr
                        key={payment.id}
                        className="border-b border-gray-800 bg-black/40"
                      >
                        <td className="px-6 py-4">{payment.date}</td>
                        <td className="px-6 py-4">{payment.amount}</td>
                        <td className="px-6 py-4">
                          <span className="text-green-400">
                            {payment.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs">
                          {payment.id}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountDashboard;
