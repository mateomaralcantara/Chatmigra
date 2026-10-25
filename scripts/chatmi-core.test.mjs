import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(path, 'utf8');

test('single canonical entrypoint is used', () => {
  assert.equal(fs.existsSync('src/main.tsx'), false);
  assert.match(read('index.html'), /src="\/index\.tsx"/);
});

test('single canonical AuthWrapper is used', () => {
  assert.equal(fs.existsSync('src/AuthWrapper.tsx'), false);
  assert.doesNotMatch(read('AuthWrapper.tsx'), /chatmig_session/);
  assert.match(read('AuthWrapper.tsx'), /supabase\.auth\.getSession/);
});

test('Gemini stays server-side and uses authenticated requests', () => {
  const service = read('src/services/geminiService.ts');
  const api = read('api/gemini.ts');

  assert.doesNotMatch(service, /VITE_GEMINI_API_KEY/);
  assert.match(service, /Authorization:/);
  assert.match(api, /GEMINI_API_KEY/);
  assert.match(api, /requireAuthenticatedUser/);
  assert.doesNotMatch(api, /req\.json\(/);
});

test('PayPal premium activation is server-authoritative', () => {
  const paymentSource = read('src/components/CambiarPlan.tsx');

  assert.match(paymentSource, /\/api\/paypal\/create-order/);
  assert.match(paymentSource, /\/api\/paypal\/capture-order/);
  assert.doesNotMatch(paymentSource, /actions\.order\.capture/);
  assert.doesNotMatch(paymentSource, /from\('subscriptions'\)/);
});

test('legacy standalone API server is removed', () => {
  assert.equal(fs.existsSync('api-server.mjs'), false);
});

test('Supabase migration exists for core tables and RLS', () => {
  const sql = read('supabase/migrations/202610230001_chatmi_core.sql');

  assert.match(sql, /create table if not exists public\.account_quotas/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /chatmi_reserve_tokens/i);
  assert.match(sql, /chatmi_finalize_tokens/i);
});


test('free Gemini requests require server-only, fail-closed quota enforcement', () => {
  const api = read('api/gemini.ts');
  assert.match(api, /getAdminSupabase\(\)/);
  assert.match(api, /chatmi_reserve_tokens_server/);
  assert.match(api, /chatmi_finalize_tokens_server/);
  assert.match(api, /QUOTA_SERVICE_UNAVAILABLE/);
  assert.doesNotMatch(api, /request allowed in degraded mode/);
  assert.doesNotMatch(api, /auth\.supabase\.rpc\('chatmi_/);
});

test('quota hardening revokes user-facing RPC access and uses idempotent reservations', () => {
  const sql = read('supabase/migrations/202610250001_chatmi_server_only_quotas.sql');
  assert.match(sql, /create table if not exists public\.chatmi_token_reservations/);
  assert.match(sql, /for update;/);
  assert.match(sql, /revoke all on function public\.chatmi_reserve_tokens\(integer\)/);
  assert.match(sql, /revoke all on function public\.chatmi_finalize_tokens\(integer, integer\)/);
  assert.match(sql, /grant execute on function public\.chatmi_reserve_tokens_server\(uuid, integer\)/);
  assert.match(sql, /grant execute on function public\.chatmi_finalize_tokens_server\(uuid, integer\)/);
  assert.doesNotMatch(sql, /drop table/i);
});


test('Gemini server routes cannot fall back to publicly prefixed secrets', () => {
  for (const path of ['api/gemini.ts', 'api/gemini-ephemeral-token.ts']) {
    const code = read(path);
    assert.match(code, /process\.env\.GEMINI_API_KEY/);
    assert.doesNotMatch(code, /process\.env\.VITE_GEMINI_API_KEY/);
  }
});

test('production build does not publish source maps', () => {
  const viteConfig = read('vite.config.ts');
  assert.match(viteConfig, /sourcemap:\s*false/);
});

test('ChatMi uses a supported Gemini 3.8 Flash text model by default', () => {
  const api = read('api/gemini.ts');
  const example = read('.env.example');
  assert.match(api, /GEMINI_TEXT_MODEL \|\| 'gemini-3\.8-flash'/);
  assert.match(example, /GEMINI_TEXT_MODEL=gemini-3\.8-flash/);
  assert.doesNotMatch(api, /temperature:\s*0\.35/);
});

test('API responses do not reveal raw upstream Google errors or key identifiers', () => {
  for (const path of ['api/gemini.ts', 'api/gemini-ephemeral-token.ts']) {
    const code = read(path);
    assert.doesNotMatch(code, /error: data\?\.error\?\.message/);
    assert.doesNotMatch(code, /console\.error\('\[gemini\]'[^;]*data\)/);
    assert.match(code, /GEMINI_.*ERROR/);
  }
});


test('color palettes remain readable on ChatMi light surfaces', () => {
  const global = read('src/index.css');
  const styles = read('src/styles/chatmi-ultimate.css');
  const shell = read('src/ui/PremiumShell.tsx');

  assert.doesNotMatch(global, /p,\s*\nspan,\s*\nli,/);
  assert.doesNotMatch(global, /color:\s*#f9fafb/);
  assert.doesNotMatch(global, /background-color:\s*#ffffff\s*!important/);

  assert.match(styles, /\.cm-reference-shell \.cm-suggestion-copy\s*\{\s*color:\s*var\(--cm-text\)/);
  assert.match(styles, /\.cm-reference-shell \.cm-rail-button/);

  for (const palette of ['classic', 'ocean', 'mint', 'violet']) {
    assert.match(shell, new RegExp("id: '" + palette + "'"));
  }
  assert.match(shell, /data-cm-theme=\{palette\}/);
  assert.match(shell, /aria-pressed=\{palette === option\.id\}/);
  assert.match(shell, /localStorage\.setItem\('chatmi:palette'/);
});

test('upgrade promotion has readable dark text over amber background', () => {
  const component = read('src/components/UpgradeTeaser.tsx');
  assert.match(component, /bg-amber-50 border border-amber-300 text-amber-950/);
});
