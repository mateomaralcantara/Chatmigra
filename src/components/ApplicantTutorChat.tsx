import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '../services/supabaseClient';

type CaseRow = { id: string; applicant_name: string };
type DocRow = { id: string; filename: string; mime_type: string; storage_path: string; created_at: string };
type MessageRow = { id?: string; role: 'user' | 'model'; content: string; created_at?: string };
type Mode = 'chat' | 'voice';
type RecognitionEntry = ArrayLike<{ transcript: string }> & { isFinal?: boolean };
type RecognitionResult = { results: ArrayLike<RecognitionEntry> };
type RecognitionEngine = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResult) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

const BUCKET = 'chatmi-applicant-cases';
const LIMIT = 2 * 1024 * 1024;
const FILE_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const uuidInPath = /^\/tutor\/([0-9a-f-]{36})$/i;

function currentCaseId() {
  return uuidInPath.exec(window.location.pathname)?.[1] || '';
}
function routeToCase(id: string) {
  const next = id ? '/tutor/' + encodeURIComponent(id) : '/tutor';
  if (window.location.pathname !== next) window.history.replaceState({}, '', next);
}
async function loggedInUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Inicia sesión para continuar.');
  return user;
}
function recognitionConstructor(): (new () => RecognitionEngine) | undefined {
  const w = window as typeof window & {
    SpeechRecognition?: new () => RecognitionEngine;
    webkitSpeechRecognition?: new () => RecognitionEngine;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

export default function ApplicantTutorChat() {
  const [mode, setMode] = useState<Mode>('chat');
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [caseId, setCaseId] = useState(currentCaseId);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [question, setQuestion] = useState('');
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
  const mountedRef = useRef(true);

  useEffect(() => { messagesRef.current = messages; endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages]);

  const refreshCases = useCallback(async (preferred?: string) => {
    await loggedInUser();
    const { data, error: queryError } = await supabase.from('applicant_cases')
      .select('id,applicant_name').order('created_at', { ascending: false });
    if (queryError) throw new Error('No se pudieron cargar tus expedientes. Revisa la instalación de Supabase.');
    const rows = (data || []) as CaseRow[];
    if (!mountedRef.current) return;
    setCases(rows);
    setCaseId(existing => {
      const wanted = preferred || existing;
      const next = rows.some(c => c.id === wanted) ? wanted : (rows[0]?.id || '');
      routeToCase(next);
      return next;
    });
  }, []);

  const refreshCase = useCallback(async (id: string) => {
    if (!id) { setDocs([]); setSelectedDocs([]); setMessages([]); setOlderAvailable(false); return; }
    const [files, conversation] = await Promise.all([
      supabase.from('applicant_case_documents')
        .select('id,filename,mime_type,storage_path,created_at')
        .eq('case_id', id).order('created_at', { ascending: false }),
      supabase.from('applicant_case_messages')
        .select('id,role,content,created_at')
        .eq('case_id', id).order('created_at', { ascending: false }).limit(100),
    ]);
    if (files.error || conversation.error) throw new Error('No se pudieron cargar los documentos o el historial.');
    if (!mountedRef.current || activeCaseRef.current !== id) return;
    const fileRows = (files.data || []) as DocRow[];
    setDocs(fileRows);
    setSelectedDocs(previous => {
      const existing = previous.filter(p => fileRows.some(f => f.id === p));
      return (existing.length ? existing : fileRows.slice(0, 4).map(f => f.id)).slice(0, 4);
    });
    const history = (conversation.data || []) as MessageRow[];
    setMessages(history.reverse());
    setOlderAvailable(history.length === 100);
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
    setDocs([]); setSelectedDocs([]); setMessages([]); setOlderAvailable(false);
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
      setNotice(saved + ' documento(s) guardado(s) en el expediente.');
    } catch (e) {
      setError((e instanceof Error ? e.message : 'No se pudo subir el documento.') +
        (saved ? ' Se guardaron ' + saved + ' documentos anteriores.' : ''));
      await refreshCase(caseId).catch(() => undefined);
    } finally { busyRef.current = false; setLoading(false); }
  };

  // Short speech utterances are chained to avoid browsers truncating long answers.
  const readAnswerAloud = (answer: string, forCase: string) => {
    if (!window.speechSynthesis || !voiceOnRef.current) return;
    const plain = answer.replace(/[*#_\[\]<>]/g, ' ').replace(/\s+/g, ' ').trim();
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
        try { recognitionRef.current?.start(); setListening(true); }
        catch { setError('Pulsa el micrófono para continuar.'); }
        return;
      }
      const utterance = new SpeechSynthesisUtterance(segments[index++]);
      utterance.lang = 'es-DO';
      utterance.rate = 1;
      utterance.onend = next;
      utterance.onerror = () => { setSpeaking(false); stopVoice(); };
      window.speechSynthesis.speak(utterance);
    };
    next();
  };

  const askQuestion = async (rawText: string, spoken: boolean): Promise<void> => {
    const text = rawText.trim();
    if (!text || !caseId || busyRef.current) return;
    if (!selectedDocs.length) {
      setError('Sube y selecciona al menos un documento para consultar al Tutor.');
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
            show(responseText);
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
        show(responseText);
      }
      if (!responseText.trim()) throw new Error('Gemini no devolvió una respuesta legible.');
      const user = await loggedInUser();
      const { error: saveError } = await supabase.from('applicant_case_messages').insert([
        { case_id: queriedCase, created_by: user.id, role: 'user', content: text.slice(0, 15000) },
        { case_id: queriedCase, created_by: user.id, role: 'model', content: responseText.slice(0, 15000) },
      ]);
      if (saveError) throw new Error('La respuesta se mostró pero no pudo guardarse en el historial.');
      if (!mountedRef.current || activeCaseRef.current !== queriedCase) return;
      setQuestion('');
      setReplyIncomplete(!complete);
      if (!complete) setNotice('Gemini alcanzó su límite de generación. Puedes pulsar «Continuar respuesta» para completar el análisis.');
      if (spoken && voiceOnRef.current) readAnswerAloud(responseText, queriedCase);
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
    if (!caseId || !selectedDocs.length) {
      setError('Sube y selecciona un documento antes de iniciar la conversación por voz.');
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
      if (complete.split(/\s+/).filter(Boolean).length < 3) {
        setError('Escuché una pregunta incompleta. Repite la frase completa.');
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
      if (finalPart && words >= 3) {
        setError('');
        // Wait for further words rather than sending the first detected fragment.
        scheduleQuestion(1700);
      } else if (voiceDelayRef.current) {
        clearTimeout(voiceDelayRef.current);
        voiceDelayRef.current = null;
      }
    };

    engine.onerror = event => {
      if (!voiceOnRef.current || busyRef.current) return;
      const reason = event.error || 'desconocido';
      if (reason === 'no-speech') {
        setError('No detecté una pregunta. Vuelve a iniciar el micrófono.');
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
      if (phrase.split(/\s+/).filter(Boolean).length >= 3) {
        scheduleQuestion(450);
        return;
      }
      // A pause after "qué" must not create a useless API request.
      if (!phrase) {
        setError('No detecté una pregunta completa. Vuelve a iniciar el micrófono.');
        stopVoice();
        return;
      }
      voiceSessionRef.current = phrase;
      voiceDraftRef.current = '';
      if (++voiceRestartRef.current > 2) {
        setError('La pregunta quedó incompleta. Pulsa Iniciar voz y repítela.');
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
    try { engine.start(); setListening(true); } catch {
      stopVoice();
      setError('No se pudo iniciar el micrófono.');
    }
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
      setMessages(current => [...older.reverse(), ...current]);
      setOlderAvailable(older.length === 100);
    } catch { setError('No se pudo recuperar el historial anterior.'); }
    finally { setLoading(false); }
  };

  const toggleDoc = (id: string) => {
    setSelectedDocs(previous => {
      if (previous.includes(id)) return previous.filter(item => item !== id);
      if (previous.length >= 4) { setError('Puedes consultar hasta 4 documentos por pregunta.'); return previous; }
      setError('');
      return [...previous, id];
    });
  };

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
        </div>
        <div className="cm-tutor-modes" role="tablist" aria-label="Modalidad del Tutor">
          <button role="tab" type="button" aria-selected={mode === 'chat'} className={mode === 'chat' ? 'is-active' : ''} onClick={() => switchMode('chat')}>Chat</button>
          <button role="tab" type="button" aria-selected={mode === 'voice'} className={mode === 'voice' ? 'is-active' : ''} onClick={() => switchMode('voice')}>Voz</button>
        </div>
      </header>

      <div className="cm-tutor-chat-scroll" aria-live="polite">
        {!messages.length && (
          <div className="cm-tutor-chat-welcome">
            <h1>{mode === 'chat' ? '¿Qué deseas saber de tus documentos?' : 'Conversa con tu Tutor Migratorio'}</h1>
            <p>{caseId ? 'Sube documentos y consulta únicamente la información de este expediente privado.' : 'Crea un expediente para comenzar.'}</p>
          </div>
        )}
        <div className="cm-tutor-chat-messages">
          {olderAvailable && <button type="button" className="cm-tutor-older" onClick={() => void loadOlder()} disabled={loading}>Cargar mensajes anteriores</button>}
          {messages.map((item, index) =>
            <div key={item.id || index} className={'cm-tutor-chat-bubble ' + (item.role === 'user' ? 'is-user' : 'is-model')}>
              <span className="cm-tutor-chat-role">{item.role === 'user' ? 'Tú' : 'Tutor IA'}</span>
              {item.role === 'model'
                ? <div className="cm-tutor-chat-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown></div>
                : <p>{item.content}</p>}
            </div>
          )}
          {loading && <p className="cm-tutor-chat-thinking" role="status">Revisando los documentos…</p>}
          <div ref={endRef} />
        </div>
      </div>

      <div className="cm-tutor-chat-bottom">
        {error && <p role="alert" className="cm-inline-error">{error}</p>}
        {notice && <p role="status" className="cm-tutor-chat-notice">{notice}</p>}
        <div className="cm-tutor-documents-bar">
          <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" className="cm-expediente-file-input" onChange={event => void uploadDocument(event)} disabled={!caseId || loading} aria-label="Subir documentos al expediente" />
          <button type="button" className="cm-tutor-upload" onClick={() => fileRef.current?.click()} disabled={!caseId || loading}>＋ Subir documentos</button>
          <details className="cm-tutor-documents">
            <summary>Documentos ({docs.length}) · {selectedDocs.length} seleccionados</summary>
            <div className="cm-tutor-document-list">
              {docs.length ? docs.map(doc => <label key={doc.id}>
                <input type="checkbox" checked={selectedDocs.includes(doc.id)} onChange={() => toggleDoc(doc.id)} disabled={loading} />
                <span title={doc.filename}>{doc.filename}</span>
              </label>) : <p>No hay documentos todavía.</p>}
            </div>
          </details>
          <span className="cm-tutor-format">PDF o imagen · 2 MB máximo por archivo</span>
        </div>

        {mode === 'chat' ? (
          <form className="cm-composer cm-tutor-composer" onSubmit={send}>
            <button type="button" className="cm-composer-plus" aria-label="Subir documentos" title="Subir documentos" onClick={() => fileRef.current?.click()} disabled={!caseId || loading}>+</button>
            <textarea aria-label="Preguntar sobre los documentos" rows={1} value={question} disabled={!caseId || loading}
              onChange={event => setQuestion(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (question.trim()) void askQuestion(question, false); } }}
              placeholder="Pregunta sobre los documentos del expediente…" />
            <div className="cm-composer-actions">
              <span className="cm-model-chip">Gemini</span>
              <button type="button" className="cm-composer-mic" aria-label="Ir a Voz" title="Conversación por voz" onClick={() => switchMode('voice')}>♫</button>
              <button type="submit" className="cm-composer-send" aria-label="Enviar pregunta" disabled={loading || !question.trim() || !selectedDocs.length}>↑</button>
            </div>
          </form>
        ) : (
          <div className="cm-tutor-voice-panel">
            <button type="button" className={'cm-tutor-voice-button ' + (listening ? 'is-listening' : '')} aria-pressed={voiceOn}
              onClick={toggleVoice} disabled={!caseId || !selectedDocs.length || loading}>
              {voiceOn ? '■ Detener voz' : '🎙 Iniciar voz'}
            </button>
            <div aria-live="polite">
              {speaking ? 'El Tutor está respondiendo…' : listening ? 'Escuchando tu pregunta…' : voiceOn ? 'Procesando…' : 'Pulsa el micrófono para conversar sobre tus documentos.'}
            </div>
            {transcript && <p className="cm-tutor-voice-transcript">Escuché: {transcript}</p>}
            <small>Se utiliza el reconocimiento y la voz del navegador; las respuestas se basan en los documentos seleccionados.</small>
          </div>
        )}
      </div>
    </section>
  );
}
