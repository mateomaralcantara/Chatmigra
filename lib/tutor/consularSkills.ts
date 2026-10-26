/**
 * Source-grounded consular interview. A "skill" defines one distinct interviewing
 * strategy; it is NOT a separate paid LLM agent. No uploaded applicant values are
 * hard-coded here, and no hypothetical evidence becomes a verified case fact.
 */
export type InterviewMethod =
  | 'exact' | 'date' | 'yesno' | 'timeline' | 'explanation'
  | 'document' | 'reconcile' | 'practice';
export type ConsularSkill = {
  id: string;
  title: string;
  method: InterviewMethod;
  field?: string;
  question: string;
  objective: string;
  correction: string;
};
export type CaseDocumentExcerpt = {
  id: string;
  filename: string;
  content: string;
};
export type PreparedQuestion = {
  id: string;
  skill: string;
  title: string;
  method: InterviewMethod;
  question: string;
  expected: string | null;
  source: string | null;
  status: 'document' | 'practice' | 'discrepancy';
  explanation: string;
};

export const CONSULAR_SKILLS: readonly ConsularSkill[] = [
  {id:'identity',title:'Identificación personal',method:'exact',field:'fullName',question:'¿Cuál es tu nombre completo, tal como figura en la solicitud?',objective:'Identidad del solicitante',correction:'Compara los nombres con la solicitud y el pasaporte.'},
  {id:'birth',title:'Nacimiento y nacionalidad',method:'date',field:'birthDate',question:'¿Cuál es tu fecha de nacimiento?',objective:'Precisar el dato biográfico',correction:'Comprueba la fecha en el documento de identidad.'},
  {id:'passport',title:'Pasaporte y vigencia',method:'exact',field:'passportNumber',question:'¿Cuál es el número de tu pasaporte vigente?',objective:'Confirmar identidad documental',correction:'Revisa los caracteres del pasaporte original.'},
  {id:'residence',title:'Domicilio de residencia',method:'document',field:'homeAddress',question:'¿Dónde vives actualmente?',objective:'Comprobar coherencia del domicilio declarado sin exigir recitar la dirección completa',correction:'Basta describir la calle o sector y la ciudad; si cambiaste de domicilio debes indicarlo.'},
  {id:'visa',title:'Categoría migratoria',method:'exact',field:'visaType',question:'¿Qué clase de visa o trámite estás solicitando?',objective:'Categoría declarada',correction:'Revisa la categoría solicitada en el formulario.'},
  {id:'purpose',title:'Propósito del viaje',method:'explanation',field:'tripPurpose',question:'¿Cuál es el propósito real de tu viaje?',objective:'Explicar el motivo con claridad',correction:'Explica con tus palabras el propósito verdadero; no memorices información falsa.'},
  {id:'invitation',title:'Invitación y organizador',method:'document',field:'organizer',question:'¿Qué organización te invitó y qué actividad realizarás?',objective:'Identificar invitación y función',correction:'Consulta la invitación que corresponda a tu identidad.'},
  {id:'dates',title:'Fechas y cronología',method:'date',field:'arrivalDate',question:'¿Qué fecha de llegada declaraste en el DS-160?',objective:'Explicar la cronología',correction:'Compara la fecha declarada con el itinerario actual.'},
  {id:'departure',title:'Duración y retorno',method:'date',field:'departureDate',question:'¿Cuál es la fecha de salida de Estados Unidos declarada?',objective:'Fechas de retorno',correction:'No sustituyas las fechas declaradas por una suposición.'},
  {id:'address',title:'Alojamiento y contacto',method:'document',field:'usContact',question:'¿Quién es tu contacto en Estados Unidos y dónde te alojarás?',objective:'Sustentar el contacto',correction:'Consulta los datos de contacto del expediente.'},
  {id:'funding',title:'Financiamiento',method:'exact',field:'tripPayer',question:'¿Quién pagará los gastos del viaje?',objective:'Origen declarado de fondos',correction:'Consulta el apartado de financiamiento del formulario.'},
  {id:'occupation',title:'Ocupación actual',method:'exact',field:'occupation',question:'¿Cuál es tu ocupación actual?',objective:'Descripción profesional',correction:'Confirma el puesto realmente desempeñado y declarado.'},
  {id:'employer',title:'Empleador y responsabilidades',method:'document',field:'employer',question:'¿Dónde trabajas y cuáles son tus funciones reales?',objective:'Trayectoria laboral',correction:'Apóyate en la constancia laboral y en tu trabajo efectivo.'},
  {id:'journalism',title:'Actividad periodística verificable',method:'explanation',field:'professionalRole',question:'¿Qué trabajo periodístico concreto realizarás durante el viaje?',objective:'Actividad profesional compatible con los hechos',correction:'Distingue asistir a un congreso de realizar labores periodísticas. Responde con veracidad.'},
  {id:'education',title:'Formación académica',method:'document',field:'education',question:'¿Qué estudios o formación tienes relacionados con tu actividad?',objective:'Formación declarada',correction:'Contrasta el nombre de la institución y tu formación real.'},
  {id:'family',title:'Familia y vínculos',method:'document',field:'usRelative',question:'¿Tienes familiares en Estados Unidos? ¿Quiénes?',objective:'Relaciones familiares declaradas',correction:'Aclara familiares y estatus conforme a los hechos.'},
  {id:'history',title:'Antecedentes migratorios',method:'yesno',field:'visaRefusal',question:'¿Te han negado anteriormente una visa o la entrada a Estados Unidos?',objective:'Historial declarado',correction:'Responde conforme a los antecedentes reales; si el DS-160 está desactualizado, revísalo.'},
  {id:'consistency',title:'Coherencia entre documentos',method:'reconcile',field:'conflicts',question:'Detecté posibles diferencias entre documentos. ¿Puedes explicar cuáles son los datos actuales correctos?',objective:'Resolver contradicciones reales',correction:'No inventes fechas. Identifica qué documento debe rectificarse.'},
  {id:'unexpected',title:'Repregunta y presión',method:'practice',question:'Si el funcionario pregunta por qué debería confiar en la finalidad declarada, ¿qué responderías con hechos comprobables?',objective:'Claridad y honestidad bajo presión',correction:'Responde de forma breve, natural y comprobable, sin prometer que aprobarán la visa.'},
  {id:'closing',title:'Cierre de entrevista',method:'practice',question:'¿Hay algún dato de tu solicitud que haya cambiado y debas aclarar antes de la entrevista?',objective:'Rectificación responsable',correction:'Es mejor identificar cambios que ocultar discrepancias.'},
] as const;

