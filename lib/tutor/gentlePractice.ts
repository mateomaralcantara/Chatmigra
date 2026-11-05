/**
 * Práctica Consular Amable (18 preguntas) y Práctica ampliada (31) — guiones deterministas.
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

// Práctica ampliada: 31 preguntas adicionales, sin saltos condicionales.
export const EXTENDED_WELCOME =
  'Bienvenido a la práctica ampliada de ChatMi: 31 preguntas adicionales sobre la actividad, '+
  'el medio que le envía, el itinerario, el hospedaje y su trayectoria. Haré una pregunta a la vez. '+
  'Recuerde: la actividad que explique debe coincidir con el propósito real del viaje y con la '+
  'categoría de visa solicitada. Responda de forma clara y veraz. Comencemos.';
export const EXTENDED_FINISHED =
  'Hemos terminado la práctica ampliada. Gracias por responder. Revise que sus respuestas coincidan '+
  'con el propósito real del viaje y con la categoría de visa solicitada. Esta práctica no predice la decisión sobre una visa.';

export const EXTENDED_QUESTIONS: readonly GentleQuestion[] = [
  {id:'x-event-name',group:'La actividad y la cobertura',text:'¿Cuál es el nombre oficial del encuentro y dónde se realizará?'},
  {id:'x-event-dates',group:'La actividad y la cobertura',text:'¿Qué fechas y horarios tendrá la actividad?'},
  {id:'x-role',group:'La actividad y la cobertura',text:'¿Qué función específica tendrá usted: asistente, expositor, panelista o periodista?'},
  {id:'x-topics',group:'La actividad y la cobertura',text:'¿Qué temas cubrirá durante el encuentro?'},
  {id:'x-audience',group:'La actividad y la cobertura',text:'¿Para qué medio o audiencia publicará la información?'},
  {id:'x-output',group:'La actividad y la cobertura',text:'¿Qué material producirá al regresar: artículos, entrevistas, reportajes, videos o fotografías?'},
  {id:'x-assigned-by',group:'La actividad y la cobertura',text:'¿Quién le asignó esa cobertura y cómo se la comunicó?'},
  {id:'x-agenda',group:'La actividad y la cobertura',text:'¿Tiene una agenda, acreditación o programa del evento?'},
  {id:'x-legal-name',group:'El medio o la empresa que le envía',text:'¿Cuál es el nombre legal del medio o empresa?'},
  {id:'x-company-location',group:'El medio o la empresa que le envía',text:'¿Dónde está ubicado y desde cuándo opera?'},
  {id:'x-position',group:'El medio o la empresa que le envía',text:'¿Cuál es su cargo y a quién reporta?'},
  {id:'x-duties',group:'El medio o la empresa que le envía',text:'¿Qué funciones realiza normalmente?'},
  {id:'x-pay-during-trip',group:'El medio o la empresa que le envía',text:'¿La empresa le pagará durante el viaje o recibirá algún pago en Estados Unidos?'},
  {id:'x-proof',group:'El medio o la empresa que le envía',text:'¿Puede demostrar su empleo, sus ingresos y la asignación para el viaje?'},
  {id:'x-expenses',group:'El medio o la empresa que le envía',text:'¿Quién cubrirá cada gasto: pasaje, alojamiento, comidas y transporte?'},
  {id:'x-travel-dates',group:'El itinerario y el regreso',text:'¿Cuándo planea viajar y cuándo regresará?'},
  {id:'x-itinerary',group:'El itinerario y el regreso',text:'¿Cuál es su itinerario completo, incluyendo conexiones y ciudades?'},
  {id:'x-daily-plan',group:'El itinerario y el regreso',text:'¿Qué hará cada día durante su estadía?'},
  {id:'x-work-return',group:'El itinerario y el regreso',text:'¿Qué compromisos laborales tiene al regresar?'},
  {id:'x-why-return',group:'El itinerario y el regreso',text:'¿Por qué debe regresar a su país después del encuentro?'},
  {id:'x-ties',group:'El itinerario y el regreso',text:'¿Tiene responsabilidades familiares, laborales o profesionales que atender al regresar?'},
  {id:'x-address',group:'El hospedaje y los contactos',text:'¿Cuál es la dirección exacta donde se hospedará?'},
  {id:'x-booking',group:'El hospedaje y los contactos',text:'¿Quién hizo la reserva y quién la pagará?'},
  {id:'x-contact',group:'El hospedaje y los contactos',text:'¿Cuál es el nombre, teléfono y relación de su contacto en Estados Unidos?'},
  {id:'x-inviter-present',group:'El hospedaje y los contactos',text:'¿La persona que le invita estará presente en la actividad?'},
  {id:'x-knows-inviter',group:'El hospedaje y los contactos',text:'¿Conoce personalmente a quien le invita? ¿Desde cuándo?'},
  {id:'x-prior-travel',group:'Su trayectoria y sus viajes',text:'¿Ha viajado antes a Estados Unidos o a otros países?'},
  {id:'x-last-trip',group:'Su trayectoria y sus viajes',text:'¿Cuándo fue su último viaje y cuánto tiempo permaneció?'},
  {id:'x-refusals',group:'Su trayectoria y sus viajes',text:'¿Le han negado alguna visa anteriormente?'},
  {id:'x-intl-experience',group:'Su trayectoria y sus viajes',text:'¿Ha trabajado antes como periodista o comunicador en actividades internacionales?'},
  {id:'x-portfolio',group:'Su trayectoria y sus viajes',text:'¿Qué publicaciones o trabajos recientes puede mencionar como ejemplo?'},
];

export function nextGentleIndex(index:number,answer:string):number {
  if(index===6 && clearNo(answer))return 8;
  if(index===14 && clearNo(answer))return 16;
  return Math.min(index+1,GENTLE_QUESTIONS.length);
}

export type PracticeSetId = 'essential' | 'extended';
export type PracticeSet = {
  id:PracticeSetId;title:string;welcome:string;finished:string;
  questions:readonly GentleQuestion[];
};
export const PRACTICE_SETS: Readonly<Record<PracticeSetId,PracticeSet>> = {
  essential:{id:'essential',title:'Práctica Consular Amable',welcome:GENTLE_WELCOME,finished:GENTLE_FINISHED,questions:GENTLE_QUESTIONS},
  extended:{id:'extended',title:'Práctica ampliada',welcome:EXTENDED_WELCOME,finished:EXTENDED_FINISHED,questions:EXTENDED_QUESTIONS},
};

/** Next question of a set. Only the essential set has conditional skips. */
export function nextPracticeIndex(set:PracticeSetId,index:number,answer:string):number {
  return set==='essential'
    ? nextGentleIndex(index,answer)
    : Math.min(index+1,EXTENDED_QUESTIONS.length);
}

