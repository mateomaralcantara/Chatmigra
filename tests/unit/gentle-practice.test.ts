// Unit family: Práctica Consular Amable, recorrida de principio a fin.
import { describe, expect, it } from 'vitest';
import { CONSULAR_SKILLS } from '../../lib/tutor/consularSkills';
import { splitTutorHistory } from '../../lib/tutor/history';
import {
  GENTLE_FINISHED,
  GENTLE_PAUSED,
  GENTLE_QUESTIONS,
  GENTLE_RESUMED,
  GENTLE_WELCOME,
  nextGentleIndex,
  resumeGentlePractice,
  type GentleMessage,
} from '../../lib/tutor/gentlePractice';

const model = (content: string): GentleMessage => ({ role: 'model', content });
const user = (content: string): GentleMessage => ({ role: 'user', content });

/** Plays the practice exactly like GentlePractice.tsx saves it. */
function play(answers: (q: number) => string) {
  const history: GentleMessage[] = [model(GENTLE_WELCOME), model(GENTLE_QUESTIONS[0].text)];
  const asked: number[] = [0];
  let index = 0;
  for (let guard = 0; guard < 40 && index < GENTLE_QUESTIONS.length; guard++) {
    const next = nextGentleIndex(index, answers(index));
    history.push(user(answers(index)), model('Gracias.'));
    history.push(model(next < GENTLE_QUESTIONS.length ? GENTLE_QUESTIONS[next].text : GENTLE_FINISHED));
    // Reloading at any point must land on exactly the same state.
    expect(resumeGentlePractice(history)).toMatchObject({ index: next, awaiting: next < GENTLE_QUESTIONS.length });
    index = next;
    if (index < GENTLE_QUESTIONS.length) asked.push(index);
  }
  return { history, asked };
}

describe('Práctica Amable: recorrido completo', () => {
  it('con respuestas afirmativas hace las 18 preguntas en orden y termina', () => {
    const { history, asked } = play(() => 'Sí, claro.');
    expect(asked).toEqual(GENTLE_QUESTIONS.map((_, i) => i));
    expect(resumeGentlePractice(history)).toMatchObject({ completed: true, awaiting: false, answered: 18 });
  });

  it('si no tiene familiares no pregunta si piensa visitarlos', () => {
    const { asked } = play((q) => (q === 6 ? 'No, no tengo.' : 'Sí'));
    expect(asked).not.toContain(7);
    expect(asked).toHaveLength(17);
  });

  it('si no es profesional no pregunta qué estudió', () => {
    const { asked } = play((q) => (q === 14 ? 'No' : 'Sí'));
    expect(asked).not.toContain(15);
  });

  it('"no sé" y "omitir" nunca saltan preguntas', () => {
    expect(play((q) => (q === 6 ? 'No sé' : 'Sí')).asked).toContain(7);
    expect(play((q) => (q === 6 ? 'Prefiero omitir esta pregunta.' : 'Sí')).asked).toContain(7);
  });

  it('sin historial no ha empezado', () => {
    expect(resumeGentlePractice([])).toMatchObject({ started: false, index: 0, awaiting: false });
  });

  it('una práctica nueva empieza desde cero aunque haya una anterior terminada', () => {
    const { history } = play(() => 'Sí');
    history.push(model(GENTLE_WELCOME), model(GENTLE_QUESTIONS[0].text));
    expect(resumeGentlePractice(history)).toMatchObject({ completed: false, index: 0, awaiting: true, answered: 0 });
  });
});

describe('Práctica Amable: pausas y el simulacro documental', () => {
  it('reanuda en la misma pregunta tras pausar', () => {
    const history = [model(GENTLE_WELCOME), model(GENTLE_QUESTIONS[0].text), user('Turismo'), model('Gracias.'),
      model(GENTLE_QUESTIONS[1].text), model(GENTLE_PAUSED), model(GENTLE_RESUMED)];
    expect(resumeGentlePractice(history)).toMatchObject({ paused: false, index: 1, awaiting: true, answered: 1 });
  });

  it('lo que el usuario escribe en el simulacro mientras la práctica está pausada NO cuenta como respuesta', () => {
    const history = [
      model(GENTLE_WELCOME), model(GENTLE_QUESTIONS[0].text), user('Turismo'), model('Gracias.'),
      model(GENTLE_QUESTIONS[1].text),
      model(GENTLE_PAUSED),
      // El usuario vuelve al Tutor y usa el simulacro documental:
      model('¿Cuál es el propósito de su viaje según su DS-160?'),
      user('Visitar a mi hermana'),
      model('Gracias. ¿Cuánto tiempo se quedará?'),
      user('Dos semanas'),
      // ...y regresa a la práctica:
      model(GENTLE_RESUMED),
    ];
    expect(resumeGentlePractice(history)).toMatchObject({ paused: false, index: 1, awaiting: true, answered: 1 });
  });
});