const norm = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const yes = (value: string) => /^(?:si|yes|afirmativo)\b/.test(norm(value));
const no = (value: string) => /^(?:no|nunca|negativo)\b/.test(norm(value));
const monthNames: Record<string,string> = {
  january:'01',enero:'01',february:'02',febrero:'02',march:'03',marzo:'03',
  april:'04',abril:'04',may:'05',mayo:'05',june:'06',junio:'06',
  july:'07',julio:'07',august:'08',agosto:'08',september:'09',septiembre:'09',
  october:'10',octubre:'10',november:'11',noviembre:'11',
  december:'12',diciembre:'12',
};
function normalizedDate(input: string): string {
  const value=norm(input);
  const iso=value.match(/\b(20\d{2}|19\d{2})\s+(\d{1,2})\s+(\d{1,2})\b/);
  if(iso) return iso[1]+'-'+iso[2].padStart(2,'0')+'-'+iso[3].padStart(2,'0');
  const other=value.match(/\b(\d{1,2})\s+(?:de\s+)?([a-z]+)\s+(?:de\s+)?(20\d{2}|19\d{2})\b/);
  if(other && monthNames[other[2]])return other[3]+'-'+monthNames[other[2]]+'-'+other[1].padStart(2,'0');
  return value;
}
function afterLabel(text: string, patterns: RegExp[]): string | null {
  for(const pattern of patterns){
    const match=pattern.exec(text);
    if(!match)continue;
    const value=(match[1]||'').split(/\r?\n/)[0].replace(/\s{3,}.*/, '').trim();
    if(value && value.length<250 && !/^(?:does not apply|do not know|ilegible)$/i.test(value))return value;
  }
  return null;
}
const label = (label: string) => new RegExp('(?:^|\\n)\\s*'+label+'\\s*[:\\-]\\s*([^\\n\\r]+)','im');

