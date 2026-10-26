// Tutor interview engine: questions are asked by the agent without an LLM call.
// The applicant's answers remain applicant statements, never verified document facts.
export type InterviewProfile = {
  nationality?: string | null;
  destination?: string | null;
  visa_type?: string | null;
};
export type InterviewMessage = { role: 'user' | 'model'; content: string };

export const INTERVIEW = {
  goal: '¿Cuál es el objetivo principal de tu trámite migratorio?',
  nationality: '¿Cuál es tu nacionalidad?',
  destination: '¿A qué país deseas viajar o emigrar?',
  visa: '¿Qué tipo de visa o proceso migratorio estás solicitando?',
  refusal: '¿Te han negado alguna visa o la entrada a algún país?',
  refusalDetails: '¿Qué país rechazó la solicitud y cuál fue el motivo, si lo conoces?',
  schedule: '¿Tienes una fecha prevista de viaje o una cita programada?',
  documents: '¿Qué documentos tienes disponibles para respaldar tu solicitud?',
  priority: '¿Qué aspecto de tu expediente te preocupa más?',
  firstReview: '¿Prefieres que revisemos primero los requisitos o tus documentos?',
} as const;

type QuestionKey = keyof typeof INTERVIEW;
const ORDER: QuestionKey[] = [
  'goal', 'nationality', 'destination', 'visa',
  'refusal', 'refusalDetails', 'schedule', 'documents', 'priority', 'firstReview',
];

export const INTERVIEW_COMPLETE =
  'Gracias. Terminamos la entrevista inicial. Ahora puedo revisar tus documentos o responder una consulta específica.';

export function isInterviewQuestion(text: string): boolean {
  return Object.values(INTERVIEW).includes(text as typeof INTERVIEW[QuestionKey]);
}

export function interviewProgress(history: InterviewMessage[], profile: InterviewProfile) {
  const answers = new Map<QuestionKey, string>();
  let outstanding: QuestionKey | null = null;
  for (const item of history) {
    if (item.role === 'model') {
      const match = ORDER.find(key => INTERVIEW[key] === item.content);
      if (match) outstanding = match;
    } else if (item.role === 'user' && outstanding) {
      answers.set(outstanding, item.content.trim());
      outstanding = null;
    }
  }
  const refusalAnswer = answers.get('refusal') || '';
  const refusalIsYes = /^(s[ií]|claro|afirmativo|yes)\b/i.test(refusalAnswer);
  const applicable = ORDER.filter(key => {
    if (key === 'nationality' && profile.nationality?.trim()) return false;
    if (key === 'destination' && profile.destination?.trim()) return false;
    if (key === 'visa' && profile.visa_type?.trim()) return false;
    if (key === 'refusalDetails' && !refusalIsYes) return false;
    return true;
  });
  const nextKey = applicable.find(key => !answers.has(key)) || null;
  const nextQuestion = nextKey ? INTERVIEW[nextKey] : null;
  return {
    nextQuestion,
    pending: Boolean(nextKey && outstanding === nextKey),
    completed: nextKey === null,
    started: history.some(item => item.role === 'model' && isInterviewQuestion(item.content)),
    answered: answers.size,
  };
}

// A browser speech engine can spell an acronym letter by letter. Merge sequences
// of individually spaced letters, but never rewrite actual applicant documents.
export function naturalSpanishSpeech(answer: string): string {
  const plain = answer.replace(/https?:\/\/\S+/gi, 'enlace disponible en pantalla')
    .replace(/[*#_\x60\[\]<>]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return plain.replace(/(?:\b[A-Za-zÁÉÍÓÚÜÑ]\b[\s.,;-]+){2,}\b[A-Za-zÁÉÍÓÚÜÑ]\b/g,
    sequence => sequence.replace(/[\s.,;-]+/g,''));
}
