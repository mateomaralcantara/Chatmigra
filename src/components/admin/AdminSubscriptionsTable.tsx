import type { SubscriptionRow } from './adminTypes';

type Props = {
  subscriptions: SubscriptionRow[];
  updatingId: string | null;
  handleUpdateSubscriptionStatus: (id: string, status: string) => void | Promise<void>;
};

export default function AdminSubscriptionsTable({ subscriptions, updatingId, handleUpdateSubscriptionStatus }: Props) {
  return (
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
  );
}