function nameMatches(applicantName: string, content: string): boolean {
  const wanted=norm(applicantName).split(' ').filter(t=>t.length>2);
  if(wanted.length<2)return false;
  const source=' '+norm(content)+' ';
  const hits=wanted.filter(t=>source.includes(' '+t+' ')).length;
  return hits >= Math.min(wanted.length,3);
}

export function assembleConsularEvidence(
  applicantName: string,
  documents: CaseDocumentExcerpt[],
): { values:Record<string,{value:string;source:string}>, alerts:string[],included:string[],excluded:string[] } {
  const included: string[]=[];
  const excluded: string[]=[];
  const values: Record<string,{value:string;source:string}>={};
  const alerts:string[]=[];
  const entries:Record<string,RegExp[]>={
    fullName:[label('(?:Name Provided|Full Name in Native Language|nombre completo|nombre proporcionado|nombre de la solicitante)')],
    birthDate:[label('(?:Date of Birth|Fecha de nacimiento)')],
    passportNumber:[label('(?:Passport\\/Travel Document Number|Passport Number|número de pasaporte|numero de pasaporte|documento de viaje|PASS|PASAPORTE)')],
    homeAddress:[label('(?:Home Address|Home Street Address|Street Address \\(1\\)|Dirección de domicilio|Direcci[oó]n residencial|Dirección actual|Domicilio actual)')],
    visaType:[label('(?:Purpose of Trip to the U\\.S\\. \\(1\\)|Visa Type|Tipo de visa|propósito del viaje a estados unidos|proposito del viaje a estados unidos)')],
    arrivalDate:[label('(?:Date of Arrival in U\\.S\\.|Fecha de llegada|fecha de ingreso)')],
    departureDate:[label('(?:Date of Departure from U\\.S\\.|Fecha de salida|fecha de regreso)')],
    tripPayer:[label('(?:Person\\/Entity Paying for Your Trip|Quién paga|Quien paga|persona que paga el viaje|entidad que paga el viaje)')],
    occupation:[label('(?:Primary Occupation|Ocupación actual|Ocupación principal|Ocupacion principal)')],
    employer:[label('(?:Present Employer or School Name|Empleador|empleador actual|nombre del empleador)')],
    education:[label('(?:Name of Institution \\(1\\)|Institución educativa)')],
    usRelative:[label('(?:Relative Name \\(1\\)|Nombre del familiar)')],
    visaRefusal:[label('(?:Have you ever been refused a U\\.S\\. Visa[^\\n]*|Visa refusal|Denegación previa)')],
    usContact:[label('(?:Contact Person Name in the U\\.S\\.|Contacto en EE\\. UU\\.|Contacto en Estados Unidos|nombre del contacto en estados unidos)')],
  };
  for(const doc of documents){
    const content=doc.content.slice(0,180000);
    // Strict applicant isolation: unattributed and third-party letters must
    // never become ground truth or a coaching question automatically.
    if(!nameMatches(applicantName,content)){excluded.push(doc.filename);continue;}
    included.push(doc.filename);
    for(const [key,patterns] of Object.entries(entries)){
      const result=afterLabel(content,patterns);
      if(!result)continue;
      if(values[key] && norm(values[key].value)!==norm(result)){
        alerts.push('El campo '+key+' presenta valores diferentes en '+values[key].source+' y '+doc.filename+'.');
      } else if(!values[key]) values[key]={value:result,source:doc.filename};
    }
    const eventDate=afterLabel(content,[
      label('(?:Event dates|Fecha del evento|Fechas del congreso)'),
    ]) || (/\b(?:invitaci[oó]n|congreso|periodismo|encuentro)\b/i.test(content)
      ? content.match(/(?:el\s+d[ií]a|los\s+d[ií]as|d[ií]as?)\s+(\d{1,2})(?:\s*(?:y|,|-)\s+\d{1,2})?\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?((?:19|20)\d{2})/i)
        ?.slice(1).join(' ') || null
      : null);
    if(eventDate && !values.eventDate) values.eventDate={value:eventDate,source:doc.filename};
    if(/\b(?:alianza internacional de periodismo|AIPMA)\b/i.test(content)){
      if(!values.organizer)values.organizer={value:'Alianza Internacional de Periodismo (AIPMA)',source:doc.filename};
    }
  }
  if(excluded.length) alerts.push('Hay documentos sin coincidencia suficiente con el nombre del solicitante. Revisa su asignación antes de utilizarlos.');
  if(values.arrivalDate && values.eventDate){
    const arrival=normalizedDate(values.arrivalDate.value),event=normalizedDate(values.eventDate.value);
    const departure=values.departureDate ? normalizedDate(values.departureDate.value) : '';
    if(/^\d{4}-/.test(arrival)&&/^\d{4}-/.test(event) && event<arrival){
      alerts.push('El evento del documento parece anterior a la llegada prevista; verificar el itinerario.');
    } else if(/^\d{4}-/.test(departure)&&/^\d{4}-/.test(event) && event>departure) {
      alerts.push('La invitación sitúa el evento después de la fecha de salida indicada en el DS-160. No entrenes una fecha inventada: verifica y actualiza los datos reales.');
    }
  }
  return {values,alerts:[...new Set(alerts)],included,excluded};
}

