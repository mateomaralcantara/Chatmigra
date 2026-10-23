import React, { useCallback, useState } from 'react';
import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js';
import type { OnApproveData } from '@paypal/paypal-js';
import { supabase } from '../services/supabaseClient';
import { Plan, type User } from '../types';

const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID as
  | string
  | undefined;

interface CambiarPlanProps {
  user: User;
  onPlanChanged?: (plan: Plan) => void;
}

async function authorizedFetch(
  input: string,
  init: RequestInit,
): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
  }

  return fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...(init.headers || {}),
    },
  });
}

const CambiarPlan: React.FC<CambiarPlanProps> = ({
  user,
  onPlanChanged,
}) => {
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const createOrder = useCallback(async (): Promise<string> => {
    setError('');
    setInfo('');

    const response = await authorizedFetch('/api/paypal/create-order', {
      method: 'POST',
      body: '{}',
    });

    const data = (await response.json().catch(() => ({}))) as {
      id?: string;
      error?: string;
    };

    if (!response.ok || !data.id) {
      throw new Error(
        data.error || 'No se pudo crear la orden de PayPal.',
      );
    }

    return data.id;
  }, []);

  const onApprove = useCallback(
    async (data: OnApproveData): Promise<void> => {
      setError('');
      setInfo('');

      try {
        const response = await authorizedFetch('/api/paypal/capture-order', {
          method: 'POST',
          body: JSON.stringify({
            orderId: data.orderID,
          }),
        });

        const result = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          plan?: string;
          error?: string;
        };

        if (!response.ok || !result.ok || result.plan !== 'premium') {
          throw new Error(
            result.error || 'No se pudo verificar el pago Premium.',
          );
        }

        setInfo(`Pago verificado. Premium quedó activo para ${user.email}.`);
        onPlanChanged?.(Plan.PREMIUM);
      } catch (caught) {
        console.error('[PayPal]', caught);
        setError(
          caught instanceof Error
            ? caught.message
            : 'No se pudo completar el pago.',
        );
      }
    },
    [onPlanChanged, user.email],
  );

  if (!PAYPAL_CLIENT_ID) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        PayPal no está configurado en este entorno. El chat y el plan FREE siguen disponibles.
      </div>
    );
  }

  return (
    <PayPalScriptProvider
      options={{
        clientId: PAYPAL_CLIENT_ID,
        currency: 'USD',
        intent: 'capture',
      }}
    >
      <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-5">
        <h3 className="text-lg font-semibold text-white">Pago Premium seguro</h3>
        <p className="mt-1 text-sm text-neutral-400">
          La orden se crea y se verifica en el servidor. El navegador no puede activarse Premium por sí solo.
        </p>

        {error && (
          <p className="mt-3 rounded-xl bg-red-950 p-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {info && (
          <p className="mt-3 rounded-xl bg-emerald-950 p-3 text-sm text-emerald-300">
            {info}
          </p>
        )}

        <div className="mt-4">
          <PayPalButtons
            style={{ layout: 'vertical', label: 'pay' }}
            createOrder={createOrder}
            onApprove={onApprove}
            onError={(paypalError) => {
              console.error('[PayPal SDK]', paypalError);
              setError('PayPal no pudo procesar la operación.');
            }}
          />
        </div>
      </div>
    </PayPalScriptProvider>
  );
};

export default CambiarPlan;
