import { supabase } from '../../services/supabaseClient';
import type { PreparedQuestion } from '../../../lib/tutor/consularSkills';

export type CaseRow = { id: string; applicant_name: string; owner_id: string; nationality: string; destination: string; visa_type: string };
export type SimulatorRun = { questions: PreparedQuestion[]; index:number; attempts:number; alerts:string[]; excluded:string[]; unindexed:string[] };
export type FactRow = { id:string; fact_key:string; fact_value:string; document_id:string|null; verification_status:'pending_review'|'verified'|'rejected' };
export type DocRow = { id: string; filename: string; mime_type: string; storage_path: string; created_at: string };
export type MessageRow = { id?: string; role: 'user' | 'model'; content: string; created_at?: string };
export type Mode = 'chat' | 'voice';
export type RecognitionEntry = ArrayLike<{ transcript: string }> & { isFinal?: boolean };
export type RecognitionResult = { results: ArrayLike<RecognitionEntry> };
export type RecognitionEngine = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResult) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export const BUCKET = 'chatmi-applicant-cases';
export const LIMIT = 2 * 1024 * 1024;
export const FILE_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
export const uuidInPath = /^\/tutor\/([0-9a-f-]{36})$/i;

export function currentCaseId() {
  return uuidInPath.exec(window.location.pathname)?.[1] || '';
}
export function routeToCase(id: string) {
  const next = id ? '/tutor/' + encodeURIComponent(id) : '/tutor';
  if (window.location.pathname !== next) window.history.replaceState({}, '', next);
}
export async function loggedInUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Inicia sesión para continuar.');
  return user;
}
export function recognitionConstructor(): (new () => RecognitionEngine) | undefined {
  const w = window as typeof window & {
    SpeechRecognition?: new () => RecognitionEngine;
    webkitSpeechRecognition?: new () => RecognitionEngine;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

// A short field lookup should never expose Gemini's unsolicited source,
// heading, or duplicated date translations. Complex questions remain intact.
export function exactFactReply(question: string, response: string): string {
  const q = question.trim().toLocaleLowerCase('es');
  const directField = q.length <= 160 &&
    !/\b(explica|analiza|compara|revisa|evalúa|evalua|resumen|detalla|razones|por qué|requisitos|procedimiento|informe|pasos|lista|varios datos)\b/i.test(q) &&
    /\b(fecha de nacimiento|nombre(?: completo)?(?: del aplicante| del solicitante)?|nacionalidad|tipo de visa|qué visa|cual visa|cuál visa|país de destino)\b/i.test(q);
  const raw = response.trim();
  if (!directField || !raw) return raw;
  let cleaned = raw.replace(/\s*(?:\*\*)?(?:Fuente|Referencia|Fuentes|Sources)(?:\*\*)?\s*:[\s\S]*$/i, '').trim();
  if (/no consta|no se encuentra|no se puede determinar|contradic|discrepan/i.test(cleaned)) return cleaned;
  if (/\bfecha de nacimiento\b/i.test(q)) {
    const spanishDates = [...cleaned.matchAll(/\b\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4}\b/gi)];
    if (spanishDates.length === 1) return spanishDates[0][0];
    const numericDates = [...cleaned.matchAll(/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})\b/g)];
    if (numericDates.length === 1) return numericDates[0][0];
  }
  cleaned = cleaned.replace(/^\s*según\s+(?:el perfil(?: del expediente)?|los documentos|el expediente)\s*,?\s*/i, '');
  cleaned = cleaned.replace(/^(?:la|el|su)\s+(?:fecha de nacimiento(?: de (?:la|el) aplicante)?|nombre(?: completo)?|nacionalidad|tipo de visa|visa solicitada|país de destino)\s*(?:es|corresponde a|:)\s*(?:el\s+|la\s+)?/i, '');
  cleaned = cleaned.replace(/\s*\(\s*\d{1,2}\s+[A-Za-z]+\s+\d{4}\s*\)\s*\.?$/i, '');
  return cleaned.trim().replace(/\.$/, '');
}


export const FACT_LABELS: Record<string,string> = {
  applicant_name:'Nombre',date_of_birth:'Fecha de nacimiento',
  nationality:'Nacionalidad',destination:'País de destino',
  visa_type:'Tipo de visa',passport_number:'Número de pasaporte',
};
