#!/usr/bin/env node
import fs from 'node:fs';

const checks = [];

function ok(name, condition) {
  checks.push({ name, condition: Boolean(condition) });
}

const read = (path) => fs.readFileSync(path, 'utf8');

const geminiService = read('src/services/geminiService.ts');
const geminiApi = read('api/gemini.ts');
const liveApi = read('api/gemini-ephemeral-token.ts');
const imageApi = read('api/image-search.ts');
const authWrapper = read('src/AuthWrapper.tsx');
const index = read('index.tsx');
const html = read('index.html');
const types = read('src/types.ts');
const quota = read('src/services/quotaService.ts');
const serverAuth = read('lib/serverAuth.ts');

ok(
  'Gemini key is not exposed in frontend',
  !geminiService.includes('VITE_GEMINI_API_KEY'),
);
ok(
  'Gemini text goes through authenticated backend',
  geminiService.includes("authenticatedFetch(apiUrl('/api/gemini')"),
);
ok(
  'Vercel Gemini handler does not use req.json()',
  !geminiApi.includes('req.json('),
);
ok(
  'Gemini API validates Supabase session',
  geminiApi.includes('authenticateRequest(req)'),
);
ok(
  'Gemini plan is resolved server-side',
  geminiApi.includes('resolveServerPlan(auth)'),
);
ok(
  'FREE quota is enforced server-side',
  geminiApi.includes('FREE_TOKENS_MAX = 3000') &&
    geminiApi.includes("from('account_quotas')"),
);
ok(
  'Gemini Live token is authenticated',
  liveApi.includes('authenticateRequest(req)') &&
    liveApi.includes("plan !== 'premium'"),
);
ok(
  'Image API requires authentication',
  imageApi.includes('authenticateRequest(req)'),
);
ok(
  'Supabase server auth validates JWT user',
  serverAuth.includes('supabase.auth.getUser(accessToken)'),
);
ok(
  'Cached browser session is validated with Supabase',
  authWrapper.includes('supabase.auth.getSession()'),
);
ok(
  'Real Vite entrypoint wires PremiumShell',
  index.includes('PremiumShell') &&
    index.includes('src/styles/chatmi-ultimate.css'),
);
ok(
  'Password reset has a dedicated route',
  index.includes('/reset-password') &&
    fs.existsSync('src/components/ResetPassword.tsx'),
);
ok(
  'Analytics is initialized before conversion call',
  html.includes('window.dataLayer = window.dataLayer || []') &&
    html.indexOf('function gtag') < html.indexOf("gtag('event', 'conversion'"),
);
ok(
  'FREE plan contract remains 3000 tokens',
  quota.includes('FREE_TOKENS_MAX = 3000'),
);
ok(
  'Account dashboard includes activity typing',
  types.includes('activity: ActivityEvent[]'),
);
ok(
  'Ultimate visual files exist',
  fs.existsSync('src/ui/PremiumShell.tsx') &&
    fs.existsSync('src/styles/chatmi-ultimate.css'),
);

const failed = checks.filter((check) => !check.condition);

for (const check of checks) {
  console.log(`${check.condition ? 'PASS' : 'FAIL'}  ${check.name}`);
}

console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);

if (failed.length > 0) {
  process.exit(1);
}
