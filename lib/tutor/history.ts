// Pure history helpers for the documentary Tutor (no browser or network).
import { CONSULAR_SKILLS } from './consularSkills';
import {
  EXTENDED_FINISHED, EXTENDED_WELCOME, GENTLE_FINISHED, GENTLE_PAUSED, GENTLE_RESUMED, GENTLE_WELCOME,
} from './gentlePractice';

type Turn = { role: 'user' | 'model'; content: string };

/**
 * Splits one case's message history for the documentary Tutor:
 * - practice turns (between WELCOME/RESUMED and FINISHED/PAUSED) are dropped,
 *   they are neither documentary facts nor simulator answers;
 * - older chat/legacy intake stays visible as `previous`, outside the active
 *   consular conversation, so it never drives or grades the next answer.
 */
export function splitTutorHistory<T extends Turn>(history: T[]) {
  let inGentlePractice = false;
  const documentHistory = history.filter(message => {
    if (message.role === 'model' &&
      (message.content === GENTLE_WELCOME || message.content === EXTENDED_WELCOME ||
       message.content === GENTLE_RESUMED)) {
      inGentlePractice = true;
      return false;
    }
    if (inGentlePractice) {
      if (message.role === 'model' &&
        (message.content === GENTLE_FINISHED || message.content === EXTENDED_FINISHED ||
           message.content === GENTLE_PAUSED)) {
        inGentlePractice = false;
      }
      return false;
    }
    return true;
  });
  const firstConsular = documentHistory.findIndex(message =>
    message.role==='model' && (
      message.content===CONSULAR_SKILLS[0].question ||
      message.content==='¿Cuál es tu nombre completo, tal como figura en la solicitud?'
    ));
  return {
    documentHistory,
    previous: firstConsular<0 ? documentHistory : documentHistory.slice(0,firstConsular),
    active: firstConsular<0 ? [] : documentHistory.slice(firstConsular),
  };
}
