import React from 'react';
import { ChecklistData } from '../types';

interface ChecklistProps {
  data: ChecklistData;
}

type Status = 'Completado' | 'En Progreso' | 'Pendiente' | string;

const statusConfig: Record<
  'completado' | 'en_progreso' | 'pendiente',
  { title: string; className: string; icon: React.ReactNode }
> = {
  completado: {
    title: 'Completado',
    className: 'text-green-600 dark:text-green-400',
    icon: (
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    ),
  },
  en_progreso: {
    title: 'En Progreso',
    className: 'text-yellow-600 dark:text-yellow-400',
    icon: (
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
        clipRule="evenodd"
      />
    ),
  },
  pendiente: {
    title: 'Pendiente',
    className: 'text-gray-500 dark:text-gray-400',
    icon: (
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z"
        clipRule="evenodd"
      />
    ),
  },
};

const normalizeStatusKey = (status: Status) => {
  const s = status.toLowerCase();
  if (s.startsWith('comp')) return 'completado' as const;
  if (s.startsWith('en pro')) return 'en_progreso' as const;
  return 'pendiente' as const;
};

const StatusIcon: React.FC<{ status: Status }> = ({ status }) => {
  const key = normalizeStatusKey(status);
  const cfg = statusConfig[key];

  return (
    <span
      title={cfg.title}
      className={`flex items-center space-x-1 ${cfg.className}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-4 w-4"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        {cfg.icon}
      </svg>
      <span>{status}</span>
    </span>
  );
};

const Checklist: React.FC<ChecklistProps> = ({ data }) => (
  <div className="my-3 bg-gray-50 dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 not-prose">
    <h3 className="text-md font-semibold p-3 bg-gray-100 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-600">
      {data.title}
    </h3>

    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-100 dark:bg-gray-700/50 text-xs uppercase text-gray-700 dark:text-gray-300">
          <tr>
            <th className="px-4 py-2 w-2/5">Tarea</th>
            <th className="px-4 py-2 w-1/5">Estado</th>
            <th className="px-4 py-2 w-2/5">Notas</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, index) => (
            <tr
              key={index}
              className="border-t border-gray-200 dark:border-gray-600"
            >
              <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">
                {item.task}
              </td>
              <td className="px-4 py-2">
                <StatusIcon status={item.status} />
              </td>
              <td className="px-4 py-2 text-gray-600 dark:text-gray-300">
                {item.notes || '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export default Checklist;
