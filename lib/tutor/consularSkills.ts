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
    fullName:[label('(?:Name Provided|Full Name in Native Language|nombre completo)')],
    birthDate:[label('(?:Date of Birth|Fecha de nacimiento)')],
    passportNumber:[label('(?:Passport\\/Travel Document Number|Passport Number|PASS|PASAPORTE)')],
    visaType:[label('(?:Purpose of Trip to the U\\.S\\. \\(1\\)|Visa Type|Tipo de visa)')],
    arrivalDate:[label('(?:Date of Arrival in U\\.S\\.|Fecha de llegada)')],
    departureDate:[label('(?:Date of Departure from U\\.S\\.|Fecha de salida)')],
    tripPayer:[label('(?:Person\\/Entity Paying for Your Trip|Quién paga)')],
    occupation:[label('(?:Primary Occupation|Ocupación actual)')],
    employer:[label('(?:Present Employer or School Name|Empleador)')],
    education:[label('(?:Name of Institution \\(1\\)|Institución educativa)')],
    usRelative:[label('(?:Relative Name \\(1\\)|Nombre del familiar)')],
    visaRefusal:[label('(?:Have you ever been refused a U\\.S\\. Visa[^\\n]*|Visa refusal|Denegación previa)')],
    usContact:[label('(?:Contact Person Name in the U\\.S\\.|Contacto en EE\\. UU\\.)')],
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

export type InterviewGrade = {
  outcome:'correct'|'retry'|'review'|'clarify';
  feedback:string;
  repeat:boolean;
};
/**
 * Never classify an applicant as dishonest merely because a document differs.
 * "retry" means reproduce a documented fact; "review" means investigate
 * ambiguity or updated real-world information.
 */
export function evaluateConsularAnswer(
  item:PreparedQuestion,
  answer:string,
  attempts:number,
):InterviewGrade {
  const spoken=answer.trim();
  if(!spoken || norm(spoken).length<2)
    return {outcome:'clarify',feedback:'No escuché una respuesta completa. Te pregunto de nuevo.',repeat:true};
  if(item.method==='explanation' &&
      /foreign media representative/.test(norm(item.expected||''))) {
    if(/\b(?:turism\w*|vacacion\w*|paseo|compras)\b/i.test(norm(spoken)) ||
      !/\b(prensa|periodismo|periodista|cobertura|reporter|corresponsal|medios|noticias|entrevista|congreso)\b/i.test(norm(spoken))) {
      return {outcome:attempts>=2?'review':'retry',
        feedback:'El documento indica una categoría de representante de medios. Tu respuesta no explica claramente esa actividad. Si el propósito real es otro, hay que revisar el DS-160, no inventar una explicación. '+(attempts<2?'¿Puedes aclararlo?':'Revisaremos este punto.'),
        repeat:attempts<2};
    }
  }
  if(!item.expected || item.status==='discrepancy' ||
     ['practice','explanation','reconcile'].includes(item.method)){
    if(norm(spoken).split(' ').length<4 && item.method!=='yesno')
      return {outcome:'clarify',feedback:'Dame un poco más de contexto con tus propias palabras.',repeat:attempts<2};
    return {outcome:'review',feedback:'Respuesta registrada. Comprueba que coincida con tu situación real y los documentos; continuemos.',repeat:false};
  }
  const expected=norm(item.expected),answerNorm=norm(spoken);
  let match=false;
  if(item.method==='date') match=normalizedDate(spoken)===normalizedDate(item.expected);
  else if(item.method==='yesno') match=(yes(spoken)&&yes(item.expected))||(no(spoken)&&no(item.expected));
  else if(item.method==='exact') {
    match=answerNorm===expected ||
      (answerNorm.length>=3 && expected.includes(answerNorm) && expected.length-answerNorm.length<12);
    if(item.id==='identity'){
      const tokens=(value:string)=>norm(value).split(' ').filter(Boolean).sort().join(' ');
      match=match || tokens(spoken)===tokens(item.expected);
    }
    if(item.id==='visa' && /foreign media representative/.test(expected)){
      match=match || /^(?:i|visa i|visa tipo i|representante de medios(?: extranjeros)?|visa de periodista)$/i.test(answerNorm);
    }
    if(item.id==='funding' && expected==='self') {
      match=match || /^(?:yo|yo misma|yo mismo|por mi cuenta|con mis propios fondos)$/.test(answerNorm);
    }
  }
  else {
    const words=expected.split(' ').filter(x=>x.length>3);
    match=(answerNorm.length>=4 && expected.includes(answerNorm)) ||
      (words.length>0 && words.filter(w=>answerNorm.includes(w)).length/words.length>=.65);
    if(item.id==='invitation' && match && answerNorm.split(' ').length<4) {
      return {outcome:attempts>=2?'review':'clarify',
        feedback:'Identificaste al organizador. Explica también qué actividad realizarás realmente durante la visita.',
        repeat:attempts<2};
    }
  }
  if(match)return {outcome:'correct',feedback:'Correcto. Continuemos.',repeat:false};
  if(attempts>=2)return {
    outcome:'review',feedback:'Tu respuesta no coincide con '+(item.source||'el documento')+
      '. El documento indica: '+item.expected+
      '. Comprueba cuál es el dato real y corrige el expediente si ha cambiado. Seguimos.',
    repeat:false,
  };
  return {
    outcome:'retry',feedback:'Tu respuesta difiere de '+(item.source||'los documentos')+
      '. Allí aparece: '+item.expected+
      '. Comprueba el dato antes de responder. Te lo preguntaré nuevamente.',
    repeat:true,
  };
}
