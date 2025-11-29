import React from 'react';
import { Plan } from '../types';

interface PlanSelectorProps {
  currentPlan: Plan;
  onPlanChange: (plan: Plan) => void;
}

const PlanSelector: React.FC<PlanSelectorProps> = ({ currentPlan, onPlanChange }) => {
  const plans = [
    { id: Plan.PREMIUM, label: 'Premium', description: 'Guía completa y simulaciones' },
  ];

  return (
    <div className="bg-gray-100 dark:bg-gray-800 p-3 border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-3xl mx-auto">
        <label
          htmlFor="plan-selector"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
        >
          Plan de Suscripción:
        </label>
        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
          {plans.map((plan) => (
            <button
              key={plan.id}
              onClick={() => onPlanChange(plan.id)}
              className={`flex-1 text-left px-4 py-2 rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-blue-500 ${
                currentPlan === plan.id
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              <div className="font-semibold">{plan.label}</div>
              <div className="text-xs opacity-80">{plan.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PlanSelector;
