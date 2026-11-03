import { describe, expect, it } from 'vitest';
import { scrub } from '../../src/services/monitoring';

describe('monitoring scrub (no credentials leave the browser)', () => {
  it('filters credential-like keys at any depth', () => {
    expect(
      scrub({
        Authorization: 'Bearer abc',
        nested: { access_token: 'x', apiKey: 'y', ok: 1 },
        list: [{ password: 'p', name: 'Ana' }],
      }),
    ).toEqual({
      Authorization: '[filtered]',
      nested: { access_token: '[filtered]', apiKey: '[filtered]', ok: 1 },
      list: [{ password: '[filtered]', name: 'Ana' }],
    });
  });

  it('passes primitives and null through', () => {
    expect(scrub('text')).toBe('text');
    expect(scrub(null)).toBeNull();
    expect(scrub(undefined)).toBeUndefined();
  });

  it('stops at a safe depth instead of recursing forever', () => {
    const deep = { a: { b: { c: { d: { e: { f: { token: 'x' } } } } } } };
    expect(() => scrub(deep)).not.toThrow();
  });
});
