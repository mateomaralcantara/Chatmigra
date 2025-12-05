import React from 'react';
import { Plan } from '../types';

interface PlanSelectorProps {
  currentPlan: Plan;
  onPlanChange: (plan: Plan) => void;
  onPremiumClick?: () => void; // callback que decide el padre
}

const ORIGINAL_PRICE = 49.99;
const DISCOUNT_PRICE = 19.95;

const PlanSelector: React.FC<PlanSelectorProps> = ({
  currentPlan,
  onPlanChange,
  onPremiumClick,
}) => {
  const isPremiumSelected = currentPlan === Plan.PREMIUM;

  const discountPercent = Math.round(
    ((ORIGINAL_PRICE - DISCOUNT_PRICE) / ORIGINAL_PRICE) * 100
  );

  const handlePremiumClick = () => {
    try {
      onPlanChange(Plan.PREMIUM);
    } catch (e) {
      console.error('Error cambiando a plan PREMIUM:', e);
    }

    // 👉 aquí ya NO abrimos PayPal
    if (onPremiumClick) {
      onPremiumClick();
    }
  };

  return (
    <div className="w-full px-2 sm:px-4 py-4 sm:py-6">
      <div className="max-w-5xl mx-auto grid gap-4 sm:gap-6 md:grid-cols-1">
        {/* Plan PREMIUM navideño */}
        <button
          id="premium-plan"
          type="button"
          onClick={handlePremiumClick}
          className="relative overflow-hidden rounded-3xl border border-red-500/70 bg-gradient-to-br from-red-950 via-slate-950 to-emerald-900 shadow-[0_0_70px_rgba(248,113,113,0.35)] text-left"
        >
          {/* Glow navideño */}
          <div className="pointer-events-none absolute inset-0 opacity-40">
            <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-red-500/40 blur-3xl" />
            <div className="absolute -bottom-16 -right-0 w-52 h-52 rounded-full bg-emerald-400/40 blur-3xl" />
          </div>

          <div className="relative px-5 sm:px-6 pt-4 sm:pt-5 pb-5 sm:pb-6 space-y-4">
            {/* Cinta superior */}
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-600/90 text-xs font-semibold text-white shadow-lg">
                <span>🎄 OFERTA NAVIDEÑA</span>
                <span className="px-2 py-0.5 rounded-full bg-black/40 text-[10px] tracking-wide">
                  -{discountPercent}% OFF
                </span>
              </div>
              <div className="hidden sm:flex items-center gap-1 text-[11px] text-emerald-100/80">
                <span>⚡ Acceso completo al asistente migratorio</span>
              </div>
            </div>

            <div className="flex flex-col gap-4 md:flex-row md:items-start">
              {/* Info izquierda */}
              <div className="flex-1 space-y-2">
                <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                  <span>ChatMig Premium</span>
                  <span>✨</span>
                </h2>
                <p className="text-xs sm:text-[13px] text-slate-100/90 leading-relaxed">
                  Acceso ilimitado a guías migratorias, simulaciones de
                  entrevistas, plantillas profesionales y soporte inteligente
                  24/7 adaptado a tu caso.
                </p>

                <ul className="mt-2 space-y-1.5 text-[12px] text-slate-100/90">
                  <li className="flex items-start gap-2">
                    <span>✅</span>
                    <span>
                      Respuestas adaptadas a tu país y tipo de visa.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>✅</span>
                    <span>
                      Historial de conversaciones y seguimiento de tu proceso.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>✅</span>
                    <span>Checklists, timelines y plantillas descargables.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>✅</span>
                    <span>
                      Actualizaciones constantes según cambios migratorios.
                    </span>
                  </li>
                </ul>
              </div>

              {/* Caja de precio */}
              <div
                className={[
                  'w-full md:w-64 shrink-0 rounded-2xl border-2 bg-black/50 backdrop-blur px-4 py-4',
                  'shadow-[0_20px_40px_rgba(0,0,0,0.6)] transition-all duration-300',
                  isPremiumSelected
                    ? 'border-amber-400/90 ring-2 ring-amber-300/70 scale-[1.03]'
                    : 'border-white/20 hover:border-amber-300/80 hover:scale-[1.01]',
                ].join(' ')}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
                    🎁 Plan Premium
                  </span>
                  <span className="rounded-full bg-amber-400 text-[10px] font-bold px-2 py-0.5 text-black">
                    -{discountPercent}%
                  </span>
                </div>

                <div className="space-y-1 mb-3">
                  <div className="flex items-center gap-2 text-[11px] text-slate-300/80">
                    <span className="line-through opacity-70">
                      Antes: ${ORIGINAL_PRICE.toFixed(2)} USD
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-red-700/80 text-[10px] text-white">
                      OFERTA LIMITADA
                    </span>
                  </div>
                  <div className="flex items-end gap-1">
                    <span className="text-2xl sm:text-3xl font-extrabold text-amber-300 drop-shadow-[0_0_25px_rgba(250,250,210,0.7)]">
                      ${DISCOUNT_PRICE.toFixed(2)}
                    </span>
                    <span className="text-[11px] sm:text-xs text-slate-100/90 mb-1">
                      USD / pago único
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-emerald-100/90 mb-3">
                  Sin pagos recurrentes: un solo pago y acceso completo.
                </p>

                {isPremiumSelected ? (
                  <p className="text-[11px] text-amber-200 mb-2">
                    Seleccionado: completa el pago con PayPal en el siguiente
                    paso.
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-200 mb-2">
                    Haz clic para activar este plan y pagar con PayPal.
                  </p>
                )}
              </div>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
};

export default PlanSelector;
