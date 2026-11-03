import type { AdminOverview } from './adminTypes';

export default function AdminMetrics({ overview }: { overview: AdminOverview | null }) {
  return (
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
  );
}