export type GentleProgress = {
  started:boolean;completed:boolean;paused:boolean;
  index:number;awaiting:boolean;answered:number;
  /** Which practice the latest session belongs to. */
  set:PracticeSetId;
};

/** Reanuda la última sesión privada; no mezcla preguntas del simulador documental. */
export function resumeGentlePractice(history:readonly GentleMessage[]):GentleProgress {
  let start=-1;
  let set:PracticeSetId='essential';
  for(let i=history.length-1;i>=0;i--){
    const message=history[i];
    if(message.role!=='model')continue;
    if(message.content===GENTLE_WELCOME){start=i;set='essential';break;}
    if(message.content===EXTENDED_WELCOME){start=i;set='extended';break;}
  }
  if(start<0)return {started:false,completed:false,paused:false,index:0,awaiting:false,answered:0,set:'essential'};
  const {questions,finished}=PRACTICE_SETS[set];
  let index=0,awaiting=false,answered=0,paused=false,completed=false;
  for(const message of history.slice(start+1)){
    if(message.role==='model'&&message.content===GENTLE_RESUMED){paused=false;continue;}
    // While paused, the same case history receives the documentary
    // simulator's turns; none of them belong to this practice.
    if(paused)continue;
    if(message.role==='model'){
      if(message.content===finished){completed=true;awaiting=false;continue;}
      if(message.content===GENTLE_PAUSED){paused=true;continue;}
      const q=questions.findIndex(item=>item.text===message.content);
      if(q>=0){index=q;awaiting=true;}
    }else if(awaiting){
      answered++;
      index=nextPracticeIndex(set,index,message.content);
      awaiting=false;
    }
  }
  return {started:true,completed,paused,index,awaiting,answered,set};
}