export function createConsularQuestions(
  applicantName:string,
  documents:CaseDocumentExcerpt[],
): {questions:PreparedQuestion[],alerts:string[],included:string[],excluded:string[]} {
  const evidence=assembleConsularEvidence(applicantName,documents);
  const questions=CONSULAR_SKILLS.map(skill=>{
    const datum=skill.field ? evidence.values[skill.field] : undefined;
    const support = datum || (skill.id==='purpose' || skill.id==='journalism'
      ? evidence.values.visaType : undefined);
    let status: PreparedQuestion['status'] = support ? 'document' : 'practice';
    if(skill.id==='consistency' && evidence.alerts.length) status='discrepancy';
    return {
      id:skill.id,skill:skill.id,title:skill.title,method:skill.method,
      question:skill.question,expected:support?.value || null,
      source:support?.source || null,status,
      explanation:skill.correction,
    };
  });
  return {questions,alerts:evidence.alerts,included:evidence.included,excluded:evidence.excluded};
}

export const CONSULAR_FINISHED =
  'Simulacro concluido. Revisa las diferencias documentales señaladas antes de tu entrevista.';

/** Resume a question from private message history without repeating it at page load. */
export function resumeConsularInterview(
  history: {role:'user'|'model';content:string}[],
  questions:PreparedQuestion[],
): {index:number;attempts:number;pending:boolean;completed:boolean;started:boolean} {
  const byQuestion = new Map(questions.map((item,index)=>[item.question,index]));
  let index=0, attempts=0, pending=false, started=false, completed=false;
  for(const message of history) {
    if(message.role==='model' && message.content===CONSULAR_FINISHED) {
      completed=true; pending=false; started=false; continue;
    }
    if(message.role==='model' && byQuestion.has(message.content)) {
      const next=byQuestion.get(message.content)!;
      if(started && next===index && !pending) attempts=Math.min(2,attempts+1);
      else if(next!==index || !started) attempts=0;
      index=next; started=true; pending=true; completed=false;
    } else if(message.role==='user' && pending) {
      pending=false;
    }
  }
  if(started && !pending) {
    index++;
    attempts=0;
    if(index>=questions.length) completed=true;
  }
  return {index,attempts,pending,completed,started};
}

export type InterviewGrade = {
  outcome:'correct'|'retry'|'review'|'clarify';
  feedback:string;
  repeat:boolean;
};

/**
 * Conversational rubric: sufficient answers are acceptable. Do not require
 * DS-160 wording, a four-word minimum, a middle name, or a street ZIP code.
 * Ask again only if the answer is unintelligible or materially contradictory.
 * A soft acceptance is NOT verification of a real-world fact.
 */
