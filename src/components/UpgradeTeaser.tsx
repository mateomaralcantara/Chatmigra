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
    <div className="mt-2 text-xs bg-amber-500/10 border border-amber-500/40 text-amber-100 rounded-xl px-3 py-2 flex items-center justify-between gap-3">
      <p className="flex-1">
        Estás usando el plan{' '}
        <span className="font-semibold uppercase">Free</span>.  
        Sube al plan PRO para respuestas más largas, más rápidas y con más uso diario.
      </p>
      <button
        type="button"
        onClick={onUpgradeClick}
        className="shrink-0 inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-400 text-black hover:bg-amber-300 transition"
      >
        Mejorar plan
      </button>
    </div>
  );
};

export default UpgradeTeaser;
