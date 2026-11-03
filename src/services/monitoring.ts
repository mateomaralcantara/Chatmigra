// Error monitoring. Sentry is loaded only when VITE_SENTRY_DSN is set, so
// local development and forks without a DSN pay no bundle or network cost.

type Reporter = (error: unknown, context?: Record<string, unknown>) => void;

let report: Reporter = (error, context) => {
  console.error('[ChatMi]', error, context ?? '');
};

const SENSITIVE_KEYS = /authorization|token|password|apikey|api_key|secret|cookie/i;

/** Drops values whose key looks like a credential before anything is sent. */
export function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEYS.test(key) ? '[filtered]' : scrub(item, depth + 1),
    ]),
  );
}

export async function initMonitoring(): Promise<void> {
  const dsn = (import.meta.env.VITE_SENTRY_DSN || '').trim();
  if (!dsn) return;

  try {
    const Sentry = await import('@sentry/react');
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      release: import.meta.env.VITE_APP_VERSION || undefined,
      tracesSampleRate: 0.1,
      // Immigration cases are sensitive: never attach IPs, cookies or bodies.
      sendDefaultPii: false,
      beforeSend(event) {
        if (event.request) {
          delete event.request.cookies;
          delete event.request.data;
          event.request.headers = scrub(event.request.headers) as Record<string, string>;
        }
        event.extra = scrub(event.extra) as Record<string, unknown>;
        return event;
      },
    });
    report = (error, context) => {
      Sentry.captureException(error, { extra: scrub(context) as Record<string, unknown> });
    };
  } catch (error) {
    console.warn('[ChatMi] Monitoring unavailable:', error);
  }
}

export function reportError(error: unknown, context?: Record<string, unknown>): void {
  report(error, context);
}