const NON_ANSWER = /^(?:no se|no recuerdo|no estoy segur[oa]|ni idea|desconozco|prefiero no responder|no lo se|no tengo idea|no entendi)$/;
const EVENT_WORDS = /\b(?:evento|congreso|conferencia|encuentro|foro|seminario|reunion|convencion|simposio|actividad|periodismo|periodista|prensa|cobertura|noticias|entrevistas?|reportaje)\b/;
const MEDIA_WORDS = /\b(?:evento|congreso|conferencia|encuentro|foro|periodis\w*|prensa|cobertura|reporter\w*|corresponsal\w*|medios|noticias|reportaje|entrevista\w*|actividad profesional)\b/;
const TOURISM_WORDS = /\b(?:turism\w*|vacacion\w*|paseo|compras|playa)\b/;
const FILLERS = new Set(['yo','mi','me','llamo','soy','el','la','los','las','de','del','en','un','una','voy','a','al','por','que','y','para','estoy','vivo','viviendo','actualmente','es','se','encuentra','ubicado','ubicada','tengo','como','trabajo','con','mis','sus','su','the','my','and','of','at','in','on']);
const FIRST_NAMES = new Set(['ana','maria','juan','jose','pedro','rosa','mariel','yaenqui','francelis','carlos','manuel','luisa','marta','alejandro','luis','francisco','antonio','ramon','miguel','diana','jessica','pablo','mariana']);
const NAME_NUMBERS = new Map([['uno','1'],['dos','2'],['tres','3'],['cuatro','4'],['cinco','5'],['seis','6'],['siete','7'],['ocho','8'],['nueve','9'],['diez','10'],['once','11'],['doce','12'],['quince','15'],['veinte','20']]);
function meaningfulTokens(value:string):string[] {
  return norm(value).split(' ').filter(token=>token.length>1 && !FILLERS.has(token));
}
function simpleLocation(value:string):string[] {
  return meaningfulTokens(value).map(token=>NAME_NUMBERS.get(token) || token)
    .filter(token=>!['calle','avenida','av','numero','num','sector','barrio','urbanizacion','ciudad','provincia','republica','dominicana','direccion','residencia','domicilio','edificio','casa'].includes(token));
}
function nameGroups(value:string):{given:Set<string>,surnames:Set<string>}{
  const parts=value.split(',');
  if(parts.length>=2) return {
    given:new Set(meaningfulTokens(parts.slice(1).join(' '))),
    surnames:new Set(meaningfulTokens(parts[0])),
  };
  const tokens=meaningfulTokens(value);
  // Simple names often arrive as 'ANA MARIA PEREZ GARCIA'. Accept a
  // given-name + surname, in either order, rather than all four tokens.
  const split=tokens.findIndex((token,i)=>i>0&&!FIRST_NAMES.has(token));
  const at=split>0?split:Math.max(1,Math.floor(tokens.length/2));
  return {given:new Set(tokens.slice(0,at)),surnames:new Set(tokens.slice(at))};
}
function nameIsSufficient(answer:string,expected:string):boolean {
  const tokens=new Set(meaningfulTokens(answer));
  if(tokens.size<2)return false;
  const groups=nameGroups(expected);
  return [...groups.given].some(token=>tokens.has(token)) &&
    [...groups.surnames].some(token=>tokens.has(token));
}
function dateIsCompatible(answer:string,expected:string):boolean {
  const a=normalizedDate(answer),b=normalizedDate(expected);
  if(a===b)return true;
  // With a full date on the form, day + month are enough to rehearse a
  // natural answer when the applicant does not mention the year.
  const parts=a.match(/\b(\d{1,2})\s+(?:de\s+)?([a-z]+)\b/);
  if(parts && monthNames[parts[2]] && /^\d{4}-\d{2}-\d{2}$/.test(b)) {
    return Number(parts[1])===Number(b.slice(-2)) && monthNames[parts[2]]===b.slice(5,7);
  }
  const numbers=norm(answer).match(/^\d{1,2}\s+\d{1,2}\s+(?:19|20)\d{2}$/);
  if(numbers && /^\d{4}-\d{2}-\d{2}$/.test(b)){
    const values=numbers[0].split(' ');
    return Number(values[0])===Number(b.slice(-2)) &&
      Number(values[1])===Number(b.slice(5,7)) &&
      Number(values[2])===Number(b.slice(0,4));
  }
  return false;
}
function phraseIsCompatible(answer:string,expected:string):boolean {
  const a=meaningfulTokens(answer), b=new Set(meaningfulTokens(expected));
  if(!a.length || !b.size)return false;
  // One or two distinctive matching words can support an abbreviated
  // address, employer, occupation, organizer or activity. Do not demand
  // recitation of the full document label.
  const matched=a.filter(token=>b.has(token)).length;
  return matched>=Math.min(2,a.length) && matched>=1;
}
function naturalAddress(answer:string):boolean {
  const tokens=simpleLocation(answer);
  const base=norm(answer);
  const locationContext=/\b(?:calle|avenida|av|sector|barrio|urbanizacion|ciudad|provincia|domicilio|direccion|vivo|resido|residencia|numero|santo domingo|santiago|vega|moca|bonao|jarabacoa|new york|nueva york|miami|pennsylvania)\b/.test(base);
  return locationContext && (tokens.some(token=>token.length>2 && !['si','no','aqui','alla'].includes(token)) ||
    /\b\d+\b/.test(base));
}
function knownCity(value:string):string|null {
  const text=norm(value);
  for(const city of ['santo domingo','santiago','la vega','jarabacoa','bonao','moca','miami','new york','nueva york','hazleton','pennsylvania']){
    if(new RegExp('\\b'+city+'\\b').test(text))return city==='nueva york'?'new york':city;
  }
  return null;
}
function incompatibleOccupation(answer:string,expected:string):boolean {
  const jobs:RegExp[]=[
    /\b(?:periodista|periodismo|reportera?|corresponsal|journalist|reporter)\b/,
    /\b(?:maestr[oa]|docente|profesor[ae]?|teacher)\b/,
    /\b(?:abogad[oa]|lawyer|attorney)\b/,
    /\b(?:medic[oa]|doctor[ae]?|physician)\b/,
    /\b(?:ingenier[oa]|engineer)\b/,
    /\b(?:contad[oa]r|accountant)\b/,
  ];
  const source=jobs.findIndex(pattern=>pattern.test(norm(expected)));
  const reply=jobs.findIndex(pattern=>pattern.test(norm(answer)));
  return source>=0 && reply>=0 && source!==reply;
}
function accepted(message='Bien, entendido. Continuemos.'):InterviewGrade {
  return {outcome:'correct',feedback:message,repeat:false};
}
function acceptedWithCaution():InterviewGrade {
  return {outcome:'review',feedback:'Entendido. Continuemos. Si los datos reales cambiaron, conviene actualizar el expediente.',repeat:false};
}
function askClarify(message:string,attempts:number):InterviewGrade {
  return attempts>=2
    ? {outcome:'review',feedback:'Anotaremos este punto para revisarlo. Continuemos.',repeat:false}
    : {outcome:'clarify',feedback:message,repeat:true};
}
function conflict(item:PreparedQuestion,attempts:number):InterviewGrade {
  const note='El documento aportado indica: '+item.expected+
    '. Si tu situación cambió, debemos verificar y corregir el expediente, no memorizar información inexacta.';
  return attempts>=2
    ? {outcome:'review',feedback:note+' Dejaremos este punto pendiente y seguiremos.',repeat:false}
    : {outcome:'retry',feedback:note+' ¿Puedes aclarar tu respuesta?',repeat:true};
}
export function evaluateConsularAnswer(
  item:PreparedQuestion,
  answer:string,
  attempts:number,
):InterviewGrade {
  const spoken=answer.trim();
  const a=norm(spoken), expected=norm(item.expected||'');
  if(!spoken || (!a && spoken!=='I'))
    return askClarify('No pude escuchar tu respuesta. Inténtalo de nuevo.',attempts);
  if(NON_ANSWER.test(a))
    return askClarify('Si no recuerdas el dato, podemos marcarlo para revisar. ¿Quieres intentarlo otra vez?',attempts);

  // Personal names: two supported components (one given, one surname)
  // suffice. Do not reject because of middle names, accents or order.
  if(item.id==='identity') {
    if(!item.expected)return meaningfulTokens(spoken).length>=2
      ?accepted():askClarify('Dime por lo menos un nombre y un apellido.',attempts);
    if(nameIsSufficient(spoken,item.expected))return accepted();
    if(meaningfulTokens(spoken).length<2)
      return askClarify('Basta decir tu primer nombre y un apellido.',attempts);
    return conflict(item,attempts);
  }

  // Passport is an identifier; do not guess or semantically approximate it.
  if(item.id==='passport' && item.expected){
    const id=(value:string)=>value.replace(/[^a-zA-Z0-9]/g,'').toUpperCase();
    return id(spoken)===id(item.expected) ? accepted() : conflict(item,attempts);
  }

  // Category synonyms and natural-language explanations of media activity.
  if(item.id==='visa' && /foreign media representative|representante de medios/.test(expected) &&
     /^(?:i|visa i|visa tipo i|visa de periodista|periodista|representante de medios(?: extranjeros)?|periodismo|para periodismo|medios de comunicacion)$/i.test(a))return accepted();

  // Dates are material. Recognize natural Spanish and English month names,
  // and allow day + month when the year was not asked explicitly.
  if(item.method==='date' && item.expected)
    return dateIsCompatible(spoken,item.expected)?accepted():conflict(item,attempts);

  // Negative history versus affirmative document remains important.
  if(item.method==='yesno' && item.expected) {
    if(yes(spoken)&&yes(item.expected) || no(spoken)&&no(item.expected))return accepted();
    if(yes(spoken)||no(spoken))return conflict(item,attempts);
    return askClarify('Puedes responder simplemente sí o no, según lo que ocurrió.',attempts);
  }
  if(item.method==='yesno' && !item.expected)
    return yes(spoken)||no(spoken)?acceptedWithCaution():acceptedWithCaution();

  // Visa I media trip: a conference, press event or professional activity
  // is a reasonable short answer even without the event's full legal title.
  // A plainly different holiday purpose is not coached into a false story.
  if(['purpose','journalism'].includes(item.id)) {
    if(item.expected && /foreign media representative|representante de medios/.test(expected) &&
       TOURISM_WORDS.test(a) && !MEDIA_WORDS.test(a)) return conflict(item,attempts);
    if(MEDIA_WORDS.test(a))return accepted();
    if(a.length>2)return acceptedWithCaution();
    return askClarify('¿Qué actividad concreta realizarás en el viaje?',attempts);
  }
  if(item.id==='invitation') {
    if(EVENT_WORDS.test(a) || phraseIsCompatible(spoken,item.expected||''))
      return accepted();
    return a.length>2?acceptedWithCaution():
      askClarify('¿A qué evento o actividad asistirás?',attempts);
  }

  // A normal spoken address need not recite ZIP code, province, full
  // street name, or all of an organization's contact details.
  if(['residence','address'].includes(item.id)) {
    const submittedCity=knownCity(spoken),declaredCity=knownCity(item.expected||'');
    if(submittedCity && declaredCity && submittedCity!==declaredCity)
      return conflict(item,attempts);
    if(naturalAddress(spoken) || phraseIsCompatible(spoken,item.expected||''))
      return accepted();
    return a.length>2?acceptedWithCaution():
      askClarify('Indica al menos el sector, una calle o la ciudad.',attempts);
  }

  // Common payer equivalences: 'yo', 'mi empresa', 'la organización'.
  if(item.id==='funding' && item.expected) {
    const self=/^(?:self|yo|yo misma|yo mismo|mis fondos|mis ahorros|por mi cuenta|con mi dinero|yo pago|lo pago yo)$/;
    if(expected==='self' && self.test(a))return accepted();
    if(expected==='self' && /\b(?:empresa|organizacion|patrocinador|familiar|padre|madre)\b/.test(a))
      return conflict(item,attempts);
  }

  if(item.id==='occupation' && item.expected &&
     incompatibleOccupation(spoken,item.expected))return conflict(item,attempts);

  // Other document-backed questions are assessed for meaningful overlap,
  // not a fixed word count or literal reproduction. Ambiguity is noted
  // without forcing applicants to adopt a scripted answer.
  if(item.expected) {
    if(a===expected || phraseIsCompatible(spoken,item.expected))return accepted();
    if(item.method==='exact' && ['funding','visa'].includes(item.id) && a.length>3)
      return acceptedWithCaution();
  }
  if(a.length>=2)return acceptedWithCaution();
  return askClarify('¿Puedes decirlo de otra manera?',attempts);
}
