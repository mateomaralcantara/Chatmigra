import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { supabase } from '../services/supabaseClient';
import { naturalSpanishSpeech } from '../../lib/tutor/interview';
import GentlePractice from './GentlePractice';
import { evaluateConsularAnswer, resumeConsularInterview, CONSULAR_FINISHED, type PreparedQuestion } from '../../lib/tutor/consularSkills';
import ApplicantCaseTasks from './ApplicantCaseTasks';
import TutorCaseManager from './tutor/TutorCaseManager';
import TutorComposer from './tutor/TutorComposer';
import { useCaseManagement } from './tutor/useCaseManagement';
import TutorDocumentsBar from './tutor/TutorDocumentsBar';
import TutorMessages from './tutor/TutorMessages';
import {
  BUCKET, LIMIT, FILE_TYPES, currentCaseId, routeToCase, loggedInUser, recognitionConstructor, exactFactReply, splitTutorHistory,
  type CaseRow, type SimulatorRun, type FactRow, type DocRow, type MessageRow, type Mode, type RecognitionEngine,
} from './tutor/tutorShared';

export default function ApplicantTutorChat() {
  const [mode, setMode] = useState<Mode>('chat');
  const [simulator, setSimulator] = useState<SimulatorRun | null>(null);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [caseId, setCaseId] = useState(currentCaseId);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [indexedIds, setIndexedIds] = useState<string[]>([]);
  const [facts, setFacts] = useState<FactRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [previousMessages, setPreviousMessages] = useState<MessageRow[]>([]);
  const [question, setQuestion] = useState('');
  // La práctica guiada es la pantalla de entrada del Tutor.
  // El simulacro documental sigue disponible desde «Volver al Tutor».
  const [gentleOpen, setGentleOpen] = useState(() => Boolean(currentCaseId()));
  const gentleOpenRef = useRef(Boolean(currentCaseId()));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [olderAvailable, setOlderAvailable] = useState(false);
  const [replyIncomplete, setReplyIncomplete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<RecognitionEngine | null>(null);
  const voiceOnRef = useRef(false);
  const voiceDraftRef = useRef('');
  const voiceSessionRef = useRef('');
  const voiceDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceRestartRef = useRef(0);
  const busyRef = useRef(false);
  const activeCaseRef = useRef(caseId);
  const messagesRef = useRef<MessageRow[]>([]);
  const startingSimulatorCasesRef = useRef(new Set<string>());
  const simulatorRef = useRef<SimulatorRun | null>(null);
  const caseProfilesRef = useRef<CaseRow[]>([]);
  const loggedUserRef = useRef('');
  const mountedRef = useRef(true);
  // React.StrictMode carga el componente dos veces en desarrollo. Evitar
  // que ambas cargas creen dos expedientes nuevos para un mismo solicitante.
  const initialCaseRequestRef = useRef<Promise<CaseRow> | null>(null);

  useEffect(() => { messagesRef.current = messages; endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages]);

  const refreshCases = useCallback(async (preferred?: string) => {
    const signedIn = await loggedInUser();
    setCurrentUserId(signedIn.id);
    loggedUserRef.current = signedIn.id;
    const { data, error: queryError } = await supabase.from('applicant_cases')
      .select('id,applicant_name,owner_id,nationality,destination,visa_type').order('created_at', { ascending: false });
    if (queryError) throw new Error('No se pudieron cargar tus expedientes. Revisa la instalación de Supabase.');
    let rows = (data || []) as CaseRow[];
    // Un solicitante nuevo empieza a practicar sin crear manualmente un expediente
    // ni subir un DS-160. Cada expediente pertenece al usuario autenticado (RLS).
    if (!rows.length) {
      if (!initialCaseRequestRef.current) {
        initialCaseRequestRef.current = (async (): Promise<CaseRow> => {
          // Comprobar de nuevo antes de crear, para no duplicar una práctica
          // si otra solicitud ya completó la inserción.
          const {data:existing,error:readError} = await supabase.from('applicant_cases')
            .select('id,applicant_name,owner_id,nationality,destination,visa_type')
            .order('created_at',{ascending:false}).limit(1);
          if (readError) throw new Error('No se pudo revisar el expediente privado.');
          if (existing?.length) return existing[0] as CaseRow;
          const { data: created, error: createError } = await supabase.from('applicant_cases')
            .insert({owner_id:signedIn.id, applicant_name:'Práctica consular'})
            .select('id,applicant_name,owner_id,nationality,destination,visa_type').single();
          if (createError || !created) throw new Error('No se pudo preparar tu práctica privada. Comprueba las tablas del Tutor en Supabase.');
          return created as CaseRow;
        })();
      }
      try { rows = [await initialCaseRequestRef.current]; }
      catch(error){initialCaseRequestRef.current = null;throw error;}
    }
    if (!mountedRef.current) return;
    caseProfilesRef.current = rows;
    setCases(rows);
    setCaseId(existing => {
      const wanted = preferred || existing;
      const next = rows.some(c => c.id === wanted) ? wanted : (rows[0]?.id || '');
      routeToCase(next);
      return next;
    });
  }, []);

  const refreshCase = useCallback(async (id: string) => {
    if (!id) { setDocs([]); setFacts([]); setIndexedIds([]); setSelectedDocs([]); setMessages([]); setPreviousMessages([]); setOlderAvailable(false); return; }
    // Load all independent private resources concurrently; avoid three
    // sequential network roundtrips before showing the agent's first question.
    const [files, conversation, candidatesResult, readyResult] = await Promise.all([
      supabase.from('applicant_case_documents')
        .select('id,filename,mime_type,storage_path,created_at,uploaded_by')
        .eq('case_id', id).order('created_at', { ascending: false }),
      supabase.from('applicant_case_messages')
        .select('id,role,content,created_at')
        .eq('case_id', id).order('created_at', { ascending: false }).limit(100),
      supabase.from('applicant_case_facts')
        .select('id,fact_key,fact_value,document_id,verification_status')
        .eq('case_id',id).order('created_at',{ascending:false}).limit(60),
      supabase.from('applicant_case_index_jobs')
        .select('document_id,status').eq('case_id',id).eq('status','ready'),
    ]);
    if (files.error || conversation.error) throw new Error('No se pudieron cargar los documentos o el historial.');
    if (!mountedRef.current || activeCaseRef.current !== id) return;
    const fileRows = (files.data || []) as DocRow[];
    setDocs(fileRows);
    // Candidate memory is optional until the new SQL is installed. Never
    // show an unverified extraction as an accepted answer.
    if(mountedRef.current && activeCaseRef.current === id) {
      setFacts((candidatesResult.data || []) as FactRow[]);
    }
    // Optional tables may be missing in an older installation.
    const readyJobs = readyResult.data;
    if (mountedRef.current && activeCaseRef.current === id) {
      setIndexedIds((readyJobs || []).map(row => String(row.document_id)));
    }
    setSelectedDocs(previous => {
      const existing = previous.filter(p => fileRows.some(f => f.id === p));
      return (existing.length ? existing : fileRows.slice(0, 4).map(f => f.id)).slice(0, 4);
    });
    const history = ((conversation.data || []) as MessageRow[]).reverse();
    const { documentHistory, previous: earlierHistory, active: activeHistory } = splitTutorHistory(history);
    setPreviousMessages(earlierHistory);
    setMessages(activeHistory);
    setOlderAvailable(history.length === 100);
    // The consular simulator, grounded in this applicant's indexed documents,
    // takes priority over every legacy generic intake prompt.
    if(gentleOpenRef.current) return;
    if(!fileRows.length) {
      setNotice('Sube el DS-160 y los documentos de respaldo para iniciar una entrevista consular dirigida.');
      return;
    }
    // A document may already have indexed chunks even if the optional jobs
    // metadata was created later. Ask the authenticated RAG endpoint first;
    // a 409 then explains precisely what the applicant should prepare.
    if(!readyJobs?.length) {
      setNotice('Comprobando si tus documentos ya están indexados...');
    }
    if(simulatorRef.current || startingSimulatorCasesRef.current.has(id)) return;
    startingSimulatorCasesRef.current.add(id);
    setNotice('El Tutor está preparando las preguntas a partir de tus documentos...');
    try {
      const {data:{session}}=await supabase.auth.getSession();
      if(!session?.access_token)throw new Error('Inicia sesión nuevamente.');
      const response=await fetch('/api/applicant-simulator',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},
        body:JSON.stringify({caseId:id}),
      });
      const payload: {
        error?:string;questions?:PreparedQuestion[];alerts?:string[];
        excluded?:string[];unindexed?:string[];
      }=await response.json().catch(()=>({}));
      if(response.status===409) {
        if(mountedRef.current && activeCaseRef.current===id) setNotice(
          'Tus documentos no están preparados. Pulsa «⚡ Preparar y comenzar simulacro»; la preparación puede consumir tu cuota de Gemini.'
        );
        return;
      }
      if(!response.ok || !payload.questions?.length) {
        throw new Error(payload.error || 'No se pudieron preparar preguntas documentales.');
      }
      if(!mountedRef.current || activeCaseRef.current!==id) return;
      const progress=resumeConsularInterview(documentHistory,payload.questions);
      if(progress.completed){
        setNotice('Este simulacro ya terminó. Pulsa «Iniciar simulacro» para practicar nuevamente.');
        return;
      }
      const run:SimulatorRun={
        questions:payload.questions,index:progress.index,attempts:progress.attempts,
        alerts:payload.alerts||[],excluded:payload.excluded||[],unindexed:payload.unindexed||[],
      };
      simulatorRef.current=run;setSimulator(run);
      if(progress.pending){
        setNotice('Simulacro reanudado en la pregunta '+(progress.index+1)+'.');
        return;
      }
      // Previous messages from the old generic interview remain in history,
      // but must never drive or replace this first consular question.
      const prompt=run.questions[run.index].question;
      setMessages([...activeHistory,{role:'model',content:prompt}]);
      const {error:saveError}=await supabase.from('applicant_case_messages').insert({
        case_id:id,created_by:loggedUserRef.current,role:'model',content:prompt,
      });
      if(saveError) throw new Error('No se pudo guardar la primera pregunta del simulacro.');
      if(mountedRef.current && activeCaseRef.current===id){
        setNotice('El agente inicia la entrevista consular. Responde su primera pregunta.');
      }
    } catch(error){
      if(mountedRef.current && activeCaseRef.current===id) {
        simulatorRef.current=null;setSimulator(null);
        setMessages(activeHistory);
        setError(error instanceof Error ? error.message : 'No se pudo iniciar el simulacro.');
      }
    } finally {
      startingSimulatorCasesRef.current.delete(id);
    }
  }, []);

  useEffect(() => {
    const openVoice = () => setMode('voice');
    window.addEventListener('chatmi:tutor-voice', openVoice);
    return () => window.removeEventListener('chatmi:tutor-voice', openVoice);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refreshCases().catch(e => setError(e instanceof Error ? e.message : 'No se pudieron cargar los expedientes.'));
    const pop = () => setCaseId(currentCaseId());
    window.addEventListener('popstate', pop);
    return () => {
      mountedRef.current = false;
      voiceOnRef.current = false;
      recognitionRef.current?.stop();
      if (voiceDelayRef.current) clearTimeout(voiceDelayRef.current);
      window.speechSynthesis?.cancel();
      window.removeEventListener('popstate', pop);
    };
  }, [refreshCases]);

  useEffect(() => {
    activeCaseRef.current = caseId;
    setError(''); setNotice(''); setTranscript('');
    simulatorRef.current = null; setSimulator(null);
    // Al entrar o cambiar de solicitante, iniciar la primera pregunta sin botón.
    gentleOpenRef.current = Boolean(caseId); setGentleOpen(Boolean(caseId));
    setDocs([]); setFacts([]); setIndexedIds([]); setSelectedDocs([]); setMessages([]); setPreviousMessages([]); setOlderAvailable(false);
    voiceOnRef.current = false; setVoiceOn(false);
    voiceSessionRef.current = '';
    voiceDraftRef.current = '';
    if (voiceDelayRef.current) clearTimeout(voiceDelayRef.current);
    voiceDelayRef.current = null;
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
    void refreshCase(caseId).catch(e => setError(e instanceof Error ? e.message : 'Error cargando expediente.'));
  }, [caseId, refreshCase]);

  const createCase = async () => {
    const name = window.prompt('Nombre del solicitante o del expediente privado:')?.trim();
    if (!name) return;
    if (name.length < 2 || name.length > 160) { setError('Utiliza un nombre de 2 a 160 caracteres.'); return; }
    setLoading(true); setError('');
    try {
      const user = await loggedInUser();
      const { data, error: saveError } = await supabase.from('applicant_cases')
        .insert({ owner_id: user.id, applicant_name: name }).select('id').single();
      if (saveError || !data) throw new Error('No se pudo crear el expediente.');
      await refreshCases(String(data.id));
      setNotice('Expediente privado creado. Puedes subir los documentos.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el expediente.');
    } finally { setLoading(false); }
  };

  const uploadDocument = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!caseId || !files.length || busyRef.current) return;
    busyRef.current = true; setLoading(true); setError(''); setNotice('');
    let saved = 0;
    const newlyAdded: string[] = [];
    try {
      const user = await loggedInUser();
      for (const file of files) {
        const ext = FILE_TYPES[file.type];
        if (!ext || !file.size || file.size > LIMIT) {
          throw new Error('Solo PDF, JPG, PNG o WebP de máximo 2 MB por archivo.');
        }
        const path = caseId + '/' + user.id + '/' + crypto.randomUUID() + '.' + ext;
        const store = supabase.storage.from(BUCKET);
        const { error: uploadError } = await store.upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw new Error('No se pudo guardar un documento en el almacenamiento privado.');
        const { data: inserted, error: insertError } = await supabase.from('applicant_case_documents').insert({
          case_id: caseId, uploaded_by: user.id, filename: file.name.slice(0, 180),
          mime_type: file.type, size_bytes: file.size, storage_path: path, category: 'otro',
        }).select('id').single();
        if (insertError) {
          await store.remove([path]);
          throw new Error('El archivo se cargó pero no pudo registrarse en el expediente.');
        }
        saved++;
        if (inserted?.id) newlyAdded.push(String(inserted.id));
      }
      await refreshCase(caseId);
      if (newlyAdded.length) setSelectedDocs(previous => [
        ...newlyAdded.slice(-4), ...previous.filter(id => !newlyAdded.includes(id)),
      ].slice(0, 4));
      setNotice(saved + ' documento(s) guardado(s). Para acelerar futuras consultas, pulsa «Preparar búsqueda rápida» una vez.');
    } catch (e) {
      setError((e instanceof Error ? e.message : 'No se pudo subir el documento.') +
        (saved ? ' Se guardaron ' + saved + ' documentos anteriores.' : ''));
      await refreshCase(caseId).catch(() => undefined);
    } finally { busyRef.current = false; setLoading(false); }
  };


  const prepareFastSearch = async () => {
    const pending = docs.filter(d => selectedDocs.includes(d.id) && !indexedIds.includes(d.id));
    if (!pending.length || loading || busyRef.current) {
      if(!pending.length && docs.length && !simulatorRef.current) void refreshCase(caseId);
      return;
    }
    busyRef.current = true; setLoading(true); setError(''); setNotice('');
    let successes = 0;
    const failures: string[] = [];
    try {
      const {data:{session}}=await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Inicia sesión de nuevo.');
      for (const [i,doc] of pending.entries()) {
        setNotice('Preparando búsqueda rápida: documento ' + (i+1) + ' de ' + pending.length + '…');
        try {
          const response = await fetch('/api/applicant-index', {
            method:'POST',
            headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},
            body:JSON.stringify({documentId:doc.id}),
          });
          const result: {indexed?:boolean;error?:string} = await response.json().catch(()=>({}));
          if (!response.ok || !result.indexed) throw new Error(result.error || 'No se pudo indexar.');
          successes++;
        } catch (err) {
          failures.push(doc.filename + ': ' + (err instanceof Error ? err.message : 'error'));
        }
      }
      const [readyResponse, factResponse] = await Promise.all([
        supabase.from('applicant_case_index_jobs')
          .select('document_id').eq('case_id',caseId).eq('status','ready'),
        supabase.from('applicant_case_facts')
          .select('id,fact_key,fact_value,document_id,verification_status')
          .eq('case_id',caseId).order('created_at',{ascending:false}).limit(60),
      ]);
      const ready = readyResponse.data;
      if (activeCaseRef.current === caseId) {
        setIndexedIds((ready||[]).map(row=>String(row.document_id)));
        if (!factResponse.error) setFacts((factResponse.data||[]) as FactRow[]);
        if (successes > 0) {
          setNotice(successes + ' documento(s) preparados. El Tutor está iniciando el simulacro consular.');
        } else if (failures.length) {
          setNotice('No se pudo preparar ningún documento. Resuelve el error indicado y vuelve a intentarlo.');
        }
        if (failures.length) setError([...new Set(failures)].join(' | ').slice(0,900));
        if (successes > 0 && !simulatorRef.current) void refreshCase(caseId);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error preparando índice.');
    } finally {
      busyRef.current=false;setLoading(false);
    }
  };

  const startSimulator = async () => {
    if(!caseId || !docs.length || loading || busyRef.current || startingSimulatorCasesRef.current.has(caseId)) return;
    const currentCase=caseId;
    busyRef.current=true;setLoading(true);setError('');setNotice('');
    try {
      const {data:{session}}=await supabase.auth.getSession();
      if(!session?.access_token)throw new Error('Sesión expirada. Inicia sesión.');
      const response=await fetch('/api/applicant-simulator',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},
        body:JSON.stringify({caseId:currentCase}),
      });
      const payload: {
        error?:string;questions?:PreparedQuestion[];
        alerts?:string[];excluded?:string[];unindexed?:string[];
      }=await response.json().catch(()=>({}));
      if(!response.ok || !payload.questions?.length)
        throw new Error(payload.error || 'No se pudo preparar el simulacro.');
      if(activeCaseRef.current!==currentCase)return;
      stopVoice();
      const run:SimulatorRun={
        questions:payload.questions,index:0,attempts:0,
        alerts:payload.alerts||[],excluded:payload.excluded||[],unindexed:payload.unindexed||[],
      };
      simulatorRef.current=run;setSimulator(run);
      const prompt=run.questions[0].question;
      const snapshot=[...messagesRef.current];
      setMessages([...snapshot,{role:'model',content:prompt}]);
      const user=await loggedInUser();
      const {error:saveError}=await supabase.from('applicant_case_messages').insert({
        case_id:currentCase,created_by:user.id,role:'model',content:prompt,
      });
      if(saveError)throw new Error('No se pudo guardar la primera pregunta del simulacro.');
      setNotice('Simulacro activo: '+run.questions.length+
        ' módulos. '+(run.alerts.length?
        'Atención: '+run.alerts[0]:'El agente te preguntará y corregirá las respuestas.'));
      if(run.unindexed.length)setNotice(previous=>previous+' Algunos documentos aún no están indexados.');
    }catch(err){
      if(activeCaseRef.current===currentCase) {
        simulatorRef.current=null;setSimulator(null);
        setError(err instanceof Error?err.message:'Error preparando el simulacro.');
      }
    }finally{busyRef.current=false;if(mountedRef.current)setLoading(false);}
  };

  const stopSimulator = () => {
    stopVoice();
    simulatorRef.current=null;setSimulator(null);setNotice('Simulacro detenido.');
  };

  // Short speech utterances are chained to avoid browsers truncating long answers.
  const readAnswerAloud = (answer: string, forCase: string) => {
    if (!window.speechSynthesis || !voiceOnRef.current) return;
    const plain = naturalSpanishSpeech(answer);
    const words = plain.split(' ');
    const segments: string[] = [];
    let chunk = '';
    for (const word of words) {
      if (chunk.length + word.length > 160 && chunk) {
        segments.push(chunk);
        chunk = '';
      }
      chunk += (chunk ? ' ' : '') + word;
    }
    if (chunk) segments.push(chunk);
    window.speechSynthesis.cancel();
    setSpeaking(true);
    let index = 0;
    const next = () => {
      if (!voiceOnRef.current || activeCaseRef.current !== forCase) { setSpeaking(false); return; }
      if (index >= segments.length) {
        setSpeaking(false);
        // When the document-grounded interview finishes and there is no document for
        // free questions, do not leave the microphone listening indefinitely.
        if (!simulatorRef.current) {
          stopVoice();
          return;
        }
        try { recognitionRef.current?.start(); setListening(true); }
        catch { setError('Pulsa el micrófono para continuar.'); }
        return;
      }
      const utterance = new SpeechSynthesisUtterance(segments[index++]);
      const spanishVoices = window.speechSynthesis.getVoices().filter(voice =>
        voice.lang.toLowerCase().startsWith('es'));
      utterance.voice = spanishVoices.find(voice => voice.lang.toLowerCase() === 'es-do')
        || spanishVoices.find(voice => voice.localService)
        || spanishVoices[0] || null;
      utterance.lang = utterance.voice?.lang || 'es-DO';
      utterance.rate = 1.12;
      utterance.onend = next;
      utterance.onerror = () => { setSpeaking(false); stopVoice(); };
      window.speechSynthesis.speak(utterance);
    };
    next();
  };

  const askQuestion = async (rawText: string, spoken: boolean): Promise<void> => {
    const text = rawText.trim();
    if (!text || !caseId || busyRef.current) return;
    // Consular simulator: assess only against case-specific indexed evidence.
    // No Gemini calls for corrections and repetitions.
    if(startingSimulatorCasesRef.current.has(caseId)) {
      setNotice('El Tutor está preparando las preguntas basadas en tus documentos.');
      return;
    }
    if(simulatorRef.current) {
      const currentRun=simulatorRef.current;
      const item=currentRun.questions[currentRun.index];
      if(!item)return;
      busyRef.current=true;setLoading(true);setError('');
      const activeId=caseId;
      const snapshot=[...messagesRef.current];
      const grade=evaluateConsularAnswer(item,text,currentRun.attempts);
      const nextAttempt=grade.repeat && currentRun.attempts<2;
      const nextIndex=nextAttempt?currentRun.index:currentRun.index+1;
      const nextItem=currentRun.questions[nextIndex];
      const nextPrompt=nextItem?.question || CONSULAR_FINISHED;
      const feedback=grade.feedback;
      const append:MessageRow[]=[
        {role:'user',content:text},
        {role:'model',content:feedback},
        {role:'model',content:nextPrompt},
      ];
      const nextRun:SimulatorRun={
        ...currentRun,index:nextIndex,attempts:nextAttempt?currentRun.attempts+1:0,
      };
      setMessages([...snapshot,...append]);
      try {
        const user=await loggedInUser();
        const now=Date.now();
        const {error:saveError}=await supabase.from('applicant_case_messages').insert(
          append.map((message,i)=>({
            case_id:activeId,created_by:user.id,
            role:message.role,content:message.content.slice(0,15000),
            created_at:new Date(now+i).toISOString(),
          }))
        );
        if(saveError)throw new Error('No se pudo guardar la evaluación.');
        if(mountedRef.current && activeCaseRef.current===activeId) {
          setQuestion('');
          if(nextItem) {
            simulatorRef.current=nextRun;setSimulator(nextRun);
          } else {
            simulatorRef.current=null;setSimulator(null);
          }
          if(spoken&&voiceOnRef.current)readAnswerAloud(feedback+' '+nextPrompt,activeId);
        }
      }catch(err){
        if(activeCaseRef.current===activeId){
          setMessages(snapshot);
          setError(err instanceof Error?err.message:'Error guardando evaluación.');
        }
      }finally{busyRef.current=false;if(mountedRef.current)setLoading(false);}
      return;
    }
    if (!selectedDocs.length) {
      setError('Selecciona un documento para realizar consultas fuera de la entrevista.');
      return;
    }
    busyRef.current = true; setLoading(true); setError(''); setNotice(''); setReplyIncomplete(false);
    const queriedCase = caseId;
    const previous = [...messagesRef.current];
    // Keep recent relevant context without allowing old one-word transcriptions
    // and generic model replies to poison the next full response.
    const history = previous.filter(m => (
      m.role === 'user'
        ? m.content.trim().split(/\s+/).filter(Boolean).length >= 3
        : !/^Por favor,? indique qu[eé] dato/i.test(m.content.trim())
    )).slice(-10).map(m => ({ role: m.role, content: m.content }));
    const show = (answer: string) => {
      if (!mountedRef.current || activeCaseRef.current !== queriedCase) return;
      setMessages([...previous, { role: 'user', content: text }, { role: 'model', content: answer }]);
    };
    show('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Tu sesión expiró. Inicia sesión de nuevo.');
      const result = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({
          caseId: queriedCase, documentIds: selectedDocs, stream: true,
          messages: [...history, { role: 'user', content: text }],
        }),
      });
      if (!result.ok) {
        const failure: { error?: string } = await result.json().catch(() => ({}));
        throw new Error(failure.error || 'El Tutor no pudo responder (HTTP ' + result.status + ').');
      }
      let responseText = '';
      let complete = true;
      if (result.headers.get('content-type')?.includes('application/x-ndjson') && result.body) {
        const reader = result.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let sawDone = false;
        const processLine = (rawLine: string) => {
          if (!rawLine.trim()) return;
          let frame: { type?: string; text?: string; error?: string; complete?: boolean };
          try { frame = JSON.parse(rawLine); }
          catch { throw new Error('La transmisión devolvió un mensaje inválido.'); }
          if (frame.type === 'delta' && typeof frame.text === 'string') {
            responseText += frame.text;
            show(exactFactReply(text, responseText));
          } else if (frame.type === 'done') {
            sawDone = true;
            complete = frame.complete === true;
          } else if (frame.type === 'error') {
            throw new Error(frame.error || 'Se interrumpió la respuesta.');
          }
        };
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let split: number;
            while ((split = buffer.indexOf('\n')) !== -1) {
              const line = buffer.slice(0, split).trim();
              buffer = buffer.slice(split + 1);
              processLine(line);
            }
          }
          buffer += decoder.decode();
          if (buffer.trim()) processLine(buffer.trim());
          if (!sawDone) throw new Error('Se cerró la conexión antes de terminar la respuesta.');
        } finally {
          await reader.cancel().catch(() => undefined);
        }
      } else {
        const data: { text?: string; complete?: boolean } = await result.json().catch(() => ({}));
        responseText = data.text || '';
        complete = data.complete !== false;
        show(exactFactReply(text, responseText));
      }
      if (!responseText.trim()) throw new Error('Gemini no devolvió una respuesta legible.');
      const finalReply = exactFactReply(text, responseText);
      if (!finalReply) throw new Error('Gemini no devolvió el dato solicitado.');
      show(finalReply);
      const user = await loggedInUser();
      // Split long model text into adjacent stored parts so the 15k row
      // constraint never silently cuts the answer or loses the continuation.
      const answerParts = finalReply.match(/[\s\S]{1,14000}/g) || [];
      const { error: saveError } = await supabase.from('applicant_case_messages').insert([
        { case_id: queriedCase, created_by: user.id, role: 'user', content: text.slice(0, 15000) },
        ...answerParts.map(content => ({
          case_id: queriedCase, created_by: user.id, role: 'model' as const, content,
        })),
      ]);
      if (saveError) throw new Error('La respuesta se mostró pero no pudo guardarse en el historial.');
      if (!mountedRef.current || activeCaseRef.current !== queriedCase) return;
      setQuestion('');
      setReplyIncomplete(!complete);
      if (!complete) setNotice('Gemini alcanzó su límite de generación. Puedes pulsar «Continuar respuesta» para completar el análisis.');
      if (spoken && voiceOnRef.current) readAnswerAloud(finalReply, queriedCase);
    } catch (e) {
      if (mountedRef.current && activeCaseRef.current === queriedCase) {
        // Uncommitted partial output is not presented as a saved, complete answer.
        setMessages(previous);
        setError(e instanceof Error ? e.message : 'No se pudo consultar el documento.');
      }
      if (spoken) { voiceOnRef.current = false; setVoiceOn(false); }
    } finally { busyRef.current = false; if (mountedRef.current) setLoading(false); }
  };

  const send = (event: FormEvent) => {
    event.preventDefault();
    if (!loading && question.trim()) void askQuestion(question, false);
  };

  const stopVoice = () => {
    voiceOnRef.current = false;
    setVoiceOn(false); setListening(false); setSpeaking(false);
    if (voiceDelayRef.current) clearTimeout(voiceDelayRef.current);
    voiceDelayRef.current = null;
    voiceDraftRef.current = '';
    voiceSessionRef.current = '';
    voiceRestartRef.current = 0;
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
  };

  const toggleVoice = () => {
    if (voiceOnRef.current) { stopVoice(); return; }
    if (!caseId || !simulatorRef.current) {
      setNotice('El Tutor debe iniciar su simulacro antes de utilizar Voz. Prepara primero los documentos.');
      return;
    }
    const Recognition = recognitionConstructor();
    if (!Recognition) {
      setError('El reconocimiento de voz no está disponible en este navegador. Prueba Chrome con permiso de micrófono.');
      return;
    }
    const engine = new Recognition();
    engine.lang = 'es-DO';
    engine.continuous = true;
    engine.interimResults = true;

    const composedText = () => [voiceSessionRef.current, voiceDraftRef.current]
      .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

    const submitRecognizedQuestion = () => {
      voiceDelayRef.current = null;
      if (!voiceOnRef.current || busyRef.current) return;
      const complete = composedText();
      if (complete.split(/\s+/).filter(Boolean).length < (simulatorRef.current ? 1 : 3)) {
        setError('No pude escuchar tu respuesta completa. Repítela.');
        return;
      }
      voiceSessionRef.current = '';
      voiceDraftRef.current = '';
      voiceRestartRef.current = 0;
      // Stop listening before contacting Gemini; otherwise the mic can pick up
      // the assistant's answer and submit it as a new applicant question.
      engine.stop();
      setListening(false);
      setTranscript(complete);
      void askQuestion(complete, true);
    };

    const scheduleQuestion = (delay: number) => {
      if (voiceDelayRef.current) clearTimeout(voiceDelayRef.current);
      voiceDelayRef.current = setTimeout(submitRecognizedQuestion, delay);
    };

    engine.onresult = event => {
      if (!voiceOnRef.current || busyRef.current) return;
      const entries = Array.from(event.results);
      voiceDraftRef.current = entries.map(entry => entry[0]?.transcript?.trim() || '')
        .filter(Boolean).join(' ').trim();
      const full = composedText();
      setTranscript(full);
      const words = full.split(/\s+/).filter(Boolean).length;
      const finalPart = entries.some(entry => entry.isFinal !== false);
      if (finalPart && words >= ((simulatorRef.current) ? 1 : 3)) {
        setError('');
        // Wait for further words rather than sending the first detected fragment.
        scheduleQuestion((simulatorRef.current) ? 850 : 1400);
      } else if (voiceDelayRef.current) {
        clearTimeout(voiceDelayRef.current);
        voiceDelayRef.current = null;
      }
    };

    engine.onerror = event => {
      if (!voiceOnRef.current || busyRef.current) return;
      const reason = event.error || 'desconocido';
      if (reason === 'no-speech') {
        setError('No escuché tu respuesta. Comprueba el permiso del micrófono y pulsa Iniciar voz para escuchar nuevamente la pregunta del Tutor.');
      } else {
        setError('No se pudo utilizar el micrófono (' + reason + ').');
      }
      stopVoice();
    };

    engine.onend = () => {
      setListening(false);
      if (!voiceOnRef.current || busyRef.current) return;
      if (voiceDelayRef.current) return;
      const phrase = composedText();
      if (phrase.split(/\s+/).filter(Boolean).length >= ((simulatorRef.current) ? 1 : 3)) {
        scheduleQuestion(450);
        return;
      }
      // A pause after "qué" must not create a useless API request.
      if (!phrase) {
        setError('No pude escuchar tu respuesta. Pulsa Iniciar voz para volver a escuchar la pregunta.');
        stopVoice();
        return;
      }
      voiceSessionRef.current = phrase;
      voiceDraftRef.current = '';
      if (++voiceRestartRef.current > 2) {
        setError('Tu respuesta quedó incompleta. Pulsa Iniciar voz e inténtalo de nuevo.');
        stopVoice();
        return;
      }
      voiceDelayRef.current = setTimeout(() => {
        voiceDelayRef.current = null;
        if (!voiceOnRef.current || busyRef.current) return;
        try { engine.start(); setListening(true); }
        catch { setError('Pulsa Iniciar voz para continuar.'); stopVoice(); }
      }, 350);
    };

    recognitionRef.current = engine;
    voiceOnRef.current = true;
    voiceDraftRef.current = '';
    voiceSessionRef.current = '';
    voiceRestartRef.current = 0;
    setVoiceOn(true); setError(''); setTranscript('');
    try {
      const active = simulatorRef.current;
      if(active) readAnswerAloud(active.questions[active.index].question,caseId);
    } catch {
      stopVoice();
      setError('No se pudo iniciar la conversación por voz.');
    }
  };

  const toggleGuidedInterview = () => {
    if(busyRef.current || loading || !caseId) return;
    if(simulatorRef.current) stopSimulator();
    else void startSimulator();
  };

  const switchMode = (next: Mode) => {
    if (next !== mode) { stopVoice(); setMode(next); }
  };

  const loadOlder = async () => {
    const before = messages[0]?.created_at;
    if (!caseId || !before || loading) return;
    setLoading(true);
    try {
      const { data, error: err } = await supabase.from('applicant_case_messages')
        .select('id,role,content,created_at').eq('case_id',caseId)
        .lt('created_at',before).order('created_at',{ascending:false}).limit(100);
      if (err) throw err;
      const older = (data || []) as MessageRow[];
      if (simulatorRef.current || previousMessages.length) {
        setPreviousMessages(current => [...older.reverse(), ...current]);
      } else {
        setMessages(current => [...older.reverse(), ...current]);
      }
      setOlderAvailable(older.length === 100);
    } catch { setError('No se pudo recuperar el historial anterior.'); }
    finally { setLoading(false); }
  };

  const reviewFact = async (fact: FactRow, approve: boolean) => {
    if (loading || !caseId) return;
    const owner = cases.find(item=>item.id===caseId)?.owner_id;
    if (!currentUserId || owner !== currentUserId) {
      setError('Solo el titular del expediente puede verificar sus datos.');
      return;
    }
    setLoading(true);setError('');
    try {
      const user=await loggedInUser();
      if (user.id !== currentUserId) throw new Error('Sesión no válida.');
      const {data,error:reviewError}=await supabase.from('applicant_case_facts')
        .update({
          verification_status:approve ? 'verified' : 'rejected',
          verified_by:approve ? user.id : null,
          verified_at:approve ? new Date().toISOString() : null,
        })
        .eq('id',fact.id).eq('case_id',caseId)
        .eq('verification_status','pending_review').select('id');
      if (reviewError || !data?.length) {
        throw new Error('No se pudo revisar el dato. Comprueba los permisos de Supabase.');
      }
      const {data:rows,error:loadError}=await supabase.from('applicant_case_facts')
        .select('id,fact_key,fact_value,document_id,verification_status')
        .eq('case_id',caseId).order('created_at',{ascending:false}).limit(60);
      if(loadError) throw loadError;
      if(activeCaseRef.current===caseId) {
        setFacts((rows||[]) as FactRow[]);
        setNotice(approve ? 'Dato confirmado; el Tutor podrá responder sin Gemini.' : 'Dato rechazado; no se utilizará como hecho verificado.');
      }
    } catch(e) {
      setError(e instanceof Error ? e.message : 'No se pudo verificar el dato.');
    } finally {setLoading(false);}
  };

  const { inviteToCase, redeemInvite, deleteCase, leaveCase, removeDocument } = useCaseManagement({
    caseId, busyRef, mountedRef, setLoading, setError, setNotice, setSelectedDocs,
    refreshCase, refreshCases,
    // After a case disappears (deleted or left), start from a clean slate. The
    // first-case request is cleared so an empty account gets a NEW practice case
    // instead of being handed the one that was just deleted.
    forgetCurrentCase: async () => {
      stopVoice();
      simulatorRef.current = null; setSimulator(null);
      initialCaseRequestRef.current = null;
      routeToCase('');
      setCaseId('');
      await refreshCases();
    },
  });

  const toggleDoc = (id: string) => {
    setSelectedDocs(previous => {
      if (previous.includes(id)) return previous.filter(item => item !== id);
      if (previous.length >= 4) { setError('Puedes consultar hasta 4 documentos por pregunta.'); return previous; }
      setError('');
      return [...previous, id];
    });
  };

  if(gentleOpen) return <GentlePractice caseId={caseId} onExit={() => {
    gentleOpenRef.current=false;
    setGentleOpen(false);
    void refreshCase(caseId);
  }}/>;

  return (
    <section className="cm-tutor-chat-layout" aria-label="Tutor Personal — Chat y Voz">
      <header className="cm-tutor-chat-header">
        <div className="cm-tutor-case-picker">
          <label htmlFor="tutor-current-case">Expediente</label>
          <select id="tutor-current-case" value={caseId} onChange={event => { stopVoice(); setCaseId(event.target.value); routeToCase(event.target.value); }} disabled={loading}>
            {!caseId && <option value="">Selecciona un expediente</option>}
            {cases.map(item => <option key={item.id} value={item.id}>{item.applicant_name}</option>)}
          </select>
          <button type="button" className="cm-tutor-new-case" onClick={() => void createCase()} disabled={loading} title="Crear expediente privado">+ Nuevo</button>
          <button type="button" className="cm-tutor-new-case" disabled={!caseId}
            onClick={() => {
              stopVoice();
              simulatorRef.current=null;setSimulator(null);
              gentleOpenRef.current=true;setGentleOpen(true);
            }}>Práctica tranquila</button>
        </div>
        <div className="cm-tutor-modes" role="tablist" aria-label="Modalidad del Tutor">
          <button role="tab" type="button" aria-selected={mode === 'chat'} className={mode === 'chat' ? 'is-active' : ''} onClick={() => switchMode('chat')}>Chat</button>
          <button role="tab" type="button" aria-selected={mode === 'voice'} className={mode === 'voice' ? 'is-active' : ''} onClick={() => switchMode('voice')}>Voz</button>
        </div>
      </header>

      <TutorMessages
        caseId={caseId}
        messages={messages}
        previousMessages={previousMessages}
        olderAvailable={olderAvailable}
        loading={loading}
        simulatorActive={Boolean(simulator)}
        onLoadOlder={() => void loadOlder()}
        endRef={endRef}
      />

      <div className="cm-tutor-chat-bottom">
        <div className="cm-tutor-interview-bar">
          <span>{simulator ? ('Simulacro consular · módulo '+(simulator.index+1)+'/'+simulator.questions.length+
            ' · '+simulator.questions[simulator.index]?.title)
            : 'Tutor consular · simulacro basado en documentos'}</span>
          <button type="button" disabled={!caseId || loading || (!simulator && !docs.length)}
            onClick={toggleGuidedInterview}>
            {simulator ? 'Pausar simulacro' : 'Iniciar simulacro'}
          </button>
        </div>
        {simulator && (simulator.alerts.length > 0 || simulator.excluded.length > 0) && (
          <details className="cm-tutor-simulator-alerts">
            <summary>Revisar inconsistencias documentales ({simulator.alerts.length})</summary>
            {simulator.alerts.map((alert,i)=><p key={'a'+i}>{alert}</p>)}
            {simulator.excluded.length>0 && <p>Documentos sin identificación suficiente para esta persona: {simulator.excluded.join(', ')}. No se utilizarán en las respuestas.</p>}
          </details>
        )}
        {error && <p role="alert" className="cm-inline-error">{error}</p>}
        {notice && <p role="status" className="cm-tutor-chat-notice">{notice}</p>}
        {replyIncomplete && !loading && (
          <button type="button" className="cm-tutor-continue" onClick={() => void askQuestion('Continúa exactamente donde terminó tu última respuesta. Completa el análisis pendiente usando el mismo expediente, sin repetir lo ya explicado.', false)}>
            Continuar respuesta
          </button>
        )}
        <TutorDocumentsBar
          caseId={caseId}
          loading={loading}
          simulatorActive={Boolean(simulator)}
          docs={docs}
          indexedIds={indexedIds}
          selectedDocs={selectedDocs}
          facts={facts}
          canReviewFacts={cases.find(c=>c.id===caseId)?.owner_id===currentUserId}
          fileRef={fileRef}
          onUpload={event => void uploadDocument(event)}
          onStartSimulator={() => void startSimulator()}
          onStopSimulator={stopSimulator}
          onPrepare={() => void prepareFastSearch()}
          onToggleDoc={toggleDoc}
          onReviewFact={(fact, approve) => void reviewFact(fact, approve)}
          canDeleteDoc={doc => cases.find(c=>c.id===caseId)?.owner_id===currentUserId || doc.uploaded_by===currentUserId}
          onDeleteDoc={doc => void removeDocument(doc)}
        />

        {caseId && currentUserId && (
          <details className="cm-tutor-documents cm-tutor-case-manager">
            <summary>Tareas pendientes</summary>
            <ApplicantCaseTasks key={caseId} caseId={caseId}
              ownerId={cases.find(c=>c.id===caseId)?.owner_id || ''} currentUserId={currentUserId} />
          </details>
        )}

        <TutorCaseManager
          activeCase={cases.find(c=>c.id===caseId)}
          isOwner={cases.find(c=>c.id===caseId)?.owner_id===currentUserId}
          busy={loading}
          onInvite={inviteToCase}
          onRedeem={redeemInvite}
          onDelete={deleteCase}
          onLeave={leaveCase}
        />

        <TutorComposer
          mode={mode}
          caseId={caseId}
          loading={loading}
          simulatorActive={Boolean(simulator)}
          question={question}
          canSend={Boolean(simulator) || selectedDocs.length > 0}
          listening={listening}
          speaking={speaking}
          voiceOn={voiceOn}
          transcript={transcript}
          onQuestionChange={setQuestion}
          onSubmit={send}
          onAsk={text => void askQuestion(text, false)}
          onPickFiles={() => fileRef.current?.click()}
          onSwitchMode={switchMode}
          onToggleVoice={toggleVoice}
        />
      </div>
    </section>
  );
}
