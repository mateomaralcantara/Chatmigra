// components/Timeline.tsx
import React from 'react';
import { TimelineData } from '../types';

// The model sometimes returns items/steps instead of events; all are optional.
interface TimelineItem {
  status?: string;
  date?: string;
  title?: string;
  description?: string;
}

interface TimelineProps {
  data: TimelineData;
}

const StatusDot: React.FC<{ status?: string }> = ({ status }) => {
  let bgColor = 'bg-gray-400';
  let ringColor = 'ring-gray-300 dark:ring-gray-500';

  switch (status) {
    case 'Completado':
      bgColor = 'bg-green-500';
      ringColor = 'ring-green-300 dark:ring-green-600';
      break;
    case 'Actual':
      bgColor = 'bg-blue-500 animate-pulse';
      ringColor = 'ring-blue-300 dark:ring-blue-600';
      break;
    case 'Próximo':
      bgColor = 'bg-gray-300 dark:bg-gray-600';
      ringColor = 'ring-gray-200 dark:ring-gray-700';
      break;
  }

  return (
    <div
      className={`absolute -left-2.5 mt-1.5 h-5 w-5 rounded-full border-4 border-white dark:border-gray-700 ${bgColor} ring-4 ${ringColor}`}
    />
  );
};

const Timeline: React.FC<TimelineProps> = ({ data }) => {
  // Permitimos data.items, data.steps o data.events
  const loose = data as TimelineData & { items?: unknown; steps?: unknown };
  const rawItems = loose.items ?? loose.steps ?? loose.events ?? [];
  const items: TimelineItem[] = Array.isArray(rawItems) ? rawItems : [];

  if (!items.length) {
    return (
      <div className="my-3 text-xs text-gray-500 italic bg-gray-50 dark:bg-gray-800/60 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 not-prose">
        (Línea de tiempo vacía o sin elementos válidos)
      </div>
    );
  }

  return (
    <div className="my-3 not-prose text-gray-800 dark:text-gray-200">
      {data?.title && (
        <h3 className="text-md font-semibold mb-4 text-gray-900 dark:text-white">
          {data.title}
        </h3>
      )}

      <div className="relative border-l-2 border-gray-200 dark:border-gray-600 ml-2">
        {items.map((item, index) => (
          <div key={index} className="mb-8 ml-8 relative">
            {item.status && <StatusDot status={item.status} />}
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 shadow-sm">
              {item.date && (
                <time className="block mb-1 text-xs font-normal leading-none text-gray-500 dark:text-gray-400">
                  {item.date}
                </time>
              )}
              {item.title && (
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {item.title}
                </p>
              )}
              {item.description && (
                <p className="mt-1 text-xs text-gray-700 dark:text-gray-300">
                  {item.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Timeline;
