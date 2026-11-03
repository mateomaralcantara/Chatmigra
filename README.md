# ChatMi · Asistente de inmigración con IA

ChatMi ayuda a personas y empresas a entender y planear trámites migratorios
(visas, residencia y similares) con un chat y una voz impulsados por Gemini, y
ofrece un **Tutor consular** privado por expediente que prepara al solicitante
para su entrevista a partir de sus propios documentos.

> ChatMi orienta; **no es asesoría legal**. Las decisiones migratorias deben
> confirmarse con fuentes oficiales o un profesional acreditado.

## Arquitectura

| Capa | Tecnología | Dónde |
|---|---|---|
| Interfaz | React 19 + Vite + Tailwind | `index.tsx`, `AuthWrapper.tsx`, `src/` |
| API (funciones Vercel) | TypeScript | `api/` |
| Lógica de servidor compartida | Supabase, PayPal, HTTP | `server/` |
| Lógica del Tutor (sin IA) | Clasificador de datos, entrevista, Práctica Amable | `lib/tutor/` |
| Base de datos | Supabase Postgres con RLS | `supabase/migrations/` |
| IA | Gemini (solo desde el servidor) | `api/gemini.ts`, `api/gemini-ephemeral-token.ts` |
| Pagos | PayPal Checkout, Premium 19.95 USD | `api/paypal/`, `server/paypal.ts` |

Más detalle del Tutor en [`docs/ARQUITECTURA_TUTOR_RAPIDO_AUTOMATICO.md`](docs/ARQUITECTURA_TUTOR_RAPIDO_AUTOMATICO.md).

## Puesta en marcha local

Requisitos: Node.js 18 o superior (el CI usa Node 24).

1. `npm ci`
2. Copia `.env.example` a `.env.local` y rellena las variables:
   - `VITE_*`: valores públicos para el navegador (URL y clave publicable de Supabase, client ID de PayPal).
   - `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_SECRET`: **solo servidor**; nunca con prefijo `VITE_`.
   - `PAYPAL_ENV=sandbox` mientras pruebas.
3. Aplica en Supabase, en orden, los archivos de `supabase/migrations/`
   (`supabase db push` o pegándolos en el SQL Editor). Todos son idempotentes:
   volver a ejecutarlos no borra datos.
4. `npx vercel dev` para levantar interfaz y API juntas (o `npm run dev` solo para la interfaz).

## Calidad: un solo comando

```bash
npm run check
```

Ejecuta lint (sin advertencias) → typecheck → guards, unit, contract, db y
flows → build. `npm run check:full` añade las pruebas en navegador real
(Playwright, escritorio y móvil). GitHub Actions corre ambos en cada push y
pull request. Explicación de cada familia y cómo extenderlas:
[`docs/HARNESS.md`](docs/HARNESS.md).

## Monitoreo de errores

Define `VITE_SENTRY_DSN` para enviar a Sentry los errores del navegador. Sin
DSN no se carga nada. Nunca se envían cookies, cuerpos de petición, IPs ni
claves (`src/services/monitoring.ts`). Si una pantalla falla, el usuario ve
una pantalla de recuperación en lugar de una página en blanco
(`src/ui/ErrorBoundary.tsx`). Los errores del servidor quedan en los logs de
Vercel con el prefijo de cada ruta (`[paypal/capture-order]`, `[gemini]`…).

## Despliegue

Vercel despliega desde `main`. Configura las variables de servidor en
*Project Settings → Environment Variables*; en producción el código **no**
lee archivos `.env` locales (`server/env.ts`).
