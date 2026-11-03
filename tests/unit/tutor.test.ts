import { describe, expect, it } from 'vitest';
import { directFactKey, extractCaseFactCandidates } from '../../lib/tutor/facts';
import {
  GENTLE_QUESTIONS,
  GENTLE_WELCOME,
  nextGentleIndex,
  resumeGentlePractice,
} from '../../lib/tutor/gentlePractice';

describe('directFactKey (fast route, no AI)', () => {
  it.each([
    ['¿Cuál es mi fecha de nacimiento?', 'date_of_birth'],
    ['¿Cuál es mi número de pasaporte?', 'passport_number'],
    ['¿Qué tipo de visa estoy pidiendo?', 'visa_type'],
    ['¿Cuál es mi nacionalidad?', 'nationality'],
  ])('routes %j to %s', (question, key) => {
    expect(directFactKey(question)).toBe(key);
  });

  it.each([
    'Explícame mi fecha de nacimiento',
    '¿Cuál es mi nacionalidad y mi número de pasaporte?',
    'Revisa el documento',
    'hola',
  ])('never takes the fast route for %j', (question) => {
    expect(directFactKey(question)).toBeNull();
  });
});

describe('extractCaseFactCandidates', () => {
  it('reads labelled fields line by line', () => {
    const rows = extractCaseFactCandidates('Nationality: Dominican\nPassport number: RD1234567');
    expect(rows).toEqual(
      expect.arrayContaining([
        { fact_key: 'nationality', fact_value: 'Dominican' },
        { fact_key: 'passport_number', fact_value: 'RD1234567' },
      ]),
    );
  });

  it('ignores text without labels', () => {
    expect(extractCaseFactCandidates('Some prose without any field.')).toEqual([]);
  });
});

describe('gentle practice', () => {
  it('always moves forward and never past the last question', () => {
    for (let i = 0; i < GENTLE_QUESTIONS.length; i++) {
      const next = nextGentleIndex(i, 'Sí, claro');
      expect(next).toBeGreaterThan(i);
      expect(next).toBeLessThanOrEqual(GENTLE_QUESTIONS.length);
    }
  });

  it('treats "no sé" as unknown, not as a negative answer', () => {
    expect(nextGentleIndex(6, 'no sé')).toBe(7);
    expect(nextGentleIndex(6, 'no')).toBe(8);
  });

  it('resumes on the unanswered question', () => {
    const progress = resumeGentlePractice([
      { role: 'model', content: GENTLE_WELCOME },
      { role: 'model', content: GENTLE_QUESTIONS[0].text },
      { role: 'user', content: 'Me llamo Ana' },
      { role: 'model', content: GENTLE_QUESTIONS[1].text },
    ]);
    expect(progress).toMatchObject({ started: true, index: 1, awaiting: true, answered: 1 });
  });
});
