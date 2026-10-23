import React, { useState, useCallback } from 'react';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import type { OnApproveData, OnApproveActions } from '@paypal/paypal-js';
import { User, Plan } from '../types';
import { supabase } from '../services/supabaseClient';
import PlanSelector from './PlanSelector';
import { logActivity } from '../services/activityService';

const PAYPAL_CLIENT_ID = import.meta.env
  .VITE_PAYPAL_CLIENT_ID as string | undefined;

const PAYPAL_OPTIONS = {
  clientId: PAYPAL_CLIENT_ID ?? '',
  intent: 'capture' as const,
  currency: 'USD' as const,
};

const PREMIUM_PRICE = 19.95;
const PREMIUM_PRICE_STR = PREMIUM_PRICE.toFixed(2);

type AuthStep = 'access' | 'plans';

interface AuthPanelProps {
  onLoginSuccess: (user: User, plan: Plan) => void;
}

const FormInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className,
  ...props
}) => (
  <input
    {...props}
    className={[
      'w-full px-3 py-2 rounded-md border border-slate-700 bg-slate-900/70',
      'text-slate-100 text-sm shadow-sm',
      'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500',
      'placeholder:text-slate-500',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
  />
);

const AuthPanel: React.FC<AuthPanelProps> = ({ onLoginSuccess }) => {
  const [step, setStep] = useState<AuthStep>('access');
  const [isLoginView, setIsLoginView] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const [selectedPlan, setSelectedPlan] = useState<Plan>(Plan.PREMIUM);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const resetMessages = () => {
    setError('');
    setInfo('');
  };

  // 🔧 Optimizado: enviamos la API key explícitamente a Supabase REST
  const saveMarketingContact = useCallback(
    async (user: { email: string; firstName?: string; lastName?: string }) => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
          console.error(
            '[marketing_contacts] Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY'
          );
          return;
        }

        const url = `${supabaseUrl}/rest/v1/marketing_contacts?on_conflict=email`;

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify({
            email: user.email,
            first_name: user.firstName ?? null,
            last_name: user.lastName ?? null,
            source: 'chatmig_app',
            consent: true,
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          console.error(
            '[marketing_contacts] Error Supabase REST:',
            res.status,
            text
          );
        }
      } catch (err) {
        console.error('Error guardando contacto de marketing:', err);
      }
    },
    []
  );

  const handleForgotPassword = useCallback(
    async (targetEmail: string): Promise<void> => {
      if (!targetEmail) {
        setError('Por favor, escribe tu correo electrónico.');
        return;
      }

      try {
        setLoading(true);
        const { error } = await supabase.auth.resetPasswordForEmail(
          targetEmail,
          {
            redirectTo: `${window.location.origin}/reset-password`,
          }
        );

        if (error) {
          setError(error.message);
          return;
        }

        setInfo(
          'Te enviamos un enlace para restablecer tu contraseña. Revisa tu bandeja de entrada y el spam.'
        );
      } catch (err) {
        console.error('Supabase reset password error:', err);
        setError('No pudimos enviar el correo. Intenta de nuevo en unos minutos.');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const checkActiveSubscription = useCallback(
    async (user: User): Promise<Plan | null> => {
      try {
        const { data, error } = await supabase
          .from('subscriptions')
          .select('plan,status')
          .eq('user_email', user.email)
          .eq('status', 'active');

        if (error) {
          console.error('Error consultando suscripción en Supabase:', error);
          return null;
        }

        if (!Array.isArray(data) || data.length === 0) return null;

        const dbPlan = (data[0].plan || 'premium') as string;
        return dbPlan === 'free' ? Plan.FREE : Plan.PREMIUM;
      } catch (err) {
        console.error('Error inesperado revisando suscripción:', err);
        return null;
      }
    },
    []
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
      e.preventDefault();
      resetMessages();

      // Flujo de "Olvidé contraseña"
      if (isForgotPassword) {
        await handleForgotPassword(email);
        return;
      }

      // Validaciones básicas
      if (!email || !password || (!isLoginView && (!firstName || !lastName))) {
        setError('Por favor, completa todos los campos.');
        return;
      }

      try {
        setLoading(true);

        // LOGIN
        if (isLoginView) {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (error) {
            if (error.message.toLowerCase().includes('email not confirmed')) {
              setError(
                'Primero confirma tu correo desde el enlace que te enviamos.'
              );
            } else {
              setError(error.message);
            }
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

          await logActivity({
            userEmail: user.email,
            type: 'login',
          });

          const activePlan = await checkActiveSubscription(user);
          if (activePlan) {
            onLoginSuccess(user, activePlan);
            return;
          }

          // Sin plan activo → lo mandamos a elegir FREE / PREMIUM
          setCurrentUser(user);
          setSelectedPlan(Plan.PREMIUM);
          setStep('plans');
          return;
        }

        // REGISTRO
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

        const user: User = { email, firstName, lastName };
        await saveMarketingContact(user);

        await logActivity({
          userEmail: user.email,
          type: 'signup',
          metadata: { source: 'auth_panel' },
        });

        // CLAVE: NO PASAR A PLANES AQUÍ
        setInfo(
          'Te enviamos un correo para confirmar tu cuenta. Primero confirma tu correo y luego inicia sesión para elegir tu plan.'
        );

        // Volver a la pantalla de login
        setIsLoginView(true);
        setIsForgotPassword(false);
        setCurrentUser(null);
        setStep('access');
      } catch (err) {
        console.error('Supabase auth error:', err);
        setError('Ocurrió un error al procesar tu solicitud. Intenta de nuevo.');
      } finally {
        setLoading(false);
      }
    },
    [
      email,
      password,
      firstName,
      lastName,
      isLoginView,
      isForgotPassword,
      handleForgotPassword,
      checkActiveSubscription,
      saveMarketingContact,
      onLoginSuccess,
    ]
  );

  const onPaymentApproved = useCallback(
    async (_data: OnApproveData, actions: OnApproveActions): Promise<void> => {
      if (!currentUser) {
        setError('No hay usuario activo para asociar el pago.');
        return;
      }
      if (!actions.order) {
        setError('No se pudo inicializar el pago con PayPal.');
        return;
      }

      try {
        const details = await actions.order.capture();
        console.log('PayPal capture result:', details);

        const transactionStatus = (details.status || '').toUpperCase();
        const amount =
          details.purchase_units?.[0]?.amount?.value ?? PREMIUM_PRICE_STR;

        if (transactionStatus !== 'COMPLETED') {
          setError('El pago no se completó correctamente. Intenta de nuevo.');
          return;
        }

        const orderId = details.id;
        const payerEmail = details.payer?.email_address || currentUser.email;

        const {
          data: subscriptionRows,
          error: subError,
        } = await supabase
          .from('subscriptions')
          .upsert(
            {
              user_email: currentUser.email,
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

        console.log('Suscripción guardada correctamente:', subscriptionRows);

        const {
          data: paymentRows,
          error: payError,
        } = await supabase
          .from('payments')
          .insert({
            user_email: currentUser.email,
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
          userEmail: currentUser.email,
          type: 'upgrade_success',
          metadata: {
            plan: 'premium',
            provider: 'paypal_checkout',
            orderId,
            amount: parseFloat(amount),
            currency: 'USD',
          },
        });

        alert('¡Pago completado y plan PREMIUM activado!');

        onLoginSuccess(
          {
            ...currentUser,
            email: payerEmail,
          },
          Plan.PREMIUM
        );
      } catch (err) {
        console.error('Error en captura de PayPal:', err);
        setError('Ocurrió un problema al procesar el pago. Intenta de nuevo.');
      }
    },
    [currentUser, onLoginSuccess]
  );

  const handleChooseFreePlan = useCallback(async (): Promise<void> => {
    if (!currentUser) {
      setError('No hay usuario activo para activar el plan FREE.');
      return;
    }

    try {
      // 1) Ver si ya tiene una suscripción y si ya usó el FREE antes
      const { data: existingSubs, error: existingError } = await supabase
        .from('subscriptions')
        .select('id, plan, status, has_used_free, free_messages_left')
        .eq('user_email', currentUser.email)
        .limit(1);

      if (existingError) {
        console.error('Error revisando suscripción existente:', existingError);
        setError('No pudimos revisar tu suscripción actual. Intenta de nuevo.');
        return;
      }

      const existing = existingSubs?.[0];

      // Si ya usó el plan FREE antes, no dejarlo repetir
      if (existing?.has_used_free && existing.plan !== 'free') {
        setError(
          'Ya usaste tu plan GRATUITO con este correo. Si quieres seguir usando ChatMig, activa el plan PREMIUM.'
        );
        return;
      }

      // 2) Payload para upsert: primera vez → marcar has_used_free y dar 3000 tokens
      const payload: any = {
        user_email: currentUser.email,
        provider: 'internal',
        provider_subscription_id: null,
        plan: 'free',
        status: 'active',
      };

      if (!existing?.has_used_free) {
        payload.has_used_free = true;
        payload.free_messages_left = 3000;
      }

      const {
        data: subscriptionRows,
        error: subError,
      } = await supabase
        .from('subscriptions')
        .upsert(payload, { onConflict: 'user_email' })
        .select();

      if (subError) {
        console.error('Error guardando plan free en Supabase:', subError);
        setError(
          `No pudimos registrar el plan FREE en BD, pero tu sesión local fue activada: ${subError.message}`
        );
      } else {
        console.log('Plan FREE guardado correctamente:', subscriptionRows);
        alert(
          'Plan GRATUITO activado. Tienes 3,000 tokens disponibles para probar ChatMig.'
        );
      }

      const { error: quotaError } = await supabase
        .from('account_quotas')
        .upsert(
          {
            user_email: currentUser.email,
            messages_remaining: 0,
            messages_max: 0,
            tokens_remaining: 3000,
            tokens_max: 3000,
          },
          { onConflict: 'user_email' },
        );

      if (quotaError) {
        console.warn(
          '[AuthPanel] No se pudo inicializar account_quotas:',
          quotaError.message,
        );
      }

      await logActivity({
        userEmail: currentUser.email,
        type: 'choose_free_plan',
        metadata: { plan: 'free' },
      });

      // Pase lo que pase en BD, activamos sesión local
      onLoginSuccess(currentUser, Plan.FREE);
    } catch (err) {
      console.error('Error activando plan free:', err);
      setError('No pudimos activar el plan gratuito. Intenta de nuevo.');
    }
  }, [currentUser, onLoginSuccess]);

  if (!PAYPAL_CLIENT_ID) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center bg-slate-950">
        <div className="glass-panel px-6 py-4 text-sm text-red-300 border border-red-500/40 rounded-2xl bg-slate-900/80">
          Error de configuración: falta <code>VITE_PAYPAL_CLIENT_ID</code> en tu{' '}
          <code>.env</code>
        </div>
      </div>
    );
  }

  const isPlansStep = step === 'plans' && !!currentUser;

  return (
    <PayPalScriptProvider options={PAYPAL_OPTIONS}>
      <div className="app-shell min-h-screen flex justify-center items-start p-4 sm:p-6 bg-slate-950 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-y-auto">
        <div
          className={[
            'glass-panel w-full mx-auto rounded-3xl border border-slate-800/60 shadow-2xl',
            'p-5 sm:p-8',
            'max-h-[calc(100vh-3rem)] overflow-y-auto',
            isPlansStep ? 'max-w-5xl' : 'max-w-md',
          ].join(' ')}
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold">
                C
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold">ChatMig AI</h1>
                <p className="text-xs text-slate-400">
                  Tu copiloto migratorio con IA en tiempo real.
                </p>
              </div>
            </div>
            {isPlansStep && (
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-400/30 px-3 py-1 text-[11px] text-emerald-100">
                <span>🔒 Pago seguro con PayPal</span>
              </div>
            )}
          </div>

          {/* STEP 1: Login / Registro / Olvidé contraseña */}
          {step === 'access' && (
            <div>
              <h2 className="text-xl sm:text-2xl font-semibold text-center mb-2">
                {isForgotPassword
                  ? 'Recupera tu contraseña'
                  : isLoginView
                  ? 'Bienvenido de Nuevo'
                  : 'Crea tu Cuenta'}
              </h2>
              <p className="text-center text-sm text-slate-400 mb-6">
                {isForgotPassword
                  ? 'Te enviaremos un enlace para que puedas crear una nueva contraseña.'
                  : isLoginView
                  ? 'Inicia sesión para continuar.'
                  : 'Para acceder a tu panel de planes y elegir FREE o PREMIUM.'}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {!isLoginView && !isForgotPassword && (
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

                {!isForgotPassword && (
                  <FormInput
                    type="password"
                    placeholder="Contraseña"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                  />
                )}

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
                    : isForgotPassword
                    ? 'Enviar enlace de recuperación'
                    : isLoginView
                    ? 'Iniciar Sesión'
                    : 'Crear Cuenta'}
                </button>
              </form>

              {/* Toggle de vistas */}
              <p className="text-center text-xs sm:text-sm text-slate-400 mt-4">
                {isForgotPassword ? (
                  <>
                    ¿Ya recordaste tu contraseña?
                    <button
                      type="button"
                      onClick={() => {
                        setIsForgotPassword(false);
                        setIsLoginView(true);
                        resetMessages();
                      }}
                      className="ml-1 font-medium text-brand-400 hover:underline"
                    >
                      Inicia sesión
                    </button>
                  </>
                ) : (
                  <>
                    {isLoginView
                      ? '¿No tienes cuenta?'
                      : '¿Ya tienes una cuenta?'}
                    <button
                      type="button"
                      onClick={() => {
                        setIsLoginView(!isLoginView);
                        resetMessages();
                      }}
                      className="ml-1 font-medium text-brand-400 hover:underline"
                    >
                      {isLoginView ? 'Regístrate' : 'Inicia Sesión'}
                    </button>
                  </>
                )}
              </p>

              {!isForgotPassword && isLoginView && (
                <p className="text-center text-xs text-slate-500 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPassword(true);
                      resetMessages();
                    }}
                    className="font-medium text-brand-400 hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </p>
              )}
            </div>
          )}

          {/* STEP 2: Plan + Pago – FREE + PREMIUM */}
          {isPlansStep && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl sm:text-2xl font-semibold mb-1">
                  Elige cómo quieres empezar
                </h2>
                <p className="text-sm text-slate-400">
                  Puedes probar ChatMig con un plan gratuito limitado o
                  desbloquear todo el potencial con el plan Premium.
                </p>
              </div>

              <PlanSelector
                currentPlan={selectedPlan}
                onPlanChange={plan => {
                  setSelectedPlan(plan);
                  setError('');
                }}
                onPremiumClick={() => {
                  setSelectedPlan(Plan.PREMIUM);
                  setError('');
                }}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Opción FREE */}
                <div className="rounded-2xl bg-slate-900/70 border border-slate-700/70 p-4 flex flex-col justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-100 mb-1">
                      Entrar con plan GRATUITO
                    </p>
                    <p className="text-xs text-slate-400 mb-2">
                      Hasta{' '}
                      <span className="font-semibold text-slate-100">
                        1,500 tokens
                      </span>{' '}
                      para probar ChatMig y evaluar si te funciona.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleChooseFreePlan}
                    className="mt-3 w-full rounded-xl border border-slate-600 bg-slate-900/80 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800 transition"
                  >
                    Continuar con plan FREE
                  </button>
                </div>

                {/* Opción PREMIUM (PayPal) */}
                <div className="rounded-2xl bg-slate-900/70 border border-slate-700/70 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                    <div>
                      <p className="text-sm font-medium text-slate-100">
                        Desbloquear plan PREMIUM
                      </p>
                      <p className="text-xs text-slate-400">
                        Un solo pago de{' '}
                        <span className="font-semibold text-slate-100">
                          {PREMIUM_PRICE_STR} USD
                        </span>
                        . Sin suscripciones mensuales.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Pago seguro con PayPal</span>
                    </div>
                  </div>

                  {error && (
                    <p className="mb-2 text-xs text-red-400 text-center">
                      {error}
                    </p>
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
                          console.error('PayPal Payment Error:', err);
                          setError(
                            'Falló el pago con PayPal. Revisa tu cuenta o intenta con otro método.'
                          );
                        }}
                      />
                    </div>
                  </div>

                  <p className="mt-3 text-[11px] text-slate-500 text-center leading-snug">
                    Tus datos de pago se procesan directamente en PayPal.
                    Nosotros solo recibimos la confirmación del pago para
                    activar tu acceso Premium.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </PayPalScriptProvider>
  );
};

export default AuthPanel;
