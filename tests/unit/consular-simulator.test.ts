// Unit family: how the documentary simulator grades and resumes.
import { describe, expect, it } from 'vitest';
import {
  CONSULAR_FINISHED,
  evaluateConsularAnswer,
  resumeConsularInterview,
  type PreparedQuestion,
} from '../../lib/tutor/consularSkills';

const q = (over: Partial<PreparedQuestion>): PreparedQuestion => ({
  id: 'x', skill: 'x', title: 'x', method: 'exact', question: '¿?', expected: null,
  source: null, status: 'document', explanation: '', ...over,
});

describe('evaluateConsularAnswer', () => {
  const identity = q({ id: 'identity', expected: 'Ana María Pérez Gómez' });
  const passport = q({ id: 'passport', expected: 'RD1234567' });

  it('acepta un nombre y un apellido, sin exigir el nombre completo', () => {
    expect(evaluateConsularAnswer(identity, 'Ana Pérez', 0).outcome).toBe('correct');
  });

  it('el pasaporte debe coincidir exactamente, también dentro de una frase', () => {
    expect(evaluateConsularAnswer(passport, 'Mi pasaporte es RD 123 4567', 0).outcome).toBe('correct');
    expect(evaluateConsularAnswer(passport, 'RD1234568', 0).repeat).toBe(true);
  });

  it('una respuesta vacía o "no sé" pide aclarar, sin avanzar', () => {
    expect(evaluateConsularAnswer(passport, '   ', 0).repeat).toBe(true);
    expect(evaluateConsularAnswer(passport, 'No sé', 0).repeat).toBe(true);
  });

  it('nunca insiste más de dos veces: al tercer intento marca para revisar y sigue', () => {
    const third = evaluateConsularAnswer(passport, 'RD0000000', 2);
    expect(third.repeat).toBe(false);
    expect(third.outcome).toBe('review');
  });

  it('las fechas aceptan lenguaje natural', () => {
    const dob = q({ id: 'dob', method: 'date', expected: '1990-03-15' });
    expect(evaluateConsularAnswer(dob, '15 de marzo de 1990', 0).outcome).toBe('correct');
  });
});

describe('resumeConsularInterview', () => {
  const questions = [q({ id: 'a', question: 'Pregunta A' }), q({ id: 'b', question: 'Pregunta B' })];
  const m = (role: 'user' | 'model', content: string) => ({ role, content });

  it('retoma la pregunta pendiente sin repetirla', () => {
    expect(resumeConsularInterview([m('model', 'Pregunta A'), m('user', 'x'), m('model', 'Pregunta B')], questions))
      .toMatchObject({ index: 1, pending: true, completed: false });
  });

  it('una pregunta respondida pasa a la siguiente', () => {
    expect(resumeConsularInterview([m('model', 'Pregunta A'), m('user', 'x')], questions))
      .toMatchObject({ index: 1, pending: false });
  });

  it('cuenta los reintentos de la misma pregunta', () => {
    expect(resumeConsularInterview([m('model', 'Pregunta A'), m('user', 'x'), m('model', 'Pregunta A')], questions))
      .toMatchObject({ index: 0, attempts: 1, pending: true });
  });

  it('reconoce un simulacro terminado', () => {
    expect(resumeConsularInterview([m('model', 'Pregunta A'), m('user', 'x'), m('model', CONSULAR_FINISHED)], questions))
      .toMatchObject({ completed: true });
  });
});
