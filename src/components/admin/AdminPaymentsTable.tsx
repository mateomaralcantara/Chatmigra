import type { PaymentRow } from './adminTypes';

export default function AdminPaymentsTable({ payments }: { payments: PaymentRow[] }) {
  return (
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
  );
}
