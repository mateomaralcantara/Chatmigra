// src/components/UpgradeTeaser.tsx
import React from 'react';
import { Plan } from '../types';

interface UpgradeTeaserProps {
  currentPlan: Plan;
  onUpgradeClick: () => void;
}

const UpgradeTeaser: React.FC<UpgradeTeaserProps> = ({
  currentPlan,
  onUpgradeClick,
}) => {
  // Si no es free, no mostramos nada (doble seguridad)
  if (currentPlan !== 'free') return null;

  return (
    <div className="mt-2 text-xs bg-amber-50 border border-amber-300 text-amber-950 rounded-xl px-3 py-2 flex items-center justify-between gap-3">
      <p className="flex-1">
        Estás usando el plan{' '}
        <span className="font-semibold uppercase">Free</span>.  
        Sube al plan PRO para respuestas más largas, más rápidas y con más uso diario.
      </p>
      <button
        type="button"
        onClick={onUpgradeClick}
        className="shrink-0 inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-400 text-amber-950 hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 transition"
      >
        Mejorar plan
      </button>
    </div>
  );
};

export default UpgradeTeaser;
