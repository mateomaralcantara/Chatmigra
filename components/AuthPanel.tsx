import React, { useState, useMemo, useCallback } from 'react';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import type { OnApproveData, OnApproveActions } from '@paypal/paypal-js';
import { User, Plan } from '../types';
import { supabase } from '../services/supabaseClient';

const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID as string | undefined;

type TierKey = Plan.PREMIUM;

interface TierConfig {
  key: TierKey;
  title: string;
  price: string;
  features: string[];
}

const TIERS: TierConfig[] = [
  {
    key: Plan.PREMIUM as TierKey,
    title: 'Premium',
    price: '1.00',
    features: [
      'Guía migratoria completa',
      'Respuestas avanzadas',
      'Simulaciones de entrevista',
    ],
  },
];

interface AuthPanelProps {
  onLoginSuccess: (user: User, plan: Plan) => void;
}

const FormInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className,
  ...props
}) => (
  <input
    {...props}
    className={
      [
        'w-full px-3 py-2 rounded-md border border-slate-700 bg-slate-900/70',
        'text-slate-100 text-sm shadow-sm',
        'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500',
        'placeholder:text-slate-500',
        className,
      ]
        .filter(Boolean)
        .join(' ')
    }
  />
);

const AuthPanel: React.FC<AuthPanelProps> = ({ onLoginSuccess }) => {
  type AuthStep = 'access' | 'plans';

  const [step, setStep] = useState<AuthStep>('access');
  const [isLoginView, setIsLoginView] = useState(true);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [info, setInfo]       = useState('');

  const [selectedTier, setSelectedTier] = useState<TierKey | null>(null);
  const [currentUser, setCurrentUser]   = useState<User | null>(null);

  const paypalOptions = useMemo(
    () => ({
      clientId: PAYPAL_CLIENT_ID || '',
      intent: 'capture' as const,
      currency: 'USD',
    }),
    [PAYPAL_CLIENT_ID]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError('');
      setInfo('');

      if (!email || !password || (!isLoginView && (!firstName || !lastName))) {
        setError('Por favor, completa todos los campos.');
        return;
      }

      try {
        setLoading(true);

        if (isLoginView) {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (error) {
            setError(error.message);
            return;
          }

          const meta = data.user?.user_metadata as
            | { first_name?: string; last_name?: string }
            | undefined;

          const user: User = {
            email: data.user?.email || email,
            firstName: meta?.first_name || firstName || 'Usuario',
            lastName: meta?.last_name || lastName || 'Premium',
          };

          setCurrentUser(user);
          setStep('plans');
        } else {
          const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                first_name: firstName,
                last_name: lastName,
              },
              emailRedirectTo: window.location.origin,
            },
          });

          if (error) {
            setError(error.message);
            return;
          }

          setInfo(
            'Te enviamos un correo para confirmar tu cuenta. Luego podrás activar tu plan Premium.'
          );

          const user: User = { email, firstName, lastName };
          setCurrentUser(user);
          setStep('plans');
        }
      } catch (err) {
        console.error('Supabase auth error:', err);
        setError('Ocurrió un error al procesar tu solicitud. Intenta de nuevo.');
      } finally {
        setLoading(false);
      }
    },
    [email, password, firstName, lastName, isLoginView]
  );

  const onPaymentApproved = useCallback(
    async (_data: OnApproveData, actions: OnApproveActions): Promise<void> => {
      if (!currentUser || !selectedTier) return;
      if (!actions.order) {
        setError('No se pudo inicializar el pago con PayPal.');
        return;
      }

      try {
        const details = await actions.order.capture();
        console.log('PayPal capture result:', details);

        const transactionStatus = (details.status || '').toUpperCase();
        const amount = details.purchase_units?.[0]?.amount?.value ?? '1.00';

        if (transactionStatus !== 'COMPLETED') {
          setError('El pago no se completó correctamente. Intenta de nuevo.');
          return;
        }

        const orderId    = details.id;
        const payerEmail = details.payer?.email_address || currentUser.email;

        const { error: subError } = await supabase.from('subscriptions').insert({
          user_email: currentUser.email,
          provider: 'paypal_checkout',
          provider_subscription_id: orderId,
          plan: 'premium',
          status: 'active',
        });

        if (subError) {
          console.error('Error guardando suscripción en Supabase:', subError);
        }

        const { error: payError } = await supabase.from('payments').insert({
          user_email: currentUser.email,
          provider: 'paypal_checkout',
          provider_subscription_id: orderId,
          amount: parseFloat(amount),
          currency: 'USD',
          status: 'paid',
        });

        if (payError) {
          console.error('Error guardando pago en Supabase:', payError);
        }

        alert('¡Pago completado y plan PREMIUM activado!');

        onLoginSuccess(
          {
            ...currentUser,
            email: payerEmail,
          },
          selectedTier
        );
      } catch (err) {
        console.error('Error en captura de PayPal:', err);
        setError('Ocurrió un problema al procesar el pago. Intenta de nuevo.');
      }
    },
    [currentUser, selectedTier, onLoginSuccess]
  );

  if (!PAYPAL_CLIENT_ID) {
    return (
      <div className="app-shell flex items-center justify-center">
        <div className="glass-panel px-6 py-4 text-sm text-red-300 border border-red-500/40">
          Error de configuración: falta <code>VITE_PAYPAL_CLIENT_ID</code> en tu <code>.env</code>
        </div>
      </div>
    );
  }

  return (
    <PayPalScriptProvider options={paypalOptions}>
      <div className="app-shell flex items-center justify-center p-4">
        <div className="glass-panel max-w-md w-full mx-auto p-6 sm:p-8">
          {/* Logo / título */}
          <div className="flex items-center justify-center space-x-3 mb-6">
            <div className="h-10 w-10 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold">
              C
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold">ChatMig AI</h1>
          </div>

          {/* STEP 1: Login / Registro */}
          {step === 'access' && (
            <div>
              <h2 className="text-xl sm:text-2xl font-semibold text-center mb-2">
                {isLoginView ? 'Bienvenido de Nuevo' : 'Crea tu Cuenta'}
              </h2>
              <p className="text-center text-sm text-slate-400 mb-6">
                {isLoginView
                  ? 'Inicia sesión para continuar.'
                  : 'Para acceder al plan Premium de ChatMig.'}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {!isLoginView && (
                  <div className="grid grid-cols-2 gap-4">
                    <FormInput
                      placeholder="Nombre"
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      required
                    />
                    <FormInput
                      placeholder="Apellido"
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      required
                    />
                  </div>
                )}

                <FormInput
                  type="email"
                  placeholder="Correo Electrónico"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />

                <FormInput
                  type="password"
                  placeholder="Contraseña"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />

                {error && (
                  <p className="text-xs text-red-400 text-center">{error}</p>
                )}
                {info && !error && (
                  <p className="text-xs text-emerald-400 text-center">{info}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full mt-2"
                >
                  {loading
                    ? 'Cargando...'
                    : isLoginView
                    ? 'Iniciar Sesión'
                    : 'Crear Cuenta'}
                </button>
              </form>

              <p className="text-center text-xs sm:text-sm text-slate-400 mt-6">
                {isLoginView ? '¿No tienes cuenta?' : '¿Ya tienes una cuenta?'}
                <button
                  type="button"
                  onClick={() => {
                    setIsLoginView(!isLoginView);
                    setError('');
                    setInfo('');
                  }}
                  className="ml-1 font-medium text-brand-400 hover:underline"
                >
                  {isLoginView ? 'Regístrate' : 'Inicia Sesión'}
                </button>
              </p>
            </div>
          )}

          {/* STEP 2: Plan + Pago */}
          {step === 'plans' && currentUser && (
            <div>
              <h2 className="text-xl sm:text-2xl font-semibold text-center mb-2">
                Activa tu plan Premium
              </h2>
              <p className="text-center text-sm text-slate-400 mb-6">
                Pago único de <span className="font-semibold text-slate-100">1.00 USD</span> para
                desbloquear ChatMig Premium.
              </p>

              <div className="space-y-3">
                {TIERS.map(tier => {
                  const isActive = selectedTier === tier.key;
                  return (
                    <button
                      key={tier.key}
                      type="button"
                      onClick={() => {
                        setSelectedTier(tier.key);
                        setError('');
                      }}
                      className={[
                        'w-full text-left p-4 rounded-xl border transition-all',
                        'bg-slate-900/60 hover:bg-slate-900',
                        isActive
                          ? 'border-brand-500 ring-2 ring-brand-500/60'
                          : 'border-slate-700 hover:border-slate-500',
                      ].join(' ')}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-slate-50 text-lg">
                          {tier.title}
                        </span>
                        <span className="font-semibold text-slate-50">
                          ${tier.price}{' '}
                          <span className="font-normal text-xs text-slate-400">
                            (pago único)
                          </span>
                        </span>
                      </div>
                      <ul className="mt-2 space-y-1 text-xs text-slate-300 list-disc list-inside">
                        {tier.features.map(f => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    </button>
                  );
                })}
              </div>

              {error && (
                <p className="text-xs text-red-400 text-center mt-4">{error}</p>
              )}

              {selectedTier && (
                <div className="mt-6">
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
                              value: '1.00',
                              currency_code: 'USD',
                            },
                            description: 'ChatMig Premium (pago único)',
                          },
                        ],
                      });
                    }}
                    onApprove={onPaymentApproved}
                    onError={err => {
                      console.error('PayPal Payment Error:', err);
                      setError(
                        'Falló el pago con PayPal. Revisa tu cuenta o intenta con otro método.'
                      );
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PayPalScriptProvider>
  );
};

export default AuthPanel;
