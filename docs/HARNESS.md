# ChatMi · Familias de harness (pruebas)

Todo cambio pasa por el mismo flujo, en este orden, en local (`npm run check`)
y en GitHub Actions (`.github/workflows/ci.yml`). Si un paso falla, los
siguientes no se ejecutan y el cambio no se publica.

```
lint (0 advertencias) ─► typecheck ─► guards ─► unit ─► contract ─► db ─► flows ─► build ─► e2e
```

`npm run check` ejecuta todo menos `e2e`; `npm run check:full` incluye también
el navegador real. En GitHub Actions, `e2e` es un segundo job que solo corre si
el primero pasó.

| Familia | Carpeta | Comando | Qué garantiza |
|---|---|---|---|
| **Guards** | `tests/guards/` | `npm run test:guards` | Reglas de arquitectura ya acordadas: Gemini solo en el servidor, un único punto de entrada, cuotas que fallan cerradas, Tutor privado por expediente, Práctica Amable, aviso legal visible en todas las pantallas, pantalla de recuperación ante errores, monitoreo sin datos personales y tamaño máximo de las pantallas grandes. Lee el código fuente sin ejecutarlo; los componentes divididos en carpetas se leen como una sola unidad. |
| **Unit** | `tests/unit/` | `npm run test:unit` | Funciones puras: lectura segura del body JSON, límite de peticiones, validación de la captura de PayPal, ruta rápida de datos del Tutor, avance y reanudación de la Práctica Amable, filtrado de credenciales antes de enviar errores al monitoreo. |
| **Contract** | `tests/contract/` | `npm run test:contract` | Cada ruta de `api/` responde siempre en el mismo orden: método incorrecto → 405, sin sesión o token falso → 401, exceso de peticiones → 429 sin llamar a Gemini, PayPal ni Google. Los códigos de PayPal (400/402/422/502/503) que la pantalla de pago espera. |
| **DB** | `tests/db/` | `npm run test:db` | Todas las tablas `public.*` tienen RLS, ninguna da acceso al rol `anon`, las migraciones están ordenadas, **cada migración se puede ejecutar dos veces sin romper nada** y un pago de PayPal solo puede registrarse una vez. |
| **Flows** | `tests/flows/` | `npm run test:flows` | El recorrido completo de compra Premium, incluidos doble clic, caída de la base de datos después del cobro y reintento, fallo del registro contable y mejora de una suscripción gratuita. |
| **E2E** | `tests/e2e/` | `npm run test:e2e` | El build de producción en Chromium real, en escritorio y en móvil. **Visitante y chat:** login correcto e incorrecto, aviso legal, sin desplazamiento horizontal, pregunta y respuesta, mensaje claro ante el límite de peticiones, voz reservada a Premium. **Tutor:** expediente creado solo, Práctica Amable completa (18 preguntas con saltos lógicos), recarga sin perder el punto, pausa + simulacro + regreso, omitir, error de guardado y «Reintentar», modo voz (el Tutor habla, escucha y avanza solo), simulacro con documentos (acepta, corrige un pasaporte que no coincide, termina, retoma tras recargar) y consulta libre con respuesta en streaming. Supabase es una base en memoria (`tests/e2e/fake-db.ts`) que guarda filas de verdad; ninguna petición sale a internet. |

## Kit compartido (`tests/harness/`)

- `http.ts`: peticiones y respuestas falsas con la forma de Vercel, más `call(handler, req)`.
- `backend.ts`: Supabase en memoria (usuarios con sesión, tablas, restricciones
  únicas y fallos simulados con `backend.failures.set('tabla:operacion', 'mensaje')`).
- `supabase-module.ts`: sustituto de `server/supabase.ts`; se activa con
  `vi.mock('../../server/supabase', () => import('../harness/supabase-module'))`.
- `tests/e2e/fixtures.ts`: el mismo enfoque para el navegador (Supabase y `/api`
  interceptados por Playwright; se construye con `.env.e2e`, que solo tiene
  valores falsos).
- `paypal.ts`: un `fetch` falso que se comporta como PayPal Orders v2 (crear,
  capturar, `ORDER_ALREADY_CAPTURED`, consultar). Cualquier URL desconocida
  falla, así que ninguna prueba sale a internet.

## Cómo añadir una ruta nueva en `api/`

1. Validar el método → 405.
2. `requireAuthenticatedUser` → 401.
3. `rejectIfRateLimited(res, auth.user.id, '<bucket>')` → 429 (añade el bucket en `server/http.ts`).
4. Validar el body con `parseJsonObject` → 400.
5. Nunca devolver `error.message` al navegador: registrar el detalle con `console.error` y responder un mensaje genérico con `code`.
6. Añadir la ruta a `ROUTES` en `tests/contract/api-guards.test.ts`.

## Límites honestos

- Los límites de peticiones viven en la memoria de cada instancia de Vercel:
  frenan ráfagas y bucles, pero no son globales. Las cuotas de Gemini en
  Supabase siguen siendo la fuente de verdad.
- Las pruebas usan dobles de Supabase y PayPal, no los servicios reales. Antes
  de cobrar en `PAYPAL_ENV=live`, haz una compra real en `sandbox`.
- Ninguna batería de pruebas garantiza "cero errores para siempre": garantiza
  que estos comportamientos no se rompan sin que el CI lo detecte.
