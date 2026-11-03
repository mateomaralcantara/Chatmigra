// Shared E2E harness: a fake Supabase + fake /api backend served through
// Playwright request interception. Nothing leaves the browser.
import { test as base, expect, type Page, type Route } from '@playwright/test';

export const SUPABASE = 'https://e2e.supabase.test';

export const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'ana@example.com',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  user_metadata: { first_name: 'Ana', last_name: 'Pérez' },
  app_metadata: { provider: 'email' },
  created_at: '2026-01-01T00:00:00Z',
};

export interface FakeApi {
  plan: 'free' | 'premium';
  /** Last body received by /api/gemini. */
  geminiRequests: unknown[];
  /** Status the next /api/gemini call answers with. */
  geminiStatus: number;
  /** Uncaught page errors (should stay empty). */
  pageErrors: string[];
}

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' },
    body: JSON.stringify(body),
  });
}

async function install(page: Page, api: FakeApi) {
  page.on('pageerror', (error) => api.pageErrors.push(error.message));

  await page.route(`${SUPABASE}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'OPTIONS') return json(route, 200, {});

    if (url.pathname === '/auth/v1/token') {
      const body = request.postDataJSON() as { password?: string };
      if (body?.password !== 'correcta-123') {
        return json(route, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' });
      }
      return json(route, 200, {
        access_token: 'e2e-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'e2e-refresh-token',
        user: USER,
      });
    }
    if (url.pathname === '/auth/v1/user') return json(route, 200, USER);
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });

    if (url.pathname === '/rest/v1/subscriptions') {
      const row = { plan: api.plan, status: 'active' };
      const single = (request.headers()['accept'] || '').includes('vnd.pgrst.object');
      return json(route, 200, single ? row : [row]);
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) return json(route, 200, null);
    if (url.pathname.startsWith('/rest/v1/')) {
      const single = (request.headers()['accept'] || '').includes('vnd.pgrst.object');
      return single ? json(route, 406, { code: 'PGRST116', message: 'no rows' }) : json(route, 200, []);
    }
    if (url.pathname.startsWith('/storage/v1/')) return json(route, 200, []);

    return json(route, 404, { message: `E2E: unmocked ${url.pathname}` });
  });

  // Playwright gives priority to the most recently registered route, so the
  // generic fallback goes first and the specific handlers after it.
  // Any other backend route is answered empty instead of hitting the network.
  await page.route('**/api/**', (route) => json(route, 200, {}));

  await page.route('**/api/gemini', async (route) => {
    api.geminiRequests.push(route.request().postDataJSON());
    if (api.geminiStatus !== 200) {
      return json(route, api.geminiStatus, { error: 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.', code: 'RATE_LIMITED' });
    }
    return json(route, 200, {
      text: 'Para una visa de estudiante necesitas la carta de admisión y prueba de fondos.',
      usageMetadata: { totalTokenCount: 42 },
      quota: { remaining: 2958 },
    });
  });

}

export const test = base.extend<{ api: FakeApi }>({
  api: async ({ page }, use) => {
    const api: FakeApi = { plan: 'free', geminiRequests: [], geminiStatus: 200, pageErrors: [] };
    await install(page, api);
    await use(api);
  },
});

export { expect };

export async function login(page: Page, password = 'correcta-123') {
  await page.goto('/');
  await page.getByPlaceholder('Correo electrónico').fill(USER.email);
  await page.getByPlaceholder('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}
