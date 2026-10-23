import React from 'react';
import { Plan } from '../types';

interface PlanSelectorProps {
  currentPlan: Plan;
  onPremiumClick?: () => void;
}

const PlanSelector: React.FC<PlanSelectorProps> = ({
  currentPlan,
  onPremiumClick,
}) => {
  const premium = currentPlan === Plan.PREMIUM || currentPlan === Plan.PRO;

  return (
    <section id="premium-plan" className="rounded-3xl border border-neutral-800 bg-neutral-950 p-5 text-white">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <span className="text-xs font-bold uppercase tracking-[.18em] text-blue-300">
            ChatMi Premium
          </span>
          <h2 className="mt-2 text-2xl font-bold">
            {premium ? 'Premium está activo' : 'Desbloquea ChatMi completo'}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-300">
            Conversación por voz, respuestas más amplias y uso sin la cuota gratuita de 3,000 tokens.
          </p>
        </div>

        <div className="min-w-[220px] rounded-2xl border border-neutral-700 bg-neutral-900 p-4">
          <div className="text-3xl font-extrabold">$19.95</div>
          <div className="text-xs text-neutral-400">USD · pago único</div>

          {premium ? (
            <div className="mt-4 rounded-xl bg-emerald-950 px-3 py-2 text-sm text-emerald-300">
              Acceso Premium activo
            </div>
          ) : (
            <button
              type="button"
              onClick={onPremiumClick}
              className="mt-4 w-full rounded-xl bg-white px-4 py-2.5 font-semibold text-black"
            >
              Activar Premium
            </button>
          )}
        </div>
      </div>
    </section>
  );
};

export default PlanSelector;