describe('splitTutorHistory (simulacro documental)', () => {
  it('nunca mezcla turnos de la Práctica Amable con el simulacro', () => {
    const { documentHistory } = splitTutorHistory([
      model(GENTLE_WELCOME), model(GENTLE_QUESTIONS[0].text), user('Turismo'), model(GENTLE_PAUSED),
      model(CONSULAR_SKILLS[0].question), user('Ana Pérez'),
      model(GENTLE_RESUMED), user('respuesta de práctica'), model(GENTLE_FINISHED),
    ]);
    expect(documentHistory.map((m) => m.content)).toEqual([CONSULAR_SKILLS[0].question, 'Ana Pérez']);
  });

  it('el chat antiguo queda como historial anterior, fuera del simulacro activo', () => {
    const { previous, active } = splitTutorHistory([
      user('pregunta vieja'), model('respuesta vieja'), model(CONSULAR_SKILLS[0].question), user('Ana'),
    ]);
    expect(previous.map((m) => m.content)).toEqual(['pregunta vieja', 'respuesta vieja']);
    expect(active.map((m) => m.content)).toEqual([CONSULAR_SKILLS[0].question, 'Ana']);
  });
});

describe('Práctica ampliada (31 preguntas adicionales)', async () => {
  const { EXTENDED_QUESTIONS, EXTENDED_WELCOME, EXTENDED_FINISHED, nextPracticeIndex } =
    await import('../../lib/tutor/gentlePractice');

  it('tiene exactamente las 31 preguntas, en orden y en sus 5 bloques', () => {
    expect(EXTENDED_QUESTIONS).toHaveLength(31);
    expect(new Set(EXTENDED_QUESTIONS.map((q) => q.id)).size).toBe(31);
    expect(EXTENDED_QUESTIONS[0].text).toBe('¿Cuál es el nombre oficial del encuentro y dónde se realizará?');
    expect(EXTENDED_QUESTIONS[30].text).toBe('¿Qué publicaciones o trabajos recientes puede mencionar como ejemplo?');
    expect([...new Set(EXTENDED_QUESTIONS.map((q) => q.group))]).toEqual([
      'La actividad y la cobertura', 'El medio o la empresa que le envía', 'El itinerario y el regreso',
      'El hospedaje y los contactos', 'Su trayectoria y sus viajes',
    ]);
    // Ninguna se confunde con las 18 esenciales.
    const essential = new Set(GENTLE_QUESTIONS.map((q) => q.text));
    expect(EXTENDED_QUESTIONS.some((q) => essential.has(q.text))).toBe(false);
  });

  it('el aviso de veracidad está en la bienvenida', () => {
    expect(EXTENDED_WELCOME).toMatch(/coincidir con el propósito real del viaje y con la categoría de visa solicitada/);
  });

  it('hace las 31 en orden, sin saltos aunque responda "No"', () => {
    const history: GentleMessage[] = [model(EXTENDED_WELCOME), model(EXTENDED_QUESTIONS[0].text)];
    for (let i = 0; i < 31; i++) {
      const next = nextPracticeIndex('extended', i, 'No');
      expect(next).toBe(i + 1);
      history.push(user('No'), model('Gracias.'), model(next < 31 ? EXTENDED_QUESTIONS[next].text : EXTENDED_FINISHED));
      expect(resumeGentlePractice(history)).toMatchObject({ set: 'extended', index: next, awaiting: next < 31 });
    }
    expect(resumeGentlePractice(history)).toMatchObject({ set: 'extended', completed: true, answered: 31 });
  });

  it('al recargar sigue en la práctica que estaba abierta', () => {
    const history = [
      model(GENTLE_WELCOME), model(GENTLE_QUESTIONS[0].text), user('Turismo'),
      model(EXTENDED_WELCOME), model(EXTENDED_QUESTIONS[0].text), user('Foro de Periodismo, Miami'),
      model('Gracias.'), model(EXTENDED_QUESTIONS[1].text),
    ];
    expect(resumeGentlePractice(history)).toMatchObject({ set: 'extended', index: 1, awaiting: true, answered: 1 });
  });

  it('el simulacro documental nunca ve los turnos de la práctica ampliada', () => {
    const { documentHistory } = splitTutorHistory([
      model(EXTENDED_WELCOME), model(EXTENDED_QUESTIONS[0].text), user('respuesta'), model(EXTENDED_FINISHED),
      model(CONSULAR_SKILLS[0].question), user('Ana'),
    ]);
    expect(documentHistory.map((m) => m.content)).toEqual([CONSULAR_SKILLS[0].question, 'Ana']);
  });
});
