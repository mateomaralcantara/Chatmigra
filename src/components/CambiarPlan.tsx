import React, { useCallback, useState } from 'react';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import type { OnApproveData, OnApproveActions } from '@paypal/paypal-js';
import { User, Plan } from '../types';
import { supabase } from '../services/supabaseClient';
import { logActivity } from '../services/activityService';

const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID as string | undefined;

const PAYPAL_OPTIONS = {
  clientId: PAYPAL_CLIENT_ID ?? '',
  intent: 'capture' as const,
  currency: 'USD' as const,
};

const PREMIUM_PRICE = 19.95;
const PREMIUM_PRICE_STR = PREMIUM_PRICE.toFixed(2);

interface CambiarPlanProps {
  user: User;                     // usuario ya logueado
  onPlanChanged?: (plan: Plan) => void; // callback opcional al terminar
}

const CambiarPlan: React.FC<CambiarPlanProps> = ({ user, onPlanChanged }) => {
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const resetMessages = () => {
    setError('');
    setInfo('');
  };

  const onPaymentApproved = useCallback(
    async (_data: OnApproveData, actions: OnApproveActions): Promise<void> => {
      resetMessages();

      if (!actions.order) {
        setError('No se pudo inicializar el pago con PayPal.');
        return;
      }

      try {
        const details = await actions.order.capture();
        console.log('PayPal capture result (cambio de plan):', details);

        const transactionStatus = (details.status || '').toUpperCase();
        const amount =
          details.purchase_units?.[0]?.amount?.value ?? PREMIUM_PRICE_STR;

        if (transactionStatus !== 'COMPLETED') {
          setError('El pago no se completó correctamente. Intenta de nuevo.');
          return;
        }

        const orderId = details.id;
        const payerEmail =
          details.payer?.email_address || user.email;

        const { data: subscriptionRows, error: subError } = await supabase
          .from('subscriptions')
          .upsert(
            {
              user_email: user.email,
              provider: 'paypal_checkout',
              provider_subscription_id: orderId,
              plan: 'premium',
              status: 'active',
            },
            { onConflict: 'user_email' }
          )
          .select();

        if (subError) {
          console.error('Error guardando suscripción en Supabase:', subError);
          setError(`Error guardando suscripción: ${subError.message}`);
          return;
        }

        console.log('Suscripción actualizada correctamente:', subscriptionRows);

        const { data: paymentRows, error: payError } = await supabase
          .from('payments')
          .insert({
            user_email: user.email,
            provider: 'paypal_checkout',
            provider_subscription_id: orderId,
            amount: parseFloat(amount),
            currency: 'USD',
            status: 'paid',
          })
          .select();

        if (payError) {
          console.error('Error guardando pago en Supabase:', payError);
          setError(
            `Pago procesado, pero no se pudo registrar en BD: ${payError.message}`
          );
        } else {
          console.log('Pago guardado correctamente:', paymentRows);
        }

        await logActivity({
          userEmail: user.email,
          type: 'upgrade_success',
          metadata: {
            plan: 'premium',
            provider: 'paypal_checkout',
            orderId,
            amount,
          },
        });

        setInfo('¡Pago completado y plan PREMIUM activado!');
        alert('¡Pago completado y plan PREMIUM activado!');

        if (onPlanChanged) {
          onPlanChanged(Plan.PREMIUM);
        }
      } catch (err) {
        console.error('Error en captura de PayPal (cambio de plan):', err);
        setError('Ocurrió un problema al procesar el pago. Intenta de nuevo.');
      }
    },
    [user, onPlanChanged]
  );

  if (!PAYPAL_CLIENT_ID) {
    return (
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-red-500/40 text-sm text-red-200">
        Error de configuración: falta <code>VITE_PAYPAL_CLIENT_ID</code> en tu{' '}
        <code>.env</code>
      </div>
    );
  }

  return (
    <PayPalScriptProvider options={PAYPAL_OPTIONS}>
      <div className="w-full max-w-xl mx-auto rounded-3xl border border-slate-800/60 bg-slate-900/80 p-6 shadow-2xl">
        <h2 className="text-xl font-semibold text-slate-100 mb-2 text-center">
          Cambiar a plan PREMIUM
        </h2>
        <p className="text-sm text-slate-400 mb-4 text-center">
          Un solo pago de{' '}
          <span className="font-semibold text-slate-100">
            {PREMIUM_PRICE_STR} USD
          </span>
          . Sin suscripciones mensuales.
        </p>

        {error && (
          <p className="mb-2 text-xs text-red-400 text-center">{error}</p>
        )}
        {info && (
          <p className="mb-2 text-xs text-emerald-400 text-center">{info}</p>
        )}

        <div className="flex justify-center">
          <div className="w-full max-w-xs sm:max-w-sm">
            <PayPalButtons
              style={{ layout: 'vertical', label: 'pay' }}
              createOrder={(_, actions) => {
                if (!actions.order) {
                  setError('No se pudo iniciar el pago con PayPal.');
                  return Promise.reject(
                    new Error('PayPal order action not available')
                  );
                }
                return actions.order.create({
                  intent: 'CAPTURE',
                  purchase_units: [
                    {
                      amount: {
                        value: PREMIUM_PRICE_STR,
                        currency_code: 'USD',
                      },
                      description: 'ChatMig Premium (pago único)',
                    },
                  ],
                });
              }}
              onApprove={onPaymentApproved}
              onError={err => {
                console.error(
                  'PayPal Payment Error (cambio de plan):',
                  err
                );
                setError(
                  'Falló el pago con PayPal. Revisa tu cuenta o intenta con otro método.'
                );
              }}
            />
          </div>
        </div>

        <p className="mt-4 text-[11px] text-slate-500 text-center">
          Tus datos de pago se procesan directamente en PayPal. Nosotros solo
          recibimos la confirmación del pago para activar tu acceso Premium.
        </p>
      </div>
    </PayPalScriptProvider>
  );
};

export default CambiarPlan;
