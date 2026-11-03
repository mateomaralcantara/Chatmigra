// Product guards added with the 10/10 pass: rules a refactor must not undo.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(path, 'utf8');

test('every user screen shows the "not legal advice" notice', () => {
  assert.match(read('src/ui/LegalNotice.tsx'), /no es asesoría legal/);
  assert.match(read('src/ui/PremiumShell.tsx'), /<LegalNotice \/>/);
});

test('a render crash shows a recovery screen and is reported', () => {
  const entry = read('index.tsx');
  assert.match(entry, /<ErrorBoundary>/);
  assert.match(entry, /initMonitoring\(\)/);
  assert.match(read('src/ui/ErrorBoundary.tsx'), /reportError\(/);
});

test('monitoring is opt-in and never sends personal data', () => {
  const monitoring = read('src/services/monitoring.ts');
  assert.match(monitoring, /VITE_SENTRY_DSN/);
  assert.match(monitoring, /sendDefaultPii: false/);
  assert.match(monitoring, /await import\('@sentry\/react'\)/);
});

test('no browser-visible Gemini key is declared', () => {
  assert.doesNotMatch(read('vite-env.d.ts'), /VITE_GEMINI/);
});

test('large screens stay split into focused components', () => {
  const limits = {
    'src/components/ApplicantTutorChat.tsx': 1000,
    'src/components/AdminDashboard.tsx': 600,
    'src/App.tsx': 600,
  };
  for (const [file, max] of Object.entries(limits)) {
    const lines = read(file).split('\n').length;
    assert.ok(lines <= max, `${file} has ${lines} lines (max ${max}); extract a component or hook`);
  }
});
