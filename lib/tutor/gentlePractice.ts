/**
 * Práctica Consular Amable — guion determinista.
 * Las respuestas son declaraciones de ensayo, NO hechos verificados del expediente.
 * No compara documentos, no califica respuestas y no llama a Gemini.
 */
export type GentleMessage = {role:'user'|'model';content:string};
export type GentleQuestion = {id:string;group:string;text:string};

export const GENTLE_WELCOME =
  'Bienvenido a tu práctica consular con ChatMi. Haré una pregunta a la vez. '+
  'Responde tranquilamente y tómate el tiempo que necesites. No voy a interrumpirte ni corregirte. Comencemos.';
export const GENTLE_FINISHED =
  'Hemos terminado esta práctica de entrevista consular. Gracias por responder. '+
  'Puedes repetirla cuando quieras. Esta práctica no predice la decisión sobre una visa.';
export const GENTLE_PAUSED = 'Práctica tranquila pausada. Puedes reanudarla cuando desees.';
export const GENTLE_RESUMED = 'Continuemos tranquilamente desde donde quedamos.';

/** Pausa mínima entre el cierre de la respuesta y la siguiente pregunta. */
export const GENTLE_QUESTION_PAUSE_MS = 15_000;

/** Se recalcula al recargar desde la fecha persistida de la última respuesta. */
export function remainingGentleQuestionPause(
  history:readonly (GentleMessage & {created_at?:string})[],
  now:number,
):number {
  const lastAnswer=[...history].reverse().find(message=>message.role==='user');
  const answeredAt=lastAnswer?.created_at ? Date.parse(lastAnswer.created_at) : NaN;
  if(!Number.isFinite(answeredAt))return GENTLE_QUESTION_PAUSE_MS;
  return Math.max(0,GENTLE_QUESTION_PAUSE_MS-(now-answeredAt));
}

export const GENTLE_QUESTIONS: readonly GentleQuestion[] = [
  {id:'purpose',group:'Motivo del viaje',text:'¿A qué va a Estados Unidos?'},
  {id:'inviter',group:'Motivo del viaje',text:'¿Quién le invita?'},
  {id:'activity',group:'Motivo del viaje',text:'¿Qué otra cosa hará en la actividad?'},
  {id:'duration',group:'Motivo del viaje',text:'¿Qué tiempo va a durar su viaje?'},
  {id:'outside-event',group:'Motivo del viaje',text:'¿Qué hará aparte de participar en el encuentro?'},
  {id:'places',group:'Motivo del viaje',text:'¿Piensa visitar otros lugares?'},
  {id:'relatives',group:'Motivo del viaje',text:'¿Tiene familiares en Estados Unidos?'},
  {id:'visit-relatives',group:'Motivo del viaje',text:'¿Piensa visitarlos?'},
  {id:'sender',group:'Trabajo y formación',text:'¿Quién o qué empresa le envía?'},
  {id:'payer',group:'Trabajo y formación',text:'¿Quién cubrirá sus gastos?'},
  {id:'job',group:'Trabajo y formación',text:'¿Qué hace usted o cuál es su trabajo en esta empresa?'},
  {id:'since',group:'Trabajo y formación',text:'¿Desde qué fecha trabaja en esta empresa?'},
  {id:'seniority',group:'Trabajo y formación',text:'¿Cuántos años tiene trabajando en esta empresa?'},
  {id:'salary',group:'Trabajo y formación',text:'¿Cuál es su sueldo?'},
  {id:'professional',group:'Trabajo y formación',text:'¿Es usted profesional?'},
  {id:'studies',group:'Trabajo y formación',text:'¿Qué estudió y dónde?'},
  {id:'lodging',group:'Hospedaje y contacto',text:'¿Dónde se va a hospedar?'},
  {id:'us-contact',group:'Hospedaje y contacto',text:'¿Cuál es su contacto en Estados Unidos?'},
];

function clearNo(answer:string):boolean {
  const value=answer.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  // "No sé" and "no recuerdo" are unknown answers, not a statement that
  // relatives or professional studies do not exist.
  if(/^(?:no se|no recuerdo|no estoy segur[oa]|no tengo idea|no lo se)\b/.test(value))return false;
  return /^(?:no(?:\b|[,.])|ningun[oa]?\b|negativo\b|para nada\b)/.test(value);
}

export function nextGentleIndex(index:number,answer:string):number {
  if(index===6 && clearNo(answer))return 8;
  if(index===14 && clearNo(answer))return 16;
  return Math.min(index+1,GENTLE_QUESTIONS.length);
}

export type GentleProgress = {
  started:boolean;completed:boolean;paused:boolean;
  index:number;awaiting:boolean;answered:number;
};

/** Reanuda la última sesión privada; no mezcla preguntas del simulador documental. */
export function resumeGentlePractice(history:readonly GentleMessage[]):GentleProgress {
  let start=-1;
  for(let i=history.length-1;i>=0;i--){
    if(history[i].role==='model'&&history[i].content===GENTLE_WELCOME){start=i;break;}
  }
  if(start<0)return {started:false,completed:false,paused:false,index:0,awaiting:false,answered:0};
  let index=0,awaiting=false,answered=0,paused=false,completed=false;
  for(const message of history.slice(start+1)){
    if(message.role==='model'){
      if(message.content===GENTLE_FINISHED){completed=true;awaiting=false;continue;}
      if(message.content===GENTLE_PAUSED){paused=true;continue;}
      if(message.content===GENTLE_RESUMED){paused=false;continue;}
      const q=GENTLE_QUESTIONS.findIndex(item=>item.text===message.content);
      if(q>=0){index=q;awaiting=true;}
    }else if(awaiting){
      answered++;
      index=nextGentleIndex(index,message.content);
      awaiting=false;
    }
  }
  return {started:true,completed,paused,index,awaiting,answered};
}
