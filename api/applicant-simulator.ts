import { requireAuthenticatedUser, type RequestLike } from '../server/supabase';
import { createConsularQuestions, type CaseDocumentExcerpt } from '../lib/tutor/consularSkills';

interface Request extends RequestLike { method?: string; body?: unknown }
interface Response {
  status(code:number): Response;
  json(value:unknown): void;
  setHeader?(name:string,value:string):void;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function bodyObject(raw:unknown): Record<string,unknown> {
  try {
    const input=typeof raw==='string' ? JSON.parse(raw) : raw;
    return input && typeof input==='object' && !Array.isArray(input)
      ? input as Record<string,unknown> : {};
  } catch {return {};}
}
export default async function handler(req:Request,res:Response) {
  res.setHeader?.('Cache-Control','no-store, private');
  if(req.method!=='POST')return res.status(405).json({error:'Método no permitido.'});
  const auth=await requireAuthenticatedUser(req);
  if(!auth)return res.status(401).json({error:'Debes iniciar sesión.'});
  const body=bodyObject(req.body);
  const caseId=typeof body.caseId==='string'?body.caseId:'';
  const inputIds=body.documentIds;
  if(!UUID.test(caseId) || !Array.isArray(inputIds) || inputIds.length<1 ||
    inputIds.length>4 || inputIds.some(id=>typeof id!=='string'||!UUID.test(id)) ||
    new Set(inputIds).size!==inputIds.length) {
    return res.status(400).json({error:'Selecciona entre uno y cuatro documentos válidos.'});
  }
  // No service_role: each profile, document and chunk is individually scoped
  // by the authenticated caller's case RLS.
  const {data:caseRow,error:caseError}=await auth.supabase.from('applicant_cases')
    .select('id,applicant_name').eq('id',caseId).maybeSingle();
  if(caseError || !caseRow)return res.status(403).json({error:'No tienes acceso a este expediente.'});
  const ids=inputIds as string[];
  const {data:docRows,error:docError}=await auth.supabase.from('applicant_case_documents')
    .select('id,filename').eq('case_id',caseId).in('id',ids).limit(4);
  if(docError || !docRows || docRows.length!==ids.length)
    return res.status(403).json({error:'Algún documento no pertenece a este expediente.'});
  const pieces=await Promise.all(docRows.map(async doc => {
    const {data,error}=await auth.supabase.from('applicant_case_document_chunks')
      .select('content').eq('case_id',caseId).eq('document_id',doc.id)
      .order('chunk_index',{ascending:true}).limit(150);
    if(error)return {id:doc.id,filename:doc.filename,content:'',ready:false};
    return {id:doc.id,filename:doc.filename,
      content:(data||[]).map(chunk=>String(chunk.content||'')).join('\n'),
      ready:Boolean(data?.length)};
  }));
  const available:CaseDocumentExcerpt[]=pieces.filter(doc=>doc.ready)
    .map(({id,filename,content})=>({id,filename,content}));
  if(!available.length) {
    return res.status(409).json({
      error:'Prepara la búsqueda rápida de los documentos antes de generar el simulacro. La preparación utiliza la cuota autorizada.',
    });
  }
  const generated=createConsularQuestions(String(caseRow.applicant_name),available);
  if(!generated.included.length) return res.status(422).json({
    error:'Ningún documento indexado coincide claramente con la identidad de este solicitante. Revisa la asignación de los archivos antes de entrenar.',
  });
  const unindexed=pieces.filter(doc=>!doc.ready).map(doc=>doc.filename);
  return res.status(200).json({
    ...generated,
    unindexed,
    count:generated.questions.length,
    // Avoid the false impression that extracted content is verified.
    notice:'La comparación se basa en documentos aportados, no en hechos gubernamentales confirmados. Debes corregir cualquier dato que ya no refleje la realidad.',
  });
}
