// Deterministic, non-LLM classifier: only single-field questions take the fast route.
// Values are never guessed. Document-derived candidates require owner verification.
export type CaseFactKey =
  | 'applicant_name' | 'date_of_birth' | 'nationality'
  | 'destination' | 'visa_type' | 'passport_number';

const FIELDS: { key: CaseFactKey; pattern: RegExp }[] = [
  { key:'date_of_birth', pattern:/\b(fecha\s+de\s+nacimiento|date\s+of\s+birth|cuando\s+naci[oó]|dob)\b/i },
  { key:'passport_number', pattern:/\b(n[uú]mero\s+de\s+pasaporte|passport\s+number)\b/i },
  { key:'visa_type', pattern:/\b(tipo\s+de\s+visa|clase\s+de\s+visa|categor[ií]a\s+de\s+visa|qu[eé]\s+visa|visa\s+(?:solicitad[ao]|estoy\s+solicitando))\b/i },
  { key:'nationality', pattern:/\b(nacionalidad|nationality)\b/i },
  { key:'destination', pattern:/\b(pa[ií]s\s+de\s+destino|destination\s+country)\b/i },
  { key:'applicant_name', pattern:/\b(nombre\s+(?:completo\s+)?(?:del\s+)?(?:aplicante|solicitante)|mi\s+nombre|c[oó]mo\s+me\s+llamo|full\s+name)\b/i },
];

function simple(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}

export function directFactKey(question: string): CaseFactKey | null {
  if (question.length < 5 || question.length > 160) return null;
  const q=simple(question);
  if (/\b(analiza|explica|revisa|verifica|compara|comparacion|contradiccion|informe|diferencia|porque|por que|detalles|varios|lista|ambos|y tambien|ademas|documento|carta|fuente|pagina)\b/i.test(q)) return null;
  const matched = FIELDS.filter(field => {
    const pattern = new RegExp(simple(field.pattern.source).replace(/\\/g,'\\'),'i');
    // Existing regular expressions use accented character alternatives. Run those
    // against the original question to preserve meaning (and the \b boundaries).
    return field.pattern.test(question) || pattern.test(q);
  });
  return matched.length === 1 ? matched[0].key : null;
}

const DATE_MATCH = [
  /\b(?:[0-2]?\d|3[01])\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+(?:19|20)\d{2}\b/i,
  /\b(?:19|20)\d{2}-\d{2}-\d{2}\b/,
  /\b(?:[0-2]?\d|3[01])[\s.-]+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)[A-Z]*[\s.,-]+(?:19|20)\d{2}\b/i,
  /\b(?:[0-2]?\d|3[01])\s+(?:JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(?:19|20)\d{2}\b/i,
];

const FIELD_LABELS: {key: CaseFactKey; label: RegExp}[] = [
  {key:'date_of_birth', label:/\b(?:date of birth|fecha de nacimiento|dob)\s*(?:\([^)]*\))?\s*[:\-]\s*/i},
  {key:'applicant_name',label:/\b(?:full name|nombre completo|applicant name|nombre del solicitante)\s*[:\-]\s*/i},
  {key:'visa_type',label:/\b(?:visa type|tipo de visa|visa class|clase de visa)\s*[:\-]\s*/i},
  {key:'nationality',label:/\b(?:nationality|nacionalidad)\s*[:\-]\s*/i},
  {key:'destination',label:/\b(?:destination country|pa[ií]s de destino)\s*[:\-]\s*/i},
  {key:'passport_number',label:/\b(?:passport number|n[uú]mero de pasaporte)\s*[:\-]\s*/i},
];

export function extractCaseFactCandidates(text: string):
  {fact_key: CaseFactKey; fact_value: string}[] {
  const rows: {fact_key: CaseFactKey; fact_value: string}[]=[];
  const seen=new Set<string>();
  for(const line of text.split(/\r?\n/)) {
    const normalized=line.replace(/[\u0000-\u001f]/g,' ').trim();
    if(!normalized || normalized.length>450) continue;
    for(const field of FIELD_LABELS) {
      const match=field.label.exec(normalized);
      if(!match) continue;
      let value=normalized.slice(match.index+match[0].length).trim()
        .replace(/^[*"' ]+|[*"' ]+$/g,'').slice(0,400);
      if(field.key === 'date_of_birth') {
        value=DATE_MATCH.map(pattern=>value.match(pattern)?.[0]).find(Boolean)||'';
      } else {
        // Reject ambiguous descriptions, unseen values and multi-field lines.
        if(/[|;]/.test(value) || value.length>120 || value.includes('[ilegible]') ||
           /^(?:none|n\/a|unknown|not available|no indicado|sin dato)$/i.test(value)) value='';
      }
      if(!value) continue;
      const signature=field.key+'\x00'+value.toLowerCase();
      if(!seen.has(signature)) {
        rows.push({fact_key:field.key,fact_value:value});
        seen.add(signature);
      }
    }
  }
  return rows.slice(0,20);
}
