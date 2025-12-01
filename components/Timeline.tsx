// components/Timeline.tsx
import React from 'react';
import { TimelineData } from '../types';

interface TimelineProps {
  data: TimelineData;
}

const Timeline: React.FC<TimelineProps> = ({ data }) => {
  // 🔧 Permitimos que venga data.items o data.steps, y evitamos el error de TS con `as any`
  const anyData = data as any;
  const rawItems = anyData.items ?? anyData.steps ?? [];
  const items = Array.isArray(rawItems) ? rawItems : [];

  if (!items.length) {
    return (
      <div className="my-3 text-xs text-gray-500 italic bg-gray-50 dark:bg-gray-800/60 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 not-prose">
        (Línea de tiempo vacía o sin elementos válidos)
      </div>
    );
  }

  return (
    <div className="my-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-4 not-prose">
      {data?.title && (
        <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100">
          {data.title}
        </h3>
      )}

      <ol className="relative border-l border-gray-300 dark:border-gray-600 pl-4 space-y-3">
        {items.map((item: any, index: number) => (
          <li key={index} className="ml-1">
            <div className="absolute -left-[7px] mt-1 w-3 h-3 rounded-full bg-blue-500 border border-white dark:border-gray-900" />
            <div className="ml-2">
              <div className="flex flex-wrap items-baseline gap-2">
                {item.date && (
                  <span className="text-xs font-mono text-blue-600 dark:text-blue-300">
                    {item.date}
                  </span>
                )}
                {item.title && (
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {item.title}
                  </span>
                )}
              </div>
              {item.description && (
                <p className="mt-1 text-xs text-gray-700 dark:text-gray-300">
                  {item.description}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
};

export default Timeline;
