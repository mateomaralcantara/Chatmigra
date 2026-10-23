#!/usr/bin/env node
import fs from 'node:fs';

const checks = [];

function ok(name, condition, detail = '') {
  checks.push({ name, condition, detail });
}

const read = (path) => fs.readFileSync(path, 'utf8');

const geminiService = read('src/services/geminiService.ts');
const geminiApi = read('api/gemini.ts');
const index = read('index.tsx');
const html = read('index.html');
const types = read('src/types.ts');

ok(
  'Gemini key is not exposed in frontend',
  !geminiService.includes('VITE_GEMINI_API_KEY'),
);
ok(
  'Gemini text goes through backend',
  geminiService.includes("/api/gemini"),
);
ok(
  'Vercel handler does not use req.json()',
  !geminiApi.includes('req.json('),
);
ok(
  'Server-side Gemini key is required',
  geminiApi.includes('GEMINI_API_KEY') || geminiApi.includes('GOOGLE_API_KEY'),
);
ok(
  'Real entrypoint wires PremiumShell',
  index.includes('PremiumShell') && index.includes('src/styles/chatmi-ultimate.css'),
);
ok(
  'Password reset has a dedicated route',
  index.includes('/reset-password') && fs.existsSync('src/components/ResetPassword.tsx'),
);
ok(
  'Analytics is initialized before conversion call',
  html.includes('window.dataLayer = window.dataLayer || []') &&
    html.indexOf('function gtag') < html.indexOf("gtag('event', 'conversion'"),
);
ok(
  'FREE plan contract remains 3000 tokens',
  read('src/services/accountDashboardService.ts').includes('FREE_TOKENS_MAX = 3000'),
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
