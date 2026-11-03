// DB family: invariants every SQL file under supabase/ must keep.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIRS = ['supabase/migrations', 'supabase/setup'];
const files = DIRS.flatMap((dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => ({ path: join(dir, f), sql: readFileSync(join(dir, f), 'utf8') })),
);
const allSql = files.map((f) => f.sql).join('\n');

const createdTables = [...allSql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi)].map((m) => m[1]);

describe('Supabase SQL', () => {
  it('finds the SQL files', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(createdTables.length).toBeGreaterThan(0);
  });

  it('migrations sort chronologically by their 12-digit prefix', () => {
    const names = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'));
    for (const name of names) expect(name).toMatch(/^\d{12}_[a-z0-9_]+\.sql$/);
    expect([...names].sort()).toEqual(names);
  });

  it.each([...new Set(createdTables)])('public.%s has row level security enabled', (table) => {
    const rls = new RegExp(`alter\\s+table\\s+(?:if\\s+exists\\s+)?public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i');
    expect(allSql).toMatch(rls);
  });

  it('a PayPal capture can only be recorded once', () => {
    expect(allSql).toMatch(/create\s+unique\s+index[\s\S]*?on\s+public\.payments\s*\(\s*provider_capture_id\s*\)/i);
  });

  it('never grants table access to the anonymous role', () => {
    expect(allSql).not.toMatch(/grant\s+[^;]*\s+on\s+(?:table\s+)?public\.\w+\s+to\s+anon\b/i);
  });

  it('never disables row level security', () => {
    expect(allSql).not.toMatch(/disable\s+row\s+level\s+security/i);
  });
});
